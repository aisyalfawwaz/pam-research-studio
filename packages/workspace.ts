import {
  analysisSchema,
  configSchema,
  methodKeys,
  stableJSON,
  jwaveDefaults,
  bubbleDefaults,
} from "./contracts";
import type { Analysis, Config, Run } from "./contracts";
import defaults from "./contracts/analysis.json";
import { makeWorkflow, workflowSchema } from "./contracts/workflow";
import type { Workflow, Pipeline } from "./contracts/workflow";

export function selectBackend(cfg: Config, backend: Pipeline): Config {
  const { simulation, bubble, coupling, ct, ...base } = cfg;
  const fluid = backend === "jwave" || backend === "coupled";
  const radial = backend === "jbubble" || backend === "coupled";
  const next: Config = {
    ...base,
    sources: base.sources.map((s) => {
      const { bubble, ...rest } = s;
      return radial ? s : rest;
    }),
    ...(fluid
      ? {
          simulation: simulation || { ...jwaveDefaults },
          ...(ct ? { ct } : {}),
        }
      : {}),
    ...(radial
      ? {
          bubble: bubble || {
            ...bubbleDefaults,
            ...(backend === "coupled" ? { drive_pa: 20e3 } : {}),
          },
        }
      : {}),
  };
  if (fluid) next.spreading = false;
  if (backend === "jbubble") next.spreading = true;
  if (radial) {
    next.gate_stride = 1;
    next.emission_kind = "pulse";
    next.bandpass_hz = null;
    next.gate_end_s = Math.max(
      base.gate_end_s,
      ...base.sources.map(
        (s) =>
          s.emission_s +
          base.duration_s / 2 +
          next.bubble!.ringdown_cycles / base.frequency_hz,
      ),
    );
  }
  if (backend === "coupled")
    next.coupling = coupling || {
      mode: "volume_flow_2d",
      effective_length_m: 0.001,
      passband_hz: 1e6,
    };
  return next;
}

const uniqueId = (graph: Workflow, base: string) => {
  let id = base,
    i = 2;
  while (graph.nodes.some((n) => n.id === id)) id = `${base}_${i++}`;
  return id;
};
export function withMethodBlocks(graph: Workflow, options: Analysis): Workflow {
  const removed = new Set(
    graph.nodes
      .filter(
        (n) => n.kind === "reconstruct" && !options.methods.includes(n.method),
      )
      .map((n) => n.id),
  );
  const nodes = graph.nodes.filter((n) => !removed.has(n.id)),
    edges = graph.edges.filter(
      (e) => !removed.has(e.source) && !removed.has(e.target),
    );
  const source =
    graph.edges.find(
      (e) =>
        e.port === "rf" &&
        graph.nodes.some((n) => n.id === e.target && n.kind === "reconstruct"),
    )?.source ||
    graph.nodes.find((n) => n.kind === "dsp")?.id ||
    graph.nodes.find((n) => ["analytic", "jwave", "monopole"].includes(n.kind))
      ?.id;
  const scope = nodes.find((n) => n.kind === "map_scope")?.id;
  const next = {
    ...graph,
    nodes: [...nodes],
    edges: [...edges],
    analysis: options,
  };
  for (const method of options.methods)
    if (!nodes.some((n) => n.kind === "reconstruct" && n.method === method)) {
      const id = uniqueId(next, `method_${method}`);
      next.nodes.push({
        id,
        kind: "reconstruct",
        method,
        label: "",
        x: 40 + methodKeys.indexOf(method) * 220,
        y: 430,
      });
      if (source) next.edges.push({ source, target: id, port: "rf" });
      if (scope) next.edges.push({ source: id, target: scope, port: "in" });
    }
  return next;
}
export function withConditioning(graph: Workflow, enabled: boolean): Workflow {
  const next = {
    ...graph,
    nodes: [...graph.nodes],
    edges: graph.edges.map((e) => ({ ...e })),
  };
  const filters = next.nodes.filter((n) => n.kind === "dsp");
  if (!enabled) {
    for (const filter of filters) {
      const source = next.edges.find(
        (e) => e.target === filter.id && e.port === "rf",
      )?.source;
      next.edges = next.edges
        .filter(
          (e) => e.target !== filter.id && (e.source !== filter.id || !!source),
        )
        .map((e) => (e.source === filter.id ? { ...e, source: source! } : e));
    }
    next.nodes = next.nodes.filter((n) => n.kind !== "dsp");
    return next;
  }
  let filter = filters[0];
  if (!filter) {
    const source = next.nodes.find((n) =>
      ["analytic", "jwave", "monopole"].includes(n.kind),
    )?.id;
    if (!source) return next;
    filter = {
      id: uniqueId(next, "dsp"),
      kind: "dsp",
      method: "das",
      label: "",
      x: 920,
      y: 40,
    };
    next.nodes.push(filter);
    next.edges.push({ source, target: filter.id, port: "rf" });
  }
  next.edges = next.edges.map((e) =>
    e.port === "rf" &&
    next.nodes.some((n) => n.id === e.target && n.kind === "reconstruct")
      ? { ...e, source: filter.id }
      : e,
  );
  return next;
}

export function defaultAnalysis(cfg: Config): Analysis {
  const active = cfg.active_channels?.length ?? cfg.channels;
  const mask = cfg.active_channels;
  const regular =
    (!cfg.arrays || cfg.arrays.length <= 1) &&
    (!mask ||
      mask.every((v, i) => i < 2 || v - mask[i - 1] === mask[1] - mask[0]));
  const gateSamples =
    Math.floor(
      ((cfg.gate_end_s - cfg.gate_start_s) * cfg.sampling_hz) / cfg.gate_stride,
    ) + 1;
  const rcbFits =
    (regular || active <= 64) &&
    (active <= 128 ||
      cfg.grid_n ** 2 *
        active *
        gateSamples *
        Math.min(defaults.rcb_subarray, active) ** 2 <=
        5_000_000_000);
  const atp =
    cfg.emission_kind === "pulse" &&
    cfg.duration_s * cfg.frequency_hz <= 5.000001 &&
    (Math.min(cfg.duration_s, 5 / cfg.frequency_hz) * cfg.sampling_hz) /
      cfg.gate_stride >=
      2 &&
    cfg.sources.every(
      (s) => Math.abs(s.emission_s - cfg.sources[0].emission_s) < 1e-12,
    );
  return analysisSchema.parse({
    ...defaults,
    methods: methodKeys.filter(
      (m) => (m !== "rcb" || rcbFits) && (m !== "atp" || atp),
    ),
    atp_timing_known: true,
    atp_emission_s: cfg.sources[0].emission_s,
    atp_window_s: Math.min(cfg.duration_s, 5 / cfg.frequency_hz),
  });
}
export function workflowForConfig(cfg: Config, options = defaultAnalysis(cfg)) {
  return {
    ...makeWorkflow(
      cfg.coupling
        ? "coupled"
        : cfg.simulation
          ? "jwave"
          : cfg.bubble
            ? "jbubble"
            : "analytic",
      options.methods,
      !!cfg.processing,
      !!cfg.ct,
    ),
    analysis: options,
  };
}
export function rawRunAnalysis(run: Run): Analysis {
  const graph = workflowSchema.safeParse(run.provenance.workflow).data;
  if (!run.provenance.reconstruction_options)
    return graph?.analysis || defaultAnalysis(run.config);
  const options = analysisSchema.parse(run.provenance.reconstruction_options);
  const simulation = run.provenance.simulation as
    | { coupling?: { source_delay_s?: number } }
    | undefined;
  const delay =
    run.config.coupling && options.atp_timing_known
      ? simulation?.coupling?.source_delay_s || 0
      : 0;
  if (
    graph?.analysis &&
    sameAnalysis(
      {
        ...graph.analysis,
        atp_emission_s: graph.analysis.atp_emission_s + delay,
      },
      options,
    )
  )
    return graph.analysis;
  return analysisSchema.parse({
    ...options,
    atp_emission_s: options.atp_emission_s - delay,
  });
}
export function restoreRunDraft(run: Run) {
  const config = configSchema.parse(run.config),
    analysis = rawRunAnalysis(run);
  const stored = workflowSchema.safeParse(run.provenance.workflow).data;
  const expected = workflowForConfig(config, analysis);
  const pipelineKinds = (graph: Workflow) =>
    graph.nodes
      .filter((n) =>
        [
          "bubble",
          "coupler",
          "jwave",
          "monopole",
          "analytic",
          "dsp",
          "ct",
        ].includes(n.kind),
      )
      .map((n) => n.kind)
      .sort()
      .join(",");
  const methods =
    stored?.nodes
      .filter((n) => n.kind === "reconstruct")
      .map((n) => n.method) || [];
  const compatible =
    !!stored &&
    pipelineKinds(stored) === pipelineKinds(expected) &&
    methods.length === analysis.methods.length &&
    methods.every((m) => analysis.methods.includes(m));
  const workflow = stored && compatible ? { ...stored, analysis } : expected;
  return {
    config,
    analysis,
    workflow,
    workflow_rebuilt: !!run.provenance.workflow && !compatible,
  };
}
export function sameAnalysis(a: Analysis, b: Analysis) {
  const normalized = (value: Analysis) =>
    JSON.parse(
      JSON.stringify(
        { ...value, methods: [...value.methods].sort() },
        (_key, v) => (typeof v === "number" ? Number(v.toPrecision(12)) : v),
      ),
    );
  return stableJSON(normalized(a)) === stableJSON(normalized(b));
}
