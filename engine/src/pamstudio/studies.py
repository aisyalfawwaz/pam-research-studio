"""Bounded, persistent research studies over real immutable scientific runs."""

import csv
import hashlib
import io
import itertools
import json
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID, uuid4

import h5py
import numpy as np
from pydantic import Field, model_validator
from scipy.interpolate import RegularGridInterpolator
from scipy.stats import bootstrap

from .benchmark import BenchmarkSettings, benchmark_run
from .methods import ReconstructionOptions
from .models import Config, ReceiveArray, StrictModel
from .storage import canonical, environment

PARAMETERS = {
    "frequency_hz",
    "sound_speed_m_s",
    "snr_db",
    "channels",
    "pitch_m",
    "grid_n",
    "gate_stride",
    "sampling_hz",
    "source.x_m",
    "source.z_m",
    "array.x_m",
    "array.z_m",
    "array.angle_deg",
    "bubble.drive_pa",
    "bubble.radius_m",
    "bubble.rtol",
    "bubble.ringdown_cycles",
    "simulation.spacing_m",
    "simulation.cfl",
    "ray_step_m",
}
REFINEMENTS = {
    "grid_n",
    "gate_stride",
    "sampling_hz",
    "simulation.spacing_m",
    "simulation.cfl",
    "bubble.rtol",
    "bubble.ringdown_cycles",
    "ray_step_m",
}
METRICS = (
    "localization_error_m",
    "gcnr",
    "roi_concentration",
    "background_peak_db",
    "lateral_fwhm_m",
    "axial_fwhm_m",
)


class Axis(StrictModel):
    parameter: str = Field(max_length=40)
    values: list[float] = Field(min_length=2, max_length=8)

    @model_validator(mode="after")
    def valid(self):
        if self.parameter not in PARAMETERS or len(set(self.values)) != len(self.values):
            raise ValueError("Choose a supported parameter and distinct axis values")
        return self


class StudyRequest(StrictModel):
    name: str = Field(default="Parameter study", min_length=1, max_length=100)
    kind: Literal["sweep", "convergence", "uncertainty"] = "sweep"
    config: Config
    options: ReconstructionOptions
    axes: list[Axis] = Field(default_factory=list, max_length=2)
    trials: int = Field(default=16, ge=2, le=64)
    seed: int = Field(default=2026, ge=0, le=2**32 - 1)
    speed_sigma_m_s: float = Field(default=0, ge=0, le=200)
    sensor_sigma_m: float = Field(default=0, ge=0, le=0.001)
    relative_tolerance: float = Field(default=0.02, gt=0, le=0.5)
    stop_on_failure: bool = True
    settings: BenchmarkSettings = Field(default_factory=BenchmarkSettings)

    @model_validator(mode="after")
    def valid(self):
        if self.kind == "uncertainty":
            if self.axes:
                raise ValueError("Uncertainty trials use independent seeded draws, not sweep axes")
            if (
                self.config.snr_db is None
                and self.speed_sigma_m_s == 0
                and self.sensor_sigma_m == 0
            ):
                raise ValueError(
                    "Enable RF noise, sound-speed error or sensor-position error for uncertainty trials"
                )
        elif not self.axes:
            raise ValueError("Add at least one parameter axis")
        if len({a.parameter for a in self.axes}) != len(self.axes):
            raise ValueError("Use distinct parameter axes")
        if self.kind == "convergence" and (
            len(self.axes) != 1 or self.axes[0].parameter not in REFINEMENTS
        ):
            raise ValueError("Convergence requires one numerical resolution/tolerance parameter")
        return self


def set_parameter(config, options, parameter, value):
    c, o = config.model_dump(), options.model_dump()
    if parameter in (
        "grid_n",
        "gate_stride",
        "channels",
        "bubble.ringdown_cycles",
    ) and value != int(value):
        raise ValueError(f"{parameter} must be an integer")
    if parameter == "ray_step_m":
        if options.receive_model != "ct_slowness":
            raise ValueError("Ray-step convergence requires CT slowness reconstruction")
        o[parameter] = value
    elif parameter.startswith("source."):
        c["sources"][0][parameter.split(".")[1]] = value
    elif parameter.startswith("array."):
        if not c.get("arrays"):
            c["arrays"] = [ReceiveArray(elements=c["channels"], pitch_m=c["pitch_m"]).model_dump()]
        c["arrays"][0][parameter.split(".")[1]] = value
    elif "." in parameter:
        group, key = parameter.split(".")
        if not c.get(group):
            raise ValueError(f"{parameter} requires the corresponding simulation backend")
        c[group][key] = int(value) if key == "ringdown_cycles" else value
    else:
        c[parameter] = int(value) if parameter in ("grid_n", "gate_stride", "channels") else value
        if parameter == "channels":
            if c.get("arrays") and len(c["arrays"]) > 1:
                raise ValueError(
                    "Channel-count sweep supports a single receive array; edit multiple arrays explicitly"
                )
            if c.get("arrays"):
                c["arrays"][0]["elements"] = int(value)
            c["active_channels"] = None
            c.pop("receiver_offsets_m", None)
        if parameter == "pitch_m" and c.get("arrays"):
            for a in c["arrays"]:
                a["pitch_m"] = value
        if parameter == "sampling_hz":
            c["samples"] = round((config.samples - 1) * value / config.sampling_hz) + 1
    return Config.model_validate(c), ReconstructionOptions.model_validate(o)


def effective_options(cfg, options):
    if cfg.coupling and options.atp_timing_known:
        from .coupling import filter_spec

        fs, count, _ = filter_spec(cfg)
        return options.model_copy(
            update={"atp_emission_s": options.atp_emission_s + (count - 1) / (2 * fs)}
        )
    return options


def plan_study(body):
    rng = np.random.default_rng(body.seed)
    cases = []
    choices = (
        [()] * body.trials
        if body.kind == "uncertainty"
        else itertools.product(*(a.values for a in body.axes))
    )
    for index, values in enumerate(choices):
        cfg, options = body.config, body.options
        parameters = {}
        if body.kind == "convergence":
            cfg = cfg.model_copy(update={"snr_db": None})
        for axis, value in zip(body.axes, values, strict=True):
            cfg, options = set_parameter(cfg, options, axis.parameter, value)
            parameters[axis.parameter] = value
        if body.kind == "uncertainty":
            raw = cfg.model_dump()
            raw["seed"] = int(rng.integers(0, 2**32 - 1))
            raw["sound_speed_m_s"] += float(rng.normal(0, body.speed_sigma_m_s))
            nominal_offsets = np.asarray(cfg.receiver_offsets_m or np.zeros((cfg.channels, 2)))
            raw["receiver_offsets_m"] = (
                nominal_offsets + rng.normal(0, body.sensor_sigma_m, (cfg.channels, 2))
            ).tolist()
            cfg = Config.model_validate(raw)
            options = ReconstructionOptions.model_validate(
                options.model_dump()
                | {
                    "assumed_sound_speed_m_s": body.config.sound_speed_m_s,
                    "assumed_receiver_offsets_m": nominal_offsets.tolist(),
                }
            )
            parameters = {
                "trial": index + 1,
                "seed": cfg.seed,
                "actual_speed_m_s": cfg.sound_speed_m_s,
                "sensor_offset_rms_m": float(
                    np.sqrt(np.mean((np.asarray(cfg.receiver_offsets_m) - nominal_offsets) ** 2))
                ),
            }
        cfg = Config.model_validate(cfg.model_dump())
        if cfg.simulation:
            from .jwave_adapter import plan

            plan(cfg)
        effective = effective_options(cfg, options)
        if effective.receive_model == "ct_slowness" and cfg.ct is None:
            raise ValueError("CT slowness study requires a CT asset")
        if "atp" in effective.methods and (
            cfg.emission_kind != "pulse" or effective.atp_window_s * cfg.frequency_hz > 5.000001
        ):
            raise ValueError(
                f"Case {index + 1}: ATP window exceeds the short-pulse method definition"
            )
        dt = cfg.gate_stride / cfg.sampling_hz
        if "atp" in effective.methods and effective.atp_window_s / dt < 2:
            raise ValueError(
                f"Case {index + 1}: ATP window requires at least three temporal samples"
            )
        if "rcb" in effective.methods or effective.receive_model == "ct_slowness":
            from .geometry import receivers

            calibration = cfg.model_dump()
            if effective.assumed_receiver_offsets_m is not None:
                calibration["receiver_offsets_m"] = effective.assumed_receiver_offsets_m
            positions = receivers(Config.model_validate(calibration))
            channels = cfg.active_channels or list(range(cfg.channels))
            delta = np.diff(positions[channels], axis=0)
            irregular = bool(cfg.arrays and len(cfg.arrays) > 1) or not np.allclose(
                delta, delta[0], rtol=1e-6, atol=1e-10
            )
            count = len(channels)
            if "rcb" in effective.methods:
                if irregular and count > 64:
                    raise ValueError(
                        f"Case {index + 1}: irregular-array RCB supports at most 64 active channels"
                    )
                subarray = count if irregular else min(effective.rcb_subarray, count)
                terms = (
                    cfg.grid_n**2
                    * count
                    * (int(np.floor((cfg.gate_end_s - cfg.gate_start_s) / dt)) + 1)
                    * subarray**2
                )
                if count > 128 and terms > 5_000_000_000:
                    raise ValueError(
                        f"Case {index + 1}: large-array RCB exceeds the covariance-term CPU budget"
                    )
            if effective.receive_model == "ct_slowness":
                corners = np.array(
                    [
                        [x, 0, z]
                        for x in (cfg.grid_x_min_m, cfg.grid_x_max_m)
                        for z in (cfg.grid_z_min_m, cfg.grid_z_max_m)
                    ]
                )
                longest = np.linalg.norm(corners[:, None] - positions[None], axis=2).max()
                if np.ceil(longest / effective.ray_step_m) + 1 > 8193:
                    raise ValueError(f"Case {index + 1}: CT ray quadrature exceeds 8193 samples")
        cases.append({"config": cfg, "options": effective, "parameters": parameters})
    if len(cases) > 64:
        raise ValueError("Studies are limited to 64 cases")
    byte_estimate = sum(
        c["config"].samples * c["config"].channels * 16
        + c["config"].grid_n ** 2 * len(c["options"].methods) * 8
        for c in cases
    )
    if byte_estimate > 2 * 1024**3:
        raise ValueError(
            "Study raw/conditioned RF/map estimate exceeds the 2 GiB budget; reduce cases or capture size"
        )
    return cases, {
        "case_count": len(cases),
        "array_bytes_upper_estimate": byte_estimate,
        "notes": [
            "Cases run sequentially; solver previews and HDF5 overhead are additional.",
            "Convergence uses noise-free capture and a finest sampled reference, not an exact solution."
            if body.kind == "convergence"
            else "Uncertainty draws independent Gaussian speed/element x-z errors; reconstruction keeps nominal calibration. No silent clipping/redraw."
            if body.kind == "uncertainty"
            else "Sweep scenarios may change multiple physical conditions; no causal ranking is implied.",
        ],
        "cases": [
            {
                "index": i,
                "parameters": c["parameters"],
                "config_sha256": hashlib.sha256(
                    canonical(c["config"].model_dump()).encode()
                ).hexdigest(),
            }
            for i, c in enumerate(cases)
        ],
    }


def summarize_uncertainty(reports, trials, seed):
    result = {}
    for method in sorted({m for r in reports for m in r["methods"]}):
        result[method] = {}
        for metric in METRICS:
            a = np.asarray(
                [
                    r["methods"][method][metric]
                    for r in reports
                    if method in r["methods"] and r["methods"][method][metric] is not None
                ]
            )
            if not len(a):
                result[method][metric] = {
                    "valid": 0,
                    "total": trials,
                    "mean": None,
                    "mean_ci95": None,
                }
                continue
            ci = None
            if len(a) >= 8:
                boot = bootstrap(
                    (a,),
                    np.mean,
                    method="percentile",
                    n_resamples=2000,
                    rng=np.random.default_rng(seed),
                    confidence_level=0.95,
                )
                ci = [float(boot.confidence_interval.low), float(boot.confidence_interval.high)]
            result[method][metric] = {
                "valid": len(a),
                "total": trials,
                "mean": float(a.mean()),
                "sample_sd": float(a.std(ddof=1)) if len(a) > 1 else None,
                "empirical_interval95": np.quantile(a, [0.025, 0.975]).tolist(),
                "mean_ci95": ci,
            }
    return {
        "methods": result,
        "bootstrap": {
            "statistic": "mean",
            "method": "percentile",
            "resamples": 2000,
            "seed": seed,
            "minimum_trials_for_ci": 8,
        },
        "notes": [
            "Bootstrap CI estimates uncertainty of the trial mean; the empirical interval describes the trial distribution. Neither is clinical coverage.",
            "Small samples, quantized peaks, bounded metrics and failed/undefined trials can make intervals optimistic. Inspect valid/total counts.",
        ],
    }


def convergence(project, record):
    completed = [c for c in record["cases"] if c["status"] == "complete"]
    if not completed:
        return {"reference_run_id": None, "cases": [], "stability": "insufficient completed cases"}
    axis = record["request"]["axes"][0]["parameter"]
    ascending = axis in ("grid_n", "sampling_hz", "bubble.ringdown_cycles")
    completed.sort(key=lambda c: c["parameters"][axis], reverse=ascending)
    reference = completed[0]
    comparisons = []
    with h5py.File(project.file(reference["run_id"]), "r") as ref:
        rz, rx = ref["grid/z_m"][:], ref["grid/x_m"][:]
        refcfg = json.loads(ref.attrs["config_json"])
        rt = refcfg["capture_t0_s"] + np.arange(refcfg["samples"]) / refcfg["sampling_hz"]
        for case in completed:
            errors = {}
            with h5py.File(project.file(case["run_id"]), "r") as src:
                z, x = src["grid/z_m"][:], src["grid/x_m"][:]
                zz, xx = np.meshgrid(z, x, indexing="ij")
                for method in record["request"]["options"]["methods"]:
                    sampled = RegularGridInterpolator((rz, rx), ref[f"maps/{method}"][:])(
                        np.column_stack([zz.ravel(), xx.ravel()])
                    ).reshape(len(z), len(x))
                    image = src[f"maps/{method}"][:]
                    errors[method] = float(
                        np.linalg.norm(image - sampled) / max(np.linalg.norm(sampled), 1e-300)
                    )
                cfg = json.loads(src.attrs["config_json"])
                t = cfg["capture_t0_s"] + np.arange(cfg["samples"]) / cfg["sampling_hz"]
                keep = (t >= rt[0]) & (t <= rt[-1])
                expected = np.column_stack(
                    [np.interp(t[keep], rt, ref["rf"][0, :, j]) for j in range(cfg["channels"])]
                )
                actual = src["rf"][0][keep]
                rf_error = float(
                    np.linalg.norm(actual - expected) / max(np.linalg.norm(expected), 1e-300)
                )
            comparisons.append(
                {
                    "run_id": case["run_id"],
                    "value": case["parameters"][axis],
                    "map_relative_l2": errors,
                    "rf_relative_l2": rf_error,
                }
            )
    tolerance = record["request"]["relative_tolerance"]
    checks = [max(c["map_relative_l2"].values()) <= tolerance for c in comparisons[1:3]]
    return {
        "reference_run_id": reference["run_id"],
        "parameter": axis,
        "cases": comparisons,
        "relative_tolerance": tolerance,
        "stability": "two nearest refinements within tolerance"
        if len(checks) == 2 and all(checks)
        else "not established",
        "note": "Errors are relative to the finest available sampled result, interpolated on each case grid. No analytical error bound or observed order is invented.",
    }


def study_path(project, study_id):
    return project.path / "studies" / (str(UUID(str(study_id))) + ".json")


def write_record(project, record):
    target = study_path(project, record["id"])
    target.parent.mkdir(exist_ok=True)
    temp = target.with_suffix(".tmp")
    temp.write_text(json.dumps(record, indent=2, allow_nan=False), encoding="utf-8")
    temp.replace(target)


class Studies:
    def __init__(self, jobs):
        self.jobs = jobs
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="pam-study")
        self.lock = threading.RLock()

    def read(self, project, study_id):
        with self.lock:
            if not study_path(project, study_id).is_file():
                raise ValueError("Unknown research study")
            record = json.loads(study_path(project, study_id).read_text(encoding="utf-8"))
            if record["status"] in ("running", "cancelling") and self.jobs.study_id != record["id"]:
                record["status"] = "interrupted"
                for case in record["cases"]:
                    if case["status"] == "running":
                        case["status"] = "interrupted"
                write_record(project, record)
            return record

    def list(self, project):
        return sorted(
            [
                {k: r[k] for k in ("id", "name", "kind", "status", "created", "completed", "total")}
                for p in sorted((project.path / "studies").glob("*.json"), reverse=True)
                if (r := self.read(project, p.stem))
            ],
            key=lambda r: r["created"],
            reverse=True,
        )

    def start(self, project, body, resume=None):
        plans, summary = plan_study(body)
        with self.jobs.lock, self.lock:
            if self.jobs.busy():
                raise ValueError("Wait for the current job/study before starting another")
            if body.config.bubble:
                from .jbubble_adapter import availability

                if not availability()["ready"]:
                    raise ValueError(availability()["message"])
            if body.config.simulation:
                from .jwave_adapter import availability

                if not availability()["ready"]:
                    raise ValueError(availability()["message"])
            record = {
                "id": str(uuid4()),
                "name": body.name,
                "kind": body.kind,
                "created": datetime.now(timezone.utc).isoformat(),
                "status": "running",
                "request": body.model_dump(),
                "definition_version": "1.0.0",
                "environment": environment(),
                "plan": summary,
                "completed": 0,
                "total": len(plans),
                "cases": [
                    dict(c, status="pending", run_id=None, report=None, error=None)
                    for c in summary["cases"]
                ],
                "summary": None,
            }
            if resume:
                if resume["status"] not in ("failed", "interrupted"):
                    raise ValueError(
                        "Only failed/interrupted studies can be resumed as a new study"
                    )
                if (
                    resume["environment"]["engine_source_sha256"]
                    != record["environment"]["engine_source_sha256"]
                ):
                    raise ValueError(
                        "Engine source changed; start a new study rather than mixing implementations"
                    )
                record["parent_study_id"] = resume["id"]
                for i, c in enumerate(resume["cases"]):
                    if c["status"] == "complete":
                        record["cases"][i] = c.copy()
                        record["completed"] += 1
            self.jobs.study_id = record["id"]
            self.jobs.current = {
                "status": "idle",
                "progress": 0,
                "run_id": None,
                "error": None,
                "stage": "Preparing study",
            }
            self.jobs.study_stop.clear()
            self.jobs.study_progress = record["completed"] / record["total"]
            write_record(project, record)
            self.executor.submit(self.work, project, body, plans, record)
            return self.jobs.snapshot() | {"study_id": record["id"]}

    def work(self, project, body, plans, record):
        parent = None
        reuse = body.kind == "convergence" and body.axes[0].parameter in (
            "grid_n",
            "gate_stride",
            "ray_step_m",
        )
        try:
            for i, case in enumerate(record["cases"]):
                if case["status"] == "complete":
                    parent = parent or case["run_id"]
                    continue
                if self.jobs.study_stop.is_set():
                    raise InterruptedError("Study cancelled")
                if (
                    environment()["engine_source_sha256"]
                    != record["environment"]["engine_source_sha256"]
                ):
                    raise ValueError(
                        "Engine source changed during study; start a new study with the updated implementation"
                    )
                plan = plans[i]
                accepted = self.jobs.start(
                    project,
                    plan["config"],
                    parent if reuse else None,
                    plan["options"],
                    study_owner=record["id"],
                    study_context={
                        "id": record["id"],
                        "case_index": i,
                        "parameters": case["parameters"],
                        "definition_version": "1.0.0",
                    },
                )
                case.update(status="running", run_id=accepted["run_id"], error=None)
                with self.lock:
                    write_record(project, record)
                while True:
                    with self.jobs.lock:
                        status = dict(self.jobs.current)
                    if status["status"] not in ("running", "cancelling"):
                        break
                    # A bounded wait on a worker event, not a UI sleep.
                    threading.Event().wait(0.05)
                case["status"] = status["status"]
                case["error"] = status.get("error")
                if status["status"] == "complete":
                    case["report"] = benchmark_run(project, case["run_id"], body.settings)
                    record["completed"] += 1
                    parent = parent or case["run_id"]
                elif self.jobs.study_stop.is_set():
                    raise InterruptedError("Study cancelled")
                elif body.stop_on_failure:
                    raise ValueError(case["error"] or "Study case failed")
                self.jobs.study_progress = (i + 1) / len(plans)
                with self.lock:
                    write_record(project, record)
            reports = [c["report"] for c in record["cases"] if c["report"]]
            record["summary"] = (
                summarize_uncertainty(reports, len(plans), body.seed)
                if body.kind == "uncertainty"
                else convergence(project, record)
                if body.kind == "convergence"
                else {"note": "Per-case descriptive scenario results; no aggregate winner."}
            )
            record["status"] = (
                "complete" if record["completed"] == record["total"] else "completed_with_failures"
            )
        except Exception as error:
            record.update(
                status="interrupted" if isinstance(error, InterruptedError) else "failed",
                error=str(error),
            )
        finally:
            record["finished"] = datetime.now(timezone.utc).isoformat()
            with self.lock:
                write_record(project, record)
            with self.jobs.lock:
                self.jobs.study_id = None
                if self.jobs.current["status"] in ("idle", "running", "cancelling"):
                    self.jobs.current.update(
                        status="interrupted" if record["status"] == "interrupted" else "failed",
                        error=record.get("error"),
                    )

    def shutdown(self):
        self.jobs.cancel()
        self.executor.shutdown(wait=True, cancel_futures=True)


def study_csv(record):
    stream = io.StringIO(newline="")
    fields = [
        "study_id",
        "case_index",
        "status",
        "run_id",
        "parameters",
        "method",
        *METRICS,
        "error",
    ]
    writer = csv.DictWriter(stream, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    for case in record["cases"]:
        for method, metrics in ((case.get("report") or {}).get("methods") or {"": {}}).items():
            writer.writerow(
                {
                    "study_id": record["id"],
                    "case_index": case["index"],
                    "status": case["status"],
                    "run_id": case["run_id"],
                    "parameters": canonical(case["parameters"]),
                    "method": method,
                    "error": case["error"],
                    **{k: metrics.get(k) for k in METRICS},
                }
            )
    return stream.getvalue()
