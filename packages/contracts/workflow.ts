import { z } from "zod";
import { configSchema, analysisSchema, methodKeys } from "./index";

export const blockKinds = [
  "drive",
  "analytic_source",
  "bubble",
  "coupler",
  "scene",
  "ct",
  "probe",
  "analytic",
  "jwave",
  "monopole",
  "reconstruct",
  "dsp",
  "rf_scope",
  "bubble_scope",
  "map_scope",
] as const;
export type BlockKind = (typeof blockKinds)[number];
export const ports: Record<
  BlockKind,
  {
    inputs: Record<string, string>;
    output?: string;
    title: string;
    description: string;
  }
> = {
  ct: {
    inputs: { scene: "scene" },
    output: "scene",
    title: "CT medium",
    description: "DICOM HU → heterogeneous fluid sound speed and density",
  },
  dsp: {
    inputs: { rf: "rf" },
    output: "rf",
    title: "RF conditioning",
    description: "SciPy DC/trend removal, zero-phase SOS filter and notch",
  },
  drive: {
    inputs: {},
    output: "drive",
    title: "Acoustic drive",
    description: "Frequency, envelope duration and emission clock",
  },
  analytic_source: {
    inputs: { drive: "drive" },
    output: "source",
    title: "Reference source",
    description: "Finite pulse / tone / broadband waveform",
  },
  bubble: {
    inputs: { drive: "drive" },
    output: "bubble",
    title: "jBubble dynamics",
    description: "Keller–Miksis radius and volume velocity",
  },
  coupler: {
    inputs: { curve: "bubble" },
    output: "source",
    title: "Volume-flow coupling",
    description: "Q=4πR²Ṙ → equivalent 2D source",
  },
  scene: {
    inputs: {},
    output: "scene",
    title: "Acoustic scene",
    description: "Medium and physical source positions",
  },
  probe: {
    inputs: {},
    output: "probe",
    title: "Receive arrays",
    description: "Elements, pitch, positions and orientations",
  },
  analytic: {
    inputs: { source: "source", scene: "scene", probe: "probe" },
    output: "rf",
    title: "Analytic propagation",
    description: "Homogeneous geometric receive delays",
  },
  jwave: {
    inputs: { source: "source", scene: "scene", probe: "probe" },
    output: "rf",
    title: "j-Wave propagation",
    description: "2D pressure evolution and sensor acquisition",
  },
  monopole: {
    inputs: { curve: "bubble", scene: "scene", probe: "probe" },
    output: "rf",
    title: "3D monopole bridge",
    description: "Retarded spherical radiation from jBubble",
  },
  reconstruct: {
    inputs: { rf: "rf" },
    output: "map",
    title: "PAM reconstruction",
    description: "A real method on the shared RF",
  },
  rf_scope: {
    inputs: { in: "rf" },
    title: "RF scope",
    description: "Channel signals and acquisition spectrum",
  },
  bubble_scope: {
    inputs: { in: "bubble" },
    title: "Bubble scope",
    description: "Radius, drive, emission and wall velocity",
  },
  map_scope: {
    inputs: { in: "map" },
    title: "PAM measurements",
    description: "Maps, profiles, localization and width",
  },
};
export const workflowSchema = z
  .object({
    analysis: analysisSchema.nullable().optional(),
    schema_version: z.literal("1.0"),
    nodes: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/),
            kind: z.enum(blockKinds),
            x: z.number().min(-4000).max(8000),
            y: z.number().min(-4000).max(8000),
            label: z.string().max(60).default(""),
            method: z.enum(methodKeys).default("das"),
          })
          .strict(),
      )
      .max(48),
    edges: z
      .array(
        z
          .object({
            source: z.string().max(40),
            target: z.string().max(40),
            port: z.string().max(20),
          })
          .strict(),
      )
      .max(96),
  })
  .strict();
export type Workflow = z.infer<typeof workflowSchema>;
export type Block = Workflow["nodes"][number];
export const workflowRequestSchema = z
  .object({
    workflow: workflowSchema,
    config: configSchema,
    options: analysisSchema,
  })
  .strict();
export type Pipeline = "analytic" | "jwave" | "jbubble" | "coupled";
export function makeWorkflow(
  pipeline: Pipeline = "analytic",
  methods: readonly (typeof methodKeys)[number][] = methodKeys,
  conditioning = false,
  withCT = false,
): Workflow {
  const nodes: Block[] = [];
  const edges: Workflow["edges"] = [];
  const add = (
    id: string,
    kind: BlockKind,
    x: number,
    y: number,
    method: Block["method"] = "das",
  ) => nodes.push({ id, kind, x, y, label: "", method });
  const wire = (source: string, target: string, port: string) =>
    edges.push({ source, target, port });
  add("drive", "drive", 40, 40);
  add("scene", "scene", 40, 230);
  add("probe", "probe", 260, 230);
  const bubble = pipeline === "jbubble" || pipeline === "coupled";
  add("source", bubble ? "bubble" : "analytic_source", 260, 40);
  wire("drive", "source", "drive");
  if (bubble) {
    add("bubble_scope", "bubble_scope", 480, 230);
    wire("source", "bubble_scope", "in");
  }
  if (pipeline === "coupled") {
    add("coupler", "coupler", 480, 40);
    wire("source", "coupler", "curve");
  }
  add(
    "prop",
    pipeline === "jbubble"
      ? "monopole"
      : pipeline === "analytic"
        ? "analytic"
        : "jwave",
    700,
    40,
  );
  wire(
    pipeline === "coupled" ? "coupler" : "source",
    "prop",
    pipeline === "jbubble" ? "curve" : "source",
  );
  if (withCT) {
    add("ct", "ct", 260, 230);
    wire("scene", "ct", "scene");
    const probe = nodes.find((n) => n.id === "probe")!;
    probe.x = 480;
    const scope = nodes.find((n) => n.id === "bubble_scope");
    if (scope) scope.x = 700;
  }
  wire(withCT ? "ct" : "scene", "prop", "scene");
  wire("probe", "prop", "probe");
  add("rf_scope", "rf_scope", 700, 230);
  if (withCT) nodes.find((n) => n.id === "rf_scope")!.x = 920;
  if (conditioning) {
    add("dsp", "dsp", 920, 40);
    wire("prop", "dsp", "rf");
  }
  wire("prop", "rf_scope", "in");
  methods.forEach((method, i) => {
    add(`method_${method}`, "reconstruct", 40 + i * 220, 430, method);
    wire(conditioning ? "dsp" : "prop", `method_${method}`, "rf");
    wire(`method_${method}`, "maps", "in");
  });
  add("maps", "map_scope", 480, 620);
  return { schema_version: "1.0", nodes, edges };
}
