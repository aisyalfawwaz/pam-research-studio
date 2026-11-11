import { z } from "zod";

export const uuid = z.string().uuid();
export const actions = [
  "health",
  "demo",
  "projectInfo",
  "saveDraft",
  "simulate",
  "reconstruct",
  "job",
  "cancel",
  "runs",
  "run",
  "methods",
  "backends",
  "workflow",
  "saveWorkflow",
  "validateWorkflow",
  "runWorkflow",
  "live",
  "publicCT",
  "phantomCT",
  "wholeCT",
  "ctInfo",
  "benchmark",
  "evaluateBenchmark",
  "planStudy",
  "startStudy",
  "studies",
  "study",
  "resumeStudy",
] as const;
export type Action = (typeof actions)[number];
export const arrayKinds = [
  "rf_processed",
  "trace_processed",
  "spectrum_processed",
  "dsp_response",
  "ct_mask",
  "wave",
  "wave_time",
  "bubble",
  "rf",
  "trace",
  "spectrum",
  "das",
  "tea",
  "cf",
  "rcb",
  "atp",
  "difference",
] as const;
export type ArrayKind = (typeof arrayKinds)[number];
export const bubbleSettingsSchema = z
  .object({
    model: z.enum(["free", "lipid"]),
    radius_m: z.number().min(0.5e-6).max(10e-6),
    drive_pa: z.number().min(0).max(300e3),
    viscosity_pa_s: z.number().min(0.0001).max(0.01),
    ringdown_cycles: z.number().int().min(2).max(40),
    rtol: z.number().min(1e-10).max(1e-5),
  })
  .strict();
export const sourceSchema = z
  .object({
    x_m: z.number().finite().min(-0.1).max(0.1),
    z_m: z.number().min(0.001).max(0.15),
    emission_s: z.number().min(0).max(100e-6),
    amplitude: z.number().positive().max(10),
    bubble: bubbleSettingsSchema.nullable().optional(),
  })
  .strict();
export const configSchema = z
  .object({
    schema_version: z.literal("1.0"),
    receiver_offsets_m: z
      .array(
        z.tuple([
          z.number().min(-0.005).max(0.005),
          z.number().min(-0.005).max(0.005),
        ]),
      )
      .max(1024)
      .nullable()
      .optional(),
    ct: z
      .object({
        asset_id: z.string().regex(/^[a-f0-9]{64}$/),
        rows: z.number().int().min(8).max(1024),
        columns: z.number().int().min(8).max(1024),
        spacing_x_m: z.number().min(0.00005).max(0.005),
        spacing_z_m: z.number().min(0.00005).max(0.005),
        crop: z.tuple([
          z.number().int(),
          z.number().int(),
          z.number().int(),
          z.number().int(),
        ]),
        origin_x_m: z.number().min(-0.3).max(0.3),
        origin_z_m: z.number().min(-0.3).max(0.3),
        contrast: z.boolean(),
        bone_threshold_hu: z.number().min(100).max(1000),
        bone_hu: z.number().min(500).max(3000),
        bone_speed_m_s: z.number().min(1800).max(3500),
        bone_density_kg_m3: z.number().min(1200).max(2500),
      })
      .strict()
      .nullable()
      .optional(),
    processing: z
      .object({
        remove_dc: z.boolean(),
        detrend_linear: z.boolean(),
        filter_kind: z.enum(["none", "lowpass", "highpass", "bandpass"]),
        low_hz: z.number().positive().max(40e6),
        high_hz: z.number().positive().max(45e6),
        order: z.number().int().min(2).max(8),
        notch_hz: z.number().positive().max(45e6).nullable(),
        notch_q: z.number().min(2).max(100),
      })
      .strict()
      .nullable()
      .optional(),
    coupling: z
      .object({
        mode: z.literal("volume_flow_2d"),
        effective_length_m: z.number().min(1e-5).max(0.1),
        passband_hz: z.number().min(0.1e6).max(10e6),
      })
      .strict()
      .nullable()
      .optional(),
    arrays: z
      .array(
        z
          .object({
            name: z.string().min(1).max(40),
            elements: z.number().int().min(2).max(1024),
            pitch_m: z.number().min(0.00005).max(0.002),
            x_m: z.number().min(-0.1).max(0.1),
            z_m: z.number().min(-0.1).max(0.15),
            angle_deg: z.number().min(-180).max(180),
          })
          .strict(),
      )
      .min(1)
      .max(8)
      .nullable()
      .optional(),
    bubble: z
      .object({
        model: z.enum(["free", "lipid"]),
        radius_m: z.number().min(0.5e-6).max(10e-6),
        drive_pa: z.number().min(0).max(300e3),
        viscosity_pa_s: z.number().min(0.0001).max(0.01),
        ringdown_cycles: z.number().int().min(2).max(40),
        rtol: z.number().min(1e-10).max(1e-5),
      })
      .strict()
      .nullable()
      .optional(),
    simulation: z
      .object({
        backend: z.literal("jwave"),
        spacing_m: z.number().min(0.00005).max(0.002),
        cfl: z.number().min(0.1).max(0.5),
        pml_cells: z.number().int().min(12).max(40),
        density_kg_m3: z.number().min(500).max(3000),
      })
      .strict()
      .nullable()
      .optional(),
    sound_speed_m_s: z.number().min(300).max(3000),
    channels: z.number().int().min(4).max(1024),
    pitch_m: z.number().min(0.00005).max(0.002),
    sampling_hz: z.number().min(1e6).max(100e6),
    samples: z.number().int().min(512).max(16384),
    capture_t0_s: z.number().min(-100e-6).max(100e-6),
    frequency_hz: z.number().min(0.1e6).max(10e6),
    duration_s: z.number().min(1e-6).max(20e-6),
    emission_kind: z.enum(["pulse", "harmonic", "broadband"]),
    bandpass_hz: z.tuple([z.number(), z.number()]).nullable(),
    spreading: z.boolean(),
    snr_db: z.number().min(-10).max(100).nullable(),
    seed: z.number().int().min(0).max(4294967295),
    sources: z.array(sourceSchema).min(1).max(8),
    active_channels: z.array(z.number().int()).nullable(),
    grid_x_min_m: z.number().min(-0.1).max(0.1),
    grid_x_max_m: z.number().min(-0.1).max(0.1),
    grid_z_min_m: z.number().min(0.001).max(0.15),
    grid_z_max_m: z.number().min(0.001).max(0.15),
    grid_n: z.number().int().min(17).max(192),
    gate_start_s: z.number().min(0).max(100e-6),
    gate_end_s: z.number().min(0).max(400e-6),
    gate_stride: z.number().int().min(1).max(16),
  })
  .strict()
  .refine((c) => c.samples * c.channels <= 8_388_608, {
    message:
      "RF exceeds the 64 MiB CPU capture budget; reduce samples or channels",
  });
export type Config = z.infer<typeof configSchema>;
export interface BackendInfo {
  id: "analytic" | "jwave" | "jbubble";
  ready: boolean;
  version: string;
  message: string;
  packages?: Record<string, string>;
  compute?: string;
  precision?: string;
  validation?: string;
}
export const jwaveDefaults = {
  backend: "jwave" as const,
  spacing_m: 0.0002,
  cfl: 0.3,
  pml_cells: 20,
  density_kg_m3: 1000,
};
export const bubbleDefaults = {
  model: "lipid" as const,
  radius_m: 2e-6,
  drive_pa: 100e3,
  viscosity_pa_s: 0.001,
  ringdown_cycles: 8,
  rtol: 1e-8,
};
export const analysisConfigFields = [
  "grid_x_min_m",
  "grid_x_max_m",
  "grid_z_min_m",
  "grid_z_max_m",
  "grid_n",
  "gate_start_s",
  "gate_end_s",
  "gate_stride",
  "active_channels",
  "processing",
] as const;
export function captureConfig(cfg: Config) {
  const result: Record<string, unknown> = { ...cfg };
  for (const key of analysisConfigFields) delete result[key];
  if (!result.simulation) delete result.simulation;
  if (!result.bubble) delete result.bubble;
  if (!result.coupling) delete result.coupling;
  if (!result.arrays) delete result.arrays;
  if (!result.processing) delete result.processing;
  if (!result.ct) delete result.ct;
  return result;
}
export const methodKeys = ["das", "tea", "cf", "rcb", "atp"] as const;
export type Method = (typeof methodKeys)[number];
export const analysisSchema = z
  .object({
    receive_model: z
      .enum(["homogeneous", "ct_slowness"])
      .default("homogeneous"),
    ray_step_m: z.number().min(0.00005).max(0.002).default(0.00025),
    assumed_sound_speed_m_s: z
      .number()
      .min(300)
      .max(3000)
      .nullable()
      .optional(),
    assumed_receiver_offsets_m: z
      .array(
        z.tuple([
          z.number().min(-0.005).max(0.005),
          z.number().min(-0.005).max(0.005),
        ]),
      )
      .max(1024)
      .nullable()
      .optional(),
    methods: z.array(z.enum(methodKeys)).min(1).max(5),
    cf_exponent: z.number().min(0).max(4),
    rcb_radius: z.number().min(0).lt(1),
    rcb_loading: z.number().min(1e-8).max(0.1),
    rcb_subarray: z.number().int().min(2).max(64),
    atp_timing_known: z.boolean(),
    atp_mode: z.enum(["emission", "plane_wave"]),
    atp_emission_s: z.number().min(-100e-6).max(200e-6),
    atp_window_s: z.number().min(0.1e-6).max(20e-6),
    atp_plane_z_m: z.number().min(-0.15).max(0.15),
  })
  .strict()
  .refine(
    (value) => new Set(value.methods).size === value.methods.length,
    "Duplicate method",
  );
export type Analysis = z.infer<typeof analysisSchema>;
export const peakSettingsSchema = z
  .object({
    threshold_db: z.number().min(-80).max(0),
    min_separation_m: z.number().min(0.00005).max(0.05),
    match_tolerance_m: z.number().min(0.00005).max(0.05),
    max_peaks: z.number().int().min(1).max(128),
  })
  .strict();
export type PeakSettings = z.infer<typeof peakSettingsSchema>;
export const peakDefaults: PeakSettings = {
  threshold_db: -20,
  min_separation_m: 0.001,
  match_tolerance_m: 0.002,
  max_peaks: 32,
};
export const benchmarkSettingsSchema = z
  .object({
    roi_radius_m: z.number().min(0.0005).max(0.01),
    histogram_bins: z.number().int().min(8).max(256),
    peaks: peakSettingsSchema.optional(),
  })
  .strict();
export type BenchmarkSettings = z.infer<typeof benchmarkSettingsSchema>;
export const benchmarkRequestSchema = z
  .object({ run_id: uuid, settings: benchmarkSettingsSchema })
  .strict();
export const benchmarkEvaluationSchema = z
  .object({
    run_ids: z.array(uuid).min(1).max(2),
    settings: benchmarkSettingsSchema,
  })
  .strict()
  .refine(
    (v) => new Set(v.run_ids).size === v.run_ids.length,
    "Choose distinct runs",
  );
export const projectSessionSchema = z.string().regex(/^[a-f0-9]{32}$/);
export const reconstructSchema = z
  .object({
    input_run_id: uuid,
    options: analysisSchema,
    config: configSchema.optional(),
  })
  .strict();
export interface MethodInfo {
  method_id: string;
  method_version: string;
  status: string;
  quantity: string;
  unit: string;
  definition: string;
  reference?: string;
}
export const methodLabels: Record<Method, string> = {
  das: "Passive DAS",
  tea: "TEA",
  cf: "CF-DAS",
  rcb: "RCB",
  atp: "ATP",
};
export interface Job {
  study_id?: string;
  status: string;
  progress: number;
  run_id: string | null;
  error: string | null;
  stage?: string;
}
export interface RunSummary {
  id: string;
  created: string;
  status: string;
  parent: string | null;
  error: string | null;
}
export interface Metrics {
  peak_x_m: number;
  peak_z_m: number;
  localization_error_m: number;
  lateral_fwhm_m: number | null;
  axial_fwhm_m: number | null;
  background_peak_ratio: number | null;
  metric_note: string;
}
export interface Run extends RunSummary {
  config: Config;
  warnings: string[];
  metrics: {
    methods: Partial<Record<Method, Metrics>>;
    runtime_ms: number;
    rf_bytes: number;
    map_bytes: number;
    rf_rms?: number;
    rf_peak?: number;
    diagnostics?: Record<string, unknown>;
  } | null;
  provenance: Record<string, unknown>;
  methods: Partial<Record<Method, MethodInfo>>;
}
export interface ProjectInfo {
  session_id: string;
  project_id: string;
  name: string;
  schema_version: string;
  draft: Config;
  runs: RunSummary[];
}
export interface BinaryArray {
  shape: number[];
  buffer: ArrayBuffer;
}
export interface ExportResult {
  zip_path: string;
  folder_path: string;
  sha256: string;
  raw_included: boolean;
}
export interface BenchmarkMetrics
  extends Omit<Metrics, "peak_x_m" | "peak_z_m" | "localization_error_m"> {
  peak_x_m: number | null;
  peak_z_m: number | null;
  localization_error_m: number | null;
  roi_concentration: number | null;
  background_peak_db: number | null;
  contrast_db: number | null;
  cnr: number | null;
  gcnr: number | null;
  normalized_entropy: number | null;
  half_power_area_m2: number | null;
  half_power_boundary: boolean | null;
  target_pixels: number;
  background_pixels: number;
  warnings: string[];
  map_sha256: string;
  detections?: PeakEvaluation;
  detected_peaks?: number;
  matched_sources?: number;
  missed_sources?: number;
  false_positive_peaks?: number;
  detection_precision?: number | null;
  detection_recall?: number | null;
  detection_f1?: number | null;
  matched_mean_error_m?: number | null;
  matched_rmse_m?: number | null;
}
export interface DetectedPeak {
  index: number;
  x_m: number;
  z_m: number;
  row: number;
  column: number;
  linear_value: number;
  relative_db: number;
  boundary: boolean;
  source_index: number | null;
  error_m: number | null;
}
export interface PeakTruth {
  source_index: number;
  x_m: number;
  z_m: number;
  in_view: boolean;
  peak_index: number | null;
  error_m: number | null;
  status: "matched" | "missed" | "outside_map";
}
export interface PeakEvaluation {
  id: string;
  version: string;
  settings: PeakSettings;
  peaks: DetectedPeak[];
  truth: PeakTruth[];
  scores: Record<string, number | null>;
  diagnostics: {
    regional_maxima: number;
    separation_suppressed: number;
    limit_reached: boolean;
  };
  notes: string[];
}
export interface BenchmarkReport {
  id: string;
  version: string;
  run_id: string;
  settings: BenchmarkSettings;
  methods: Partial<Record<Method, BenchmarkMetrics>>;
  fingerprints: Record<string, string>;
  definitions: Record<string, string>;
  runtime_ms: number | null;
  runtime_scope: string;
  rf_bytes: number | null;
  map_bytes: number | null;
  grid_spacing_m: number[];
  reference: string;
  notes: string[];
}
export interface BenchmarkComparison {
  matched: boolean;
  differences: string[];
  label: string;
  details: { field: string; current: unknown; reference: unknown }[];
  detail_count: number;
  deltas: Partial<Record<Method, Record<string, number | null>>>;
  delta_convention: string;
}
export interface BenchmarkEvaluation {
  reports: BenchmarkReport[];
  comparison: BenchmarkComparison | null;
}
export interface CTAsset {
  asset_id: string;
  rows: number;
  columns: number;
  spacing_x_m: number;
  spacing_z_m: number;
  source: Record<string, unknown>;
}
export interface CTTemplate {
  asset: CTAsset;
  workflow: import("./workflow").Workflow;
  config: Config;
  options: Analysis;
}
export interface DesktopAPI {
  exportReport: (
    id: string,
    scope: "run" | "study",
    settings?: BenchmarkSettings,
  ) => Promise<{ path: string; context_path: string; sha256: string } | null>;
  saveVideo: (
    id: string,
    data: Uint8Array,
    metadata: VideoMetadata,
  ) => Promise<{ path: string; sha256: string } | null>;
  exportStudy: (
    id: string,
    format: "csv" | "json",
  ) => Promise<{ path: string } | null>;
  exportBenchmark: (
    runIds: string[],
    settings: BenchmarkSettings,
    format: "csv" | "json",
  ) => Promise<{ path: string } | null>;
  importCT: () => Promise<CTTemplate | null>;
  ctArray: (config: Config) => Promise<BinaryArray>;
  request: (action: Action, payload?: unknown) => Promise<unknown>;
  array: (
    runId: string,
    kind: ArrayKind,
    channel?: number,
  ) => Promise<BinaryArray>;
  project: (create: boolean, name?: string) => Promise<ProjectInfo | null>;
  exportBundle: (
    runId: string,
    includeRaw: boolean,
  ) => Promise<ExportResult | null>;
  importBundle: () => Promise<Run | null>;
  exportRF: (
    runId: string,
    kind: "csv" | "h5",
    channel: number,
    signal?: "raw" | "processed",
  ) => Promise<{ path: string } | null>;
}
export interface VideoMetadata {
  mode: "bubble" | "pipeline";
  source_index: number;
  fps: number;
  duration_s: number;
  width: number;
  height: number;
  mime: string;
  method: Method;
  physical_time_range_s: [number, number];
}
export function mm(value: number): number {
  return value / 1000;
}
export function stableJSON(value: unknown): string {
  const normalize = (item: unknown): unknown =>
    Array.isArray(item)
      ? item.map(normalize)
      : item !== null && typeof item === "object"
        ? Object.fromEntries(
            Object.entries(item)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, val]) => [key, normalize(val)]),
          )
        : item;
  return JSON.stringify(normalize(value));
}
export function microseconds(value: number): number {
  return value / 1e6;
}
export function relativeDB(value: number, max: number, floor = -40): number {
  return max > 0
    ? Math.max(floor, 10 * Math.log10(Math.max(value / max, 1e-30)))
    : floor;
}
