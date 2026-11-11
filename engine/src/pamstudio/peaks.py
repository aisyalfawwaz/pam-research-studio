"""Truth-independent regional maxima and gated one-to-one source matching."""

import numpy as np
from pydantic import Field
from scipy.ndimage import binary_dilation, find_objects, label, maximum_filter
from scipy.optimize import linear_sum_assignment

from .models import StrictModel


class PeakSettings(StrictModel):
    threshold_db: float = Field(default=-20, ge=-80, le=0)
    min_separation_m: float = Field(default=0.001, ge=0.00005, le=0.05)
    match_tolerance_m: float = Field(default=0.002, ge=0.00005, le=0.05)
    max_peaks: int = Field(default=32, ge=1, le=128)


def detect_peaks(image, x, z, settings):
    """One representative per 8-connected maximum plateau, then physical NMS.

    No truth coordinates or desired source count enter detection. Values are
    sampled grid coordinates, not an unsupported subpixel precision claim.
    """
    peak = float(image.max())
    if peak <= 0 or np.ptp(image) == 0:
        return [], {"regional_maxima": 0, "separation_suppressed": 0, "limit_reached": False}
    maximum = maximum_filter(image, size=3, mode="constant", cval=-np.inf)
    mask = (image == maximum) & (image > 0) & (image / peak >= 10 ** (settings.threshold_db / 10))
    regions, _ = label(mask, structure=np.ones((3, 3), dtype=int))
    candidates = []
    for index, slices in enumerate(find_objects(regions), 1):
        if slices is None:
            continue
        rows, cols = np.nonzero(regions[slices] == index)
        rows, cols = rows + slices[0].start, cols + slices[1].start
        # Deterministic centre-nearest actual plateau pixel; ties use row/column order.
        distance = (x[cols] - x[cols].mean()) ** 2 + (z[rows] - z[rows].mean()) ** 2
        i = int(np.argmin(distance))
        r, c = int(rows[i]), int(cols[i])
        # A flat shelf connected to a higher value is not a regional maximum,
        # even when its interior survives the local maximum filter.
        extent = tuple(
            slice(max(0, s.start - 1), min(image.shape[axis], s.stop + 1))
            for axis, s in enumerate(slices)
        )
        component = regions[extent] == index
        halo = binary_dilation(component, structure=np.ones((3, 3), dtype=bool)) & ~component
        if np.any(image[extent][halo] >= image[r, c]):
            continue
        candidates.append((float(image[r, c]), r, c))
    candidates.sort(key=lambda item: (-item[0], item[1], item[2]))
    selected, suppressed, eligible = [], 0, 0
    for value, r, c in candidates:
        if any(
            np.hypot(x[c] - p["x_m"], z[r] - p["z_m"]) < settings.min_separation_m for p in selected
        ):
            suppressed += 1
            continue
        eligible += 1
        if len(selected) >= settings.max_peaks:
            continue
        selected.append(
            {
                "index": len(selected),
                "x_m": float(x[c]),
                "z_m": float(z[r]),
                "row": r,
                "column": c,
                "linear_value": value,
                "relative_db": float(10 * np.log10(value / peak)),
                "boundary": r in (0, len(z) - 1) or c in (0, len(x) - 1),
                "source_index": None,
                "error_m": None,
            }
        )
    return selected, {
        "regional_maxima": len(candidates),
        "separation_suppressed": suppressed,
        "limit_reached": eligible > settings.max_peaks,
    }


def match_truth(peaks, sources, x, z, tolerance):
    truth = [
        {
            "source_index": i,
            "x_m": s.x_m,
            "z_m": s.z_m,
            "in_view": bool(x[0] <= s.x_m <= x[-1] and z[0] <= s.z_m <= z[-1]),
            "peak_index": None,
            "error_m": None,
            "status": "missed",
        }
        for i, s in enumerate(sources)
    ]
    visible = [t for t in truth if t["in_view"]]
    for t in truth:
        if not t["in_view"]:
            t["status"] = "outside_map"
    if visible and peaks:
        distances = np.linalg.norm(
            np.array([[t["x_m"], t["z_m"]] for t in visible])[:, None]
            - np.array([[p["x_m"], p["z_m"]] for p in peaks])[None],
            axis=2,
        )
        n, count = len(visible), len(peaks)
        # A dummy assignment costs > the sum of all possible valid distances.
        # Thus maximize number matched first, then minimize total distance.
        cost = np.full((n, count + n), n + 1.0, dtype=float)
        cost[:, :count] = np.where(
            distances <= tolerance + 1e-12, distances / tolerance, 2 * (n + 1.0)
        )
        rows, columns = linear_sum_assignment(cost)
        for r, c in zip(rows, columns, strict=True):
            if c >= count or distances[r, c] > tolerance + 1e-12:
                continue
            error = float(distances[r, c])
            t, p = visible[r], peaks[c]
            t.update(peak_index=int(c), error_m=error, status="matched")
            p.update(source_index=t["source_index"], error_m=error)
    errors = [t["error_m"] for t in visible if t["error_m"] is not None]
    tp, total = len(errors), len(visible)
    fp, fn = len(peaks) - tp, total - tp
    scores = {
        "detected_peaks": len(peaks),
        "matched_sources": tp,
        "missed_sources": fn,
        "false_positive_peaks": fp,
        "detection_precision": tp / len(peaks) if peaks else None,
        "detection_recall": tp / total if total else None,
        "detection_f1": 2 * tp / (2 * tp + fp + fn) if total else None,
        "matched_mean_error_m": float(np.mean(errors)) if errors else None,
        "matched_rmse_m": float(np.sqrt(np.mean(np.square(errors)))) if errors else None,
    }
    return truth, scores


def evaluate_peaks(image, x, z, cfg, settings=None):
    settings = settings or PeakSettings()
    peaks, diagnostics = detect_peaks(image, x, z, settings)
    truth, scores = match_truth(peaks, cfg.sources, x, z, settings.match_tolerance_m)
    notes = [
        "Peaks are detected from the linear map alone, without using truth or forcing a source count. One peak can match at most one source. Unresolved sources may share one lobe and remain missed."
    ]
    if np.ptp(image) == 0:
        notes.append("Constant/zero map: no distinct local maximum.")
    if diagnostics["limit_reached"]:
        notes.append(
            "Peak limit reached; increase the cap or threshold/separation. Detection scores depend on this cap."
        )
    if any(p["boundary"] for p in peaks):
        notes.append(
            "Some detected peaks touch the map boundary; inspect field-of-view truncation."
        )
    if any(not t["in_view"] for t in truth):
        notes.append("Out-of-view truth is listed separately and excluded from recall.")
    if settings.match_tolerance_m < np.hypot(np.max(np.diff(x)), np.max(np.diff(z))) / 2:
        notes.append(
            "Matching tolerance is smaller than half a grid-cell diagonal; quantization can cause misses."
        )
    return {
        "id": "pam.peaks.regional_nms",
        "version": "1.0.0",
        "settings": settings.model_dump(),
        "peaks": peaks,
        "truth": truth,
        "scores": scores,
        "diagnostics": diagnostics,
        "notes": notes,
    }
