import { describe, expect, it } from "vitest";
import {
  studyRequestSchema,
  studyLaunchSchema,
  studyResumeSchema,
} from "./studies";
import { configSchema, analysisSchema } from "./index";
import demo from "./demo.json";
import analysis from "./analysis.json";
import { receiverPositions } from "../../apps/desktop/src/arrayGeometry";

const request = {
  name: "Calibration trials",
  kind: "uncertainty",
  config: demo,
  options: analysis,
  axes: [],
  trials: 16,
  seed: 2026,
  speed_sigma_m_s: 15,
  sensor_sigma_m: 0.00004,
  relative_tolerance: 0.02,
  stop_on_failure: true,
  settings: { roi_radius_m: 0.002, histogram_bins: 100 },
};
describe("bounded research IPC", () => {
  it("rejects arbitrary study parameters, oversize trials and stale/path bindings", () => {
    expect(studyRequestSchema.safeParse(request).success).toBe(true);
    for (const changes of [
      { trials: 65 },
      { sensor_sigma_m: 0.1 },
      { axes: [{ parameter: "__proto__", values: [1, 2] }] },
      { axes: [{ parameter: "snr_db", values: [1, Infinity] }] },
      { command: "arbitrary code" },
    ])
      expect(
        studyRequestSchema.safeParse({ ...request, ...changes }).success,
      ).toBe(false);
    expect(
      studyLaunchSchema.safeParse({ session_id: "../project", study: request })
        .success,
    ).toBe(false);
    expect(
      studyResumeSchema.safeParse({
        session_id: "a".repeat(32),
        id: "../study",
      }).success,
    ).toBe(false);
  });
  it("represents actual element offsets separately from nominal reconstruction calibration", () => {
    const cfg = configSchema.parse(demo);
    const nominal = receiverPositions(cfg);
    const offsets = Array.from(
      { length: cfg.channels },
      (_, i) => [i * 1e-6, -2e-5] as [number, number],
    );
    const actual = receiverPositions(
      configSchema.parse({ ...cfg, receiver_offsets_m: offsets }),
    );
    expect(actual[3][0] - nominal[3][0]).toBeCloseTo(3e-6, 14);
    expect(actual[3][1] - nominal[3][1]).toBeCloseTo(-2e-5, 14);
    const receive = analysisSchema.parse({
      ...analysis,
      receive_model: "ct_slowness",
      ray_step_m: 0.0001,
      assumed_sound_speed_m_s: 1500,
    });
    expect(receive.assumed_sound_speed_m_s).toBe(1500);
    expect(
      analysisSchema.safeParse({ ...receive, receive_model: "raytrace_fake" })
        .success,
    ).toBe(false);
  });
});
