import { useEffect, useRef, useState } from "react";
import {
  Check,
  Play,
  Undo2,
  Redo2,
  Trash2,
  Maximize2,
  Plus,
  Minus,
  Move,
  Settings2,
} from "lucide-react";
import {
  ports,
  blockKinds,
  makeWorkflow,
} from "../../../packages/contracts/workflow";
import type {
  Block,
  BlockKind,
  Pipeline,
  Workflow,
} from "../../../packages/contracts/workflow";
import {
  methodKeys,
  bubbleDefaults,
  jwaveDefaults,
  configSchema,
  analysisSchema,
} from "../../../packages/contracts";
import coupledTemplate from "../../../packages/contracts/coupled-template.json";
import type { Workbench } from "./useWorkbench";
import { request } from "./useWorkbench";
const W = 180,
  H = 110;
const portY = (node: Block, port: string) =>
  node.y + 43 + Object.keys(ports[node.kind].inputs).indexOf(port) * 21;
const title = (n: Block) =>
  n.label ||
  (n.kind === "reconstruct"
    ? `${n.method.toUpperCase()} reconstruction`
    : ports[n.kind].title);
export function WorkflowEditor({
  w,
  onInspect,
  onScene,
  onExpand,
}: {
  w: Workbench;
  onInspect: (kind: BlockKind) => void;
  onScene: () => void;
  onExpand: () => void;
}) {
  const graph = w.workflow,
    setGraph = w.setWorkflow;
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const [selected, setSelected] = useState<string | null>(null),
    [edgeSelection, setEdge] = useState<number | null>(null),
    [connect, setConnect] = useState<string | null>(null);
  const [view, setView] = useState({ x: 20, y: 20, scale: 0.65 }),
    [pointer, setPointer] = useState({ x: 0, y: 0 }),
    [validation, setValidation] = useState(
      "Connect a source model, propagation, arrays and reconstruction. Run executes this graph.",
    );
  const [template, setTemplate] = useState<Pipeline>("coupled");
  const svg = useRef<SVGSVGElement>(null),
    drag = useRef<{ id: string; x: number; y: number; graph: Workflow } | null>(
      null,
    ),
    pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const history = useRef<{ past: Workflow[]; future: Workflow[] }>({
    past: [],
    future: [],
  });
  const commit = (next: Workflow) => {
    history.current = {
      past: [...history.current.past.slice(-49), graph],
      future: [],
    };
    setGraph(next);
  };
  const undo = () => {
    const old = history.current.past.pop();
    if (old) {
      history.current.future.push(graph);
      setGraph(old);
    }
  };
  const redo = () => {
    const next = history.current.future.pop();
    if (next) {
      history.current.past.push(graph);
      setGraph(next);
    }
  };
  const point = (clientX: number, clientY: number) => {
    const rect = svg.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - view.x) / view.scale,
      y: (clientY - rect.top - view.y) / view.scale,
    };
  };
  const fit = () => {
    const graph = graphRef.current;
    if (!svg.current || !graph.nodes.length) return;
    const rect = svg.current.getBoundingClientRect(),
      xmin = Math.min(...graph.nodes.map((n) => n.x)) - 30,
      ymin = Math.min(...graph.nodes.map((n) => n.y)) - 30,
      xmax = Math.max(...graph.nodes.map((n) => n.x)) + W + 30,
      ymax = Math.max(...graph.nodes.map((n) => n.y)) + H + 30;
    const scale = Math.min(
      1.25,
      rect.width / (xmax - xmin),
      rect.height / (ymax - ymin),
    );
    setView({
      x: (rect.width - (xmax - xmin) * scale) / 2 - xmin * scale,
      y: (rect.height - (ymax - ymin) * scale) / 2 - ymin * scale,
      scale,
    });
  };
  useEffect(() => {
    const observer = new ResizeObserver(fit);
    if (svg.current) observer.observe(svg.current);
    return () => observer.disconnect();
  }, [w.project]);
  const add = (kind: BlockKind, x = 120, y = 120) => {
    if (w.locked || graph.nodes.length >= 48) return;
    const id = `block_${crypto.randomUUID().slice(0, 8)}`;
    commit({
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          id,
          kind,
          x: Math.round(x / 10) * 10,
          y: Math.round(y / 10) * 10,
          label: "",
          method: "das",
        },
      ],
    });
    setSelected(id);
    setEdge(null);
  };
  const remove = () => {
    if (w.locked) return;
    if (selected) {
      commit({
        ...graph,
        nodes: graph.nodes.filter((n) => n.id !== selected),
        edges: graph.edges.filter(
          (e) => e.source !== selected && e.target !== selected,
        ),
      });
      setSelected(null);
    } else if (edgeSelection !== null) {
      commit({
        ...graph,
        edges: graph.edges.filter((_, i) => i !== edgeSelection),
      });
      setEdge(null);
    }
  };
  const attach = (target: string, port: string) => {
    if (!connect || w.locked) return;
    const source = graph.nodes.find((n) => n.id === connect)!,
      node = graph.nodes.find((n) => n.id === target)!;
    if (ports[source.kind].output !== ports[node.kind].inputs[port]) {
      setValidation("These ports carry different data types.");
      setConnect(null);
      return;
    }
    const edges = graph.edges.filter(
      (e) =>
        node.kind === "map_scope" || e.target !== target || e.port !== port,
    );
    if (
      !edges.some(
        (e) => e.source === connect && e.target === target && e.port === port,
      )
    )
      edges.push({ source: connect, target, port });
    commit({ ...graph, edges });
    setConnect(null);
  };
  const preset = () => {
    if (!w.config || w.locked) return;
    if (template === "coupled") {
      w.updateConfig(configSchema.parse(coupledTemplate.config));
      w.setAnalysis(analysisSchema.parse(coupledTemplate.options));
      commit(makeWorkflow("coupled"));
      setSelected(null);
      setValidation(
        "Coupled template loaded: two receive arrays, causal volume-flow source and five PAM methods.",
      );
      setTimeout(fit, 80);
      return;
    }
    const { simulation: _s, bubble: _b, coupling: _c, ...base } = w.config;
    const coupled = false,
      bubble = template === "jbubble",
      wave = template === "jwave";
    w.updateConfig({
      ...base,
      simulation: wave ? { ...jwaveDefaults, spacing_m: 0.00025 } : undefined,
      bubble: bubble
        ? { ...bubbleDefaults, drive_pa: 20e3, ringdown_cycles: 4 }
        : undefined,
      coupling: coupled
        ? {
            mode: "volume_flow_2d",
            effective_length_m: 0.001,
            passband_hz: 0.7e6,
          }
        : undefined,
      channels: 32,
      arrays: [
        {
          name: "Array 1",
          elements: 16,
          pitch_m: 0.0003,
          x_m: -0.003,
          z_m: 0,
          angle_deg: 0,
        },
        {
          name: "Array 2",
          elements: 16,
          pitch_m: 0.0003,
          x_m: 0.009,
          z_m: 0.008,
          angle_deg: 90,
        },
      ],
      frequency_hz: 0.5e6,
      duration_s: 4e-6,
      sampling_hz: 10e6,
      samples: 512,
      gate_stride: bubble ? 1 : 2,
      gate_start_s: 4e-6,
      gate_end_s: 36e-6,
      spreading: template === "jbubble",
      emission_kind: "pulse",
      bandpass_hz: null,
      active_channels: null,
      sources: [{ x_m: 0, z_m: 0.012, emission_s: 8e-6, amplitude: 1 }],
      grid_x_min_m: -0.008,
      grid_x_max_m: 0.012,
      grid_z_min_m: 0.004,
      grid_z_max_m: 0.02,
      grid_n: 65,
    });
    w.setAnalysis({
      ...w.analysis,
      methods: [...methodKeys],
      atp_timing_known: true,
      atp_emission_s: 8e-6,
      atp_window_s: 4e-6,
    });
    commit(makeWorkflow(template));
    setSelected(null);
    setValidation(
      "Template loaded. Review its source, two-array layout and coupling settings before running.",
    );
    setTimeout(fit, 100);
  };
  const validate = async () => {
    try {
      const result = await request<{ pipeline: string; methods: string[] }>(
        "validateWorkflow",
        { workflow: graph, config: w.config, options: w.analysis },
      );
      setValidation(
        `${result.pipeline}. Methods: ${result.methods.join(", ")}. Graph is ready.`,
      );
    } catch (error) {
      setValidation(String(error).replace(/^Error.*?: /, ""));
    }
  };
  const node = graph.nodes.find((n) => n.id === selected);
  return (
    <div className="workflow-editor">
      <div className="model-toolbar">
        <button
          className="run-model"
          aria-label="Run model"
          disabled={!w.project || w.locked}
          onClick={() => void w.runWorkflow()}
        >
          <Play size={14} />
          Run model <kbd>F7</kbd>
        </button>
        <button onClick={() => void validate()} disabled={w.locked}>
          <Check size={14} />
          Validate
        </button>
        <span className="toolbar-rule" />
        <select
          aria-label="Workflow template"
          value={template}
          onChange={(e) => setTemplate(e.target.value as Pipeline)}
        >
          <option value="coupled">jBubble → j-Wave</option>
          <option value="analytic">Analytic reference</option>
          <option value="jwave">j-Wave source</option>
          <option value="jbubble">jBubble → monopole</option>
        </select>
        <button onClick={preset} disabled={w.locked}>
          Load template
        </button>
        <button
          aria-label="Undo workflow edit"
          onClick={undo}
          disabled={!history.current.past.length || w.locked}
        >
          <Undo2 size={15} />
        </button>
        <button
          aria-label="Redo workflow edit"
          onClick={redo}
          disabled={!history.current.future.length || w.locked}
        >
          <Redo2 size={15} />
        </button>
        <button
          aria-label="Delete selected block or connection"
          onClick={remove}
          disabled={w.locked || (!selected && edgeSelection === null)}
        >
          <Trash2 size={15} />
        </button>
        <div className="strip-space" />
        <button
          aria-label="Zoom out workflow"
          onClick={() =>
            setView((v) => ({ ...v, scale: Math.max(0.25, v.scale / 1.2) }))
          }
        >
          <Minus size={14} />
        </button>
        <span>{Math.round(view.scale * 100)}%</span>
        <button
          aria-label="Zoom in workflow"
          onClick={() =>
            setView((v) => ({ ...v, scale: Math.min(2, v.scale * 1.2) }))
          }
        >
          <Plus size={14} />
        </button>
        <button onClick={fit} title="Fit graph" aria-label="Fit workflow">
          <Maximize2 size={14} />
        </button>
        <button
          onClick={() => {
            onExpand();
            setTimeout(fit, 80);
          }}
        >
          Expand canvas
        </button>
      </div>
      <div className="block-library" aria-label="Simulation block library">
        {blockKinds.map((kind) => (
          <button
            key={kind}
            draggable={!w.locked}
            disabled={w.locked}
            onDragStart={(e) =>
              e.dataTransfer.setData("application/x-pam-block", kind)
            }
            onClick={() =>
              add(
                kind,
                (-view.x + 100) / view.scale,
                (-view.y + 80) / view.scale,
              )
            }
            title={`${ports[kind].description}. Drag to canvas or click to add.`}
          >
            {ports[kind].title}
          </button>
        ))}
      </div>
      <div className="workflow-canvas">
        <svg
          ref={svg}
          width="100%"
          height="100%"
          role="application"
          aria-label="Simulation workflow canvas"
          tabIndex={0}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const kind = e.dataTransfer.getData(
              "application/x-pam-block",
            ) as BlockKind;
            if (blockKinds.includes(kind)) {
              const p = point(e.clientX, e.clientY);
              add(kind, p.x, p.y);
            }
          }}
          onWheel={(e) => {
            if (e.ctrlKey) {
              e.preventDefault();
              setView((v) => ({
                ...v,
                scale: Math.max(
                  0.25,
                  Math.min(2, v.scale * Math.exp(-e.deltaY * 0.002)),
                ),
              }));
            } else
              setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
          }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget || e.button === 1) {
              setSelected(null);
              setEdge(null);
              setConnect(null);
              pan.current = {
                x: e.clientX,
                y: e.clientY,
                vx: view.x,
                vy: view.y,
              };
              e.currentTarget.setPointerCapture(e.pointerId);
            }
          }}
          onPointerMove={(e) => {
            const p = point(e.clientX, e.clientY);
            setPointer(p);
            if (drag.current) {
              const d = drag.current;
              setGraph({
                ...graph,
                nodes: graph.nodes.map((n) =>
                  n.id === d.id
                    ? {
                        ...n,
                        x: Math.max(
                          -4000,
                          Math.min(8000, Math.round((p.x - d.x) / 10) * 10),
                        ),
                        y: Math.max(
                          -4000,
                          Math.min(8000, Math.round((p.y - d.y) / 10) * 10),
                        ),
                      }
                    : n,
                ),
              });
            } else if (pan.current) {
              const p = pan.current;
              setView((v) => ({
                ...v,
                x: p.vx + e.clientX - p.x,
                y: p.vy + e.clientY - p.y,
              }));
            }
          }}
          onPointerUp={(e) => {
            drag.current = null;
            pan.current = null;
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setConnect(null);
              setSelected(null);
            }
            if (e.key === "Delete" || e.key === "Backspace") {
              e.preventDefault();
              remove();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === "z") {
              e.preventDefault();
              undo();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === "y") {
              e.preventDefault();
              redo();
            }
            if (node && e.key.startsWith("Arrow") && !w.locked) {
              e.preventDefault();
              const s = e.shiftKey ? 1 : 10;
              commit({
                ...graph,
                nodes: graph.nodes.map((n) =>
                  n.id === node.id
                    ? {
                        ...n,
                        x:
                          n.x +
                          (e.key === "ArrowRight"
                            ? s
                            : e.key === "ArrowLeft"
                              ? -s
                              : 0),
                        y:
                          n.y +
                          (e.key === "ArrowDown"
                            ? s
                            : e.key === "ArrowUp"
                              ? -s
                              : 0),
                      }
                    : n,
                ),
              });
            }
          }}
        >
          <defs>
            <pattern
              id="workflow-grid"
              width={20 * view.scale}
              height={20 * view.scale}
              patternUnits="userSpaceOnUse"
              x={view.x}
              y={view.y}
            >
              <circle cx="1" cy="1" r=".7" fill="var(--line)" />
            </pattern>
            <marker
              id="wire-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M0 0L10 5L0 10Z" fill="currentColor" />
            </marker>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="url(#workflow-grid)"
            pointerEvents="none"
          />
          <g transform={`translate(${view.x},${view.y}) scale(${view.scale})`}>
            {graph.edges.map((edge, i) => {
              const s = graph.nodes.find((n) => n.id === edge.source),
                t = graph.nodes.find((n) => n.id === edge.target);
              if (!s || !t) return null;
              const sy = s.y + 52,
                ty = portY(t, edge.port),
                sx = s.x + W,
                tx = t.x;
              const path =
                t.kind === "reconstruct"
                  ? `M${sx} ${sy}H${sx + 30}V${t.y - 35}H${tx - 25}V${ty}H${tx}`
                  : s.kind === "reconstruct"
                    ? `M${sx} ${sy}H${sx + 25}V${t.y - 35}H${tx - 25}V${ty}H${tx}`
                    : `M${sx} ${sy}H${sx + 30}V${ty}H${tx}`;
              return (
                <g
                  key={`${edge.source}-${edge.target}-${edge.port}`}
                  className={`wire wire-${ports[s.kind].output} ${edgeSelection === i ? "selected" : ""}`}
                >
                  <path d={path} markerEnd="url(#wire-arrow)" />
                  <path
                    className="wire-hit"
                    d={path}
                    tabIndex={0}
                    role="button"
                    aria-label={`Connection ${title(s)} to ${title(t)} ${edge.port}`}
                    onClick={() => {
                      setEdge(i);
                      setSelected(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Delete") {
                        commit({
                          ...graph,
                          edges: graph.edges.filter((_, j) => j !== i),
                        });
                      }
                    }}
                  />
                </g>
              );
            })}
            {connect &&
              (() => {
                const n = graph.nodes.find((n) => n.id === connect);
                return n ? (
                  <path
                    className="wire-preview"
                    d={`M${n.x + W} ${n.y + 52}L${pointer.x} ${pointer.y}`}
                  />
                ) : null;
              })()}
            {graph.nodes.map((n) => (
              <g
                key={n.id}
                transform={`translate(${n.x},${n.y})`}
                className={`model-block ${selected === n.id ? "selected" : ""}`}
                role="button"
                tabIndex={0}
                aria-label={`Block ${title(n)}`}
                onFocus={() => setSelected(n.id)}
                onPointerDown={(e) => {
                  if (w.locked || e.button !== 0) return;
                  e.stopPropagation();
                  setSelected(n.id);
                  setEdge(null);
                  const p = point(e.clientX, e.clientY);
                  history.current = {
                    past: [...history.current.past.slice(-49), graph],
                    future: [],
                  };
                  drag.current = {
                    id: n.id,
                    x: p.x - n.x,
                    y: p.y - n.y,
                    graph,
                  };
                  svg.current?.setPointerCapture(e.pointerId);
                }}
                onDoubleClick={() => onInspect(n.kind)}
              >
                <rect width={W} height={H} rx="2" />
                <rect
                  className={`block-stripe type-${ports[n.kind].output || "scope"}`}
                  width="4"
                  height={H}
                />
                <text x="12" y="22" className="block-title">
                  {title(n).slice(0, 24)}
                </text>
                <text x="12" y="99" className="block-type">
                  {n.kind.replaceAll("_", " ")}
                </text>
                {Object.entries(ports[n.kind].inputs).map(([port, type], i) => (
                  <g
                    key={port}
                    role="button"
                    tabIndex={0}
                    aria-label={`Connect ${port} input of ${title(n)}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerUp={(e) => {
                      e.stopPropagation();
                      attach(n.id, port);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      attach(n.id, port);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.stopPropagation();
                        attach(n.id, port);
                      }
                    }}
                  >
                    <circle
                      className={`port port-${type}`}
                      cx="0"
                      cy={43 + i * 21}
                      r="6"
                    />
                    <text x="12" y={47 + i * 21}>
                      {port}
                    </text>
                  </g>
                ))}
                {ports[n.kind].output ? (
                  <g
                    role="button"
                    tabIndex={0}
                    aria-label={`Connect output of ${title(n)}`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setConnect(n.id);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setConnect(n.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.stopPropagation();
                        setConnect(n.id);
                      }
                    }}
                  >
                    <text x={W - 12} y="56" textAnchor="end">
                      {ports[n.kind].output}
                    </text>
                    <circle
                      className={`port port-${ports[n.kind].output}`}
                      cx={W}
                      cy="52"
                      r="6"
                    />
                  </g>
                ) : null}
              </g>
            ))}
          </g>
        </svg>
      </div>
      <div className="block-properties">
        {node ? (
          <>
            <strong>{title(node)}</strong>
            <span>{ports[node.kind].description}</span>
            {node.kind === "reconstruct" ? (
              <select
                aria-label="Block reconstruction method"
                value={node.method}
                onChange={(e) =>
                  commit({
                    ...graph,
                    nodes: graph.nodes.map((n) =>
                      n.id === node.id
                        ? { ...n, method: e.target.value as Block["method"] }
                        : n,
                    ),
                  })
                }
              >
                {methodKeys.map((m) => (
                  <option key={m} value={m}>
                    {m.toUpperCase()}
                  </option>
                ))}
              </select>
            ) : null}
            <input
              aria-label="Block label"
              value={node.label}
              placeholder="Block label"
              maxLength={60}
              onChange={(e) =>
                commit({
                  ...graph,
                  nodes: graph.nodes.map((n) =>
                    n.id === node.id ? { ...n, label: e.target.value } : n,
                  ),
                })
              }
            />
            <button onClick={() => onInspect(node.kind)}>
              <Settings2 size={13} />
              Parameters
            </button>
            {node.kind === "scene" || node.kind === "probe" ? (
              <button onClick={onScene}>Edit physical layout</button>
            ) : null}
          </>
        ) : (
          <>
            <Move size={13} />
            <span>
              Drag blocks from the library. Connect output to a matching input.
              Middle drag pans; Ctrl+wheel zooms; Delete removes selection.
            </span>
            <button onClick={onScene}>Scene layout</button>
          </>
        )}
      </div>
      <div className="workflow-validation" role="status">
        {validation}
      </div>
    </div>
  );
}
