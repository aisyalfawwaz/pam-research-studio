import hashlib
import importlib.metadata
import json
import os
import platform
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import h5py
import numpy as np

from . import __version__
from .methods import METHODS
from .models import Config
from .physics import receivers


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(path):
    with Path(path).open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def environment():
    root = Path(__file__).resolve().parents[3]
    # Read VCS metadata without launching git. Inherited debugger/pipe handles on
    # Windows can prevent subprocess.communicate() from ever observing pipe EOF.
    commit = "uncommitted"
    git_dir = root / ".git"
    try:
        if git_dir.is_file():
            git_dir = (root / git_dir.read_text().strip().removeprefix("gitdir: ")).resolve()
        if git_dir.is_dir():
            head = (git_dir / "HEAD").read_text().strip()
            if head.startswith("ref: "):
                ref = head[5:]
                ref_path = git_dir / ref
                if ref_path.is_file():
                    commit = ref_path.read_text().strip()
                elif (git_dir / "packed-refs").is_file():
                    for line in (git_dir / "packed-refs").read_text().splitlines():
                        if line.endswith(" " + ref):
                            commit = line.split()[0]
            else:
                commit = head
    except OSError:
        commit = "unavailable"
    source_files = sorted(Path(__file__).parent.glob("*.py"))
    source_hash = hashlib.sha256(
        b"".join(p.name.encode() + p.read_bytes() for p in source_files)
    ).hexdigest()
    frontend = (
        json.loads((root / "package.json").read_text()) if (root / "package.json").is_file() else {}
    )
    return {
        "engine_version": __version__,
        "python": platform.python_version(),
        "os": platform.platform(),
        # platform.processor() can block in Windows WMI from an ASGI worker thread.
        "cpu": os.environ.get("PROCESSOR_IDENTIFIER") or platform.machine(),
        "backend": "numpy-cpu",
        "precision": "float64",
        "git_commit": commit,
        "engine_source_sha256": source_hash,
        "node": os.environ.get("PAM_NODE_VERSION", "not recorded (CLI)"),
        "frontend_dependencies": frontend.get("dependencies", {}),
        "packages": {
            p: importlib.metadata.version(p)
            for p in [
                "numpy",
                "scipy",
                "h5py",
                "pydantic",
                "fastapi",
                "matplotlib",
                "pydicom",
                "python-gdcm",
            ]
        },
    }


class Project:
    def __init__(self, path, name="Point-source study", create=False):
        self.path = Path(path).resolve()
        if create:
            self.path.mkdir(parents=True, exist_ok=True)
        if not self.path.is_dir():
            raise ValueError("Choose a project directory")
        self.db_path = self.path / "project.sqlite"
        if create and self.db_path.exists():
            raise ValueError("A project already exists here; use Open project")
        if not create and not self.db_path.is_file():
            raise ValueError("No project.sqlite in this directory")
        with self.connection() as db:
            if create:
                db.executescript("""
                PRAGMA user_version=1;
                CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE runs(id TEXT PRIMARY KEY, created TEXT NOT NULL, status TEXT NOT NULL,
                    config TEXT NOT NULL, parent TEXT, metrics TEXT, provenance TEXT NOT NULL, error TEXT);
                """)
                db.execute("INSERT INTO metadata VALUES('name', ?)", (name,))
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if version != 1:
                raise ValueError("Unsupported project schema version")
            self.name = db.execute("SELECT value FROM metadata WHERE key='name'").fetchone()[0]
            db.execute(
                "UPDATE runs SET status='interrupted', error='Application stopped before finalization' WHERE status='running'"
            )
        (self.path / "runs").mkdir(exist_ok=True)

    @contextmanager
    def connection(self):
        conn = sqlite3.connect(self.db_path, timeout=10)
        conn.row_factory = sqlite3.Row
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    def info(self):
        draft_path = self.path / "draft.json"
        draft = (
            Config.model_validate_json(draft_path.read_text()).model_dump()
            if draft_path.exists()
            else Config().model_dump()
        )
        return {
            "name": self.name,
            "project_id": hashlib.sha256(
                os.path.normcase(str(self.path.resolve())).encode()
            ).hexdigest(),
            "schema_version": "1.0",
            "draft": draft,
            "runs": self.runs(),
        }

    def draft(self, cfg):
        target = self.path / "draft.json"
        temp = target.with_suffix(".tmp")
        temp.write_text(canonical(cfg.model_dump()), encoding="utf-8")
        os.replace(temp, target)

    def begin(self, cfg, parent=None, analysis=None):
        run_id = str(uuid4())
        (self.path / "runs" / run_id).mkdir()
        provenance = environment() | {
            "config_sha256": hashlib.sha256(canonical(cfg.model_dump()).encode()).hexdigest()
        }
        if analysis is not None:
            provenance["reconstruction_options"] = analysis
        if parent:
            simulation = self.run(parent)["provenance"].get("simulation")
            if simulation:
                provenance["simulation"] = simulation
        with self.connection() as db:
            db.execute(
                "INSERT INTO runs VALUES(?,?,?,?,?,?,?,?)",
                (
                    run_id,
                    datetime.now(timezone.utc).isoformat(),
                    "running",
                    canonical(cfg.model_dump()),
                    parent,
                    None,
                    canonical(provenance),
                    None,
                ),
            )
        return run_id

    def finish(self, run_id, status, metrics=None, error=None):
        with self.connection() as db:
            cursor = db.execute(
                "UPDATE runs SET status=?, metrics=?, error=? WHERE id=? AND status='running'",
                (status, canonical(metrics) if metrics else None, error, run_id),
            )
            if cursor.rowcount != 1:
                raise ValueError("Finished experiment runs are immutable")

    def run(self, run_id):
        with self.connection() as db:
            row = db.execute("SELECT * FROM runs WHERE id=?", (run_id,)).fetchone()
        if row is None:
            raise ValueError("Unknown experiment run")
        result = dict(row)
        for key in ("config", "metrics", "provenance"):
            result[key] = json.loads(result[key]) if result[key] else None
        result["methods"] = {
            key: METHODS[key]
            for key in (result["metrics"] or {}).get("methods", {})
            if key in METHODS
        }
        result["warnings"] = Config.model_validate(result["config"]).warnings()
        simulation = result["provenance"].get("simulation", {})
        if simulation.get("id") == "jbubble":
            upper = simulation.get("emission_999_energy_upper_hz", 0)
            if upper and result["config"]["pitch_m"] > result["config"]["sound_speed_m_s"] / (
                2 * upper
            ):
                result["warnings"].append(
                    "Receiver pitch exceeds half the resolved bubble-emission wavelength; harmonics may produce grating lobes. Consider smaller pitch or a validated receive bandpass."
                )
            if simulation.get("final_emission_relative_peak", 0) > 0.01:
                result["warnings"].append(
                    "Bubble emission is still appreciable at integration end; increase ringdown cycles for a convergence check."
                )
            if simulation.get("energy_above_acquisition_nyquist_fraction", 0) > 0.001:
                result["warnings"].append(
                    "Acquisition anti-alias filtering discards some simulated bubble-emission energy; inspect the recorded spectral-loss fraction."
                )
        return result

    def runs(self):
        with self.connection() as db:
            rows = db.execute(
                "SELECT id,created,status,parent,error FROM runs ORDER BY created DESC"
            ).fetchall()
        return [dict(row) for row in rows]

    def file(self, run_id):
        self.run(run_id)  # Do not derive paths from an unchecked caller-supplied id.
        return self.path / "runs" / run_id / "results.h5"

    def save_rf(self, run_id, rf, cfg, simulation=None, extras=None):
        if self.run(run_id)["status"] != "running":
            raise ValueError("Finished experiment runs are immutable")
        path = self.file(run_id)
        temp = path.with_suffix(".tmp")
        with h5py.File(temp, "w") as out:
            out.attrs.update(
                schema_version="1.0",
                data_kind="rf_real",
                dimension_order="frame,sample,channel",
                sampling_frequency_hz=cfg.sampling_hz,
                t0_s=cfg.capture_t0_s,
                signal_unit="arbitrary_unit",
                config_json=canonical(cfg.model_dump()),
                precision="float64",
            )
            out.create_dataset("rf", data=rf[None, :, :], compression="gzip", shuffle=True)
            out.create_dataset("probe/positions_xyz_m", data=receivers(cfg))
            out["probe"].attrs["channel_order"] = (
                "array list order, then local element order from negative to positive array offset"
            )
            counts = [a.elements for a in cfg.arrays] if cfg.arrays else [cfg.channels]
            out.create_dataset("probe/array_index", data=np.repeat(np.arange(len(counts)), counts))
            out.create_dataset(
                "probe/element_index", data=np.concatenate([np.arange(n) for n in counts])
            )
            if simulation:
                out.attrs["simulation_json"] = canonical(simulation)
            for key, array in (extras or {}).items():
                if key not in {
                    "bubble/trajectory",
                    "bubble/population",
                    "coupling/volume_flow",
                    "wave/pressure",
                    "wave/time_s",
                    "medium/hu",
                    "medium/sound_speed_m_s",
                    "medium/density_kg_m3",
                }:
                    raise ValueError("Unknown simulation output")
                dataset = out.create_dataset(key, data=array, compression="gzip", shuffle=True)
                if key == "bubble/trajectory":
                    dataset.attrs["columns"] = (
                        "source_time_s,radius_m,wall_velocity_m_s,drive_pa,emission_pa_at_1mm,wall_acceleration_m_s2"
                    )
                elif key == "bubble/population":
                    dataset.attrs["columns"] = (
                        "source_index,source_time_s,radius_m,wall_velocity_m_s,drive_pa,emission_pa_at_1mm,wall_acceleration_m_s2"
                    )
                elif key == "coupling/volume_flow":
                    dataset.attrs["columns"] = "source_time_s," + ",".join(
                        f"source_{i}_filtered_volume_flow_m3_s" for i in range(array.shape[1] - 1)
                    )
                elif key == "wave/pressure":
                    dataset.attrs["dimension_order"] = "frame,z,x"
                    dataset.attrs["unit"] = (
                        "dimensionless p/Pdrive" if cfg.coupling else "arbitrary_unit"
                    )
                elif key.startswith("medium/"):
                    dataset.attrs["dimension_order"] = "row,column" if key == "medium/hu" else "z,x"
                    dataset.attrs["unit"] = {
                        "medium/hu": "HU",
                        "medium/sound_speed_m_s": "m/s",
                        "medium/density_kg_m3": "kg/m^3",
                    }[key]
        os.replace(temp, path)
        if simulation:
            provenance = self.run(run_id)["provenance"] | {"simulation": simulation}
            with self.connection() as db:
                changed = db.execute(
                    "UPDATE runs SET provenance=? WHERE id=? AND status='running'",
                    (canonical(provenance), run_id),
                ).rowcount
                if changed != 1:
                    raise ValueError("Finished experiment runs are immutable")

    def save_reconstruction(self, run_id, parent, result):
        path = self.file(run_id)
        temp = path.with_suffix(".tmp")
        with h5py.File(self.file(parent), "r") as src, h5py.File(temp, "w") as out:
            for key, value in src.attrs.items():
                out.attrs[key] = value
            for key in ("rf", "probe"):
                src.copy(key, out)
            if "bubble" in src:
                src.copy("bubble", out)
            for key in ("coupling", "wave", "medium"):
                if key in src:
                    src.copy(key, out)
            out.attrs.update(
                input_run_id=parent,
                rf_sha256=hashlib.sha256(out["rf"][:].tobytes()).hexdigest(),
                timing_convention="s_m(u + ||r-r_m||/c); u is source emission time",
                normalization="mean over active channels; optional 1/r compensation",
                methods_json=canonical({key: METHODS[key] for key in result.maps}),
                analysis_json=canonical(result.options),
                reconstruction_config_json=canonical(self.run(run_id)["config"]),
                diagnostics_json=canonical(result.diagnostics),
            )
            out.create_dataset("grid/x_m", data=result.x)
            out.create_dataset("grid/z_m", data=result.z)
            out.create_dataset("gate/emission_time_s", data=result.gate)
            if result.processing is None and "processing_json" in out.attrs:
                del out.attrs["processing_json"]
            if result.conditioned_rf is not None:
                out.create_dataset(
                    "rf_processed",
                    data=result.conditioned_rf[None, :, :],
                    compression="gzip",
                    shuffle=True,
                )
                out.create_dataset("processing/response", data=result.response)
                out.attrs["processing_json"] = canonical(result.processing)
            for key, image in result.maps.items():
                out.create_dataset(f"maps/{key}", data=image)
        os.replace(temp, path)

    def read_rf(self, run_id):
        with h5py.File(self.file(run_id), "r") as src:
            if "rf" not in src:
                raise ValueError(
                    "Raw RF was excluded from this imported package; rerun the synthetic configuration"
                )
            return src["rf"][0]

    def array(self, run_id, kind, channel=0):
        run = self.run(run_id)
        cfg = Config.model_validate(run["config"])
        if not 0 <= channel < (len(cfg.sources) if kind == "bubble" else cfg.channels):
            raise ValueError("Channel out of range")
        with h5py.File(self.file(run_id), "r") as src:
            if kind == "ct_mask":
                if cfg.ct is None or "medium/sound_speed_m_s" not in src:
                    raise ValueError("No CT medium in this run")
                density = src["medium/density_kg_m3"][:]
                speed = src["medium/sound_speed_m_s"][:]
                span = cfg.ct.bone_density_kg_m3 - cfg.simulation.density_kg_m3
                fraction = (
                    (density - cfg.simulation.density_kg_m3) / span
                    if abs(span) > 1e-9
                    else (speed - cfg.sound_speed_m_s)
                    / (cfg.ct.bone_speed_m_s - cfg.sound_speed_m_s)
                    if abs(cfg.ct.bone_speed_m_s - cfg.sound_speed_m_s) > 1e-9
                    else np.zeros_like(speed)
                )
                sz, sx = (
                    max(1, int(np.ceil(fraction.shape[0] / 64))),
                    max(1, int(np.ceil(fraction.shape[1] / 64))),
                )
                return np.clip(fraction[::sz, ::sx], 0, 1).astype("<f4")
            if kind == "dsp_response":
                if "processing/response" not in src:
                    raise ValueError("No receive filter response in this run")
                return src["processing/response"][:].astype("<f4")
            rf_key = "rf_processed" if kind.endswith("_processed") else "rf"
            if kind.endswith("_processed"):
                kind = kind.removesuffix("_processed")
            if kind in ("wave", "wave_time"):
                key = "wave/pressure" if kind == "wave" else "wave/time_s"
                if key not in src:
                    raise ValueError("No recorded wave frames in this run")
                data = src[key][:]
                return (
                    data.reshape(len(data), -1) if kind == "wave" else np.column_stack([data, data])
                ).astype("<f4")
            if kind == "bubble":
                if "bubble/trajectory" not in src:
                    raise ValueError("This run has no bubble trajectory")
                if "bubble/population" in src:
                    if channel >= len(cfg.sources):
                        raise ValueError("Bubble source index out of range")
                    population = src["bubble/population"][:]
                    values = population[population[:, 0] == channel, 1:]
                else:
                    if channel >= len(cfg.sources):
                        raise ValueError("Bubble source index out of range")
                    values = src["bubble/trajectory"]
                # At most 50k × 6 float32 = 1.2 MB. The renderer performs
                # peak-preserving display reduction independently for each curve.
                return values[:].astype("<f4")
            if kind in ("rf", "trace", "spectrum"):
                if rf_key not in src:
                    raise ValueError(
                        "This package excludes raw RF; simulate its configuration to inspect traces"
                    )
                if kind == "rf":
                    stride = max(1, int(np.ceil(cfg.samples / 512)))
                    # Peak-preserving signed bins avoid hiding short pulses in the RF overview.
                    raw = src[rf_key]
                    bins = []
                    for start in range(0, cfg.samples, stride):
                        block = raw[0, start : start + stride]
                        bins.append(block[np.abs(block).argmax(axis=0), np.arange(cfg.channels)])
                    return np.asarray(bins, dtype="<f4")
                trace = src[rf_key][0, :, channel]
                if kind == "trace":
                    return np.column_stack(
                        [cfg.capture_t0_s + np.arange(cfg.samples) / cfg.sampling_hz, trace]
                    ).astype("<f4")
                window = np.hanning(len(trace))
                amplitude = np.abs(np.fft.rfft(trace * window)) / window.sum()
                amplitude[1:-1] *= 2
                return np.column_stack(
                    [np.fft.rfftfreq(len(trace), 1 / cfg.sampling_hz), amplitude]
                ).astype("<f4")
            if run["status"] != "complete":
                raise ValueError("Reconstruction is not complete")
            if kind in METHODS:
                if f"maps/{kind}" not in src:
                    raise ValueError(f"{kind.upper()} was not calculated in this run")
                return src[f"maps/{kind}"][:].astype("<f4")
            if kind == "difference":
                das, tea = src["maps/das"][:], src["maps/tea"][:]
                return (das / max(das.max(), 1e-30) - tea / max(tea.max(), 1e-30)).astype("<f4")
            raise ValueError("Unknown array kind")
