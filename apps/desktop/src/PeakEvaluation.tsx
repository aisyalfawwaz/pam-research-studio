import type { PeakEvaluation, PeakSettings } from "../../../packages/contracts";
import { useState } from "react";
import { NumericProperty } from "./InstrumentControls";

const fmt = (v: number | null | undefined, scale = 1) =>
  v == null ? "—" : (v * scale).toFixed(3);
export function PeakControls({
  value,
  onChange,
  disabled = false,
}: {
  value: PeakSettings;
  onChange: (v: PeakSettings) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset
      className="peak-controls"
      disabled={disabled}
      aria-label="Multiple peak detection settings"
    >
      <legend>Peak detection and ground-truth matching</legend>
      <NumericProperty
        label="Peak threshold"
        unit="dB"
        value={value.threshold_db}
        min={-80}
        max={0}
        step={1}
        onChange={(v) =>
          onChange({ ...value, threshold_db: Math.max(-80, Math.min(0, v)) })
        }
      />
      <NumericProperty
        label="Minimum peak separation"
        unit="mm"
        value={value.min_separation_m * 1000}
        min={0.05}
        max={50}
        step={0.1}
        onChange={(v) =>
          onChange({
            ...value,
            min_separation_m: Math.max(0.00005, Math.min(0.05, v / 1000)),
          })
        }
      />
      <NumericProperty
        label="Truth matching tolerance"
        unit="mm"
        value={value.match_tolerance_m * 1000}
        min={0.05}
        max={50}
        step={0.1}
        onChange={(v) =>
          onChange({
            ...value,
            match_tolerance_m: Math.max(0.00005, Math.min(0.05, v / 1000)),
          })
        }
      />
      <NumericProperty
        label="Maximum detected peaks"
        value={value.max_peaks}
        min={1}
        max={128}
        step={1}
        onChange={(v) =>
          onChange({
            ...value,
            max_peaks: Math.max(1, Math.min(128, Math.round(v))),
          })
        }
      />
    </fieldset>
  );
}

export function PeakResults({
  evaluation,
  compact = false,
}: {
  evaluation?: PeakEvaluation;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(!compact);
  if (!evaluation)
    return (
      <p className="peak-note" role="status">
        Calculating local peaks from the saved linear map…
      </p>
    );
  const s = evaluation.scores;
  return (
    <details
      className={`peak-results ${compact ? "compact" : ""}`}
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>
        Source localization · {s.matched_sources}/
        {evaluation.truth.filter((t) => t.in_view).length} matched ·{" "}
        {s.missed_sources} missed · {s.false_positive_peaks} unmatched peaks
      </summary>
      <div className="peak-detail-content">
        <p className="peak-note">
          {evaluation.peaks.length} detected · Precision{" "}
          {fmt(s.detection_precision)} · Recall {fmt(s.detection_recall)} · F1{" "}
          {fmt(s.detection_f1)} · Matched RMSE {fmt(s.matched_rmse_m, 1000)} mm.
          P = detected peak; S = ground truth. Each peak can match only one
          source.
        </p>
        <div className="peak-tables">
          <table
            className="research-table"
            aria-label="Per-source localization matches"
          >
            <thead>
              <tr>
                <th>Truth</th>
                <th>x / z (mm)</th>
                <th>Detection</th>
                <th>Detected x / z (mm)</th>
                <th>Error (mm)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {evaluation.truth.map((t) => {
                const p =
                  t.peak_index == null ? null : evaluation.peaks[t.peak_index];
                return (
                  <tr key={t.source_index}>
                    <th>S{t.source_index + 1}</th>
                    <td>
                      {fmt(t.x_m, 1000)} / {fmt(t.z_m, 1000)}
                    </td>
                    <td>{p ? `P${p.index + 1}` : "—"}</td>
                    <td>
                      {p ? `${fmt(p.x_m, 1000)} / ${fmt(p.z_m, 1000)}` : "—"}
                    </td>
                    <td>{fmt(t.error_m, 1000)}</td>
                    <td>
                      {t.status === "outside_map"
                        ? "Outside map"
                        : t.status === "matched"
                          ? "Matched"
                          : "Missed"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <table className="research-table" aria-label="Detected local peaks">
            <thead>
              <tr>
                <th>Peak</th>
                <th>x / z (mm)</th>
                <th>Power (dB)</th>
                <th>Match</th>
                <th>Boundary</th>
              </tr>
            </thead>
            <tbody>
              {evaluation.peaks.map((p) => (
                <tr key={p.index}>
                  <th>P{p.index + 1}</th>
                  <td>
                    {fmt(p.x_m, 1000)} / {fmt(p.z_m, 1000)}
                  </td>
                  <td>{fmt(p.relative_db)}</td>
                  <td>
                    {p.source_index == null
                      ? "Unmatched"
                      : `S${p.source_index + 1}`}
                  </td>
                  <td>{p.boundary ? "Yes" : "—"}</td>
                </tr>
              ))}
              {!evaluation.peaks.length ? (
                <tr>
                  <td colSpan={5}>
                    No distinct peak above the current threshold.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {evaluation.notes.map((note) => (
          <p key={note} className="peak-note">
            {note}
          </p>
        ))}
      </div>
    </details>
  );
}
