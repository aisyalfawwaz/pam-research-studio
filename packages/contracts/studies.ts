import { z } from "zod";
import {
  configSchema,
  analysisSchema,
  benchmarkSettingsSchema,
  projectSessionSchema,
  uuid,
} from "./index";

export const studyParameters = [
  ["snr_db", "SNR", "dB", 1],
  ["frequency_hz", "Carrier frequency", "MHz", 1e6],
  ["sound_speed_m_s", "Host sound speed", "m/s", 1],
  ["channels", "Receive channels", "", 1],
  ["pitch_m", "Receive pitch", "mm", 0.001],
  ["source.x_m", "Source 1 x", "mm", 0.001],
  ["source.z_m", "Source 1 z", "mm", 0.001],
  ["array.x_m", "Array 1 x", "mm", 0.001],
  ["array.z_m", "Array 1 z", "mm", 0.001],
  ["array.angle_deg", "Array 1 angle", "deg", 1],
  ["bubble.drive_pa", "Default bubble drive", "kPa", 1000],
  ["bubble.radius_m", "Default bubble radius", "µm", 1e-6],
  ["grid_n", "Reconstruction grid", "nodes/axis", 1],
  ["gate_stride", "Gate stride", "samples", 1],
  ["sampling_hz", "Acquisition rate", "MHz", 1e6],
  ["simulation.spacing_m", "Propagation spacing", "mm", 0.001],
  ["simulation.cfl", "CFL ceiling", "", 1],
  ["bubble.rtol", "Bubble ODE tolerance", "", 1],
  ["bubble.ringdown_cycles", "Default bubble ringdown", "cycles", 1],
  ["ray_step_m", "CT ray step", "mm", 0.001],
] as const;
export const refinementParameters = [
  "grid_n",
  "gate_stride",
  "sampling_hz",
  "simulation.spacing_m",
  "simulation.cfl",
  "bubble.rtol",
  "bubble.ringdown_cycles",
  "ray_step_m",
];
export const studyRequestSchema = z
  .object({
    name: z.string().min(1).max(100),
    kind: z.enum(["sweep", "convergence", "uncertainty"]),
    config: configSchema,
    options: analysisSchema,
    axes: z
      .array(
        z
          .object({
            parameter: z.enum(
              studyParameters.map((p) => p[0]) as [string, ...string[]],
            ),
            values: z.array(z.number().finite()).min(2).max(8),
          })
          .strict(),
      )
      .max(2),
    trials: z.number().int().min(2).max(64),
    seed: z.number().int().min(0).max(4294967295),
    speed_sigma_m_s: z.number().min(0).max(200),
    sensor_sigma_m: z.number().min(0).max(0.001),
    relative_tolerance: z.number().positive().max(0.5),
    stop_on_failure: z.boolean(),
    settings: benchmarkSettingsSchema,
  })
  .strict();
export const studyLaunchSchema = z
  .object({ session_id: projectSessionSchema, study: studyRequestSchema })
  .strict();
export const studyResumeSchema = z
  .object({ id: uuid, session_id: projectSessionSchema })
  .strict();
export type StudyRequest = z.infer<typeof studyRequestSchema>;
export interface StudyCase {
  index: number;
  status: string;
  run_id: string | null;
  parameters: Record<string, number>;
  error: string | null;
  report: import("./index").BenchmarkReport | null;
  config_sha256: string;
}
export interface StudyListItem {
  id: string;
  name: string;
  kind: StudyRequest["kind"];
  status: string;
  created: string;
  completed: number;
  total: number;
}
export interface StudyPlan {
  case_count: number;
  array_bytes_upper_estimate: number;
  notes: string[];
  cases: {
    index: number;
    parameters: Record<string, number>;
    config_sha256: string;
  }[];
}
export interface StudyRecord extends StudyListItem {
  request: StudyRequest;
  cases: StudyCase[];
  plan: StudyPlan;
  error?: string;
  definition_version: string;
  parent_study_id?: string;
  summary: null | {
    reference_run_id?: string;
    parameter?: string;
    relative_tolerance?: number;
    stability?: string;
    note?: string;
    notes?: string[];
    cases?: {
      run_id: string;
      value: number;
      map_relative_l2: Record<string, number>;
      rf_relative_l2: number;
    }[];
    methods?: Record<
      string,
      Record<
        string,
        {
          valid: number;
          total: number;
          mean: number | null;
          sample_sd?: number | null;
          mean_ci95: number[] | null;
          empirical_interval95?: number[];
        }
      >
    >;
  };
}
