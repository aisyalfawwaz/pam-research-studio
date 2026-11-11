"""Versioned descriptive PAM map evaluation; no composite or clinical score."""

import csv
import hashlib
import io
import json

import h5py
import numpy as np
from pydantic import Field, model_serializer
from scipy.ndimage import label

from .models import ANALYSIS_CONFIG_FIELDS, Config, StrictModel
from .peaks import PeakSettings, evaluate_peaks
from .storage import canonical

IDENTITY = {"id": "pam.benchmark.map", "version": "1.2.0"}
REFERENCE = "https://doi.org/10.1109/TUFFC.2019.2956855"


class BenchmarkSettings(StrictModel):
    roi_radius_m: float = Field(default=0.002, ge=0.0005, le=0.01)
    histogram_bins: int = Field(default=100, ge=8, le=256)
    peaks: PeakSettings | None = None

    @model_serializer(mode="wrap")
    def serialize_legacy(self, handler):
        values = handler(self)
        if self.peaks is None:
            values.pop("peaks", None)
        return values


DEFINITIONS = {
    "detected_peaks": "Truth-independent 8-connected regional maxima above a relative power threshold, consolidated per plateau, then amplitude-ordered Euclidean minimum-separation suppression and a recorded cap.",
    "matched_sources": "One-to-one gated assignment: maximize matched in-view truth count, then minimize total Euclidean distance within the matching tolerance.",
    "missed_sources": "In-view configured sources without an assigned detection. Unresolved shared lobes are not counted twice.",
    "false_positive_peaks": "Detected peaks without an assigned in-view source within tolerance.",
    "detection_precision": "Matched sources / detected peaks; unavailable when no detections.",
    "detection_recall": "Matched sources / in-view truth sources; unavailable when no in-view truth.",
    "detection_f1": "2 TP / (2 TP + FP + FN); unavailable without in-view truth.",
    "matched_mean_error_m": "Mean Euclidean error among matched sources only. Inspect recall/misses alongside it; misses are not zero-error matches.",
    "matched_rmse_m": "Root mean square Euclidean error among matched sources only, in metres.",
    "localization_error_m": "Global map peak to nearest configured source; not per-source detection recall. Lower is better.",
    "lateral_fwhm_m": "Half-power width through global peak, interpolated; single source only, unavailable for boundary-truncated lobes.",
    "axial_fwhm_m": "Half-power width through global peak, interpolated; single source only, unavailable for boundary-truncated lobes.",
    "roi_concentration": "Integral of linear map inside the union of truth disks / integral over the ROI grid, using trapezoidal spatial weights. Map concentration, not physical acoustic energy. Higher is better for this target definition.",
    "background_peak_db": "10 log10(max map outside truth disks / global peak). Lower is better. This is an exclusion-region background measure, not a PSF sidelobe level.",
    "contrast_db": "10 log10(mean linear target / mean linear background); pixel means, signed contrast. Higher favours bright targets.",
    "cnr": "abs(mean target - mean background) / sqrt(population variance target + population variance background). Descriptive; dynamic-range sensitive.",
    "gcnr": "1 - sum(min(target PMF, background PMF)); shared uniform histogram bins on linear map/global peak in [0,1]. Descriptive region separation [0,1], not a clinical detection probability. Finite bins/sample counts can bias this estimator.",
    "normalized_entropy": "-sum(p log p)/log(number of pixels), p=linear map/sum(map). Lower is more concentrated, which can also indicate a misplaced artefact.",
    "half_power_area_m2": "Trapezoidal area of the 4-connected >=half-global-peak component containing the peak; boundary contact is flagged. Smaller alone does not establish correct localization.",
}


def map_metrics(image, x, z, cfg, settings=None):
    from .reconstruction import evaluate

    settings = settings or BenchmarkSettings()
    image = np.asarray(image, dtype=np.float64)
    x, z = np.asarray(x), np.asarray(z)
    if image.shape != (len(z), len(x)) or min(image.shape) < 2:
        raise ValueError("Benchmark map/grid dimensions disagree")
    if (
        not np.isfinite(image).all()
        or not np.isfinite(x).all()
        or not np.isfinite(z).all()
        or np.any(image < 0)
        or not (np.diff(x) > 0).all()
        or not (np.diff(z) > 0).all()
    ):
        raise ValueError("Benchmark requires a finite nonnegative map and increasing axes")
    notes = []
    detections = evaluate_peaks(image, x, z, cfg, settings.peaks)
    values = {key: None for key in DEFINITIONS}
    values.update(detections["scores"])
    if image.max() <= 0:
        return {
            **values,
            "detections": detections,
            "peak_x_m": None,
            "peak_z_m": None,
            "warnings": ["Zero map: no peak or quality score is defined."],
            "target_pixels": 0,
            "background_pixels": 0,
            "half_power_boundary": None,
        }
    values.update(evaluate(image, x, z, cfg))
    norm = image / image.max()
    weights_x = np.r_[np.diff(x)[0] / 2, (x[2:] - x[:-2]) / 2, np.diff(x)[-1] / 2]
    weights_z = np.r_[np.diff(z)[0] / 2, (z[2:] - z[:-2]) / 2, np.diff(z)[-1] / 2]
    weights = weights_z[:, None] * weights_x[None, :]
    xx, zz = np.meshgrid(x, z)
    target = np.zeros(image.shape, dtype=bool)
    clipped = False
    truth_outside = False
    for source in cfg.sources:
        target |= (xx - source.x_m) ** 2 + (zz - source.z_m) ** 2 <= settings.roi_radius_m**2
        clipped |= not (
            x[0] <= source.x_m - settings.roi_radius_m
            and source.x_m + settings.roi_radius_m <= x[-1]
            and z[0] <= source.z_m - settings.roi_radius_m
            and source.z_m + settings.roi_radius_m <= z[-1]
        )
        truth_outside |= not (x[0] <= source.x_m <= x[-1] and z[0] <= source.z_m <= z[-1])
    inside, outside = norm[target], norm[~target]
    values["background_exclusion_radius_m"] = settings.roi_radius_m
    values["background_peak_ratio"] = float(outside.max()) if outside.size else None
    if outside.size and outside.max() > 0:
        values["background_peak_db"] = float(10 * np.log10(outside.max()))
    p = norm.ravel() / norm.sum()
    values["normalized_entropy"] = float(-np.sum(p[p > 0] * np.log(p[p > 0])) / np.log(p.size))
    components, _ = label(norm >= 0.5)
    peak = np.unravel_index(norm.argmax(), norm.shape)
    lobe = components == components[peak]
    boundary = bool(lobe[0].any() or lobe[-1].any() or lobe[:, 0].any() or lobe[:, -1].any())
    values["half_power_area_m2"] = float(weights[lobe].sum())
    if boundary:
        notes.append("Half-power component touches the map boundary; its area may be truncated.")
    if len(cfg.sources) > 1:
        notes.append(
            "Multiple sources: global-peak error is not source detection recall; FWHM is disabled and truth disks form a union."
        )
    if clipped:
        notes.append(
            "A truth disk extends beyond the grid; regional scores are unavailable. Enlarge the grid or reduce the radius."
        )
    if truth_outside:
        notes.append(
            "A configured source lies outside the map; localization is distance to an out-of-view truth."
        )
    if inside.size and outside.size and not clipped:
        values["roi_concentration"] = float(
            np.clip((norm * weights)[target].sum() / (norm * weights).sum(), 0, 1)
        )
        if inside.size >= 8 and outside.size >= 8:
            mean_i, mean_o = inside.mean(), outside.mean()
            if mean_i > 0 and mean_o > 0:
                values["contrast_db"] = float(10 * np.log10(mean_i / mean_o))
            else:
                notes.append("Contrast in dB is undefined when either regional mean is zero.")
            variance = inside.var() + outside.var()
            if variance > 0:
                values["cnr"] = float(abs(mean_i - mean_o) / np.sqrt(variance))
            else:
                notes.append("CNR is undefined for zero combined regional variance.")
            a = np.histogram(inside, settings.histogram_bins, (0, 1))[0] / inside.size
            b = np.histogram(outside, settings.histogram_bins, (0, 1))[0] / outside.size
            values["gcnr"] = float(np.clip(1 - np.minimum(a, b).sum(), 0, 1))
            if min(inside.size, outside.size) < settings.histogram_bins:
                notes.append(
                    "Fewer regional pixels than histogram bins; gCNR is sensitive to undersampling. Inspect bin/radius sensitivity."
                )
        else:
            notes.append(
                "At least 8 target and 8 background pixels are required for contrast/CNR/gCNR."
            )
    elif not clipped:
        notes.append(
            "Target or background region has no grid pixels; regional scores are unavailable."
        )
    return {
        **values,
        "detections": detections,
        "target_pixels": int(inside.size),
        "background_pixels": int(outside.size),
        "roi_clipped": clipped,
        "half_power_boundary": boundary,
        "warnings": notes,
    }


def benchmark_run(project, run_id, settings=None):
    settings = settings or BenchmarkSettings()
    run = project.run(run_id)
    if run["status"] != "complete":
        raise ValueError("Benchmark requires a completed reconstruction")
    cfg = Config.model_validate(run["config"])
    with h5py.File(project.file(run_id), "r") as src:
        x, z = src["grid/x_m"][:], src["grid/z_m"][:]
        result = {}
        for method in run["methods"]:
            image = src[f"maps/{method}"][:]
            result[method] = map_metrics(image, x, z, cfg, settings) | {
                "map_sha256": hashlib.sha256(image.tobytes()).hexdigest()
            }
        fingerprints = {
            "raw_rf": str(src.attrs.get("rf_sha256", "unavailable")),
            "capture": hashlib.sha256(
                canonical(
                    {k: v for k, v in cfg.model_dump().items() if k not in ANALYSIS_CONFIG_FIELDS}
                ).encode()
            ).hexdigest(),
            "analysis": hashlib.sha256(
                canonical({k: cfg.model_dump().get(k) for k in ANALYSIS_CONFIG_FIELDS}).encode()
            ).hexdigest(),
            "engine": run["provenance"].get("engine_source_sha256", "unavailable"),
            "method_options": str(src.attrs.get("analysis_json", "{}")),
        }
        analysis_options = json.loads(fingerprints["method_options"])
        if "methods" in analysis_options:
            analysis_options["methods"] = sorted(analysis_options["methods"])
        context = {
            "capture": {
                k: v for k, v in cfg.model_dump().items() if k not in ANALYSIS_CONFIG_FIELDS
            },
            "analysis": {k: cfg.model_dump().get(k) for k in sorted(ANALYSIS_CONFIG_FIELDS)},
            "method_options": analysis_options,
            "implementation": {
                "methods": run["methods"],
                "packages": run["provenance"].get("packages", {}),
                "engine_version": run["provenance"].get("engine_version"),
            },
        }
        fingerprints["method_options"] = canonical(analysis_options)
        fingerprints["implementation"] = hashlib.sha256(
            canonical(context["implementation"]).encode()
        ).hexdigest()
    return {
        **IDENTITY,
        "run_id": run_id,
        "created": run["created"],
        "settings": settings.model_dump()
        | {"peaks": (settings.peaks or PeakSettings()).model_dump()},
        "methods": result,
        "fingerprints": fingerprints,
        "context": context,
        "definitions": DEFINITIONS,
        "reference": REFERENCE,
        "runtime_ms": (run["metrics"] or {}).get("runtime_ms"),
        "runtime_scope": "shared selected-method reconstruction wall time; not individual method timing",
        "rf_bytes": (run["metrics"] or {}).get("rf_bytes"),
        "map_bytes": (run["metrics"] or {}).get("map_bytes"),
        "grid_spacing_m": [float(x[1] - x[0]), float(z[1] - z[0])],
        "notes": [
            "Descriptive synthetic-truth evaluation; no universal composite score or clinical validity.",
            "Regional scores use linear maps and a common truth radius. Display dB/colour settings do not affect them.",
            "Runtime is shared; storage bytes are not peak RAM. Histogram estimates depend on bins and grid resolution.",
        ],
    }


def compare_reports(current, baseline):
    reasons = [
        key
        for key in ("raw_rf", "capture", "analysis", "engine", "method_options", "implementation")
        if current["fingerprints"].get(key) != baseline["fingerprints"].get(key)
        or current["fingerprints"].get(key) in (None, "unavailable")
    ]
    if current["settings"] != baseline["settings"]:
        reasons.append("benchmark_settings")
    if current["version"] != baseline["version"]:
        reasons.append("benchmark_definition")

    def flatten(value, prefix=""):
        if isinstance(value, dict) and value:
            return {
                p: v
                for k, item in sorted(value.items())
                for p, v in flatten(item, f"{prefix}.{k}" if prefix else k).items()
            }
        return {prefix: value}

    left, right = (
        flatten(current.get("context", {}) | {"evaluation": current["settings"]}),
        flatten(baseline.get("context", {}) | {"evaluation": baseline["settings"]}),
    )
    details = [
        {"field": key, "current": left.get(key), "reference": right.get(key)}
        for key in sorted(set(left) | set(right))
        if canonical(left.get(key)) != canonical(right.get(key))
    ]
    if "raw_rf" in reasons:
        details.insert(
            0,
            {
                "field": "raw_rf_sha256",
                "current": current["fingerprints"].get("raw_rf"),
                "reference": baseline["fingerprints"].get("raw_rf"),
            },
        )
    if "engine" in reasons:
        details.insert(
            0,
            {
                "field": "engine_source_sha256",
                "current": current["fingerprints"].get("engine"),
                "reference": baseline["fingerprints"].get("engine"),
            },
        )
    deltas = {
        method: {
            key: float(a[key] - b[key])
            if a.get(key) is not None and b.get(key) is not None
            else None
            for key in DEFINITIONS
        }
        for method, a in current["methods"].items()
        if (b := baseline["methods"].get(method)) is not None
    }
    return {
        "matched": not reasons,
        "differences": reasons,
        "details": details[:128],
        "detail_count": len(details),
        "deltas": deltas,
        "delta_convention": "current minus reference; SI units; descriptive differences, not significance or confidence intervals",
        "label": "Matched RF and settings"
        if not reasons
        else "Scenario comparison; settings or data differ",
    }


def report_csv(reports):
    stream = io.StringIO(newline="")
    keys = list(DEFINITIONS)
    fields = [
        "run_id",
        "method",
        "metric_version",
        "roi_radius_m",
        "histogram_bins",
        "peak_threshold_db",
        "peak_min_separation_m",
        "peak_match_tolerance_m",
        "peak_max_peaks",
        "detector_version",
        "detected_peaks_json",
        "truth_matches_json",
        *keys,
        "target_pixels",
        "background_pixels",
        "half_power_boundary",
        "map_sha256",
        "shared_runtime_ms",
        "rf_storage_bytes",
        "map_storage_bytes",
        "warnings",
        "role",
        "pair_matched",
        "pair_differences",
        "raw_rf_sha256",
        "capture_sha256",
        "analysis_sha256",
        "engine_source_sha256",
        *["delta_" + key for key in keys],
    ]
    writer = csv.DictWriter(stream, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    comparison = compare_reports(*reports) if len(reports) == 2 else None
    for index, report in enumerate(reports):
        for method, metrics in report["methods"].items():
            writer.writerow(
                {
                    "run_id": report["run_id"],
                    "method": method,
                    "metric_version": report["version"],
                    **{k: report["settings"][k] for k in ("roi_radius_m", "histogram_bins")},
                    **{
                        "peak_" + k: (metrics.get("detections") or {}).get("settings", {}).get(k)
                        for k in (
                            "threshold_db",
                            "min_separation_m",
                            "match_tolerance_m",
                            "max_peaks",
                        )
                    },
                    "detector_version": (metrics.get("detections") or {}).get("version"),
                    "detected_peaks_json": canonical(
                        (metrics.get("detections") or {}).get("peaks", [])
                    ),
                    "truth_matches_json": canonical(
                        (metrics.get("detections") or {}).get("truth", [])
                    ),
                    **{k: metrics.get(k) for k in keys},
                    **{
                        k: metrics.get(k)
                        for k in (
                            "target_pixels",
                            "background_pixels",
                            "half_power_boundary",
                            "map_sha256",
                        )
                    },
                    "shared_runtime_ms": report["runtime_ms"],
                    "rf_storage_bytes": report["rf_bytes"],
                    "map_storage_bytes": report["map_bytes"],
                    "warnings": "; ".join(metrics["warnings"]),
                    "role": "current" if index == 0 else "reference",
                    "pair_matched": comparison["matched"] if comparison else None,
                    "pair_differences": ";".join(comparison["differences"]) if comparison else "",
                    **{
                        name: report["fingerprints"].get(key)
                        for name, key in [
                            ("raw_rf_sha256", "raw_rf"),
                            ("capture_sha256", "capture"),
                            ("analysis_sha256", "analysis"),
                            ("engine_source_sha256", "engine"),
                        ]
                    },
                    **{
                        "delta_" + key: comparison["deltas"].get(method, {}).get(key)
                        if comparison and index == 0
                        else None
                        for key in keys
                    },
                }
            )
    return stream.getvalue()
