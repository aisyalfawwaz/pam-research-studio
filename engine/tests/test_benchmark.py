import csv
import io
import json
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from pamstudio.benchmark import BenchmarkSettings, benchmark_run, compare_reports, map_metrics
from pamstudio.cli import demo
from pamstudio.exporting import export_bundle, import_bundle, verify_folder
from pamstudio.models import Config
from pamstudio.server import create_app
from pamstudio.storage import Project, digest


def gaussian_scene():
    cfg = Config(
        grid_n=161, grid_x_min_m=-0.012, grid_x_max_m=0.012, grid_z_min_m=0.018, grid_z_max_m=0.042
    )
    x = np.linspace(-0.012, 0.012, 161)
    z = np.linspace(0.018, 0.042, 161)
    xx, zz = np.meshgrid(x, z)
    image = np.exp(-(xx**2 + (zz - 0.03) ** 2) / (2 * 0.001**2))
    return cfg, x, z, image


def test_gaussian_reference_width_integral_and_scale_invariance():
    cfg, x, z, image = gaussian_scene()
    a = map_metrics(image, x, z, cfg)
    assert a["localization_error_m"] < 1e-12
    assert a["lateral_fwhm_m"] == pytest.approx(2 * np.sqrt(2 * np.log(2)) * 0.001, abs=1e-5)
    assert a["axial_fwhm_m"] == pytest.approx(a["lateral_fwhm_m"], abs=1e-12)
    assert a["roi_concentration"] == pytest.approx(1 - np.exp(-2), abs=0.008)
    assert a["background_peak_db"] == pytest.approx(10 * np.log10(np.exp(-2)), abs=0.4)
    b = map_metrics(image * 1e-20, x, z, cfg)
    for key in (
        "gcnr",
        "cnr",
        "contrast_db",
        "roi_concentration",
        "background_peak_db",
        "normalized_entropy",
        "half_power_area_m2",
    ):
        assert a[key] == pytest.approx(b[key], rel=1e-12, abs=1e-12)
    assert 0 <= a["gcnr"] <= 1


def test_histogram_overlap_limits_zero_map_and_degenerate_variance():
    cfg, x, z, image = gaussian_scene()
    flat = map_metrics(np.ones_like(image), x, z, cfg)
    assert flat["gcnr"] == 0 and flat["contrast_db"] == 0
    assert flat["cnr"] is None
    assert flat["normalized_entropy"] == pytest.approx(1)
    xx, zz = np.meshgrid(x, z)
    binary = ((xx**2 + (zz - 0.03) ** 2) <= 0.002**2).astype(float)
    separated = map_metrics(binary, x, z, cfg)
    assert separated["gcnr"] == 1 and separated["roi_concentration"] == 1
    assert separated["cnr"] is None
    json.dumps(separated, allow_nan=False)
    empty = map_metrics(image * 0, x, z, cfg)
    assert empty["localization_error_m"] is None and empty["gcnr"] is None
    assert empty["peak_x_m"] is None and empty["peak_z_m"] is None
    with pytest.raises(ValueError, match="nonnegative"):
        map_metrics(-image, x, z, cfg)


def test_clipped_sparse_regions_and_wrong_peak_do_not_receive_false_validity():
    cfg, x, z, image = gaussian_scene()
    moved = np.roll(image, 30, axis=1)
    score = map_metrics(moved, x, z, cfg)
    assert score["localization_error_m"] == pytest.approx(0.0045)
    assert score["roi_concentration"] < 0.01
    clipped = map_metrics(
        image,
        x,
        z,
        cfg.model_copy(update={"sources": [cfg.sources[0].model_copy(update={"x_m": x[0]})]}),
    )
    assert (
        clipped["roi_clipped"] and clipped["gcnr"] is None and clipped["roi_concentration"] is None
    )
    sparse = map_metrics(
        image[::10, ::10], x[::10], z[::10], cfg, BenchmarkSettings(roi_radius_m=0.0005)
    )
    assert sparse["target_pixels"] == 1 and sparse["gcnr"] is None
    assert any("8 target" in note for note in sparse["warnings"])


def test_readonly_benchmark_exports_imports_and_scenario_fingerprints(tmp_path):
    project, run_id, _ = demo(tmp_path / "source", Config(grid_n=33))
    before = digest(project.file(run_id))
    report = benchmark_run(project, run_id)
    assert digest(project.file(run_id)) == before
    assert report["runtime_scope"].startswith("shared")
    exported = export_bundle(project, run_id, tmp_path / "scores.zip", False)
    verify_folder(exported["folder_path"])
    assert (
        json.loads((Path(exported["folder_path"]) / "benchmark.json").read_text())["methods"]
        == report["methods"]
    )
    rows = list(
        csv.DictReader(io.StringIO((Path(exported["folder_path"]) / "benchmark.csv").read_text()))
    )
    assert {r["method"] for r in rows} == {"das", "tea"}
    assert float(rows[0]["roi_radius_m"]) == 0.002
    assert b"\r\r\n" not in (Path(exported["folder_path"]) / "benchmark.csv").read_bytes()
    target = Project(tmp_path / "imported", create=True)
    imported = import_bundle(target, exported["zip_path"])
    other = benchmark_run(target, imported["id"])
    assert other["methods"] == report["methods"]
    assert compare_reports(report, other)["matched"]
    other["fingerprints"]["raw_rf"] = "different"
    assert compare_reports(report, other)["differences"] == ["raw_rf"]
    # Legacy bundles remain readable; old runs are evaluated without rewriting them.
    root = Path(__file__).resolve().parents[2]
    legacy = import_bundle(target, root / "examples/point_source_64ch/experiment.zip")
    assert benchmark_run(target, legacy["id"])["methods"]["das"]["gcnr"] is not None


def test_authenticated_benchmark_api_and_native_export_contract(tmp_path):
    project, run_id, _ = demo(tmp_path / "source", Config(grid_n=33))
    with TestClient(create_app("q" * 32)) as client:
        headers = {"Authorization": "Bearer " + "q" * 32}
        assert (
            client.post("/project", headers=headers, json={"path": str(project.path)}).status_code
            == 200
        )
        url = f"/runs/{run_id}/benchmark"
        assert client.post(url, json={}).status_code == 401
        response = client.post(url, headers=headers, json={})
        assert response.status_code == 200, response.text
        assert response.json()["methods"]["das"]["gcnr"] is not None
        assert client.post(url, headers=headers, json={"roi_radius_m": 1}).status_code == 422
        assert client.post(url, headers=headers, json={"script": "external.py"}).status_code == 422
        for kind in ("csv", "json"):
            output = tmp_path / ("report." + kind)
            result = client.post(
                "/benchmark-export",
                headers=headers,
                json={"path": str(output), "run_ids": [run_id], "settings": {}, "format": kind},
            )
            assert result.status_code == 200, result.text
            assert output.stat().st_size > 100
