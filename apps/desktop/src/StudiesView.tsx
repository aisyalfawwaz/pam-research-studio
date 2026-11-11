import { useEffect, useMemo, useState } from "react";
import { Play, Square, ClipboardCheck, RotateCcw } from "lucide-react";
import {
  methodKeys,
  methodLabels,
  stableJSON,
} from "../../../packages/contracts";
import type { Job, Method } from "../../../packages/contracts";
import {
  studyParameters,
  refinementParameters,
  studyRequestSchema,
} from "../../../packages/contracts/studies";
import type {
  StudyRequest,
  StudyRecord,
  StudyListItem,
  StudyPlan,
} from "../../../packages/contracts/studies";
import { NumericProperty } from "./InstrumentControls";
import { LinePlot } from "./plots";
import { request } from "./useWorkbench";
import type { Workbench } from "./useWorkbench";

const metrics = [
  ["localization_error_m", "Peak error", "mm", 1000],
  ["gcnr", "gCNR", "", 1],
  ["roi_concentration", "ROI concentration", "%", 100],
  ["background_peak_db", "Background peak", "dB", 1],
  ["lateral_fwhm_m", "Lateral FWHM", "mm", 1000],
  ["axial_fwhm_m", "Axial FWHM", "mm", 1000],
] as const;
type Metric = (typeof metrics)[number][0];
const numeric = (value: number | null | undefined, scale = 1) =>
  value == null ? "—" : (value * scale).toPrecision(5);
const active = (status: string | undefined) =>
  status === "running" || status === "cancelling";

function Histogram({ values, label }: { values: number[]; label: string }) {
  if (!values.length)
    return <p className="study-note">No defined trial scores yet.</p>;
  const min = Math.min(...values),
    max = Math.max(...values),
    span = max - min || Math.max(Math.abs(min) * 0.1, 1e-6);
  const low = min === max ? min - span / 2 : min,
    high = min === max ? max + span / 2 : max;
  const bins = Math.min(16, Math.max(3, Math.ceil(Math.sqrt(values.length)))),
    counts = new Array<number>(bins).fill(0);
  for (const value of values)
    counts[
      Math.min(bins - 1, Math.floor(((value - low) / (high - low)) * bins))
    ]++;
  const peak = Math.max(...counts);
  return (
    <section className="study-histogram">
      <header className="plot-heading">
        <strong>Trial distribution</strong>
        <small>{values.length} defined observations</small>
      </header>
      <svg
        viewBox="0 0 560 230"
        role="img"
        aria-label={`Observed trial distribution; ${label}`}
      >
        <line x1="45" x2="540" y1="180" y2="180" className="axis-border" />
        {counts.map((count, i) => (
          <g key={i}>
            <rect
              x={46 + (i * 490) / bins}
              y={180 - (count / peak) * 135}
              width={490 / bins - 2}
              height={(count / peak) * 135}
              fill="var(--trace)"
            />
            <title>{count} trials</title>
          </g>
        ))}
        <text x="45" y="202">
          {low.toPrecision(4)}
        </text>
        <text x="538" y="202" textAnchor="end">
          {high.toPrecision(4)}
        </text>
        <text x="290" y="224" textAnchor="middle">
          {label}
        </text>
        <text x="45" y="28">
          Count · maximum {peak}
        </text>
      </svg>
    </section>
  );
}

export function StudiesView({ w }: { w: Workbench }) {
  const [kind, setKind] = useState<StudyRequest["kind"]>("sweep"),
    [name, setName] = useState("Parameter study");
  const [parameter, setParameter] = useState("snr_db"),
    [values, setValues] = useState("10, 20, 30");
  const [second, setSecond] = useState(false),
    [parameter2, setParameter2] = useState("source.x_m"),
    [values2, setValues2] = useState("-2, 0, 2");
  const [trials, setTrials] = useState(16),
    [seed, setSeed] = useState(2026),
    [speedSigma, setSpeedSigma] = useState(10),
    [sensorSigma, setSensorSigma] = useState(0.05);
  const [tolerance, setTolerance] = useState(2),
    [stopFailure, setStopFailure] = useState(true),
    [planning, setPlanning] = useState(false);
  const [plan, setPlan] = useState<StudyPlan | null>(null),
    [plannedSignature, setPlannedSignature] = useState("");
  const [list, setList] = useState<StudyListItem[]>([]),
    [selectedId, setSelectedId] = useState(""),
    [record, setRecord] = useState<StudyRecord | null>(null);
  const [method, setMethod] = useState<Method>("das"),
    [metric, setMetric] = useState<Metric>("localization_error_m"),
    [error, setError] = useState("");
  const [localBusy, setLocalBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const metricInfo = metrics.find((m) => m[0] === metric)!;
  const availableParameters = studyParameters.filter(
    (p) =>
      (kind !== "convergence" || refinementParameters.includes(p[0])) &&
      (!p[0].startsWith("bubble.") || w.config?.bubble) &&
      (!p[0].startsWith("simulation.") || w.config?.simulation) &&
      (p[0] !== "ray_step_m" || w.analysis.receive_model === "ct_slowness"),
  );
  const signature = stableJSON({
    kind,
    name,
    parameter,
    values,
    second,
    parameter2,
    values2,
    trials,
    seed,
    speedSigma,
    sensorSigma,
    tolerance,
    stopFailure,
    config: w.config,
    options: w.analysis,
  });
  const parseAxis = (key: string, text: string) => {
    const scale = studyParameters.find((p) => p[0] === key)![3];
    if (!text.trim())
      throw new Error(
        "Enter at least two distinct values separated by commas.",
      );
    return {
      parameter: key,
      values: text
        .split(/[,;\s]+/)
        .filter(Boolean)
        .map((v) => Number(v) * scale),
    };
  };
  const body = () =>
    studyRequestSchema.parse({
      name,
      kind,
      config: w.config,
      options: w.analysis,
      axes:
        kind === "uncertainty"
          ? []
          : [
              parseAxis(parameter, values),
              ...(kind === "sweep" && second
                ? [parseAxis(parameter2, values2)]
                : []),
            ],
      trials,
      seed,
      speed_sigma_m_s: speedSigma,
      sensor_sigma_m: sensorSigma / 1000,
      relative_tolerance: tolerance / 100,
      stop_on_failure: stopFailure,
      settings: { roi_radius_m: 0.002, histogram_bins: 100 },
    });
  const chooseKind = (value: StudyRequest["kind"]) => {
    setKind(value);
    setPlan(null);
    setError("");
    if (value === "convergence") {
      setParameter("grid_n");
      setValues("33, 65, 129");
      setName("Convergence study");
    }
    if (value === "sweep") {
      setParameter("snr_db");
      setValues("10, 20, 30");
      setName("Parameter study");
    }
    if (value === "uncertainty") setName("Calibration uncertainty");
  };
  useEffect(() => {
    let live = true,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const items = await request<StudyListItem[]>("studies");
        if (!live) return;
        setList(items);
        const id = selectedId || items[0]?.id;
        if (id) {
          const value = await request<StudyRecord>("study", id);
          if (live) {
            setRecord(value);
            if (!selectedId) setSelectedId(id);
          }
        }
      } catch (e) {
        if (live) setError(String(e));
      } finally {
        if (live) timer = setTimeout(poll, w.busy ? 650 : 1800);
      }
    };
    if (w.project) void poll();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [w.project?.project_id, selectedId, revision, w.busy]);
  const run = async (resume = false) => {
    if (!w.project) return;
    setLocalBusy(true);
    setError("");
    try {
      const job = await request<Job>(
        resume ? "resumeStudy" : "startStudy",
        resume
          ? { id: record!.id, session_id: w.project.session_id }
          : { session_id: w.project.session_id, study: body() },
      );
      setSelectedId(job.study_id!);
      setRecord(null);
      w.trackJob(job);
      setRevision((v) => v + 1);
      w.log(
        `${resume ? "Resumed as a new study" : "Started study"}: ${job.study_id?.slice(0, 8)}. Real cases run sequentially.`,
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setLocalBusy(false);
    }
  };
  const completed =
    record?.cases.filter((c) => c.status === "complete" && c.report) || [];
  const available = methodKeys.filter((m) =>
    completed.some((c) => c.report?.methods[m]),
  );
  const chosen = available.includes(method) ? method : available[0] || method;
  const data = completed.flatMap((c) => {
    const value = c.report?.methods[chosen]?.[metric];
    const x =
      record?.kind === "uncertainty"
        ? c.index + 1
        : c.parameters[record!.request.axes[0].parameter] /
          (studyParameters.find(
            (p) => p[0] === record!.request.axes[0].parameter,
          )?.[3] || 1);
    return typeof value === "number"
      ? [{ case: c, x, value: value * metricInfo[3] }]
      : [];
  });
  const groups = useMemo(() => {
    const result = new Map<string, [number, number][]>();
    for (const point of data) {
      const axis = record?.request.axes[1];
      const key = axis
        ? `${axis.parameter} = ${point.case.parameters[axis.parameter]}`
        : "Cases";
      const rows = result.get(key) || [];
      rows.push([point.x, point.value]);
      result.set(key, rows);
    }
    for (const rows of result.values()) rows.sort((a, b) => a[0] - b[0]);
    return [...result];
  }, [record, chosen, metric]);
  const axisEditor = (secondAxis: boolean) => {
    const key = secondAxis ? parameter2 : parameter,
      value = secondAxis ? values2 : values,
      info = studyParameters.find((p) => p[0] === key)!;
    return (
      <>
        <label>
          {secondAxis ? "Second parameter" : "Parameter"}
          <select
            aria-label={
              secondAxis ? "Second study parameter" : "Study parameter"
            }
            value={key}
            onChange={(e) =>
              (secondAxis ? setParameter2 : setParameter)(e.target.value)
            }
          >
            {availableParameters
              .filter((p) => !secondAxis || p[0] !== parameter)
              .map((p) => (
                <option key={p[0]} value={p[0]}>
                  {p[1]} {p[2] ? `(${p[2]})` : ""}
                </option>
              ))}
          </select>
        </label>
        <label>
          Values ({info[2] || "dimensionless"})
          <input
            aria-label={secondAxis ? "Second study values" : "Study values"}
            value={value}
            onChange={(e) =>
              (secondAxis ? setValues2 : setValues)(e.target.value)
            }
          />
        </label>
      </>
    );
  };
  if (!w.project)
    return (
      <div className="monitor-wait">
        Create or open a project to define a research study.
      </div>
    );
  return (
    <div className="studies-workspace">
      <div className="model-toolbar">
        <strong>Research studies</strong>
        <button
          disabled={!record || active(record.status) || w.locked || localBusy}
          onClick={async () => {
            if (!record) return;
            setLocalBusy(true);
            try {
              const result = await window.pam.exportReport(record.id, "study");
              if (result) w.log(`Exported study PDF: ${result.path}`);
            } catch (e) {
              setError(String(e));
            } finally {
              setLocalBusy(false);
            }
          }}
        >
          Export study PDF…
        </button>
        <span>Sequential · immutable runs · local CPU</span>
        <div className="strip-space" />
        {(["csv", "json"] as const).map((format) => (
          <button
            key={format}
            disabled={!record || active(record.status) || localBusy}
            onClick={async () => {
              try {
                await window.pam.exportStudy(record!.id, format);
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            Export {format === "csv" ? "cases CSV" : "full study JSON"}…
          </button>
        ))}
      </div>
      {error ? (
        <div className="study-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="studies-columns">
        <aside className="study-definition">
          <h3>Study definition</h3>
          <fieldset disabled={w.locked || localBusy || planning}>
            <label>
              Study type
              <select
                aria-label="Study type"
                value={kind}
                onChange={(e) =>
                  chooseKind(e.target.value as StudyRequest["kind"])
                }
              >
                <option value="sweep">Parameter sweep</option>
                <option value="convergence">Numerical convergence</option>
                <option value="uncertainty">Calibration uncertainty</option>
              </select>
            </label>
            <label>
              Name
              <input
                aria-label="Study name"
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            {kind !== "uncertainty" ? (
              <>
                {axisEditor(false)}
                {kind === "sweep" ? (
                  <>
                    <label className="study-check">
                      <input
                        type="checkbox"
                        checked={second}
                        onChange={(e) => setSecond(e.target.checked)}
                      />
                      Second axis
                    </label>
                    {second ? axisEditor(true) : null}
                  </>
                ) : (
                  <>
                    <NumericProperty
                      label="Relative tolerance"
                      unit="%"
                      value={tolerance}
                      min={0.01}
                      max={50}
                      onChange={setTolerance}
                    />
                    <p>
                      Noise is disabled. Grid/gate/ray refinements reuse
                      identical RF; propagation/sampling/ODE changes rerun the
                      source. Reference is the finest sampled result, not an
                      exact solution.
                    </p>
                  </>
                )}
              </>
            ) : (
              <>
                <NumericProperty
                  label="Independent trials"
                  value={trials}
                  min={2}
                  max={64}
                  step={1}
                  onChange={setTrials}
                />
                <NumericProperty
                  label="Study seed"
                  value={seed}
                  min={0}
                  max={4294967295}
                  step={1}
                  onChange={setSeed}
                />
                <NumericProperty
                  label="Sound-speed standard deviation"
                  unit="m/s"
                  value={speedSigma}
                  min={0}
                  max={200}
                  onChange={setSpeedSigma}
                />
                <NumericProperty
                  label="Element x/z standard deviation"
                  unit="mm"
                  value={sensorSigma}
                  min={0}
                  max={1}
                  onChange={setSensorSigma}
                />
                <p>
                  Independent Gaussian perturbations change the actual capture.
                  Reconstruction retains nominal calibration. Each trial has a
                  recorded independent noise seed. Mean confidence intervals
                  need at least 8 defined trials.
                </p>
              </>
            )}
            <label className="study-check">
              <input
                type="checkbox"
                checked={stopFailure}
                onChange={(e) => setStopFailure(e.target.checked)}
              />
              Stop after a failed case
            </label>
          </fieldset>
          <div className="study-actions">
            <button
              disabled={w.locked || localBusy || planning}
              onClick={async () => {
                setPlanning(true);
                setError("");
                try {
                  setPlan(await request<StudyPlan>("planStudy", body()));
                  setPlannedSignature(signature);
                } catch (e) {
                  setError(String(e));
                  setPlan(null);
                } finally {
                  setPlanning(false);
                }
              }}
            >
              <ClipboardCheck size={14} />
              {planning ? "Checking…" : "Check study"}
            </button>
            <button
              disabled={
                w.locked || localBusy || !plan || plannedSignature !== signature
              }
              onClick={() => void run()}
            >
              <Play size={14} />
              Start study
            </button>
            <button disabled={!w.busy} onClick={() => void w.cancel()}>
              <Square size={14} />
              Stop
            </button>
          </div>
          {plan && plannedSignature === signature ? (
            <div className="study-plan">
              <strong>
                {plan.case_count} real cases ·{" "}
                {(plan.array_bytes_upper_estimate / 1024 ** 2).toFixed(1)} MiB
                array estimate
              </strong>
              {plan.notes.map((n) => (
                <p key={n}>{n}</p>
              ))}
            </div>
          ) : (
            <p className="study-note">
              Check the complete plan before starting. Completed experiments are
              never overwritten.
            </p>
          )}
          <h3>Saved studies</h3>
          <select
            aria-label="Saved study"
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setRecord(null);
            }}
          >
            <option value="">Choose a study</option>
            {list.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.status} · {s.completed}/{s.total}
              </option>
            ))}
          </select>
          {record &&
          (record.status === "failed" || record.status === "interrupted") ? (
            <button
              disabled={w.locked || localBusy}
              onClick={() => void run(true)}
            >
              <RotateCcw size={14} />
              Resume as new study
            </button>
          ) : null}
        </aside>
        <section className="study-results">
          {!record ? (
            <div className="monitor-wait">
              Define and check a study, or select a saved study to inspect its
              real cases.
            </div>
          ) : (
            <>
              <div className="editor-strip">
                <strong>{record.name}</strong>
                <span role="status">
                  {record.status} · {record.completed}/{record.total} complete
                </span>
                <div className="strip-space" />
                <span>Definition {record.definition_version}</span>
              </div>
              {active(record.status) ? (
                <progress
                  aria-label="Study progress"
                  max={record.total}
                  value={record.completed}
                />
              ) : null}
              {record.error ? (
                <div className="study-error">{record.error}</div>
              ) : null}
              <div className="study-display-controls">
                <label>
                  Method
                  <select
                    aria-label="Study result method"
                    value={chosen}
                    onChange={(e) => setMethod(e.target.value as Method)}
                  >
                    {(available.length ? available : methodKeys).map((m) => (
                      <option key={m} value={m}>
                        {methodLabels[m]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Metric
                  <select
                    aria-label="Study result metric"
                    value={metric}
                    onChange={(e) => setMetric(e.target.value as Metric)}
                  >
                    {metrics.map((m) => (
                      <option key={m[0]} value={m[0]}>
                        {m[1]}
                      </option>
                    ))}
                  </select>
                </label>
                <span>ROI 2 mm · 100 bins · descriptive synthetic truth</span>
              </div>
              {groups.length ? (
                <div className="study-graphs">
                  {groups.map(([group, points]) => (
                    <LinePlot
                      key={group}
                      points={points}
                      title={group}
                      xLabel={
                        record.kind === "uncertainty"
                          ? "Trial number · independent draws"
                          : studyParameters
                              .find(
                                (p) =>
                                  p[0] === record.request.axes[0].parameter,
                              )
                              ?.slice(1, 3)
                              .join(" · ") || "Parameter"
                      }
                      yLabel={`${metricInfo[1]} ${metricInfo[2]}`}
                    />
                  ))}
                  {record.kind === "uncertainty" ? (
                    <Histogram
                      values={data.map((d) => d.value)}
                      label={`${metricInfo[1]} ${metricInfo[2]}`}
                    />
                  ) : null}
                </div>
              ) : null}
              {record.kind === "uncertainty" && record.summary?.methods ? (
                <>
                  <h3>Trial uncertainty · {methodLabels[chosen]}</h3>
                  <table
                    className="research-table"
                    aria-label="Uncertainty statistics"
                  >
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>Valid / total</th>
                        <th>Mean</th>
                        <th>SD</th>
                        <th>95% mean CI · bootstrap</th>
                        <th>Central 95% of trials</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.map((m) => {
                        const s = record.summary!.methods?.[chosen]?.[m[0]];
                        return (
                          <tr key={m[0]}>
                            <td>
                              {m[1]} {m[2]}
                            </td>
                            <td>
                              {s?.valid || 0} / {s?.total || record.total}
                            </td>
                            <td>{numeric(s?.mean, m[3])}</td>
                            <td>{numeric(s?.sample_sd, m[3])}</td>
                            <td>
                              {s?.mean_ci95
                                ?.map((v) => numeric(v, m[3]))
                                .join(" … ") ||
                                "Unavailable · fewer than 8 defined trials"}
                            </td>
                            <td>
                              {s?.empirical_interval95
                                ?.map((v) => numeric(v, m[3]))
                                .join(" … ") || "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {record.summary.notes?.map((n) => (
                    <p className="study-note" key={n}>
                      {n}
                    </p>
                  ))}
                </>
              ) : null}
              {record.kind === "convergence" && record.summary?.cases ? (
                <>
                  <h3>Convergence · {record.summary.stability}</h3>
                  <p className="study-note">
                    Reference {record.summary.reference_run_id?.slice(0, 8)} ·
                    threshold {record.request.relative_tolerance * 100}%.{" "}
                    {record.summary.note}
                  </p>
                  <table
                    className="research-table"
                    aria-label="Convergence errors"
                  >
                    <thead>
                      <tr>
                        <th>Parameter · SI</th>
                        <th>RF relative L2</th>
                        <th>{methodLabels[chosen]} map relative L2</th>
                        <th>Run</th>
                      </tr>
                    </thead>
                    <tbody>
                      {record.summary.cases.map((c) => (
                        <tr key={c.run_id}>
                          <td>{c.value}</td>
                          <td>{numeric(c.rf_relative_l2)}</td>
                          <td>{numeric(c.map_relative_l2[chosen])}</td>
                          <td>{c.run_id.slice(0, 8)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : null}
              <h3>Case records</h3>
              <table className="research-table" aria-label="Study cases">
                <thead>
                  <tr>
                    <th>Case</th>
                    <th>Parameters · SI</th>
                    <th>Status</th>
                    <th>
                      {metricInfo[1]} {metricInfo[2]}
                    </th>
                    <th>Inspect</th>
                  </tr>
                </thead>
                <tbody>
                  {record.cases.map((c) => (
                    <tr key={c.index}>
                      <td>{c.index + 1}</td>
                      <td>
                        <code>
                          {Object.entries(c.parameters)
                            .map(
                              ([k, v]) =>
                                `${k}=${k === "seed" || k === "trial" ? v : Number(v.toPrecision(6))}`,
                            )
                            .join("; ")}
                        </code>
                      </td>
                      <td>
                        {c.status}
                        {c.error ? <small>{c.error}</small> : null}
                      </td>
                      <td>
                        {numeric(
                          c.report?.methods[chosen]?.[metric],
                          metricInfo[3],
                        )}
                      </td>
                      <td>
                        <button
                          disabled={
                            !c.run_id || c.status !== "complete" || w.locked
                          }
                          onClick={() =>
                            void w.selectRun(c.run_id!, "benchmark")
                          }
                        >
                          PAM / benchmark
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
