import { useEffect, useMemo, useRef } from "react";
import {
  ChevronDown,
  FolderOpen,
  Grid2X2,
  Layers,
  Radio,
  Table2,
  Waves,
} from "lucide-react";
import { methodKeys, methodLabels } from "../../../packages/contracts";
import type {
  BinaryArray,
  Config,
  Method,
  Run,
  RunSummary,
} from "../../../packages/contracts";
import { LinePlot, peakValue, values } from "./plots";
import type { Workbench } from "./useWorkbench";
import { receiverPositions } from "./arrayGeometry";
import { BubbleDynamics } from "./BubbleDynamics";
export const unitLabel = (unit?: string) => (unit || "a.u.").replace("^2", "²");

export function BubbleView({
  trace,
  run,
  sourceIndex = 0,
  onSource = () => {},
}: {
  trace: BinaryArray | null;
  run: Run | null;
  sourceIndex?: number;
  onSource?: (index: number) => void;
}) {
  const inspected = useMemo(() => {
    if (!run?.config.bubble) return run;
    const simulation = run.provenance.simulation as
      | { bubble?: unknown }
      | undefined;
    const radial = (simulation?.bubble || simulation) as
      | { population?: { simulation: unknown }[] }
      | undefined;
    return {
      ...run,
      config: {
        ...run.config,
        bubble: run.config.sources[sourceIndex]?.bubble || run.config.bubble,
      },
      provenance: {
        ...run.provenance,
        simulation: radial?.population?.[sourceIndex]?.simulation || radial,
      },
    };
  }, [run, sourceIndex]);
  if (!trace || !run?.config.bubble)
    return (
      <EmptyView
        title="No bubble dynamics in this run"
        text="Select jBubble in Model → Simulation backend, then simulate to inspect the calculated radius, drive and emission."
      />
    );
  const simulation = inspected!.provenance.simulation as { bubble?: unknown };
  const info = (simulation?.bubble || simulation) as
    | { max_radius_ratio?: number; max_wall_mach?: number; converged?: boolean }
    | undefined;
  return (
    <div className="bubble-workspace">
      <div className="editor-strip">
        <strong>
          jBubble ·{" "}
          {inspected!.config.bubble!.model === "lipid"
            ? "Lipid shell"
            : "Free bubble"}
        </strong>
        <span>
          Keller–Miksis ·{" "}
          {info?.converged ? "Converged" : "See run diagnostics"}
        </span>
        {run.config.sources.length > 1 ? (
          <label>
            Inspect source{" "}
            <select
              aria-label="Bubble source"
              value={sourceIndex}
              onChange={(e) => onSource(Number(e.target.value))}
            >
              {run.config.sources.map((s, i) => (
                <option key={i} value={i}>
                  S{i + 1} ·{" "}
                  {((s.bubble || run.config.bubble!).radius_m * 1e6).toFixed(2)}{" "}
                  µm · {(s.bubble || run.config.bubble!).drive_pa / 1000} kPa
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="strip-space" />
        <span>
          Rmax/R₀ {info?.max_radius_ratio?.toFixed(3)} · wall Mach{" "}
          {info?.max_wall_mach?.toFixed(4)}
        </span>
      </div>
      <BubbleDynamics
        key={`${run.id}:${sourceIndex}`}
        trace={trace}
        run={inspected!}
      />
      <div className="plot-caption">
        {run.config.coupling
          ? "Independent radial responses → per-source causal volume-flow filters → j-Wave equivalent 2D line sources. The 1 mm emission curve is a 3D diagnostic, not the injected pressure."
          : "Independent radial responses; RF uses retarded 3D monopole propagation and a common reference-drive normalization."}{" "}
        These are model predictions.
      </div>
    </div>
  );
}

export function runLabel(id: string, runs: RunSummary[]) {
  const index = [...runs].reverse().findIndex((r) => r.id === id);
  return index < 0
    ? id.slice(0, 8)
    : `Run ${String(index + 1).padStart(3, "0")}`;
}
export function mapDomain(cfg: Config) {
  return {
    x0: cfg.grid_x_min_m * 1000,
    x1: cfg.grid_x_max_m * 1000,
    y0: cfg.grid_z_min_m * 1000,
    y1: cfg.grid_z_max_m * 1000,
  };
}
export function pairs(
  array: BinaryArray | null,
  scale = 1,
): [number, number][] {
  if (!array) return [];
  const data = values(array);
  return Array.from({ length: array.shape[0] }, (_, i) => [
    data[i * 2] * scale,
    data[i * 2 + 1],
  ]);
}
export function arrivalWindow(cfg: Config): [number, number] {
  const positions = receiverPositions(cfg);
  let first = Infinity,
    last = -Infinity;
  for (const s of cfg.sources) {
    const distances = positions.map(([x, z]) =>
      Math.hypot(s.x_m - x, s.z_m - z),
    );
    const near = Math.min(...distances),
      far = Math.max(...distances);
    first = Math.min(
      first,
      s.emission_s - cfg.duration_s / 2 + near / cfg.sound_speed_m_s,
    );
    last = Math.max(
      last,
      s.emission_s +
        cfg.duration_s / 2 +
        far / cfg.sound_speed_m_s +
        (cfg.bubble ? cfg.bubble.ringdown_cycles / cfg.frequency_hz : 0) +
        (cfg.coupling ? 12 / cfg.coupling.passband_hz : 0),
    );
  }
  return [
    Math.max(cfg.capture_t0_s, first - 1e-6) * 1e6,
    Math.min(
      cfg.capture_t0_s + (cfg.samples - 1) / cfg.sampling_hz,
      last + 1e-6,
    ) * 1e6,
  ];
}
export function ProjectTree({
  w,
  onSource,
  onMethod,
}: {
  w: Workbench;
  onSource: (i: number) => void;
  onMethod: (method: Method) => void;
}) {
  return (
    <div className="project-tree" aria-label="Project contents">
      <div className="tree-root">
        <ChevronDown size={12} />
        <FolderOpen size={15} />
        <strong>{w.project?.name || "Untitled"}</strong>
      </div>
      <details open>
        <summary>
          <ChevronDown size={12} />
          <Radio size={14} />
          Model
        </summary>
        <div className="tree-children">
          <button
            className={w.editor === "scene" ? "selected" : ""}
            onClick={() => w.setEditor("scene")}
          >
            <Radio size={13} />
            Receive array
          </button>
          {w.config?.sources.map((_, i) => (
            <button key={i} onClick={() => onSource(i)}>
              <span className="source-dot" />
              Source S{i + 1}
            </button>
          ))}
          <button onClick={() => w.setEditor("scene")}>
            <Grid2X2 size={13} />
            Reconstruction grid
          </button>
        </div>
      </details>
      <details open>
        <summary>
          <ChevronDown size={12} />
          <Waves size={14} />
          RF data{" "}
          <small>{w.runs.filter((r) => r.status === "simulated").length}</small>
        </summary>
        <div className="tree-children">
          {w.runs
            .filter((r) => r.status === "simulated")
            .map((r) => (
              <button
                key={r.id}
                disabled={w.locked}
                className={w.run?.id === r.id ? "selected" : ""}
                onClick={() => void w.selectRun(r.id)}
              >
                <Waves size={13} />
                <span>{runLabel(r.id, w.runs)}</span>
                <small>RF</small>
              </button>
            ))}
          {!w.runs.some((r) => r.status === "simulated") ? (
            <div className="tree-empty">No RF runs</div>
          ) : null}
        </div>
      </details>
      <details open>
        <summary>
          <ChevronDown size={12} />
          <Layers size={14} />
          Results{" "}
          <small>{w.runs.filter((r) => r.status === "complete").length}</small>
        </summary>
        <div className="tree-children">
          {w.runs
            .filter((r) => r.status === "complete")
            .map((r) => (
              <button
                key={r.id}
                disabled={w.locked}
                className={w.run?.id === r.id ? "selected" : ""}
                onClick={() => void w.selectRun(r.id)}
              >
                <Layers size={13} />
                <span>{runLabel(r.id, w.runs)}</span>
                <small>{r.parent ? "PAM" : "Imported"}</small>
              </button>
            ))}
          {w.run?.status === "complete" ? (
            <div className="tree-methods">
              {methodKeys
                .filter((k) => w.run?.metrics?.methods[k])
                .map((key) => (
                  <button
                    className={
                      w.editor === "map" && w.method === key ? "selected" : ""
                    }
                    key={key}
                    onClick={() => onMethod(key)}
                  >
                    <span className="result-dot" />
                    {methodLabels[key]}
                  </button>
                ))}
            </div>
          ) : null}
          {!w.runs.some((r) => r.status === "complete") ? (
            <div className="tree-empty">No reconstructions</div>
          ) : null}
        </div>
      </details>
      <button className="tree-history" onClick={() => w.setEditor("runs")}>
        <Table2 size={13} />
        Run history
      </button>
    </div>
  );
}
export function EmptyView({
  title,
  text,
  action,
}: {
  title: string;
  text?: string;
  action?: { label: string; run: () => void };
}) {
  return (
    <div className="empty-document">
      <p>{title}</p>
      {text ? <span>{text}</span> : null}
      {action ? <button onClick={action.run}>{action.label}</button> : null}
    </div>
  );
}
export function SourceTable({
  cfg,
  selected,
  onSelect,
}: {
  cfg: Config;
  selected: number;
  onSelect: (i: number) => void;
}) {
  return (
    <section className="source-list">
      <div className="table-title">
        Sources <span>{cfg.sources.length}</span>
      </div>
      <div className="source-table-scroll">
        <table aria-label="Source coordinates">
          <thead>
            <tr>
              <th>Source</th>
              <th>x (mm)</th>
              <th>z (mm)</th>
              <th>Emission (µs)</th>
              <th>Amplitude (a.u.)</th>
            </tr>
          </thead>
          <tbody>
            {cfg.sources.map((s, i) => (
              <tr
                className={i === selected ? "selected-row" : ""}
                key={i}
                onClick={() => onSelect(i)}
              >
                <th>
                  <button onClick={() => onSelect(i)}>S{i + 1}</button>
                </th>
                <td>{(s.x_m * 1000).toFixed(3)}</td>
                <td>{(s.z_m * 1000).toFixed(3)}</td>
                <td>{(s.emission_s * 1e6).toFixed(3)}</td>
                <td>{s.amplitude.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export function Profiles({
  array,
  cfg,
  selection,
}: {
  array: BinaryArray;
  cfg: Config;
  selection: [number, number];
}) {
  const data = useMemo(() => values(array), [array]),
    n = cfg.grid_n;
  const ix = Math.max(
      0,
      Math.min(
        n - 1,
        Math.round(
          ((selection[0] / 1000 - cfg.grid_x_min_m) /
            (cfg.grid_x_max_m - cfg.grid_x_min_m)) *
            (n - 1),
        ),
      ),
    ),
    iz = Math.max(
      0,
      Math.min(
        n - 1,
        Math.round(
          ((selection[1] / 1000 - cfg.grid_z_min_m) /
            (cfg.grid_z_max_m - cfg.grid_z_min_m)) *
            (n - 1),
        ),
      ),
    );
  const maximum = peakValue(data) || 1;
  const lateral: [number, number][] = Array.from({ length: n }, (_, i) => [
    (cfg.grid_x_min_m + (i / (n - 1)) * (cfg.grid_x_max_m - cfg.grid_x_min_m)) *
      1000,
    data[iz * n + i] / maximum,
  ]);
  const axial: [number, number][] = Array.from({ length: n }, (_, i) => [
    (cfg.grid_z_min_m + (i / (n - 1)) * (cfg.grid_z_max_m - cfg.grid_z_min_m)) *
      1000,
    data[i * n + ix] / maximum,
  ]);
  return (
    <div className="profile-plots">
      <LinePlot
        title={`Lateral · z ${selection[1].toFixed(2)} mm`}
        points={lateral}
        xLabel="x (mm)"
        yLabel="P / map max"
      />
      <LinePlot
        title={`Axial · x ${selection[0].toFixed(2)} mm`}
        points={axial}
        xLabel="z (mm)"
        yLabel="P / map max"
      />
    </div>
  );
}
function width(value: number | null | undefined) {
  return value == null ? "—" : (value * 1000).toFixed(3);
}
export function Measurements({
  run,
  method,
  select,
}: {
  run: Run | null;
  method: Method;
  select: (method: Method) => void;
}) {
  if (!run?.metrics)
    return <p className="output-empty">No reconstruction selected.</p>;
  return (
    <>
      <table
        className="measurement-table"
        aria-label="Reconstruction measurements"
      >
        <thead>
          <tr>
            <th>Method</th>
            <th>Global peak x (mm)</th>
            <th>Global peak z (mm)</th>
            <th>Error (mm)</th>
            <th>Lateral FWHM (mm)</th>
            <th>Axial FWHM (mm)</th>
            <th>Background / peak</th>
          </tr>
        </thead>
        <tbody>
          {methodKeys
            .filter((k) => run.metrics?.methods[k])
            .map((key) => {
              const m = run.metrics!.methods[key]!;
              return (
                <tr className={method === key ? "selected-row" : ""} key={key}>
                  <th>
                    <button onClick={() => select(key)}>
                      {key.toUpperCase()}
                    </button>
                  </th>
                  <td>{(m.peak_x_m * 1000).toFixed(3)}</td>
                  <td>{(m.peak_z_m * 1000).toFixed(3)}</td>
                  <td>{(m.localization_error_m * 1000).toFixed(3)}</td>
                  <td>{width(m.lateral_fwhm_m)}</td>
                  <td>{width(m.axial_fwhm_m)}</td>
                  <td>{m.background_peak_ratio?.toFixed(3) ?? "—"}</td>
                </tr>
              );
            })}
        </tbody>
      </table>
      <div className="measurement-note">
        FWHM uses half-power crossings; — means unavailable. Error uses the
        global peak. Per-source detection and matching are available in
        Reconstruction and Benchmark. Background excludes 2 mm truth disks.
      </div>
    </>
  );
}
export function Messages({ messages }: { messages: Workbench["messages"] }) {
  const end = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);
  return messages.length ? (
    <table className="message-table" aria-label="Calculation messages">
      <thead>
        <tr>
          <th>Time</th>
          <th>Type</th>
          <th>Message</th>
        </tr>
      </thead>
      <tbody>
        {messages.map((message, i) => (
          <tr
            ref={i === messages.length - 1 ? end : undefined}
            key={message.id}
          >
            <td>{message.time}</td>
            <td className={`severity-${message.level}`}>{message.level}</td>
            <td>{message.text}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ) : (
    <p className="output-empty">No messages.</p>
  );
}
export function RunInfo({ run }: { run: Run | null }) {
  if (!run) return <p className="output-empty">No run selected.</p>;
  const diagnostics = run.metrics?.diagnostics;
  return (
    <div className="run-info">
      <dl>
        <dt>Run ID</dt>
        <dd>{run.id}</dd>
        <dt>Input RF</dt>
        <dd>{run.parent || "Synthetic generation"}</dd>
        <dt>Created</dt>
        <dd>{new Date(run.created).toLocaleString("en-GB")}</dd>
        <dt>State</dt>
        <dd>{run.status}</dd>
        <dt>Data type</dt>
        <dd>Real RF · float64 · arbitrary amplitude</dd>
        <dt>Simulation</dt>
        <dd>
          {run.config.coupling
            ? "jbubble → volume flow → j-Wave · one-way 2D coupling"
            : run.config.simulation
              ? "j-Wave 0.2.1 · 2D acoustic propagation · experimental"
              : run.config.bubble
                ? "jbubble 0.2.0 · 3D monopole RF · experimental"
                : "Analytic straight-ray reference"}
        </dd>
        <dt>Methods</dt>
        <dd>
          {Object.keys(run.methods)
            .map((k) => k.toUpperCase())
            .join(", ") || "—"}
        </dd>
        <dt>Array memory</dt>
        <dd>
          {((run.metrics?.rf_bytes || 0) / 1024 ** 2).toFixed(2)} MiB RF;{" "}
          {((run.metrics?.map_bytes || 0) / 1024 ** 2).toFixed(2)} MiB maps
        </dd>
        {diagnostics
          ? Object.entries(diagnostics).map(([key, value]) => (
              <div className="info-entry" key={key}>
                <dt>{key.replaceAll("_", " ")}</dt>
                <dd>
                  {typeof value === "number"
                    ? Number(value.toPrecision(6)).toString()
                    : JSON.stringify(value)}
                </dd>
              </div>
            ))
          : null}
      </dl>
      <details>
        <summary>Configuration and provenance</summary>
        <pre>
          {JSON.stringify(
            { config: run.config, provenance: run.provenance },
            null,
            2,
          )}
        </pre>
      </details>
      <ul>
        {run.warnings.map((warning, i) => (
          <li key={i}>{warning}</li>
        ))}
      </ul>
    </div>
  );
}
export function RunTable({
  runs,
  current,
  locked,
  select,
}: {
  runs: RunSummary[];
  current?: string;
  locked: boolean;
  select: (id: string) => void;
}) {
  return (
    <div className="run-table-view">
      <div className="editor-strip">
        <strong>Run history</strong>
        <span>{runs.length} records</span>
      </div>
      {runs.length ? (
        <div className="run-table-scroll">
          <table aria-label="Run history">
            <thead>
              <tr>
                <th>Run</th>
                <th>State</th>
                <th>Created</th>
                <th>Input</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr
                  key={run.id}
                  className={run.id === current ? "selected-row" : ""}
                >
                  <th>
                    <button
                      disabled={
                        locked ||
                        !["simulated", "complete"].includes(run.status)
                      }
                      onClick={() => select(run.id)}
                    >
                      {runLabel(run.id, runs)}
                    </button>
                  </th>
                  <td>
                    {run.status === "simulated" ? "RF ready" : run.status}
                  </td>
                  <td>{new Date(run.created).toLocaleString("en-GB")}</td>
                  <td>{run.parent ? runLabel(run.parent, runs) : "—"}</td>
                  <td>{run.error || run.id.slice(0, 8)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyView title="No runs in this project." />
      )}
    </div>
  );
}
