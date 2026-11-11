import { describe, expect, it } from "vitest";
import {
  mm,
  microseconds,
  relativeDB,
  sourceSchema,
  uuid,
  configSchema,
  benchmarkRequestSchema,
  peakSettingsSchema,
  peakDefaults,
} from "./index";
import demo from "./demo.json";
import analysis from "./analysis.json";
import { analysisSchema, methodKeys } from "./index";
import { workflowRequestSchema, makeWorkflow, ports } from "./workflow";
import coupled from "./coupled-template.json";
import { receiverPositions } from "../../apps/desktop/src/arrayGeometry";
import { identity, libraryCredits } from "../branding";

describe("scientific display and IPC boundaries", () => {
  it("bounds peak thresholds, physical separation, matching tolerance and cap independently", () => {
    expect(peakSettingsSchema.parse(peakDefaults)).toEqual(peakDefaults);
    for (const bad of [
      { threshold_db: 1 },
      { threshold_db: -100 },
      { min_separation_m: 0 },
      { match_tolerance_m: 0.1 },
      { max_peaks: 129 },
      { max_peaks: 2.5 },
      { truth_count: 3 },
    ]) {
      expect(
        peakSettingsSchema.safeParse({ ...peakDefaults, ...bad }).success,
      ).toBe(false);
    }
    const input = {
      run_id: "42e2aba0-16c2-4c4a-9970-d26c19dd26c4",
      settings: {
        roi_radius_m: 0.002,
        histogram_bins: 100,
        peaks: { ...peakDefaults, threshold_db: -12 },
      },
    };
    expect(benchmarkRequestSchema.parse(input)).toEqual(input);
  });
  it("bounds truth-region benchmark requests and rejects paths or arbitrary metrics", () => {
    const input = {
      run_id: "42e2aba0-16c2-4c4a-9970-d26c19dd26c4",
      settings: { roi_radius_m: 0.002, histogram_bins: 100 },
    };
    expect(benchmarkRequestSchema.parse(input)).toEqual(input);
    expect(
      benchmarkRequestSchema.safeParse({ ...input, run_id: "../run" }).success,
    ).toBe(false);
    expect(
      benchmarkRequestSchema.safeParse({
        ...input,
        settings: { ...input.settings, roi_radius_m: 2 },
      }).success,
    ).toBe(false);
    expect(
      benchmarkRequestSchema.safeParse({
        ...input,
        settings: { ...input.settings, histogram_bins: 10000 },
      }).success,
    ).toBe(false);
    expect(
      benchmarkRequestSchema.safeParse({ ...input, path: "data.h5" }).success,
    ).toBe(false);
  });
  it("restricts DSP to typed numerical filters without executable hooks", () => {
    const processing = {
      remove_dc: true,
      detrend_linear: false,
      filter_kind: "bandpass",
      low_hz: 0.2e6,
      high_hz: 2e6,
      order: 4,
      notch_hz: null,
      notch_q: 30,
    };
    expect(configSchema.parse({ ...demo, processing }).processing).toEqual(
      processing,
    );
    expect(
      configSchema.safeParse({
        ...demo,
        processing: { ...processing, script: "external.py" },
      }).success,
    ).toBe(false);
    expect(
      configSchema.safeParse({
        ...demo,
        processing: { ...processing, filter_kind: "custom" },
      }).success,
    ).toBe(false);
    expect(
      configSchema.safeParse({
        ...demo,
        processing: { ...processing, order: 99 },
      }).success,
    ).toBe(false);
  });
  it("uses immutable CT asset identities and SI geometry instead of renderer paths", () => {
    const ct = {
      asset_id: "a".repeat(64),
      rows: 512,
      columns: 512,
      spacing_x_m: 0.0005,
      spacing_z_m: 0.0005,
      crop: [20, 148, 128, 256],
      origin_x_m: -0.032,
      origin_z_m: 0,
      contrast: true,
      bone_threshold_hu: 300,
      bone_hu: 1000,
      bone_speed_m_s: 2800,
      bone_density_kg_m3: 1900,
    };
    expect(configSchema.parse({ ...demo, ct }).ct).toEqual(ct);
    expect(
      configSchema.safeParse({ ...demo, ct: { ...ct, asset_id: "../scan" } })
        .success,
    ).toBe(false);
    expect(
      configSchema.safeParse({ ...demo, ct: { ...ct, path: "head.dcm" } })
        .success,
    ).toBe(false);
    expect(
      configSchema.safeParse({ ...demo, ct: { ...ct, spacing_x_m: 0.5 } })
        .success,
    ).toBe(false);
  });
  it("accepts 1024-channel captures within a bounded CPU memory budget", () => {
    expect(
      configSchema.safeParse({ ...demo, channels: 1024, samples: 8192 })
        .success,
    ).toBe(true);
    expect(configSchema.safeParse({ ...demo, channels: 1025 }).success).toBe(
      false,
    );
    expect(
      configSchema.safeParse({ ...demo, channels: 1024, samples: 16384 })
        .success,
    ).toBe(false);
  });
  it("keeps project identity separate from upstream library authorship", () => {
    expect(identity.researcher).toBe("Aisy Fawwaz");
    expect(identity.institution).toBe("Imperial College London");
    expect(libraryCredits.slice(0, 2).map((c) => c.name)).toEqual([
      "jbubble",
      "j-Wave",
    ]);
    expect(
      libraryCredits.every((c) => !c.authors.includes(identity.researcher)),
    ).toBe(true);
  });
  it("preserves the canonical Python coupled graph and raw drive timing", () => {
    expect(workflowRequestSchema.parse(coupled)).toEqual(coupled);
    const graph = makeWorkflow("coupled");
    for (const edge of graph.edges) {
      const source = graph.nodes.find((n) => n.id === edge.source)!;
      const target = graph.nodes.find((n) => n.id === edge.target)!;
      expect(ports[source.kind].output).toBe(
        ports[target.kind].inputs[edge.port],
      );
    }
    expect(coupled.options.atp_emission_s).toBe(8e-6);
    expect(
      workflowRequestSchema.safeParse({
        ...coupled,
        workflow: { ...graph, script: "external.py" },
      }).success,
    ).toBe(false);
  });
  it("plots rotated array elements in the same flattened channel order as the engine", () => {
    const cfg = configSchema.parse(coupled.config);
    const points = receiverPositions(cfg);
    expect(points).toHaveLength(32);
    expect(points[0][0]).toBeCloseTo(-0.00525, 12);
    expect(points[16][0]).toBeCloseTo(0.009, 12);
    expect(points[16][1]).toBeCloseTo(0.00575, 12);
    expect(points[31][1]).toBeCloseTo(0.01025, 12);
  });
  it("accepts bounded bubble parameters and rejects unsupported model or paths", () => {
    const bubble = {
      model: "lipid",
      radius_m: 2e-6,
      drive_pa: 100e3,
      viscosity_pa_s: 0.001,
      ringdown_cycles: 8,
      rtol: 1e-8,
    };
    expect(
      configSchema.safeParse({
        ...demo,
        bubble,
        spreading: true,
        gate_stride: 1,
      }).success,
    ).toBe(true);
    expect(
      configSchema.safeParse({
        ...demo,
        bubble: { ...bubble, script: "external.py" },
      }).success,
    ).toBe(false);
    expect(
      configSchema.safeParse({
        ...demo,
        bubble: { ...bubble, model: "invented" },
      }).success,
    ).toBe(false);
    expect(
      configSchema.safeParse({ ...demo, bubble: { ...bubble, drive_pa: 1e6 } })
        .success,
    ).toBe(false);
  });
  it("accepts the fixed j-Wave settings without arbitrary executable paths", () => {
    const simulation = {
      backend: "jwave",
      spacing_m: 0.0002,
      cfl: 0.3,
      pml_cells: 20,
      density_kg_m3: 1000,
    };
    expect(configSchema.safeParse({ ...demo, simulation }).success).toBe(true);
    expect(
      configSchema.safeParse({
        ...demo,
        simulation: { ...simulation, executable: "arbitrary.exe" },
      }).success,
    ).toBe(false);
    expect(
      configSchema.safeParse({ ...demo, simulation: { ...simulation, cfl: 2 } })
        .success,
    ).toBe(false);
  });
  it("preserves method parameters from the Python contract", () => {
    expect(analysisSchema.parse(analysis)).toEqual(analysis);
    expect(
      analysisSchema.safeParse({ ...analysis, methods: ["rcb", "rcb"] })
        .success,
    ).toBe(false);
    expect(methodKeys).toEqual(["das", "tea", "cf", "rcb", "atp"]);
  });
  it("accepts the actual Python default configuration without dropping fields", () => {
    expect(configSchema.parse(demo)).toEqual(demo);
    expect(configSchema.safeParse({ ...demo, unexpected: 1 }).success).toBe(
      false,
    );
  });
  it("converts UI units explicitly to SI", () => {
    expect(mm(-3)).toBe(-0.003);
    expect(mm(30)).toBe(0.03);
    expect(microseconds(8)).toBe(8e-6);
  });
  it("uses 10log10 for power and leaves input values unchanged", () => {
    const map = [1, 0.01, 0];
    expect(map.map((v) => relativeDB(v, 1))).toEqual([0, -20, -40]);
    expect(map).toEqual([1, 0.01, 0]);
    expect(relativeDB(0, 0)).toBe(-40);
  });
  it("rejects traversal in run identifiers and implausible source units", () => {
    expect(uuid.safeParse("../../etc/passwd").success).toBe(false);
    expect(
      sourceSchema.safeParse({ x_m: 3, z_m: 30, emission_s: 8, amplitude: 1 })
        .success,
    ).toBe(false);
    expect(
      sourceSchema.safeParse({
        x_m: -0.003,
        z_m: 0.03,
        emission_s: 8e-6,
        amplitude: 1,
      }).success,
    ).toBe(true);
  });
});
