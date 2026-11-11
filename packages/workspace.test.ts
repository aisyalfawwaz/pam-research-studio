import { describe, expect, it } from "vitest";
import { configSchema, analysisSchema } from "./contracts";
import type { Run } from "./contracts";
import demo from "./contracts/demo.json";
import optionsJSON from "./contracts/analysis.json";
import coupled from "./contracts/coupled-template.json";
import {
  defaultAnalysis,
  rawRunAnalysis,
  restoreRunDraft,
  sameAnalysis,
  workflowForConfig,
  withConditioning,
  withMethodBlocks,
  selectBackend,
} from "./workspace";
import { replayRFPrefix } from "./replay";

const cfg = configSchema.parse(demo),
  options = analysisSchema.parse(optionsJSON);
function saved(changes: Partial<Run> = {}): Run {
  return {
    id: "42e2aba0-16c2-4c4a-9970-d26c19dd26c4",
    created: "2026-11-11T00:00:00Z",
    status: "complete",
    parent: null,
    error: null,
    config: cfg,
    warnings: [],
    metrics: null,
    methods: {},
    provenance: { reconstruction_options: options },
    ...changes,
  };
}
describe("saved workspace context", () => {
  it("preserves configured drive/grid values across compatible backends and detaches unsupported CT", () => {
    const base = configSchema.parse({
      ...coupled.config,
      simulation: { ...coupled.config.simulation!, spacing_m: 0.0007 },
      bubble: { ...coupled.config.bubble!, drive_pa: 33e3 },
      ct: {
        asset_id: "a".repeat(64),
        rows: 160,
        columns: 160,
        spacing_x_m: 0.0004,
        spacing_z_m: 0.0004,
        crop: [0, 160, 0, 160],
        origin_x_m: -0.032,
        origin_z_m: 0,
        contrast: true,
        bone_threshold_hu: 300,
        bone_hu: 1000,
        bone_speed_m_s: 2800,
        bone_density_kg_m3: 1900,
      },
    });
    const wave = selectBackend(base, "jwave");
    expect(wave.simulation?.spacing_m).toBe(0.0007);
    expect(wave.ct).toEqual(base.ct);
    expect(wave.bubble).toBeUndefined();
    const radial = selectBackend(base, "jbubble");
    expect(radial.bubble?.drive_pa).toBe(33e3);
    expect(radial.ct).toBeUndefined();
    expect(radial.simulation).toBeUndefined();
    const analytic = selectBackend(base, "analytic");
    expect(analytic.ct).toBeUndefined();
    expect(analytic.coupling).toBeUndefined();
    expect(analytic.sources).toEqual(base.sources);
    expect(analytic.processing).toEqual(base.processing);
  });
  it("keeps method and DSP controls connected while preserving unrelated diagram edits", () => {
    const original = workflowForConfig(cfg);
    const moved = {
      ...original,
      nodes: original.nodes.map((n) =>
        n.id === "scene" ? { ...n, x: 123, y: 321 } : n,
      ),
    };
    const one = withMethodBlocks(moved, {
      ...defaultAnalysis(cfg),
      methods: ["cf"],
    });
    expect(
      one.nodes.filter((n) => n.kind === "reconstruct").map((n) => n.method),
    ).toEqual(["cf"]);
    expect(one.nodes.find((n) => n.id === "scene")).toMatchObject({
      x: 123,
      y: 321,
    });
    const filtered = withConditioning(one, true);
    const dsp = filtered.nodes.find((n) => n.kind === "dsp")!;
    expect(
      filtered.edges.some(
        (e) =>
          e.source === dsp.id && e.target === "method_cf" && e.port === "rf",
      ),
    ).toBe(true);
    const raw = withConditioning(filtered, false);
    expect(raw.nodes.some((n) => n.kind === "dsp")).toBe(false);
    expect(
      raw.edges.some(
        (e) =>
          e.source === "prop" && e.target === "method_cf" && e.port === "rf",
      ),
    ).toBe(true);
    const two = withMethodBlocks(raw, {
      ...defaultAnalysis(cfg),
      methods: ["cf", "tea"],
    });
    expect(
      two.nodes.filter((n) => n.kind === "reconstruct").map((n) => n.method),
    ).toEqual(["cf", "tea"]);
  });
  it("restores method controls from a run without a workflow", () => {
    const custom = {
      ...options,
      methods: ["cf", "atp"] as const,
      cf_exponent: 2.5,
      atp_timing_known: true,
      atp_emission_s: 9e-6,
      atp_window_s: 3e-6,
    };
    const restored = restoreRunDraft(
      saved({ provenance: { reconstruction_options: custom } }),
    );
    expect(restored.analysis).toEqual(custom);
    expect(
      restored.workflow.nodes
        .filter((n) => n.kind === "reconstruct")
        .map((n) => n.method),
    ).toEqual(custom.methods);
    expect(restored.config).toEqual(cfg);
    for (const workflow of [
      { version: "unsupported" },
      workflowForConfig(
        configSchema.parse(coupled.config),
        analysisSchema.parse(custom),
      ),
    ]) {
      const recovered = restoreRunDraft(
        saved({ provenance: { reconstruction_options: custom, workflow } }),
      );
      expect(recovered.analysis).toEqual(custom);
      expect(recovered.workflow.nodes.some((n) => n.kind === "analytic")).toBe(
        true,
      );
      expect(recovered.workflow_rebuilt).toBe(true);
    }
  });
  it("restores raw ATP timing once and prefers actual run options over a stale editor selection", () => {
    const c = configSchema.parse(coupled.config),
      delay = 13e-6;
    const raw = analysisSchema.parse({
      ...coupled.options,
      methods: ["das", "atp"],
    });
    const graph = workflowForConfig(c, analysisSchema.parse(coupled.options));
    const record = saved({
      config: c,
      provenance: {
        workflow: graph,
        reconstruction_options: {
          ...raw,
          atp_emission_s: raw.atp_emission_s + delay,
        },
        simulation: { coupling: { source_delay_s: delay } },
      },
    });
    expect(sameAnalysis(rawRunAnalysis(record), raw)).toBe(true);
    expect(restoreRunDraft(record).analysis.methods).toEqual(["das", "atp"]);
    const again = {
      ...record,
      provenance: {
        ...record.provenance,
        workflow: restoreRunDraft(record).workflow,
      },
    };
    expect(sameAnalysis(rawRunAnalysis(again), raw)).toBe(true);
    const unknownClock = {
      ...record,
      provenance: {
        simulation: record.provenance.simulation,
        reconstruction_options: { ...raw, atp_timing_known: false },
      },
    };
    expect(rawRunAnalysis(unknownClock).atp_emission_s).toBe(
      raw.atp_emission_s,
    );
    expect(
      sameAnalysis({ ...raw, atp_emission_s: raw.atp_emission_s + delay }, raw),
    ).toBe(false);
  });
  it("generates a coherent graph for the selected backend and a fresh preset", () => {
    const conditioned = configSchema.parse({
      ...coupled.config,
      processing: {
        remove_dc: true,
        detrend_linear: false,
        filter_kind: "bandpass",
        low_hz: 1e5,
        high_hz: 2e6,
        order: 4,
        notch_hz: null,
        notch_q: 30,
      },
    });
    expect(workflowForConfig(conditioned).nodes.map((n) => n.kind)).toEqual(
      expect.arrayContaining(["bubble", "coupler", "jwave", "dsp"]),
    );
    expect(workflowForConfig(cfg).nodes.map((n) => n.kind)).not.toEqual(
      expect.arrayContaining(["bubble", "jwave"]),
    );
    expect(workflowForConfig(cfg).analysis).toEqual(defaultAnalysis(cfg));
  });
  it("chooses runnable initial methods for large arrays and unsuitable ATP clocks", () => {
    const large = configSchema.parse({ ...demo, channels: 1024, grid_n: 129 });
    expect(defaultAnalysis(large).methods).not.toContain("rcb");
    expect(
      defaultAnalysis({ ...cfg, emission_kind: "harmonic" }).methods,
    ).not.toContain("atp");
    const staggered = {
      ...cfg,
      sources: [
        cfg.sources[0],
        { ...cfg.sources[0], x_m: 0.001, emission_s: 10e-6 },
      ],
    };
    expect(defaultAnalysis(staggered).methods).not.toContain("atp");
  });
});
describe("recorded RF acquisition clock", () => {
  it("exposes only completed peak bins, handles nonzero t0 and retains the final short bin", () => {
    const capture = {
      ...cfg,
      samples: 1025,
      sampling_hz: 1e6,
      capture_t0_s: -10e-6,
    };
    const data = {
      shape: [342, 2],
      buffer: new Float32Array(684).map((_, i) => i).buffer,
    };
    expect(replayRFPrefix(data, capture, -11e-6)).toBeNull();
    expect(replayRFPrefix(data, capture, -9e-6)).toBeNull();
    const first = replayRFPrefix(data, capture, -8e-6)!;
    expect(first.array.shape).toEqual([1, 2]);
    expect(Array.from(new Float32Array(first.array.buffer))).toEqual([0, 1]);
    expect(first.end_s).toBeCloseTo(-8e-6, 12);
    expect(
      replayRFPrefix(data, capture, capture.capture_t0_s + 1023 / 1e6)!.array
        .shape[0],
    ).toBe(341);
    expect(
      replayRFPrefix(data, capture, capture.capture_t0_s + 1024 / 1e6)!.array
        .shape[0],
    ).toBe(342);
    expect(data.buffer.byteLength).toBe(684 * 4);
  });
});
