"""Local research reports from immutable runs/studies; no renderer HTML or network."""

import io
import json
import os
import re
import threading
from pathlib import Path
from uuid import uuid4
from xml.sax.saxutils import escape

import h5py
import numpy as np
from matplotlib.backends.backend_agg import FigureCanvasAgg
from matplotlib.figure import Figure
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    CondPageBreak,
    Image,
    LongTable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    TableStyle,
)

from .benchmark import benchmark_run
from .exporting import HEAD_CT_REFERENCE, JBUBBLE_REFERENCE, JWAVE_REFERENCE, REFERENCES
from .methods import ReconstructionOptions
from .models import Config
from .storage import digest

PLOT_LOCK = threading.Lock()


def references():
    entries = []
    for entry in (REFERENCES + JWAVE_REFERENCE + JBUBBLE_REFERENCE + HEAD_CT_REFERENCE).split("@"):
        if not entry.strip():
            continue

        def field(name):
            found = re.search(r"\b" + name + r"\s*=\s*\{([^}]+)\}", entry)
            return found.group(1) if found else ""

        entries.append(
            ". ".join(
                v
                for v in (
                    field("author"),
                    field("title"),
                    field("year"),
                    "doi:" + field("doi") if field("doi") else field("url"),
                )
                if v
            )
        )
    entries.extend(
        [
            "Rodriguez-Molares, Rindal, D'Hooge, Masoy, Austeng, Lediju Bell and Torp. Generalized Contrast-to-Noise Ratio (2020). doi:10.1109/TUFFC.2019.2956855. PAM truth-disk use here is descriptive.",
            "ReportLab: Andy Robinson, Robin Becker, ReportLab team and community. ReportLab Toolkit 5.1.0; BSD license. No remote rendering.",
            "SciPy bootstrap percentile mean intervals: Virtanen and contributors; scipy.stats.bootstrap. Small-sample coverage is not validated for these PAM scores.",
        ]
    )
    return entries


def presentation_context(project, run_id, settings=None):
    run = project.run(run_id)
    if run["status"] not in ("simulated", "complete"):
        raise ValueError("Presentation export requires a successful immutable run")
    with h5py.File(project.file(run_id), "r") as src:
        raw = str(src.attrs.get("rf_sha256", "not available"))
    return {
        "definition_version": "1.0.0",
        "run": run,
        "benchmark": benchmark_run(project, run_id, settings)
        if run["status"] == "complete"
        else None,
        "results_h5_sha256": digest(project.file(run_id)),
        "rf_sha256": raw,
        "references": references(),
        "credit": "Aisy Fawwaz | MRes Project | Bioengineering | Imperial College London",
        "limitations": "Synthetic/model research output; reference/experimental methods. Not a clinical calibration or safety assessment.",
    }


def styles():
    from matplotlib import font_manager

    font = font_manager.findfont("DejaVu Sans")
    if "StudioSans" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("StudioSans", font))
    sheet = getSampleStyleSheet()
    for name in ("Normal", "BodyText", "Title", "Heading1", "Heading2", "Heading3"):
        sheet[name].fontName = "StudioSans"
        sheet[name].alignment = TA_LEFT
    sheet["BodyText"].fontSize = 8.5
    sheet["BodyText"].leading = 12
    sheet["Title"].fontSize = 20
    sheet["Title"].leading = 26
    sheet["Heading2"].fontSize = 11
    sheet["Heading2"].leading = 15
    sheet["Heading2"].spaceBefore = 12
    for name in ("Heading1", "Heading2", "Heading3"):
        sheet[name].keepWithNext = True
    sheet.add(ParagraphStyle(name="TableHeading", parent=sheet["Heading2"], keepWithNext=False))
    sheet.add(ParagraphStyle(name="TableLead", parent=sheet["BodyText"], keepWithNext=True))
    sheet.add(
        ParagraphStyle(
            name="SmallStudio", fontName="StudioSans", fontSize=7, leading=10, wordWrap="CJK"
        )
    )
    return sheet


def text(value, sheet, style="BodyText"):
    return Paragraph(escape(str(value)).replace("\n", "<br/>"), sheet[style])


def table(rows, widths, sheet):
    data = [[text(v, sheet, "SmallStudio") for v in row] for row in rows]
    result = LongTable(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    result.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e9eef3")),
                ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#ccd4dc")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return result


def image(fig, width_mm=177):
    buffer = io.BytesIO()
    FigureCanvasAgg(fig)
    fig.savefig(buffer, format="png", dpi=160, bbox_inches="tight")
    buffer.seek(0)
    result = Image(buffer)
    scale = width_mm * mm / result.imageWidth
    result.drawWidth = width_mm * mm
    result.drawHeight = result.imageHeight * scale
    return result


def fmt(v, scale=1):
    return "Unavailable" if v is None else f"{v * scale:.5g}"


def run_story(project, context, sheet):
    run = context["run"]
    cfg = Config.model_validate(run["config"])
    options = ReconstructionOptions.model_validate(
        run["provenance"].get("reconstruction_options") or {}
    )
    rows = [
        ["Record", "Value"],
        ["Run", run["id"]],
        ["Created", run["created"]],
        ["Status / methods", run["status"] + " / " + ", ".join(run["methods"])],
        [
            "Capture",
            f"{cfg.channels} channels; {cfg.samples} samples; fs {cfg.sampling_hz / 1e6:g} MHz; t0 {cfg.capture_t0_s * 1e6:g} us",
        ],
        [
            "Grid / gate",
            f"{cfg.grid_n} x {cfg.grid_n}; x {cfg.grid_x_min_m * 1000:g}..{cfg.grid_x_max_m * 1000:g} mm; z {cfg.grid_z_min_m * 1000:g}..{cfg.grid_z_max_m * 1000:g} mm; gate {cfg.gate_start_s * 1e6:g}..{cfg.gate_end_s * 1e6:g} us; stride {cfg.gate_stride}",
        ],
        [
            "Receive model",
            options.receive_model
            + (
                f"; ray step {options.ray_step_m * 1000:g} mm"
                if options.receive_model == "ct_slowness"
                else ""
            ),
        ],
        [
            "Engine",
            str(run["provenance"].get("engine_version"))
            + " / "
            + str(run["provenance"].get("engine_source_sha256")),
        ],
        ["Results HDF5 SHA-256", context["results_h5_sha256"]],
        ["Raw RF SHA-256", context["rf_sha256"]],
    ]
    story = [
        text("Experiment settings", sheet, "Heading2"),
        table(rows, [38 * mm, 139 * mm], sheet),
    ]
    if context["benchmark"]:
        rows = [["Method", "Global peak error mm", "gCNR", "ROI %", "CNR", "FWHM x / z mm"]]
        for method, score in context["benchmark"]["methods"].items():
            rows.append(
                [
                    method.upper(),
                    fmt(score["localization_error_m"], 1000),
                    fmt(score["gcnr"]),
                    fmt(score["roi_concentration"], 100),
                    fmt(score["cnr"]),
                    fmt(score["lateral_fwhm_m"], 1000) + " / " + fmt(score["axial_fwhm_m"], 1000),
                ]
            )
        story.extend(
            [
                text("PAM benchmark", sheet, "Heading2"),
                text(
                    "Truth disk radius 2 mm; 100 histogram bins. Undefined/truncated/sparse metrics remain unavailable. No composite score or clinical threshold.",
                    sheet,
                ),
                table(rows, [26 * mm, 27 * mm, 24 * mm, 24 * mm, 24 * mm, 52 * mm], sheet),
            ]
        )
    with h5py.File(project.file(run["id"]), "r") as src:
        if run["methods"]:
            if context["benchmark"]:
                story.extend(
                    [
                        CondPageBreak(40 * mm),
                        text("Multiple-source localization", sheet, "TableHeading"),
                    ]
                )
                for method, scores in context["benchmark"]["methods"].items():
                    detection = scores["detections"]
                    params = detection["settings"]
                    story.append(
                        text(
                            f"{method.upper()}: {scores['matched_sources']} matched, {scores['missed_sources']} missed, {scores['false_positive_peaks']} unmatched peaks; F1 {fmt(scores['detection_f1'])}; matched RMSE {fmt(scores['matched_rmse_m'], 1000)} mm. Threshold {params['threshold_db']:g} dB, separation {params['min_separation_m'] * 1000:g} mm, matching tolerance {params['match_tolerance_m'] * 1000:g} mm, peak cap {params['max_peaks']}.",
                            sheet,
                            "TableLead",
                        )
                    )
                    rows = [
                        [
                            "Truth",
                            "Truth x / z mm",
                            "Peak",
                            "Detected x / z mm",
                            "Error mm",
                            "Status",
                        ]
                    ]
                    for target in detection["truth"]:
                        p = (
                            detection["peaks"][target["peak_index"]]
                            if target["peak_index"] is not None
                            else None
                        )
                        rows.append(
                            [
                                f"S{target['source_index'] + 1}",
                                f"{target['x_m'] * 1000:g} / {target['z_m'] * 1000:g}",
                                f"P{p['index'] + 1}" if p else "Unavailable",
                                f"{p['x_m'] * 1000:g} / {p['z_m'] * 1000:g}"
                                if p
                                else "Unavailable",
                                fmt(target["error_m"], 1000),
                                target["status"],
                            ]
                        )
                    story.append(
                        table(rows, [15 * mm, 40 * mm, 23 * mm, 45 * mm, 23 * mm, 31 * mm], sheet)
                    )
                story.append(
                    text(
                        "Detection uses the map alone; one peak can match at most one source. Unresolved sources remain missed. Matched errors exclude misses; inspect recall together with localization error. Full peak coordinates and assignments are in the companion JSON.",
                        sheet,
                    )
                )
            methods = list(run["methods"])
            fig = Figure(figsize=(8, 3.4 * int(np.ceil(len(methods) / 2))), layout="constrained")
            axes = fig.subplots(int(np.ceil(len(methods) / 2)), 2, squeeze=False).ravel()
            x, z = src["grid/x_m"][:], src["grid/z_m"][:]
            for ax, method in zip(axes, methods):
                m = src[f"maps/{method}"][:]
                db = 10 * np.log10(np.maximum(m / max(m.max(), 1e-300), 1e-8))
                im = ax.imshow(
                    db,
                    origin="upper",
                    extent=[x[0] * 1000, x[-1] * 1000, z[-1] * 1000, z[0] * 1000],
                    aspect="auto",
                    vmin=-40,
                    vmax=0,
                    cmap="viridis",
                )
                ax.scatter(
                    [s.x_m * 1000 for s in cfg.sources],
                    [s.z_m * 1000 for s in cfg.sources],
                    marker="+",
                    c="white",
                    s=35,
                )
                detection = context["benchmark"]["methods"][method]["detections"]
                for p in detection["peaks"]:
                    ax.plot(
                        p["x_m"] * 1000,
                        p["z_m"] * 1000,
                        marker="D",
                        ms=4,
                        mfc="none",
                        mec="lime" if p["source_index"] is not None else "orange",
                    )
                    ax.annotate(
                        f"P{p['index'] + 1}",
                        (p["x_m"] * 1000, p["z_m"] * 1000),
                        xytext=(4, 4),
                        textcoords="offset points",
                        fontsize=6,
                        color="white",
                    )
                ax.set(
                    xlabel="Lateral x (mm)",
                    ylabel="Depth z (mm)",
                    title=method.upper() + " | own peak = 0 dB",
                )
                fig.colorbar(im, ax=ax, label="dB")
            for ax in axes[len(methods) :]:
                ax.set_visible(False)
            # At most six maps; keep the figure on a page at a readable size.
            story.extend([text("Calculated PAM maps", sheet, "Heading2"), image(fig)])
        fig = Figure(figsize=(8, 3.2), layout="constrained")
        ax = fig.subplots()
        if "rf" in src:
            rf = src["rf"][0, :, 0]
            t = cfg.capture_t0_s + np.arange(len(rf)) / cfg.sampling_hz
            ax.plot(t * 1e6, rf, lw=0.7)
            ax.set(
                xlabel="Capture time (us)",
                ylabel="Raw RF (a.u.)",
                title="Receiver 0 | raw acquisition",
            )
            story.extend([text("RF inspection", sheet, "Heading2"), image(fig)])
        if "bubble/trajectory" in src:
            fig = Figure(figsize=(8, 3.3), layout="constrained")
            ax = fig.subplots()
            for i, source in enumerate(cfg.sources):
                if "bubble/population" in src:
                    data = src["bubble/population"][:]
                    curve = data[data[:, 0] == i, 1:]
                else:
                    curve = src["bubble/trajectory"][:]
                ax.plot(curve[:, 0] * 1e6, curve[:, 1] * 1e6, lw=0.8, label=f"S{i + 1}")
            ax.set(
                xlabel="Time from drive centre (us)",
                ylabel="Radius (um)",
                title="Independent radial solutions",
            )
            ax.legend()
            rows = [["Source", "Position x/z mm", "R0 um", "Drive kPa", "Shell", "RF weight"]]
            for i, s in enumerate(cfg.sources):
                b = s.bubble or cfg.bubble
                rows.append(
                    [
                        f"S{i + 1}",
                        f"{s.x_m * 1000:g} / {s.z_m * 1000:g}",
                        fmt(b.radius_m, 1e6),
                        fmt(b.drive_pa, 0.001),
                        b.model,
                        str(s.amplitude),
                    ]
                )
            story.extend(
                [
                    text("Bubble population", sheet, "Heading2"),
                    image(fig),
                    table(rows, [17 * mm, 43 * mm, 24 * mm, 28 * mm, 30 * mm, 35 * mm], sheet),
                ]
            )
    story.append(text("Model limitations and calibration", sheet, "Heading2"))
    for note in cfg.warnings():
        story.append(text(note, sheet))
    if options.receive_model == "ct_slowness":
        story.append(
            text(
                "CT timing uses fixed-ray slowness integration only. Refraction, diffraction, shear, attenuation, multipath and amplitude correction are not included.",
                sheet,
            )
        )
    if options.assumed_sound_speed_m_s is not None:
        story.append(
            text(
                f"Capture sound speed {cfg.sound_speed_m_s:g} m/s; assumed reconstruction speed {options.assumed_sound_speed_m_s:g} m/s. Actual and assumed calibration are deliberately different in this uncertainty trial.",
                sheet,
            )
        )
    return story


def study_story(record, sheet):
    story = [
        text(
            f"{record['kind']} | {record['status']} | {record['completed']}/{record['total']} completed",
            sheet,
        ),
        text("Study " + record["id"] + " | created " + record["created"], sheet),
        text(
            "Frozen study definition and case seeds are included in the companion JSON. Cases are independent immutable experiment runs.",
            sheet,
        ),
    ]
    for note in record["plan"]["notes"]:
        story.append(text(note, sheet))
    summary = record.get("summary") or {}
    if summary.get("cases"):
        rows = [["Parameter (SI)", "RF relative L2", "Map relative L2 by method", "Run"]]
        for c in summary["cases"]:
            rows.append(
                [
                    str(c["value"]),
                    fmt(c["rf_relative_l2"]),
                    "; ".join(f"{k}: {v:.5g}" for k, v in c["map_relative_l2"].items()),
                    c["run_id"],
                ]
            )
        story.extend(
            [
                text("Numerical convergence: " + summary["stability"], sheet, "Heading2"),
                text(summary["note"], sheet),
                table(rows, [30 * mm, 30 * mm, 70 * mm, 47 * mm], sheet),
            ]
        )
    if summary.get("methods"):
        story.extend(
            [CondPageBreak(40 * mm), text("Uncertainty of trial scores", sheet, "TableHeading")]
        )
        rows = [
            [
                "Method / metric (SI)",
                "Valid / total",
                "Mean / SD",
                "95% mean bootstrap CI",
                "Central 95% of trials",
            ]
        ]
        for method, metrics in summary["methods"].items():
            for key, s in metrics.items():
                rows.append(
                    [
                        method + " / " + key,
                        f"{s['valid']} / {s['total']}",
                        fmt(s["mean"]) + "\n" + fmt(s.get("sample_sd")),
                        "\n".join(fmt(v) for v in s["mean_ci95"])
                        if s["mean_ci95"]
                        else "Unavailable",
                        "\n".join(fmt(v) for v in s.get("empirical_interval95", [])),
                    ]
                )
        story.append(table(rows, [47 * mm, 22 * mm, 33 * mm, 38 * mm, 37 * mm], sheet))
        for note in summary["notes"]:
            story.append(text(note, sheet))
    reports = [c for c in record["cases"] if c.get("report")]
    if reports:
        fig = Figure(figsize=(8, 3.5), layout="constrained")
        ax = fig.subplots()
        for method in record["request"]["options"]["methods"]:
            pairs = [
                (c["index"] + 1, c["report"]["methods"][method]["localization_error_m"] * 1000)
                for c in reports
                if c["report"]["methods"][method]["localization_error_m"] is not None
            ]
            if pairs:
                ax.plot(*np.asarray(pairs).T, ".-", label=method.upper(), lw=0.8)
        ax.set(
            xlabel="Case index",
            ylabel="Global peak error (mm)",
            title="Computed cases; inspect experimental parameters below",
        )
        ax.legend()
        story.append(image(fig))
    rows = [["Case", "Status", "Parameters (SI)", "Run / failure"]]
    for c in record["cases"]:
        rows.append(
            [
                str(c["index"] + 1),
                c["status"],
                "; ".join(
                    f"{k}={v if k in ('seed', 'trial') else format(v, '.6g')}"
                    for k, v in c["parameters"].items()
                ),
                c["run_id"] or c.get("error") or "Not executed",
            ]
        )
    story.extend(
        [
            CondPageBreak(40 * mm),
            text("Case inventory", sheet, "TableHeading"),
            table(rows, [14 * mm, 30 * mm, 80 * mm, 53 * mm], sheet),
        ]
    )
    return story


def export_pdf(project, path, run_id=None, study=None, settings=None):
    target = Path(path)
    if target.suffix.lower() != ".pdf":
        raise ValueError("Research report filename must end in .pdf")
    context = (
        presentation_context(project, run_id, settings)
        if run_id
        else {
            "study": study,
            "references": references(),
            "credit": "Aisy Fawwaz | MRes Project | Bioengineering | Imperial College London",
        }
    )
    if study and study["status"] in ("running", "cancelling"):
        raise ValueError("Stop or finish a study before exporting its report")
    temp = target.with_name(target.name + "." + uuid4().hex + ".tmp")
    json_path = target.with_suffix(".report.json")
    json_temp = json_path.with_name(json_path.name + "." + uuid4().hex + ".tmp")
    try:
        with PLOT_LOCK:
            sheet = styles()
            story = [
                text("PAM Research Studio", sheet, "Title"),
                text(
                    "Research experiment report" if run_id else "Research study report",
                    sheet,
                    "Heading2",
                ),
                text(project.name, sheet),
                text(context["credit"], sheet),
                Spacer(1, 5 * mm),
            ]
            story.extend(
                run_story(project, context, sheet) if run_id else study_story(study, sheet)
            )
            story.extend(
                [text("References and software credit", sheet, "Heading2")]
                + [text(r, sheet, "SmallStudio") for r in context["references"]]
            )
            doc = SimpleDocTemplate(
                str(temp),
                pagesize=A4,
                leftMargin=16 * mm,
                rightMargin=16 * mm,
                topMargin=17 * mm,
                bottomMargin=18 * mm,
                title="PAM Research Studio research report",
                author="Aisy Fawwaz; upstream scientific authors credited separately",
            )

            def footer(canvas, doc):
                canvas.setFont("StudioSans", 7)
                canvas.setFillColor(colors.HexColor("#536575"))
                canvas.drawString(
                    16 * mm,
                    10 * mm,
                    "PAM Research Studio | model research output | full provenance in companion JSON",
                )
                canvas.drawRightString(194 * mm, 10 * mm, str(doc.page))

            doc.build(story, onFirstPage=footer, onLaterPages=footer)
        context["pdf_sha256"] = digest(temp)
        json_temp.write_text(json.dumps(context, indent=2, allow_nan=False), encoding="utf-8")
        os.replace(temp, target)
        os.replace(json_temp, json_path)
        return {
            "path": str(target),
            "context_path": str(json_path),
            "sha256": context["pdf_sha256"],
        }
    finally:
        temp.unlink(missing_ok=True)
        json_temp.unlink(missing_ok=True)
