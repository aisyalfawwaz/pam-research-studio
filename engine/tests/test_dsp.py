import hashlib

import numpy as np
import pytest
from pamstudio.dsp import condition
from pamstudio.exporting import export_bundle, import_bundle
from pamstudio.methods import ReconstructionOptions
from pamstudio.models import Config, ProcessingSettings
from pamstudio.physics import simulate
from pamstudio.reconstruction import reconstruct
from pamstudio.storage import Project


def test_scipy_receive_chain_suppresses_dc_and_out_of_band_without_mutating_raw():
    cfg = Config(
        channels=4,
        sampling_hz=10e6,
        gate_stride=2,
        processing=ProcessingSettings(
            remove_dc=True, filter_kind="bandpass", low_hz=0.3e6, high_hz=0.8e6, notch_hz=0.6e6
        ),
    )
    time = np.arange(cfg.samples) / cfg.sampling_hz
    raw = np.tile(
        (2 + np.sin(2 * np.pi * 0.5e6 * time) + np.sin(2 * np.pi * 2e6 * time))[:, None], (1, 4)
    )
    original = raw.copy()
    out, meta, response = condition(raw, cfg)
    np.testing.assert_array_equal(raw, original)
    centre = slice(300, -300)

    def component(signal, f):
        return abs(np.mean(signal[centre] * np.exp(-2j * np.pi * f * time[centre])))

    assert component(out[:, 0], 2e6) < component(raw[:, 0], 2e6) * 0.01
    assert component(out[:, 0], 0.5e6) > component(raw[:, 0], 0.5e6) * 0.8
    assert abs(out[centre, 0].mean()) < 0.01
    assert meta["rf_sha256"] == hashlib.sha256(out.tobytes()).hexdigest()
    assert response.shape == (513, 2)
    assert meta["library"] == "scipy.signal"


def test_nyquist_invalid_receive_filters_are_rejected():
    with pytest.raises(ValueError, match="Nyquist"):
        Config(processing=ProcessingSettings(notch_hz=11e6))
    with pytest.raises(ValueError, match="lower edge"):
        Config(processing=ProcessingSettings(filter_kind="bandpass", low_hz=2e6, high_hz=1e6))


def test_dsp_reanalysis_export_import_preserves_raw_and_effective_signal(tmp_path):
    cfg = Config(channels=8, grid_n=17)
    raw = simulate(cfg)
    project = Project(tmp_path / "project", create=True)
    captured = project.begin(cfg)
    project.save_rf(captured, raw, cfg)
    project.finish(captured, "simulated")
    analysis_cfg = cfg.model_copy(
        update={
            "processing": ProcessingSettings(
                remove_dc=True, filter_kind="bandpass", low_hz=0.4e6, high_hz=2e6
            )
        }
    )
    options = ReconstructionOptions(methods=["das", "tea"])
    run = project.begin(analysis_cfg, captured, options.model_dump())
    result = reconstruct(raw, analysis_cfg, options=options)
    project.save_reconstruction(run, captured, result)
    project.finish(run, "complete", {"methods": result.metrics, "runtime_ms": result.runtime_ms})
    np.testing.assert_array_equal(project.read_rf(run), raw)
    assert not np.array_equal(project.array(run, "trace_processed"), project.array(run, "trace"))
    archived = export_bundle(project, run, tmp_path / "dsp.zip", True)
    target = Project(tmp_path / "import", create=True)
    imported = import_bundle(target, archived["zip_path"])
    np.testing.assert_array_equal(
        target.array(imported["id"], "rf_processed"), project.array(run, "rf_processed")
    )
    stripped = export_bundle(project, run, tmp_path / "without-raw.zip", False)
    imported_without = import_bundle(target, stripped["zip_path"])
    with pytest.raises(ValueError, match="excludes"):
        target.array(imported_without["id"], "rf_processed")
