import { useEffect, useMemo, useState } from "react";
import type {
  BenchmarkReport,
  BenchmarkComparison,
  BenchmarkEvaluation,
  BinaryArray,
  Method,
  Run,
} from "../../../packages/contracts";
import {
  methodKeys,
  methodLabels,
  benchmarkSettingsSchema,
  uuid,
} from "../../../packages/contracts";
import { NumericProperty } from "./InstrumentControls";
import { RasterPlot } from "./plots";
import { EmptyView, mapDomain, runLabel } from "./WorkspaceViews";
import { request } from "./useWorkbench";
import type { Workbench } from "./useWorkbench";
import { PeakControls, PeakResults } from "./PeakEvaluation";

type MetricKey =
  | "localization_error_m"
  | "gcnr"
  | "roi_concentration"
  | "background_peak_db"
  | "detection_recall"
  | "detection_f1"
  | "matched_rmse_m";
const format = (v: number | null | undefined, scale = 1, digits = 3) =>
  v == null || !Number.isFinite(v) ? "—" : (v * scale).toFixed(digits);
const fingerprintLabels: Record<string, string> = {
  raw_rf: "raw RF",
  capture: "capture / medium",
  analysis: "grid, gate, aperture or DSP",
  engine: "engine source",
  method_options: "method selection / parameters",
  implementation: "method identity / library versions",
  benchmark_settings: "evaluation region / histogram / peak criteria",
  benchmark_definition: "benchmark definition version",
};
const metricSorts = [
  "detection_recall",
  "detection_f1",
  "matched_rmse_m",
  "localization_error_m",
  "gcnr",
  "roi_concentration",
  "background_peak_db",
];
function readSelection(projectId: string | undefined) {
  try {
    const value = JSON.parse(
      localStorage.getItem(`pam.benchmark.selection.${projectId}`) || "{}",
    );
    return {
      runId: uuid.safeParse(value.runId).success ? String(value.runId) : "",
      referenceId: uuid.safeParse(value.referenceId).success
        ? String(value.referenceId)
        : "",
      method: methodKeys.includes(value.method)
        ? (value.method as Method)
        : null,
      sort: metricSorts.includes(value.sort)
        ? (value.sort as MetricKey)
        : ("localization_error_m" as MetricKey),
    };
  } catch {
    return {
      runId: "",
      referenceId: "",
      method: null,
      sort: "localization_error_m" as MetricKey,
    };
  }
}
const describeValue = (value: unknown, field: string) => {
  if (value == null && field === "analysis.active_channels")
    return "All captured channels";
  if (value === null || value === undefined) return "Not configured";
  if (Array.isArray(value) && value.length > 8)
    return `${value.length} entries: ${JSON.stringify(value.slice(0, 8))}…`;
  const text = JSON.stringify(value);
  return text.length > 150 ? text.slice(0, 150) + "…" : text;
};
const deltaFormat = (v: number | null | undefined, scale = 1, digits = 3) =>
  v == null ? "—" : `${v >= 0 ? "+" : ""}${format(v, scale, digits)}`;
function readSettings() {
  try {
    return benchmarkSettingsSchema.parse(
      JSON.parse(localStorage.getItem("pam.benchmark.v1") || "null"),
    );
  } catch {
    return { roi_radius_m: 0.002, histogram_bins: 100 };
  }
}

export function BenchmarkView({ w }: { w: Workbench }) {
  const completed = w.runs.filter((r) => r.status === "complete");
  const [initialSelection] = useState(() =>
    readSelection(w.project?.project_id),
  );
  const [selectedId, setSelectedId] = useState(
    w.run?.status === "complete"
      ? w.run.id
      : initialSelection.runId || completed[0]?.id || "",
  );
  const runId = completed.some((r) => r.id === selectedId)
    ? selectedId
    : completed[0]?.id || "";
  const [baselineId, setBaselineId] = useState(initialSelection.referenceId);
  const [initialSettings] = useState(readSettings);
  const [radius, setRadius] = useState(initialSettings.roi_radius_m * 1000),
    [bins, setBins] = useState(initialSettings.histogram_bins);
  const [method, setMethod] = useState<Method>(
      w.run?.status === "complete"
        ? w.method
        : initialSelection.method || w.method,
    ),
    [sort, setSort] = useState<MetricKey>(initialSelection.sort);
  const [reports, setReports] = useState<BenchmarkReport[]>([]),
    [records, setRecords] = useState<Run[]>([]);
  const [maps, setMaps] = useState<(BinaryArray | null)[]>([]),
    [loading, setLoading] = useState(false),
    [exporting, setExporting] = useState(false);
  const [comparison, setComparison] = useState<BenchmarkComparison | null>(
    null,
  );
  const settings = useMemo(
    () => ({
      roi_radius_m: radius / 1000,
      histogram_bins: bins,
      peaks: w.peakSettings,
    }),
    [radius, bins, w.peakSettings],
  );
  useEffect(() => {
    localStorage.setItem("pam.benchmark.v1", JSON.stringify(settings));
  }, [settings]);
  const referenceId =
    baselineId !== runId && completed.some((r) => r.id === baselineId)
      ? baselineId
      : "";
  useEffect(() => {
    if (w.run?.status === "complete") setSelectedId(w.run.id);
  }, [w.run?.id]);
  useEffect(() => {
    setReports([]);
    setComparison(null);
    if (!runId) return;
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      const ids = referenceId ? [runId, referenceId] : [runId];
      Promise.all([
        request<BenchmarkEvaluation>("evaluateBenchmark", {
          run_ids: ids,
          settings,
        }),
        Promise.all(ids.map((id) => request<Run>("run", id))),
      ])
        .then(([result, runs]) => {
          if (active) {
            setReports(result.reports);
            setComparison(result.comparison);
            setRecords(runs);
          }
        })
        .catch((error) => {
          if (active) {
            w.setError(String(error));
            w.log(String(error), "error");
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [runId, referenceId, settings, w.project]);
  const available = methodKeys.filter((m) => reports.some((r) => r.methods[m]));
  const selected =
    available.includes(method) || !reports.length
      ? method
      : available[0] || "das";
  const recordKey = records
    .map((r) => r.id + ":" + Object.keys(r.methods).sort().join(","))
    .join(";");
  useEffect(() => {
    if (records[0] && records[0].id === runId) w.activateRun(records[0]);
  }, [records, runId, w.activateRun]);
  useEffect(() => {
    if (reports[0]?.methods[selected]) w.setMethod(selected);
  }, [selected, reports, w.setMethod]);
  useEffect(() => {
    if (w.project)
      localStorage.setItem(
        `pam.benchmark.selection.${w.project.project_id}`,
        JSON.stringify({ runId, referenceId, method: selected, sort }),
      );
  }, [runId, referenceId, selected, sort, w.project]);
  useEffect(() => {
    let active = true;
    setMaps([]);
    Promise.all(
      records.map((r) =>
        r.methods[selected]
          ? window.pam.array(r.id, selected)
          : Promise.resolve(null),
      ),
    )
      .then((result) => {
        if (active) setMaps(result);
      })
      .catch((error) => {
        if (active) w.setError(String(error));
      });
    return () => {
      active = false;
    };
  }, [recordKey, selected]);
  const current = reports[0],
    metric = current?.methods[selected];
  const differences = comparison?.differences || [];
  const rows = reports
    .flatMap((r, i) =>
      methodKeys
        .filter((m) => r.methods[m])
        .map((m) => ({
          report: r,
          index: i,
          method: m,
          metrics: r.methods[m]!,
        })),
    )
    .sort((a, b) => {
      const av = a.metrics[sort],
        bv = b.metrics[sort];
      if (av == null) return bv == null ? 0 : 1;
      if (bv == null) return -1;
      return (
        (av - bv) *
        ([
          "gcnr",
          "roi_concentration",
          "detection_recall",
          "detection_f1",
        ].includes(sort)
          ? -1
          : 1)
      );
    });
  const exportReport = async (format: "csv" | "json") => {
    setExporting(true);
    try {
      const result = await window.pam.exportBenchmark(
        reports.map((r) => r.run_id),
        settings,
        format,
      );
      if (result) w.log(`Exported PAM benchmark: ${result.path}`);
    } catch (error) {
      w.setError(String(error));
    } finally {
      setExporting(false);
    }
  };
  if (!completed.length)
    return (
      <EmptyView
        title="No completed PAM reconstruction"
        text="Simulate RF and reconstruct one or more methods, then open Benchmark to evaluate the saved linear maps against configured truth."
      />
    );
  return (
    <div className="benchmark-workspace">
      <div className="model-toolbar">
        <strong>PAM benchmark</strong>
        <span>Saved numerical results</span>
        <button
          disabled={loading || !records[0]?.methods[selected] || w.locked}
          onClick={() => {
            w.activateRun(records[0], "map");
            w.setMethod(selected);
          }}
        >
          Inspect PAM
        </button>
        <button
          disabled={loading || w.run?.id !== runId || !w.rawRF || w.locked}
          onClick={() => w.activateRun(records[0], "rf")}
        >
          Inspect RF
        </button>
        <button
          disabled={loading || w.run?.id !== runId || w.locked}
          onClick={() => void w.loadRunConfig()}
        >
          Load saved settings
        </button>
        <div className="strip-space" />
        <button
          disabled={loading || !reports.length || exporting}
          onClick={() => void exportReport("csv")}
        >
          Export scores CSV…
        </button>
        <button
          disabled={loading || !reports.length || exporting}
          onClick={() => void exportReport("json")}
        >
          Export report JSON…
        </button>
      </div>
      <div className="benchmark-content">
        <div className="benchmark-controls">
          <label>
            Evaluate run
            <select
              aria-label="Benchmark run"
              value={runId}
              onChange={(e) => {
                setSelectedId(e.target.value);
                void w.selectRun(e.target.value, "benchmark");
              }}
            >
              {completed.map((r) => (
                <option key={r.id} value={r.id}>
                  {runLabel(r.id, w.runs)} · {r.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Reference run
            <select
              aria-label="Benchmark reference run"
              value={referenceId}
              onChange={(e) => setBaselineId(e.target.value)}
            >
              <option value="">No reference</option>
              {completed
                .filter((r) => r.id !== runId)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {runLabel(r.id, w.runs)} · {r.id.slice(0, 8)}
                  </option>
                ))}
            </select>
          </label>
          <NumericProperty
            label="Truth ROI radius"
            accessibleLabel="Benchmark truth ROI radius (mm)"
            value={radius}
            min={0.5}
            max={10}
            step={0.5}
            unit="mm"
            onChange={(v) => {
              setRadius(Math.max(0.5, Math.min(10, v)));
            }}
          />
          <label>
            Histogram bins
            <select
              aria-label="Benchmark histogram bins"
              value={bins}
              onChange={(e) => setBins(Number(e.target.value))}
            >
              {[16, 32, 64, 100, 128, 256].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="benchmark-context">
          Truth regions are the union of disks around configured source
          coordinates. Dashed outlines show this region. Scores use linear maps;
          display colour and dB range do not alter them. Draft edits do not
          change a saved result. Maps use each map’s own peak as 0 dB.
        </p>
        <PeakControls
          value={w.peakSettings}
          onChange={w.setPeakSettings}
          disabled={w.locked || exporting}
        />
        <p className="peak-note">
          Threshold is relative power: 10 log10(map / map maximum). Separation
          merges nearby detections; matching tolerance only assigns peaks to
          truth and never changes where peaks are found. A merged lobe cannot
          establish two resolved bubbles.
        </p>
        {loading ? <p role="status">Calculating map benchmarks…</p> : null}
        {current ? (
          <>
            {reports.length === 2 ? (
              <div
                className={`benchmark-match ${differences.length ? "different" : ""}`}
                role="status"
              >
                <strong>
                  {differences.length
                    ? "Scenario comparison"
                    : "Matched RF and settings"}
                </strong>
                <span>
                  {differences.length
                    ? `Differences: ${differences.map((k) => fingerprintLabels[k]).join("; ")}. Interpret changes as an experiment, not an isolated algorithm ranking.`
                    : "RF hashes, capture, grid/gate/aperture/DSP, engine and method parameters agree."}
                </span>
              </div>
            ) : null}
            {comparison?.details.length ? (
              <details className="benchmark-change-details">
                <summary>
                  Inspect {comparison.detail_count} changed parameter
                  {comparison.detail_count === 1 ? "" : "s"}
                </summary>
                <table aria-label="Changed experiment parameters">
                  <thead>
                    <tr>
                      <th>Parameter</th>
                      <th>Current · SI values</th>
                      <th>Reference · SI values</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.details.map((d) => (
                      <tr key={d.field}>
                        <th>{d.field}</th>
                        <td>{describeValue(d.current, d.field)}</td>
                        <td>{describeValue(d.reference, d.field)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {comparison.detail_count > comparison.details.length ? (
                  <p>
                    First {comparison.details.length} differences shown; full
                    settings are in the JSON report.
                  </p>
                ) : null}
              </details>
            ) : null}
            <div className="benchmark-method-strip">
              <label>
                Inspect method{" "}
                <select
                  aria-label="Benchmark inspect method"
                  value={selected}
                  onChange={(e) => setMethod(e.target.value as Method)}
                >
                  {available.map((m) => (
                    <option key={m} value={m}>
                      {methodLabels[m]}
                    </option>
                  ))}
                </select>
              </label>
              <span>
                ROI {metric?.target_pixels ?? "—"} / background{" "}
                {metric?.background_pixels ?? "—"} pixels · {bins} histogram
                bins · v{current.version}
              </span>
            </div>
            <div className="benchmark-scores" aria-label="PAM quality scores">
              {[
                [
                  "Matched / truth",
                  `${metric?.matched_sources ?? "—"} / ${metric?.detections?.truth.filter((t) => t.in_view).length ?? "—"}`,
                  "one-to-one within tolerance",
                ],
                [
                  "Detection F1",
                  format(metric?.detection_f1),
                  "inspect missed and extra peaks",
                ],
                [
                  "Matched RMSE",
                  format(metric?.matched_rmse_m, 1000),
                  "mm · matched sources only",
                ],
                [
                  "Missed / extra peaks",
                  `${metric?.missed_sources ?? "—"} / ${metric?.false_positive_peaks ?? "—"}`,
                  "extra peaks have no truth match",
                ],
                [
                  "Global peak error",
                  format(metric?.localization_error_m, 1000),
                  "mm · lower is better",
                ],
                ["gCNR", format(metric?.gcnr), "0–1 · greater separation"],
                [
                  "ROI concentration",
                  format(metric?.roi_concentration, 100, 2),
                  "% of map integral · higher",
                ],
                [
                  "Background peak",
                  format(metric?.background_peak_db, 1, 2),
                  "dB relative to peak · lower",
                ],
              ].map(([label, value, note]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                  <small>{note}</small>
                </div>
              ))}
            </div>
            {comparison ? (
              <div
                className="benchmark-deltas"
                aria-label="Metric changes from reference"
              >
                <strong>Δ current − reference</strong>
                <span>
                  Peak error{" "}
                  {deltaFormat(
                    comparison.deltas[selected]?.localization_error_m,
                    1000,
                  )}{" "}
                  mm
                </span>
                <span>
                  gCNR {deltaFormat(comparison.deltas[selected]?.gcnr)}
                </span>
                <span>
                  ROI{" "}
                  {deltaFormat(
                    comparison.deltas[selected]?.roi_concentration,
                    100,
                    2,
                  )}{" "}
                  percentage points
                </span>
                <span>
                  Background{" "}
                  {deltaFormat(
                    comparison.deltas[selected]?.background_peak_db,
                    1,
                    2,
                  )}{" "}
                  dB
                </span>
                <small>Descriptive change; no significance estimate.</small>
              </div>
            ) : null}
            {metric?.warnings.length ? (
              <div className="benchmark-score-warning" role="note">
                {metric.warnings.join(" ")}
              </div>
            ) : null}
            <div className="benchmark-table-title">
              <strong>Method / run comparison</strong>
              <label>
                Sort rows by{" "}
                <select
                  aria-label="Benchmark sort metric"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as MetricKey)}
                >
                  <option value="localization_error_m">Peak error ↑</option>
                  <option value="detection_recall">Source recall ↓</option>
                  <option value="detection_f1">Detection F1 ↓</option>
                  <option value="matched_rmse_m">Matched RMSE ↑</option>
                  <option value="gcnr">gCNR ↓</option>
                  <option value="roi_concentration">ROI concentration ↓</option>
                  <option value="background_peak_db">Background peak ↑</option>
                </select>
              </label>
              <span>— = undefined or unsuitable; no combined score</span>
            </div>
            <div className="benchmark-table-scroll">
              <table aria-label="PAM benchmark results">
                <thead>
                  <tr>
                    <th>Run</th>
                    <th>Method</th>
                    <th>Error (mm)</th>
                    <th>Matched / truth</th>
                    <th>Missed / FP</th>
                    <th>F1</th>
                    <th>Matched RMSE (mm)</th>
                    <th>gCNR</th>
                    <th>ROI (%)</th>
                    <th>BG peak (dB)</th>
                    <th>Contrast (dB)</th>
                    <th>CNR</th>
                    <th>FWHM x (mm)</th>
                    <th>FWHM z (mm)</th>
                    <th>Half-power area (mm²)</th>
                    <th>Entropy</th>
                    <th>Pixels ROI / BG</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={`${row.report.run_id}-${row.method}`}
                      className={
                        row.index === 0 && row.method === selected
                          ? "selected-row"
                          : ""
                      }
                    >
                      <td>
                        {row.index === 0 ? "Current" : "Reference"} ·{" "}
                        {row.report.run_id.slice(0, 8)}
                      </td>
                      <th>
                        <button onClick={() => setMethod(row.method)}>
                          {methodLabels[row.method]}
                        </button>
                      </th>
                      <td>{format(row.metrics.localization_error_m, 1000)}</td>
                      <td>
                        {row.metrics.matched_sources ?? "—"} /{" "}
                        {row.metrics.detections?.truth.filter((t) => t.in_view)
                          .length ?? "—"}
                      </td>
                      <td>
                        {row.metrics.missed_sources ?? "—"} /{" "}
                        {row.metrics.false_positive_peaks ?? "—"}
                      </td>
                      <td>{format(row.metrics.detection_f1)}</td>
                      <td>{format(row.metrics.matched_rmse_m, 1000)}</td>
                      <td>{format(row.metrics.gcnr)}</td>
                      <td>{format(row.metrics.roi_concentration, 100, 2)}</td>
                      <td>{format(row.metrics.background_peak_db, 1, 2)}</td>
                      <td>{format(row.metrics.contrast_db, 1, 2)}</td>
                      <td>{format(row.metrics.cnr)}</td>
                      <td>{format(row.metrics.lateral_fwhm_m, 1000)}</td>
                      <td>{format(row.metrics.axial_fwhm_m, 1000)}</td>
                      <td>
                        {format(row.metrics.half_power_area_m2, 1e6, 2)}
                        {row.metrics.half_power_boundary ? " *" : ""}
                      </td>
                      <td>{format(row.metrics.normalized_entropy)}</td>
                      <td>
                        {row.metrics.target_pixels} /{" "}
                        {row.metrics.background_pixels}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div
              className={`benchmark-maps ${reports.length === 1 ? "single" : ""}`}
            >
              {records.map((r, i) =>
                maps[i] ? (
                  <RasterPlot
                    key={r.id}
                    array={maps[i]!}
                    domain={mapDomain(r.config)}
                    title={`${i === 0 ? "Current" : "Reference"} · ${methodLabels[selected]}`}
                    xLabel="Lateral x (mm)"
                    yLabel="Depth z (mm)"
                    truth={r.config.sources.map((s) => [
                      s.x_m * 1000,
                      s.z_m * 1000,
                    ])}
                    truthRadius={radius}
                    detections={reports[i]?.methods[selected]?.detections}
                    peak={
                      reports[i]?.methods[selected]?.peak_x_m != null &&
                      reports[i]?.methods[selected]?.peak_z_m != null
                        ? [
                            reports[i].methods[selected]!.peak_x_m! * 1000,
                            reports[i].methods[selected]!.peak_z_m! * 1000,
                          ]
                        : undefined
                    }
                  />
                ) : (
                  <div key={r.id} className="monitor-wait">
                    {r.methods[selected]
                      ? "Loading map…"
                      : "Method absent from this reference"}
                  </div>
                ),
              )}
            </div>
            {reports.map((report, i) => (
              <section key={report.run_id}>
                <h3>
                  {i === 0 ? "Current" : "Reference"} · {methodLabels[selected]}{" "}
                  source detections
                </h3>
                <PeakResults
                  evaluation={report.methods[selected]?.detections}
                />
              </section>
            ))}
            <div className="benchmark-run-costs">
              {reports.map((r, i) => (
                <p key={r.run_id}>
                  <strong>{i === 0 ? "Current" : "Reference"}</strong> · shared
                  reconstruction {format(r.runtime_ms, 1, 1)} ms · RF storage{" "}
                  {format(r.rf_bytes, 1 / 1048576, 2)} MiB · maps{" "}
                  {format(r.map_bytes, 1 / 1048576, 3)} MiB · grid Δx/Δz{" "}
                  {r.grid_spacing_m.map((v) => format(v, 1000)).join(" / ")} mm
                </p>
              ))}
            </div>
            <section className="benchmark-notes">
              <h3>Interpretation and validity</h3>
              <ul>
                {[
                  ...new Set([
                    ...current.notes,
                    "Higher gCNR means regional distributions differ; a dark target can also score highly. Inspect signed contrast and localization together. A narrow, misplaced artefact can have low entropy and small area.",
                    "* Half-power component reaches a map boundary. FWHM is unavailable for multiple sources or truncated crossings.",
                    ...reports.flatMap((r, i) =>
                      (r.methods[selected]?.warnings || []).map(
                        (s) => `${i === 0 ? "Current" : "Reference"}: ${s}`,
                      ),
                    ),
                  ]),
                ].map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </section>
            <details className="benchmark-definitions">
              <summary>Metric equations, units and credit</summary>
              <dl>
                {Object.entries(current.definitions).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <p>
                gCNR: Alfonso Rodriguez-Molares, Ole Marius Hoel Rindal, Jan
                D’Hooge, Svein-Erik Måsøy, Andreas Austeng, Muyinatu A. Lediju
                Bell and Hans Torp (2020). DOI 10.1109/TUFFC.2019.2956855.
                Histogram estimation here is a descriptive adaptation to PAM
                target/background regions.
              </p>
            </details>
          </>
        ) : null}
      </div>
    </div>
  );
}
