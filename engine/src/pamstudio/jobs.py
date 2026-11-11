import json
import threading
from concurrent.futures import ThreadPoolExecutor

import numpy as np

from .methods import ReconstructionOptions
from .models import ANALYSIS_CONFIG_FIELDS, Config
from .physics import simulate
from .reconstruction import reconstruct


class Cancelled(Exception):
    pass


class Jobs:
    def __init__(self):
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="pam-science")
        self.lock = threading.RLock()
        self.cancel_event = threading.Event()
        self.current = {"status": "idle", "progress": 0, "run_id": None, "error": None}
        self.live_path = None
        self.partial = None
        self.live_config = None
        self.study_id = None
        self.study_progress = 0.0
        self.study_stop = threading.Event()

    def live(self):
        result = {
            "stage": self.snapshot().get("stage", "idle"),
            "status": self.snapshot()["status"],
        }
        result.update(config=self.live_config, run_id=self.snapshot().get("run_id"))
        path = self.live_path
        if path and path.is_file():
            try:
                with np.load(path, allow_pickle=False) as frame:
                    result.update({key: frame[key].tolist() for key in frame.files})
            except (OSError, ValueError):
                pass
        with self.lock:
            if self.partial is not None:
                result.update(self.partial)
        return result

    def snapshot(self):
        with self.lock:
            value = dict(self.current)
            if self.study_id:
                value.update(
                    status="cancelling" if self.study_stop.is_set() else "running",
                    study_id=self.study_id,
                    progress=self.study_progress,
                    stage="Research study · " + value.get("stage", "preparing"),
                )
            return value

    def check_cancel(self):
        if self.cancel_event.is_set():
            raise Cancelled("Cancelled by user")

    def busy(self):
        return self.snapshot()["status"] in ("running", "cancelling")

    def start(
        self,
        project,
        cfg,
        parent=None,
        options=None,
        workflow=None,
        study_owner=None,
        study_context=None,
    ):
        with self.lock:
            if self.current["status"] in ("running", "cancelling") or (
                self.study_id and self.study_id != study_owner
            ):
                raise ValueError("A scientific job is already running")
            if not parent and cfg.simulation:
                from .jwave_adapter import availability, plan

                plan(cfg)
                backend = availability()
                if not backend["ready"]:
                    raise ValueError(backend["message"])
            if not parent and cfg.bubble:
                from .jbubble_adapter import availability

                backend = availability()
                if not backend["ready"]:
                    raise ValueError(backend["message"])
            run_id = project.begin(cfg, parent, options.model_dump() if options else None)
            if workflow is not None:
                with project.connection() as db:
                    provenance = project.run(run_id)["provenance"] | {"workflow": workflow}
                    db.execute(
                        "UPDATE runs SET provenance=? WHERE id=?", (json.dumps(provenance), run_id)
                    )
            if study_context is not None:
                with project.connection() as db:
                    provenance = project.run(run_id)["provenance"] | {"study": study_context}
                    db.execute(
                        "UPDATE runs SET provenance=? WHERE id=? AND status='running'",
                        (json.dumps(provenance), run_id),
                    )
            self.live_path = project.file(run_id).with_name("live.npz")
            self.live_config = cfg.model_dump()
            self.partial = None
            self.cancel_event.clear()
            self.current = {
                "status": "running",
                "progress": 0,
                "run_id": run_id,
                "error": None,
                "stage": "reconstruct" if parent else "simulate",
            }
        # Return a stable accepted state even when the worker finishes before HTTP responds.
        accepted = dict(self.current)
        self.executor.submit(
            self.work,
            project,
            cfg,
            run_id,
            parent,
            options,
            workflow is not None or (options is not None and parent is None),
        )
        return accepted

    def work(self, project, cfg, run_id, parent, options, end_to_end=False):
        try:
            self.check_cancel()
            medium = None
            if cfg.ct:
                from .ct import read_asset

                medium = read_asset(project, cfg.ct)
            if parent or end_to_end:
                if end_to_end:
                    metadata, extras = {}, {}

                    def simulation_progress(value, stage):
                        with self.lock:
                            self.current.update(progress=value * 0.45, stage=stage)

                    rf = simulate(
                        cfg,
                        self.check_cancel,
                        simulation_progress,
                        metadata,
                        extras,
                        self.live_path,
                        medium,
                    )
                    self.check_cancel()
                    project.save_rf(run_id, rf, cfg, metadata, extras)
                    parent = run_id
                    with self.lock:
                        self.current.update(stage="reconstruct", progress=0)
                else:
                    rf = project.read_rf(parent)

                def progress(value):
                    with self.lock:
                        self.current["progress"] = value

                def live_map(outputs, completed):
                    with self.lock:
                        key = options.methods[0]
                        self.partial = {
                            "pam": outputs[key].reshape(cfg.grid_n, cfg.grid_n).tolist(),
                            "computed": completed,
                            "pam_method": key,
                        }

                result = reconstruct(
                    rf,
                    cfg,
                    check_cancel=self.check_cancel,
                    progress=progress,
                    options=options,
                    frame_callback=live_map,
                    medium=medium,
                )
                self.check_cancel()
                project.save_reconstruction(run_id, parent, result)
                metrics = {
                    "rf_rms": float(np.sqrt(np.einsum("ij,ij->", rf, rf) / rf.size)),
                    "rf_peak": float(np.max(np.abs(rf))),
                    "methods": result.metrics,
                    "runtime_ms": result.runtime_ms,
                    "rf_bytes": rf.nbytes,
                    "map_bytes": sum(m.nbytes for m in result.maps.values()),
                    "runtime_scope": "selected reconstruction methods, shared wall time",
                    "diagnostics": result.diagnostics,
                }
                status = "complete"
            else:
                simulation = {}
                extras = {}

                def simulation_progress(value, stage):
                    with self.lock:
                        self.current.update(progress=value, stage=stage)

                rf = simulate(
                    cfg,
                    self.check_cancel,
                    simulation_progress,
                    simulation,
                    extras,
                    self.live_path,
                    medium,
                )
                self.check_cancel()
                project.save_rf(run_id, rf, cfg, simulation, extras)
                metrics = None
                status = "simulated"
            # Cancellation and finalization serialize: a cancelled job never becomes complete.
            with self.lock:
                self.check_cancel()
                project.finish(run_id, status, metrics)
                self.current.update(status=status, progress=1)
        except Exception as error:
            status = "interrupted" if isinstance(error, Cancelled) else "failed"
            with self.lock:
                project.file(run_id).unlink(missing_ok=True)
                project.file(run_id).with_suffix(".tmp").unlink(missing_ok=True)
                project.finish(run_id, status, error=str(error))
                self.current.update(status=status, error=str(error))

    def cancel(self):
        with self.lock:
            if self.busy():
                if self.study_id:
                    self.study_stop.set()
                self.cancel_event.set()
                self.current["status"] = "cancelling"
        return self.snapshot()

    def shutdown(self):
        self.cancel()
        self.executor.shutdown(wait=True, cancel_futures=True)

    def reconstruct(self, project, run_id, options=None, config=None):
        run = project.run(run_id)
        if run["status"] not in ("simulated", "complete"):
            raise ValueError("Choose a successfully simulated RF run")
        original = Config.model_validate(run["config"])
        cfg = config or original
        if original.model_dump(exclude=ANALYSIS_CONFIG_FIELDS) != cfg.model_dump(
            exclude=ANALYSIS_CONFIG_FIELDS
        ):
            raise ValueError(
                "Scene or acquisition differs from the selected RF. Simulate the modified model first."
            )
        return self.start(project, cfg, run_id, options or ReconstructionOptions())
