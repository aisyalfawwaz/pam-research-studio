import csv
import io
import json

import numpy as np
import pytest
from fastapi.testclient import TestClient
from pamstudio.benchmark import BenchmarkSettings, benchmark_run, map_metrics, report_csv
from pamstudio.cli import demo
from pamstudio.exporting import export_bundle, import_bundle
from pamstudio.methods import ReconstructionOptions
from pamstudio.models import Config, Source
from pamstudio.peaks import PeakSettings, detect_peaks, match_truth
from pamstudio.reporting import export_pdf
from pamstudio.server import create_app
from pamstudio.storage import Project, digest


def mixture():
    x = np.linspace(-0.012, 0.012, 161)
    z = np.linspace(0.018, 0.042, 161)
    xx, zz = np.meshgrid(x, z)
    sources = [Source(x_m=-0.006, z_m=0.03), Source(x_m=0, z_m=0.03), Source(x_m=0.006, z_m=0.03)]
    cfg = Config(grid_n=161, sources=sources)
    image = sum(
        a * np.exp(-((xx - s.x_m) ** 2 + (zz - s.z_m) ** 2) / (2 * 0.0003**2))
        for a, s in zip([1, 0.3, 0.05], sources, strict=True)
    )
    image += 0.1 * np.exp(-((xx - 0.009) ** 2 + (zz - 0.039) ** 2) / (2 * 0.0003**2))
    return cfg, x, z, image


def test_three_unequal_peaks_false_positive_threshold_and_scale_invariance():
    cfg, x, z, image = mixture()
    settings = BenchmarkSettings(peaks=PeakSettings(match_tolerance_m=0.0005))
    report = map_metrics(image, x, z, cfg, settings)
    assert report["detected_peaks"] == 4 and report["matched_sources"] == 3
    assert report["false_positive_peaks"] == 1 and report["missed_sources"] == 0
    assert report["detection_precision"] == 0.75 and report["detection_recall"] == 1
    assert report["detection_f1"] == pytest.approx(6 / 7)
    assert report["matched_rmse_m"] < 1e-12
    assert (
        len(
            {
                p["source_index"]
                for p in report["detections"]["peaks"]
                if p["source_index"] is not None
            }
        )
        == 3
    )
    scaled = map_metrics(image * 1e-25, x, z, cfg, settings)
    assert [(p["row"], p["column"]) for p in scaled["detections"]["peaks"]] == [
        (p["row"], p["column"]) for p in report["detections"]["peaks"]
    ]
    assert scaled["detection_f1"] == report["detection_f1"]
    high = map_metrics(
        image,
        x,
        z,
        cfg,
        BenchmarkSettings(peaks=PeakSettings(threshold_db=-8, match_tolerance_m=0.0005)),
    )
    assert (
        high["detected_peaks"] == 2 and high["matched_sources"] == 2 and high["missed_sources"] == 1
    )


def test_tolerance_changes_assignment_not_detection_and_unresolved_sources_are_missed():
    cfg, x, z, image = mixture()
    changed = cfg.model_copy(
        update={"sources": [s.model_copy(update={"z_m": s.z_m + 0.0003}) for s in cfg.sources]}
    )
    strict = map_metrics(
        image, x, z, changed, BenchmarkSettings(peaks=PeakSettings(match_tolerance_m=0.0001))
    )
    loose = map_metrics(
        image, x, z, changed, BenchmarkSettings(peaks=PeakSettings(match_tolerance_m=0.0005))
    )
    assert strict["matched_sources"] == 0 and loose["matched_sources"] == 3
    assert [(p["x_m"], p["z_m"], p["relative_db"]) for p in strict["detections"]["peaks"]] == [
        (p["x_m"], p["z_m"], p["relative_db"]) for p in loose["detections"]["peaks"]
    ]
    single = np.zeros((len(z), len(x)))
    single[80:82, 80:82] = 1
    shared = cfg.model_copy(
        update={"sources": [Source(x_m=0, z_m=0.03), Source(x_m=0.0001, z_m=0.0301)]}
    )
    result = map_metrics(single, x, z, shared)
    assert (
        result["detected_peaks"] == 1
        and result["matched_sources"] == 1
        and result["missed_sources"] == 1
    )
    assert result["detection_recall"] == 0.5


def test_global_assignment_maximizes_match_count_before_error():
    truth = [Source(x_m=0, z_m=0.03), Source(x_m=0.0015, z_m=0.03)]
    peaks = [
        {"index": i, "x_m": x, "z_m": 0.03, "source_index": None, "error_m": None}
        for i, x in enumerate([0.0007, -0.0008])
    ]
    assigned, scores = match_truth(
        peaks, truth, np.array([-0.01, 0.01]), np.array([0.02, 0.04]), 0.001
    )
    assert [t["peak_index"] for t in assigned] == [1, 0]
    assert scores["matched_sources"] == 2 and scores["matched_mean_error_m"] == pytest.approx(
        0.0008
    )


def test_physical_separation_anisotropic_grid_plateaus_cap_zero_and_outside():
    x = np.arange(40) * 0.00005
    z = np.arange(40) * 0.001
    image = np.zeros((40, 40))
    image[10, 10] = 1
    image[10, 13] = 0.9
    image[13, 10] = 0.8
    peaks, info = detect_peaks(image, x, z, PeakSettings(min_separation_m=0.0005))
    assert [(p["row"], p["column"]) for p in peaks] == [(10, 10), (13, 10)]
    assert info["separation_suppressed"] == 1
    peaks, info = detect_peaks(image, x, z, PeakSettings(min_separation_m=0.00005, max_peaks=1))
    assert len(peaks) == 1 and info["limit_reached"]
    shelf = np.ones((40, 40)) * 0.1
    shelf[20, 20] = 1
    peaks, _ = detect_peaks(shelf, x, z, PeakSettings())
    assert len(peaks) == 1 and peaks[0]["row"] == 20 and peaks[0]["column"] == 20
    cfg, x, z, image = mixture()
    for image in [np.zeros_like(image), np.ones_like(image)]:
        result = map_metrics(image, x, z, cfg)
        assert result["detected_peaks"] == 0 and result["missed_sources"] == 3
        assert (
            result["detection_precision"] is None
            and result["detection_recall"] == 0
            and result["detection_f1"] == 0
        )
        json.dumps(result, allow_nan=False)
    image = np.zeros((len(z), len(x)))
    image[0, 0] = 1
    outside = cfg.model_copy(update={"sources": [Source(x_m=0.05, z_m=0.03)]})
    result = map_metrics(image, x, z, outside)
    assert result["detections"]["peaks"][0]["boundary"]
    assert result["detections"]["truth"][0]["status"] == "outside_map"
    assert result["detection_recall"] is None and result["missed_sources"] == 0


def test_real_three_source_rf_readonly_evaluation_exchange_and_custom_pdf(tmp_path):
    cfg = Config(
        grid_n=97,
        gate_stride=2,
        duration_s=1e-6,
        snr_db=30,
        sources=[
            Source(x_m=-0.006, z_m=0.028),
            Source(x_m=0, z_m=0.035, amplitude=0.6),
            Source(x_m=0.006, z_m=0.025, amplitude=0.3),
        ],
    )
    project, run, _ = demo(
        tmp_path / "real",
        cfg,
        ReconstructionOptions(methods=["atp"], atp_timing_known=True, atp_window_s=1e-6),
    )
    sha = digest(project.file(run))
    settings = BenchmarkSettings(peaks=PeakSettings(threshold_db=-12, min_separation_m=0.002))
    report = benchmark_run(project, run, settings)
    scores = report["methods"]["atp"]
    assert scores["detected_peaks"] == scores["matched_sources"] == 3
    assert scores["false_positive_peaks"] == scores["missed_sources"] == 0
    assert scores["matched_rmse_m"] < 0.0003
    rows = list(csv.DictReader(io.StringIO(report_csv([report]))))
    assert len(json.loads(rows[0]["truth_matches_json"])) == 3
    assert len(json.loads(rows[0]["detected_peaks_json"])) == 3
    assert rows[0]["peak_threshold_db"] == "-12.0"
    export_pdf(project, tmp_path / "sources.pdf", run_id=run, settings=settings)
    context = json.loads((tmp_path / "sources.report.json").read_text())
    assert context["benchmark"]["settings"]["peaks"]["threshold_db"] == -12
    assert context["benchmark"]["methods"]["atp"]["detections"] == scores["detections"]
    assert digest(project.file(run)) == sha
    bundle = export_bundle(project, run, tmp_path / "sources.zip", True)
    target = Project(tmp_path / "import", create=True)
    copied = import_bundle(target, bundle["zip_path"])
    assert benchmark_run(target, copied["id"], settings)["methods"] == report["methods"]
    headers = {"Authorization": "Bearer " + "p" * 32}
    with TestClient(create_app("p" * 32)) as client:
        opened = client.post(
            "/project", json={"path": str(project.path), "create": False}, headers=headers
        )
        assert opened.status_code == 200
        body = {"settings": settings.model_dump(), "path": str(tmp_path / "api.pdf")}
        assert client.post(f"/runs/{run}/report", json=body).status_code == 401
        result = client.post(f"/runs/{run}/report", json=body, headers=headers)
        assert result.status_code == 200, result.text
        assert (
            json.loads((tmp_path / "api.report.json").read_text())["benchmark"]["methods"]["atp"][
                "matched_sources"
            ]
            == 3
        )
        invalid = {"settings": settings.model_dump() | {"peaks": {"threshold_db": 5}}}
        assert (
            client.post(
                f"/runs/{run}/benchmark", json=invalid["settings"], headers=headers
            ).status_code
            == 422
        )
