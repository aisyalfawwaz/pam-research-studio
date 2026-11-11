import time

import h5py
import numpy as np
import pytest
from pamstudio.coupling import filter_spec, volume_flow
from pamstudio.exporting import export_bundle, import_bundle, verify_folder
from pamstudio.geometry import receivers
from pamstudio.jbubble_adapter import PYTHON as BUBBLE_PYTHON
from pamstudio.jobs import Jobs
from pamstudio.jwave_adapter import PYTHON as WAVE_PYTHON
from pamstudio.methods import ReconstructionOptions
from pamstudio.models import Config, ReceiveArray, Source
from pamstudio.physics import simulate
from pamstudio.reconstruction import reconstruct
from pamstudio.storage import Project
from pamstudio.workflow import WorkflowRequest, compile_graph, coupled_template
from scipy.signal import hilbert


def request():
    graph, cfg, options = coupled_template()
    return WorkflowRequest(workflow=graph, config=cfg.model_dump(), options=options)


def test_typed_graph_compiles_actual_pipeline_and_delay_once():
    body = request()
    cfg, options, plan = compile_graph(body)
    assert cfg.coupling and cfg.bubble and cfg.simulation
    fs, taps, _ = filter_spec(cfg)
    assert options.atp_emission_s == body.options.atp_emission_s + (taps - 1) / (2 * fs)
    assert compile_graph(body)[1] == options
    assert (
        plan["order"].index("source") < plan["order"].index("coupler") < plan["order"].index("prop")
    )
    assert set(options.methods) == {"das", "tea", "cf", "rcb", "atp"}


@pytest.mark.parametrize(
    "mutation,match",
    [
        ("missing", "connect"),
        ("port", "Incompatible"),
        ("duplicate", "Duplicate"),
        ("method", "one reconstruction"),
    ],
)
def test_invalid_graphs_cannot_execute(mutation, match):
    body = request().model_dump()
    if mutation == "missing":
        body["workflow"]["edges"] = body["workflow"]["edges"][1:]
    elif mutation == "port":
        body["workflow"]["edges"][0]["source"] = "scene"
    elif mutation == "duplicate":
        body["workflow"]["nodes"].append(body["workflow"]["nodes"][0])
    else:
        for n in body["workflow"]["nodes"]:
            if n["kind"] == "reconstruct":
                n["method"] = "das"
    with pytest.raises(ValueError, match=match):
        compile_graph(WorkflowRequest.model_validate(body))


def test_array_geometry_and_effect_on_actual_rf():
    cfg = Config(
        channels=8,
        grid_n=33,
        snr_db=None,
        sources=[Source(x_m=0.001, z_m=0.012)],
        arrays=[
            ReceiveArray(name="A", elements=4),
            ReceiveArray(name="B", elements=4, x_m=0.01, z_m=0.01, angle_deg=90),
        ],
    )
    positions = receivers(cfg)
    np.testing.assert_allclose(positions[:4, 0], [-0.00045, -0.00015, 0.00015, 0.00045])
    np.testing.assert_allclose(positions[4:, 2], [0.00955, 0.00985, 0.01015, 0.01045])
    rf = simulate(cfg)
    expected = 8e-6 + np.linalg.norm(positions - [0.001, 0, 0.012], axis=1) / 1500
    arrival = abs(hilbert(rf, axis=0)).argmax(axis=0) / cfg.sampling_hz
    np.testing.assert_allclose(arrival, expected, atol=0.1e-6, rtol=0)
    other = cfg.model_copy(deep=True)
    other.arrays[1].x_m += 0.004
    shifted = simulate(other)
    np.testing.assert_array_equal(shifted[:, :4], rf[:, :4])
    assert np.max(abs(shifted[:, 4:] - rf[:, 4:])) > 0.1
    result = reconstruct(
        rf, cfg, options=ReconstructionOptions(methods=["das", "rcb"], rcb_subarray=2)
    )
    assert result.diagnostics["rcb_subarray"] == 8
    assert "disabled" in result.diagnostics["rcb_spatial_smoothing"]


def test_filter_causality_dc_volume_and_recorded_units():
    cfg = request().config
    cfg = Config.model_validate(cfg)
    fs, _, _ = filter_spec(cfg)
    t = np.arange(1001) / fs
    radius = 2e-6 * (1 + 0.05 * np.sin(2 * np.pi * 0.5e6 * t))
    velocity = 2e-6 * 0.05 * 2 * np.pi * 0.5e6 * np.cos(2 * np.pi * 0.5e6 * t)
    curve = np.column_stack([t, radius, velocity, np.zeros((len(t), 3))])
    flow, meta = volume_flow(curve, cfg)
    assert flow[0, 0] == curve[0, 0]  # No future-looking pre-ringing timestamp.
    assert meta["source_delay_s"] > 0
    raw = 4 * np.pi * radius**2 * velocity
    np.testing.assert_allclose(flow[:, 1].sum() / fs, raw.sum() / fs, rtol=1e-10, atol=1e-25)
    assert "m^3/s" in meta["q_equation"]


@pytest.mark.skipif(
    not WAVE_PYTHON.is_file() or not BUBBLE_PYTHON.is_file(),
    reason="Install both optional runtimes",
)
def test_actual_coupled_workflow_live_conservation_reproduction_and_import(tmp_path):
    body = request()
    # Small native fixture keeps the independent scientific integration test fast.
    body.config.update(
        channels=8,
        grid_n=33,
        snr_db=None,
        arrays=[
            ReceiveArray(name="left", elements=4, x_m=-0.002).model_dump(),
            ReceiveArray(name="right", elements=4, x_m=0.002).model_dump(),
        ],
    )
    cfg, options, _ = compile_graph(body)
    project = Project(tmp_path / "coupled", create=True)
    jobs = Jobs()
    observations = []
    try:
        accepted = jobs.start(project, cfg, options=options, workflow=body.workflow.model_dump())
        deadline = time.monotonic() + 90
        while jobs.busy() and time.monotonic() < deadline:
            live = jobs.live()
            if "time_s" in live:
                observations.append(live["time_s"])
            time.sleep(0.04)
        assert jobs.snapshot()["status"] == "complete", jobs.snapshot()
        assert len(set(observations)) > 2
        run = project.run(accepted["run_id"])
        assert run["provenance"]["simulation"]["id"] == "jbubble-jwave"
        assert run["provenance"]["workflow"]["nodes"]
        with h5py.File(project.file(run["id"]), "r") as stored:
            assert stored["wave/pressure"].ndim == 3
            assert len(stored["wave/time_s"]) > 32
            assert np.diff(stored["wave/time_s"][:]).min() > 0
            assert stored["coupling/volume_flow"].shape[1] == 2
        original = project.read_rf(run["id"])
        # Enabling the observer cannot alter RF. Reproduction runs without it.
        np.testing.assert_allclose(simulate(cfg), original, rtol=1e-10, atol=1e-14)
        twice = cfg.model_copy(deep=True)
        twice.coupling.effective_length_m *= 2
        np.testing.assert_allclose(simulate(twice), original / 2, rtol=1e-9, atol=1e-14)
        archived = export_bundle(project, run["id"], tmp_path / "coupled.zip", True)
        verify_folder(archived["folder_path"])
        target = Project(tmp_path / "import", create=True)
        imported = import_bundle(target, archived["zip_path"])
        assert imported["provenance"]["workflow"] == run["provenance"]["workflow"]
        np.testing.assert_array_equal(
            target.array(imported["id"], "wave"), project.array(run["id"], "wave")
        )
    finally:
        jobs.shutdown()
