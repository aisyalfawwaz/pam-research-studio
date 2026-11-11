import { useEffect, useMemo, useState } from "react";
import type {
  BinaryArray,
  Config,
  CTTemplate,
  Method,
  Run,
} from "../../../packages/contracts";
import {
  analysisSchema,
  configSchema,
  stableJSON,
  methodLabels,
} from "../../../packages/contracts";
import { workflowSchema } from "../../../packages/contracts/workflow";
import { NumericProperty } from "./InstrumentControls";
import { RasterPlot } from "./plots";
import { receiverPositions } from "./arrayGeometry";
import { request } from "./useWorkbench";
import type { Workbench } from "./useWorkbench";
import { rawRunAnalysis } from "../../../packages/workspace";
const pairKey = (cfg: Config) =>
  stableJSON({ ...cfg, ct: cfg.ct ? { ...cfg.ct, contrast: false } : null });
const analysisKey = (options: unknown) => {
  if (!options || typeof options !== "object") return "";
  const value = options as Record<string, unknown>;
  return stableJSON(
    JSON.parse(
      JSON.stringify(
        {
          ...value,
          methods: Array.isArray(value.methods)
            ? [...value.methods].sort()
            : value.methods,
        },
        (_key, v) => (typeof v === "number" ? Number(v.toPrecision(12)) : v),
      ),
    ),
  );
};
function rawOptions(run: Run) {
  try {
    return rawRunAnalysis(run);
  } catch {
    return null;
  }
}
function Slice({
  image,
  cfg,
  mode,
  centre,
  width,
}: {
  image: BinaryArray;
  cfg: Config;
  mode: string;
  centre: number;
  width: number;
}) {
  const ct = cfg.ct!;
  const raster = useMemo(() => {
    const [rows, columns] = image.shape,
      values = new Float32Array(image.buffer);
    const canvas = document.createElement("canvas");
    canvas.width = columns;
    canvas.height = rows;
    const context = canvas.getContext("2d")!,
      pixels = context.createImageData(columns, rows);
    values.forEach((hu, i) => {
      const fraction =
        ct.contrast && hu >= ct.bone_threshold_hu
          ? Math.max(0, Math.min(1, hu / ct.bone_hu))
          : 0;
      const value =
        mode === "hu" ? (hu - (centre - width / 2)) / width : fraction;
      const gray = Math.round(Math.max(0, Math.min(1, value)) * 255);
      pixels.data.set([gray, gray, gray, 255], i * 4);
    });
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL();
  }, [
    image,
    mode,
    centre,
    width,
    ct.contrast,
    ct.bone_hu,
    ct.bone_threshold_hu,
  ]);
  const [r0, r1, c0, c1] = ct.crop;
  const col = (x: number) => c0 + (x - ct.origin_x_m) / ct.spacing_x_m;
  const row = (z: number) => r0 + (z - ct.origin_z_m) / ct.spacing_z_m;
  const viewWidth = ct.columns * ct.spacing_x_m * 1000,
    viewHeight = ct.rows * ct.spacing_z_m * 1000;
  const x = (column: number) => column * ct.spacing_x_m * 1000,
    y = (r: number) => r * ct.spacing_z_m * 1000;
  return (
    <section className="ct-image-panel">
      <header className="plot-heading">
        <span>
          {mode === "hu"
            ? "CT source · Hounsfield units"
            : mode === "speed"
              ? "Estimated sound speed · HU mixture"
              : "Estimated density · HU mixture"}
        </span>
        <small>
          {ct.columns} × {ct.rows} pixels
        </small>
      </header>
      <div className="ct-slice">
        <svg
          viewBox={`0 0 ${viewWidth} ${viewHeight}`}
          role="img"
          aria-label="CT anatomy with simulation crop, sources and receivers"
        >
          <image
            href={raster}
            width={viewWidth}
            height={viewHeight}
            preserveAspectRatio="none"
          />
          <rect
            x={x(c0)}
            y={y(r0)}
            width={x(c1 - c0)}
            height={y(r1 - r0)}
            fill="none"
            stroke="#55e2dd"
            strokeWidth={0.7}
          />
          {receiverPositions(cfg).map(([px, pz], i) => (
            <circle
              key={i}
              cx={x(col(px) + 0.5)}
              cy={y(row(pz) + 0.5)}
              r={0.7}
              fill="#ffcd66"
            />
          ))}
          {cfg.sources.map((s, i) => (
            <g key={i} stroke="#f56853" strokeWidth={0.8}>
              <path
                d={`M${x(col(s.x_m) + 0.5) - 2},${y(row(s.z_m) + 0.5)}h4M${x(col(s.x_m) + 0.5)},${y(row(s.z_m) + 0.5) - 2}v4`}
              />
            </g>
          ))}
        </svg>
      </div>
      <p className="plot-caption">
        Cyan: solver anatomy crop. Yellow: receivers. Red: source. Physical
        scale retained; simulation x/z follows DICOM columns/rows.{" "}
        {mode === "hu"
          ? `Window ${centre} / ${width} HU.`
          : mode === "speed"
            ? `${cfg.sound_speed_m_s}–${ct.contrast ? ct.bone_speed_m_s : cfg.sound_speed_m_s} m/s`
            : `${cfg.simulation?.density_kg_m3}–${ct.contrast ? ct.bone_density_kg_m3 : cfg.simulation?.density_kg_m3} kg/m³`}{" "}
        Source pixels are resampled onto the propagation grid.
      </p>
    </section>
  );
}
export function CTWorkspace({
  w,
  onScene,
  onExpand,
}: {
  w: Workbench;
  onScene: () => void;
  onExpand: () => void;
}) {
  const cfg = w.config,
    ct = cfg?.ct;
  const [image, setImage] = useState<BinaryArray | null>(null),
    [metadata, setMetadata] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false),
    [mode, setMode] = useState("hu"),
    [centre, setCentre] = useState(400),
    [width, setWidth] = useState(1600);
  const [records, setRecords] = useState<Run[]>([]),
    [method, setMethod] = useState<Method>("das");
  const [waterMap, setWaterMap] = useState<BinaryArray | null>(null),
    [ctMap, setCTMap] = useState<BinaryArray | null>(null);
  const fail = (error: unknown) => {
    const text = error instanceof Error ? error.message : String(error);
    w.setError(text);
    w.log(text, "error");
  };
  const load = async (
    kind: "publicCT" | "phantomCT" | "wholeCT" | "import",
  ) => {
    setLoading(true);
    try {
      const body =
        kind === "import"
          ? await window.pam.importCT()
          : await request<CTTemplate>(
              kind,
              kind === "wholeCT" ? cfg : undefined,
            );
      if (!body) return;
      w.updateConfig(configSchema.parse(body.config));
      w.setWorkflow(workflowSchema.parse(body.workflow));
      w.setAnalysis(analysisSchema.parse(body.options));
      w.log(
        `Loaded ${String(body.asset.source.label)}. Review the crop, source and receive geometry before running.`,
      );
    } catch (error) {
      fail(error);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    setImage(null);
    setMetadata(null);
    if (!cfg?.ct) return;
    let active = true;
    Promise.all([
      window.pam.ctArray(cfg),
      request<Record<string, unknown>>("ctInfo", cfg),
    ])
      .then(([pixels, info]) => {
        if (active) {
          setImage(pixels);
          setMetadata(info);
        }
      })
      .catch((error) => {
        if (active) fail(error);
      });
    return () => {
      active = false;
    };
  }, [ct?.asset_id, w.project]);
  useEffect(() => {
    if (!ct) {
      setRecords([]);
      return;
    }
    let active = true;
    Promise.all(
      w.runs
        .filter((r) => r.status === "complete")
        .slice(0, 20)
        .map((r) => request<Run>("run", r.id)),
    )
      .then((runs) => {
        if (active)
          setRecords(runs.filter((r) => r.config.ct?.asset_id === ct.asset_id));
      })
      .catch((error) => {
        if (active) fail(error);
      });
    return () => {
      active = false;
    };
  }, [w.runs, ct?.asset_id]);
  const matching = cfg
    ? records.filter(
        (r) =>
          pairKey(r.config) === pairKey(cfg) &&
          analysisKey(rawOptions(r)) === analysisKey(w.analysis),
      )
    : [];
  const water = matching.find((r) => !r.config.ct?.contrast),
    skull = matching.find(
      (r) =>
        r.config.ct?.contrast &&
        (!water ||
          (r.provenance.engine_source_sha256 ===
            water.provenance.engine_source_sha256 &&
            stableJSON(r.methods) === stableJSON(water.methods))),
    );
  useEffect(() => {
    setWaterMap(null);
    setCTMap(null);
    let active = true;
    const tasks = [];
    if (water?.metrics?.methods[method])
      tasks.push(
        window.pam.array(water.id, method).then((a) => {
          if (active) setWaterMap(a);
        }),
      );
    if (skull?.metrics?.methods[method])
      tasks.push(
        window.pam.array(skull.id, method).then((a) => {
          if (active) setCTMap(a);
        }),
      );
    Promise.all(tasks).catch((error) => {
      if (active) fail(error);
    });
    return () => {
      active = false;
    };
  }, [water?.id, skull?.id, method]);
  const source = metadata?.source as Record<string, unknown> | undefined;
  const edit = (patch: Partial<NonNullable<Config["ct"]>>) => {
    if (cfg && ct) w.updateConfig({ ...cfg, ct: { ...ct, ...patch } });
  };
  const run = (contrast: boolean) => {
    if (!cfg || !ct) return;
    const next = { ...cfg, ct: { ...ct, contrast } };
    w.updateConfig(next);
    void w.runWorkflow(next);
  };
  const locked = w.locked || loading;
  const mapDomain = (run: Run) => ({
    x0: run.config.grid_x_min_m * 1000,
    x1: run.config.grid_x_max_m * 1000,
    y0: run.config.grid_z_min_m * 1000,
    y1: run.config.grid_z_max_m * 1000,
  });
  return (
    <div className="ct-workspace">
      <div className="model-toolbar">
        <strong>CT medium</strong>
        <button
          className="run-model"
          disabled={!ct || locked || !w.project}
          onClick={() => run(false)}
        >
          Run water reference
        </button>
        <button
          className="run-model"
          disabled={!ct || locked || !w.project}
          onClick={() => run(true)}
        >
          Run CT medium
        </button>
        <span className="toolbar-rule" />
        <button
          disabled={!w.project || locked}
          onClick={() => void load("import")}
        >
          Import CT DICOM…
        </button>
        <button
          disabled={!w.project || locked}
          onClick={() => void load("publicCT")}
        >
          Load public head CT
        </button>
        <button
          disabled={!ct || locked || source?.kind !== "public_deidentified_CT"}
          onClick={() => void load("wholeCT")}
        >
          Whole slice · 0.1 MHz
        </button>
        <button
          disabled={!w.project || locked}
          onClick={() => void load("phantomCT")}
        >
          Synthetic skull phantom
        </button>
        <div className="strip-space" />
        <button onClick={onExpand}>Expand CT workspace</button>
      </div>
      {!ct || !cfg ? (
        <div className="monitor-wait">
          Create a project, then import a single CT DICOM slice or load a
          reference. The public head example is attributed CC BY 4.0 data; the
          synthetic phantom contains no patient data.
        </div>
      ) : (
        <div className="ct-content">
          <div className="ct-layout">
            <section className="ct-properties">
              <fieldset disabled={locked}>
                <h3>Anatomy and coordinates</h3>
                <div className="property-note">
                  {String(source?.label || "Stored CT source")}
                </div>
                <NumericProperty
                  label="Crop row start"
                  value={ct.crop[0]}
                  min={0}
                  max={ct.rows - 8}
                  step={1}
                  onChange={(v) =>
                    edit({ crop: [v, ct.crop[1], ct.crop[2], ct.crop[3]] })
                  }
                />
                <NumericProperty
                  label="Crop row end"
                  value={ct.crop[1]}
                  min={8}
                  max={ct.rows}
                  step={1}
                  onChange={(v) =>
                    edit({ crop: [ct.crop[0], v, ct.crop[2], ct.crop[3]] })
                  }
                />
                <NumericProperty
                  label="Crop column start"
                  value={ct.crop[2]}
                  min={0}
                  max={ct.columns - 8}
                  step={1}
                  onChange={(v) =>
                    edit({ crop: [ct.crop[0], ct.crop[1], v, ct.crop[3]] })
                  }
                />
                <NumericProperty
                  label="Crop column end"
                  value={ct.crop[3]}
                  min={8}
                  max={ct.columns}
                  step={1}
                  onChange={(v) =>
                    edit({ crop: [ct.crop[0], ct.crop[1], ct.crop[2], v] })
                  }
                />
                <NumericProperty
                  label="CT crop origin x"
                  unit="mm"
                  value={ct.origin_x_m * 1000}
                  step={0.5}
                  onChange={(v) => edit({ origin_x_m: v / 1000 })}
                />
                <NumericProperty
                  label="CT crop origin z"
                  unit="mm"
                  value={ct.origin_z_m * 1000}
                  step={0.5}
                  onChange={(v) => edit({ origin_z_m: v / 1000 })}
                />
                <h3>Acoustic material model</h3>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={ct.contrast}
                    onChange={(e) => edit({ contrast: e.target.checked })}
                  />
                  Enable skull acoustic contrast
                </label>
                <NumericProperty
                  label="Bone threshold"
                  unit="HU"
                  value={ct.bone_threshold_hu}
                  min={100}
                  max={1000}
                  step={25}
                  onChange={(v) => edit({ bone_threshold_hu: v })}
                />
                <NumericProperty
                  label="Cortical endpoint"
                  unit="HU"
                  value={ct.bone_hu}
                  min={500}
                  max={3000}
                  step={100}
                  onChange={(v) => edit({ bone_hu: v })}
                />
                <NumericProperty
                  label="Bone sound speed"
                  unit="m/s"
                  value={ct.bone_speed_m_s}
                  min={1800}
                  max={3500}
                  step={100}
                  onChange={(v) => edit({ bone_speed_m_s: v })}
                />
                <NumericProperty
                  label="Bone density"
                  unit="kg/m³"
                  value={ct.bone_density_kg_m3}
                  min={1200}
                  max={2500}
                  step={100}
                  onChange={(v) => edit({ bone_density_kg_m3: v })}
                />
                <p className="property-note">
                  Thresholded HU → linear fluid c/ρ mixture. Air and soft tissue
                  become host fluid. Absorption and shear modes are not
                  simulated. Choose homogeneous or experimental straight-ray CT
                  receive delays in Analysis. Matched comparisons require the
                  same reconstruction settings.
                </p>
                <button onClick={onScene}>
                  Edit source and array placement
                </button>
                <h3>Matched reference comparison</h3>
                <p className="property-note">
                  Use the two Run commands above to generate a matched pair.
                  Same geometry, source, filtering, reconstruction grid and
                  solver clock. Only CT material contrast changes. Recent 20
                  completed runs are considered for matching.
                </p>
              </fieldset>
              <h3>Display</h3>
              <label className="select-property property-row">
                CT display
                <select
                  aria-label="CT display"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  <option value="hu">Source HU</option>
                  <option value="speed">Estimated speed</option>
                  <option value="density">Estimated density</option>
                </select>
              </label>
              <NumericProperty
                label="CT window centre"
                unit="HU"
                value={centre}
                step={50}
                onChange={setCentre}
              />
              <NumericProperty
                label="CT window width"
                unit="HU"
                value={width}
                min={1}
                step={100}
                onChange={setWidth}
              />
            </section>
            {image ? (
              <Slice
                image={image}
                cfg={cfg}
                mode={mode}
                centre={centre}
                width={Math.max(1, width)}
              />
            ) : (
              <div className="monitor-wait">Loading actual HU pixels…</div>
            )}
          </div>
          <section className="ct-comparison">
            <div className="editor-strip">
              <strong>Water reference / CT medium</strong>
              <select
                aria-label="CT comparison method"
                value={method}
                onChange={(e) => setMethod(e.target.value as Method)}
              >
                {(["das", "tea", "cf", "atp"] as const).map((m) => (
                  <option key={m} value={m}>
                    {methodLabels[m]}
                  </option>
                ))}
              </select>
              <span>
                Relative dB within each run ·{" "}
                {w.analysis.receive_model === "ct_slowness"
                  ? "CT straight-ray"
                  : "homogeneous"}{" "}
                receive delays
              </span>
            </div>
            <table aria-label="CT effect measurements">
              <thead>
                <tr>
                  <th>Quantity</th>
                  <th>Water reference</th>
                  <th>CT medium</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Run</td>
                  <td>{water?.id.slice(0, 8) || "Not run"}</td>
                  <td>{skull?.id.slice(0, 8) || "Not run"}</td>
                </tr>
                <tr>
                  <td>Raw RF RMS · whole capture</td>
                  <td>{water?.metrics?.rf_rms?.toExponential(3) || "—"}</td>
                  <td>{skull?.metrics?.rf_rms?.toExponential(3) || "—"}</td>
                </tr>
                <tr>
                  <td>CT / water RMS ratio</td>
                  <td>{water?.metrics?.rf_rms ? "1.000 (reference)" : "—"}</td>
                  <td>
                    {water?.metrics?.rf_rms && skull?.metrics?.rf_rms
                      ? (skull.metrics.rf_rms / water.metrics.rf_rms).toFixed(3)
                      : "—"}
                  </td>
                </tr>
                <tr>
                  <td>Global peak error (mm)</td>
                  <td>
                    {water?.metrics?.methods[method]?.localization_error_m !==
                    undefined
                      ? (
                          water.metrics.methods[method]!.localization_error_m *
                          1000
                        ).toFixed(3)
                      : "—"}
                  </td>
                  <td>
                    {skull?.metrics?.methods[method]?.localization_error_m !==
                    undefined
                      ? (
                          skull.metrics.methods[method]!.localization_error_m *
                          1000
                        ).toFixed(3)
                      : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="ct-map-pair">
              {water && waterMap ? (
                <RasterPlot
                  array={waterMap}
                  domain={mapDomain(water)}
                  title={`Water reference · ${method.toUpperCase()}`}
                  xLabel="Lateral x (mm)"
                  yLabel="Depth z (mm)"
                  truth={water.config.sources.map((s) => [
                    s.x_m * 1000,
                    s.z_m * 1000,
                  ])}
                />
              ) : (
                <div className="monitor-wait">
                  Run a water reference with these settings.
                </div>
              )}
              {skull && ctMap ? (
                <RasterPlot
                  array={ctMap}
                  domain={mapDomain(skull)}
                  title={`CT medium · ${method.toUpperCase()}`}
                  xLabel="Lateral x (mm)"
                  yLabel="Depth z (mm)"
                  truth={skull.config.sources.map((s) => [
                    s.x_m * 1000,
                    s.z_m * 1000,
                  ])}
                />
              ) : (
                <div className="monitor-wait">
                  Run the CT medium to compare its calculated PAM map.
                </div>
              )}
            </div>
          </section>
          <details className="ct-attribution" open>
            <summary>Anatomy source and credit</summary>
            <p>{String(source?.label || "CT asset")}</p>
            <p>
              {Array.isArray(source?.authors)
                ? source.authors.join(", ")
                : String(source?.citation || "")}
            </p>
            <p>
              {String(source?.license || "Source license supplied by user")} ·{" "}
              {String(source?.doi || "")}
            </p>
            <p className="property-note">
              {String(source?.modifications || "")} HU-to-acoustics is an
              experimental user-defined conversion, not a calibrated
              patient-specific measurement. The public demo uses one axial crop
              and ideal point receivers.
            </p>
          </details>
        </div>
      )}
    </div>
  );
}
