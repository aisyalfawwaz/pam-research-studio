import argparse
import json
from pathlib import Path

import h5py
import numpy as np

from .exporting import export_bundle, verify_folder
from .methods import ReconstructionOptions
from .models import BubbleSettings, Config, JWaveSettings
from .physics import simulate
from .reconstruction import reconstruct
from .storage import Project


def demo(destination, config=None, options=None):
    cfg = config or Config()
    project = Project(destination, "64-channel point-source reference", create=True)
    project.draft(cfg)
    simulation = project.begin(cfg)
    metadata = {}
    extras = {}
    rf = simulate(cfg, metadata=metadata, extras=extras)
    project.save_rf(simulation, rf, cfg, metadata, extras)
    project.finish(simulation, "simulated")
    options = options or ReconstructionOptions()
    run_id = project.begin(cfg, simulation, options.model_dump())
    result = reconstruct(rf, cfg, options=options)
    project.save_reconstruction(run_id, simulation, result)
    project.finish(
        run_id,
        "complete",
        {
            "methods": result.metrics,
            "runtime_ms": result.runtime_ms,
            "rf_bytes": rf.nbytes,
            "map_bytes": sum(m.nbytes for m in result.maps.values()),
            "runtime_scope": "selected reconstruction methods, shared wall time",
            "diagnostics": result.diagnostics,
        },
    )
    return project, run_id, result


def main():
    parser = argparse.ArgumentParser(description="PAM Research Studio offline reference CLI")
    subs = parser.add_subparsers(dest="command", required=True)
    make = subs.add_parser("demo")
    make.add_argument("destination", type=Path)
    make.add_argument("--export", type=Path)
    make.add_argument("--backend", choices=["analytic", "jwave", "jbubble"], default="analytic")
    make.add_argument(
        "--methods", nargs="+", choices=["das", "tea", "cf", "rcb", "atp"], default=["das", "tea"]
    )
    make.add_argument("--atp-known", action="store_true")
    make.add_argument("--atp-time-us", type=float, default=8)
    make.add_argument("--atp-window-us", type=float, default=4)
    rep = subs.add_parser("reproduce")
    rep.add_argument("bundle_folder", type=Path)
    args = parser.parse_args()
    if args.command == "demo":
        options = ReconstructionOptions(
            methods=args.methods,
            atp_timing_known=args.atp_known,
            atp_emission_s=args.atp_time_us / 1e6,
            atp_window_s=args.atp_window_us / 1e6,
        )
        cfg = Config(
            simulation=JWaveSettings() if args.backend == "jwave" else None,
            bubble=BubbleSettings() if args.backend == "jbubble" else None,
            spreading=args.backend == "jbubble",
            gate_end_s=18e-6 if args.backend == "jbubble" else 12e-6,
            gate_stride=1 if args.backend == "jbubble" else 4,
        )
        project, run_id, result = demo(args.destination, cfg, options=options)
        if args.export:
            print(
                json.dumps(export_bundle(project, run_id, args.export, include_raw=True), indent=2)
            )
        print(json.dumps(result.metrics, indent=2))
    else:
        experiment = verify_folder(args.bundle_folder)
        cfg = Config.model_validate(experiment["config"])
        options = ReconstructionOptions.model_validate(experiment.get("analysis") or {})
        capture_cfg = Config.model_validate(experiment.get("input_config") or experiment["config"])
        medium = None
        if capture_cfg.ct:
            with h5py.File(args.bundle_folder / "results.h5", "r") as src:
                medium = {
                    "hu": src["medium/hu"][:],
                    "metadata": json.loads(src.attrs["simulation_json"])["ct_source"],
                }
        result = reconstruct(
            simulate(capture_cfg, medium=medium), cfg, options=options, medium=medium
        )
        rtol, atol = (
            (1e-7, 1e-12) if capture_cfg.simulation or capture_cfg.bubble else (1e-10, 1e-14)
        )
        with h5py.File(args.bundle_folder / "results.h5", "r") as src:
            for key, array in result.maps.items():
                np.testing.assert_allclose(array, src[f"maps/{key}"][:], rtol=rtol, atol=atol)
        print(f"Reproduced {', '.join(result.maps)} within rtol={rtol:g}, atol={atol:g}")


if __name__ == "__main__":
    main()
