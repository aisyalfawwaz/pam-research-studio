import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ChevronRight,
  FilePlus2,
  Folder,
  FolderOpen,
  Grid2X2,
  Layers,
  Maximize2,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Play,
  Radio,
  RotateCcw,
  RotateCw,
  Save,
  SlidersHorizontal,
  Square,
  Table2,
  Waves,
  X,
} from "lucide-react";
import { methodKeys, methodLabels } from "../../../packages/contracts";
import type { Method } from "../../../packages/contracts";
import { Inspector } from "./InstrumentControls";
import { MenuBar, Modal, Splitter } from "./DesktopControls";
import { LinePlot, RasterPlot, ScenePlot } from "./plots";
import type { Cursor, Palette } from "./plots";
import {
  arrivalWindow,
  BubbleView,
  EmptyView,
  mapDomain,
  Measurements,
  Messages,
  pairs,
  Profiles,
  ProjectTree,
  RunInfo,
  runLabel,
  RunTable,
  SourceTable,
  unitLabel,
} from "./WorkspaceViews";
import { useWorkbench } from "./useWorkbench";
import { WorkflowEditor } from "./WorkflowEditor";
import { LiveView } from "./LiveView";
import { AboutStudio } from "./AboutStudio";
import { CTWorkspace } from "./CTWorkspace";
import { BenchmarkView } from "./BenchmarkView";
import { StudiesView } from "./StudiesView";
import { PresentationExports } from "./PresentationExports";
import { PeakControls, PeakResults } from "./PeakEvaluation";

const INITIAL_LAYOUT = {
  left: 214,
  right: 310,
  bottom: 196,
  project: true,
  properties: true,
  output: true,
};
type Layout = typeof INITIAL_LAYOUT;
function readLayout(): Layout {
  try {
    const v = JSON.parse(localStorage.getItem("pam.layout.v2") || "{}");
    return {
      ...INITIAL_LAYOUT,
      left: Math.max(170, Math.min(340, Number(v.left) || 214)),
      right: Math.max(260, Math.min(440, Number(v.right) || 310)),
      bottom: Math.max(100, Math.min(350, Number(v.bottom) || 196)),
      project: v.project !== false,
      properties: v.properties !== false,
      output: v.output !== false,
    };
  } catch {
    return INITIAL_LAYOUT;
  }
}

export default function App() {
  const [about, setAbout] = useState(false);
  const w = useWorkbench();
  const [layout, setLayout] = useState(readLayout),
    [theme, setTheme] = useState(
      () => localStorage.getItem("pam.theme.v2") || "light",
    );
  const [output, setOutput] = useState<"messages" | "measurements" | "info">(
    "messages",
  );
  const outputRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = 0;
  }, [output]);
  const [category, setCategory] = useState<"model" | "analysis">("model"),
    [source, setSource] = useState(0);
  const [sourceFocus, setSourceFocus] = useState(0);
  const [selectedArray, setSelectedArray] = useState(0);
  const [parameterFocus, setParameterFocus] = useState({ kind: "", token: 0 });
  const normalPanels = useRef<Pick<
    typeof INITIAL_LAYOUT,
    "project" | "properties" | "output"
  > | null>(null);
  useEffect(() => {
    const immersive =
      w.editor === "live" ||
      w.editor === "ct" ||
      w.editor === "benchmark" ||
      w.editor === "bubble" ||
      w.editor === "studies";
    if (immersive && !normalPanels.current) {
      normalPanels.current = {
        project: layout.project,
        properties: layout.properties,
        output: layout.output,
      };
      setLayout((v) => ({
        ...v,
        project: false,
        properties: false,
        output: false,
      }));
    } else if (!immersive && normalPanels.current) {
      const saved = normalPanels.current;
      normalPanels.current = null;
      setLayout((v) => ({
        ...v,
        project: v.project || saved.project,
        properties: v.properties || saved.properties,
        output: v.output || saved.output,
      }));
    }
  }, [w.editor]);
  const [newProject, setNewProject] = useState(false),
    [projectName, setProjectName] = useState("Point source");
  const [exportOpen, setExportOpen] = useState(false),
    [rawExport, setRawExport] = useState(false),
    [help, setHelp] = useState(false);
  const [presentationBusy, setPresentationBusy] = useState(false);
  const [display, setDisplay] = useState<"db" | "linear">("db"),
    [floor, setFloor] = useState(-40),
    [palette, setPalette] = useState<Palette>("viridis");
  const [truth, setTruth] = useState(true),
    [crosshair, setCrosshair] = useState(true),
    [profiles, setProfiles] = useState(true),
    [tiled, setTiled] = useState(false);
  const [reset, setReset] = useState(0),
    [selection, setSelection] = useState<[number, number] | null>(null),
    [cursor, setCursor] = useState<Cursor | null>(null);
  const [timeView, setTimeView] = useState<"signal" | "record">("signal");
  const [spectrumView, setSpectrumView] = useState("signal");
  const cfg = w.config,
    viewCfg = w.run?.config || cfg;
  const canSimulate =
    !!w.project &&
    !!cfg &&
    !w.locked &&
    (!cfg.simulation || !!w.backends.find((b) => b.id === "jwave")?.ready) &&
    (!cfg.bubble || !!w.backends.find((b) => b.id === "jbubble")?.ready);
  const canReconstruct =
    !!w.rf &&
    !!w.run &&
    !w.captureChanged &&
    !w.locked &&
    w.analysis.methods.length > 0 &&
    (!w.analysis.methods.includes("atp") || w.analysis.atp_timing_known);
  const canExport = w.run?.status === "complete" && !w.locked;
  const canPresent =
    !!w.run && ["simulated", "complete"].includes(w.run.status) && !w.locked;
  const available = methodKeys.filter((k) => w.run?.metrics?.methods[k]);
  const tracePoints = useMemo(() => pairs(w.trace, 1e6), [w.trace]),
    spectrumPoints = useMemo(() => pairs(w.spectrum, 1e-6), [w.spectrum]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("pam.theme.v2", theme);
  }, [theme]);
  useEffect(
    () =>
      localStorage.setItem(
        "pam.layout.v2",
        JSON.stringify({ ...layout, ...(normalPanels.current || {}) }),
      ),
    [layout],
  );
  useEffect(() => {
    setSelection(null);
    setCursor(null);
    if (w.run?.status === "complete") setOutput("measurements");
  }, [w.run?.id, w.method]);
  useEffect(() => {
    if (w.error) {
      setOutput("messages");
      setLayout((v) => ({ ...v, output: true }));
    }
  }, [w.error]);
  const toggle = (key: "project" | "properties" | "output") =>
    setLayout((v) => ({ ...v, [key]: !v[key] }));
  const fit = () => setReset((v) => v + 1);
  const properties = (tab: "model" | "analysis") => {
    setCategory(tab);
    setLayout((v) => ({ ...v, properties: true }));
  };
  const showMethod = (method: Method) => {
    w.setMethod(method);
    w.setEditor("map");
  };
  const reconstruct = () => {
    if (canReconstruct) {
      setCategory("analysis");
      setOutput("measurements");
      setLayout((v) => ({ ...v, output: true }));
      void w.reconstruct();
    }
  };
  const preset = () => {
    void w.preset();
    setSource(0);
    setCategory("model");
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      const ctrl = e.ctrlKey || e.metaKey,
        editing =
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement;
      if (e.key === "F1") {
        e.preventDefault();
        setHelp(true);
      } else if (e.key === "F7") {
        e.preventDefault();
        if (w.project && !w.locked) void w.runWorkflow();
      } else if (e.key === "F5") {
        e.preventDefault();
        if (canSimulate) void w.simulate();
      } else if (e.key === "F6") {
        e.preventDefault();
        reconstruct();
      } else if (e.key === "Escape" && w.busy) {
        e.preventDefault();
        void w.cancel();
      } else if (ctrl && e.key.toLowerCase() === "n") {
        e.preventDefault();
        if (!w.locked) setNewProject(true);
      } else if (ctrl && e.key.toLowerCase() === "o") {
        e.preventDefault();
        if (!w.locked) void w.openProject(false);
      } else if (ctrl && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (w.project && !w.locked) void w.save();
      } else if (ctrl && e.key.toLowerCase() === "e") {
        e.preventDefault();
        if (canPresent) setExportOpen(true);
      } else if (ctrl && !editing && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (!w.locked) e.shiftKey ? w.redo() : w.undo();
      } else if (ctrl && !editing && e.key.toLowerCase() === "y") {
        e.preventDefault();
        if (!w.locked) w.redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  const menus = [
    {
      label: "File",
      items: [
        {
          label: "New project…",
          shortcut: "Ctrl+N",
          disabled: w.locked,
          action: () => setNewProject(true),
        },
        {
          label: "Open project…",
          shortcut: "Ctrl+O",
          disabled: w.locked,
          action: () => void w.openProject(false),
        },
        {
          label: "Save project",
          shortcut: "Ctrl+S",
          disabled: !w.project || w.locked,
          action: () => void w.save(),
        },
        {
          label: "Import experiment…",
          separator: true,
          disabled: !w.project || w.locked,
          action: () => void w.importBundle(),
        },
        {
          label: "Export experiment…",
          shortcut: "Ctrl+E",
          disabled: !canExport,
          action: () => setExportOpen(true),
        },
        {
          label: "Export channel CSV…",
          disabled: !w.rf || w.locked,
          action: () => void w.exportRF("csv"),
        },
        {
          label: "Export RF HDF5…",
          disabled: !w.rf || w.locked,
          action: () => void w.exportRF("h5"),
        },
        {
          label: "Close application",
          separator: true,
          disabled: w.busy,
          action: () => window.close(),
        },
      ],
    },
    {
      label: "Edit",
      items: [
        {
          label: "Undo model edit",
          shortcut: "Ctrl+Z",
          disabled: !w.canUndo || w.locked,
          action: w.undo,
        },
        {
          label: "Redo model edit",
          shortcut: "Ctrl+Y",
          disabled: !w.canRedo || w.locked,
          action: w.redo,
        },
        {
          label: "Load selected run configuration",
          separator: true,
          disabled: !w.run || w.locked,
          action: w.loadRunConfig,
        },
      ],
    },
    {
      label: "View",
      items: [
        {
          label: "Project panel",
          checked: layout.project,
          action: () => toggle("project"),
        },
        {
          label: "Properties panel",
          checked: layout.properties,
          action: () => toggle("properties"),
        },
        {
          label: "Output panel",
          checked: layout.output,
          action: () => toggle("output"),
        },
        {
          label: "Tile reconstruction plots",
          separator: true,
          checked: tiled,
          action: () => {
            setTiled(!tiled);
            w.setEditor("map");
          },
        },
        {
          label: "Axial / lateral profiles",
          checked: profiles,
          action: () => setProfiles(!profiles),
        },
        {
          label: "Ground-truth markers",
          checked: truth,
          action: () => setTruth(!truth),
        },
        {
          label: "Crosshair",
          checked: crosshair,
          action: () => setCrosshair(!crosshair),
        },
        { label: "Fit plots", separator: true, action: fit },
        {
          label: "Dark theme",
          checked: theme === "dark",
          action: () => setTheme(theme === "dark" ? "light" : "dark"),
        },
        {
          label: "Reset layout",
          separator: true,
          action: () => setLayout(INITIAL_LAYOUT),
        },
      ],
    },
    {
      label: "Simulation",
      items: [
        { label: "Load 64-channel preset", disabled: w.locked, action: preset },
        {
          label: "Simulate RF",
          shortcut: "F5",
          disabled: !canSimulate,
          action: () => void w.simulate(),
        },
        {
          label: "Stop calculation",
          shortcut: "Esc",
          disabled: !w.busy,
          action: () => void w.cancel(),
        },
      ],
    },
    {
      label: "Analysis",
      items: [
        {
          label: "Reconstruct selected methods",
          shortcut: "F6",
          disabled: !canReconstruct,
          action: reconstruct,
        },
        { label: "Method parameters", action: () => properties("analysis") },
        {
          label: "Benchmark saved PAM results",
          action: () => w.setEditor("benchmark"),
        },
        {
          label: "Measurements",
          action: () => {
            setOutput("measurements");
            setLayout((v) => ({ ...v, output: true }));
          },
        },
        {
          label: "Method reference…",
          separator: true,
          action: () => setHelp(true),
        },
      ],
    },
    {
      label: "Help",
      items: [
        { label: "About & credits…", action: () => setAbout(true) },
        {
          label: "Methods and units…",
          shortcut: "F1",
          action: () => setHelp(true),
        },
      ],
    },
  ];
  return (
    <div className="instrument-shell">
      <div className="application-bar">
        <MenuBar menus={menus} />
        <span className="application-name">
          <img src="./brand/app-icon.svg" alt="" />
          PAM Research Studio
        </span>
      </div>
      <div
        className="main-toolbar"
        role="toolbar"
        aria-label="Project and calculation commands"
      >
        <div className="tool-group">
          <button
            title="New project (Ctrl+N)"
            disabled={w.locked}
            onClick={() => setNewProject(true)}
          >
            <FilePlus2 size={16} />
            New
          </button>
          <button
            title="Open project (Ctrl+O)"
            disabled={w.locked}
            onClick={() => void w.openProject(false)}
          >
            <FolderOpen size={16} />
            Open
          </button>
          <button
            title="Save project (Ctrl+S)"
            disabled={!w.project || w.locked}
            onClick={() => void w.save()}
          >
            <Save size={16} />
            Save
          </button>
        </div>
        <div className="tool-group">
          <button
            title="Undo model edit (Ctrl+Z)"
            aria-label="Undo model edit"
            disabled={!w.canUndo || w.locked}
            onClick={w.undo}
          >
            <RotateCcw size={15} />
          </button>
          <button
            title="Redo model edit (Ctrl+Y)"
            aria-label="Redo model edit"
            disabled={!w.canRedo || w.locked}
            onClick={w.redo}
          >
            <RotateCw size={15} />
          </button>
        </div>
        <div className="tool-group">
          <button
            title="Load 64-channel point-source preset"
            disabled={w.locked}
            onClick={preset}
          >
            <Radio size={16} />
            Preset
          </button>
          <button
            className="run-command"
            aria-label="Simulate"
            aria-keyshortcuts="F5"
            title="Simulate RF (F5)"
            disabled={!canSimulate}
            onClick={() => void w.simulate()}
          >
            <Play size={15} />
            Simulate<kbd>F5</kbd>
          </button>
          <button
            title="Reconstruct selected methods (F6)"
            aria-label="Reconstruct"
            aria-keyshortcuts="F6"
            disabled={!canReconstruct}
            onClick={reconstruct}
          >
            <Layers size={16} />
            Reconstruct<kbd>F6</kbd>
          </button>
          <button
            className="stop-command"
            title="Stop calculation (Esc)"
            aria-label="Stop calculation"
            disabled={!w.busy || w.job?.status === "cancelling"}
            onClick={() => void w.cancel()}
          >
            <Square size={13} />
          </button>
        </div>
        <div className="tool-group">
          <button
            title="Export experiment, report or video (Ctrl+E)"
            disabled={!canPresent}
            onClick={() => setExportOpen(true)}
          >
            <ArrowDownToLine size={16} />
            Export
          </button>
        </div>
        <div className="strip-space" />
        <div className="tool-group panel-buttons">
          <button
            title="Project panel"
            aria-label="Toggle Project panel"
            aria-pressed={layout.project}
            onClick={() => toggle("project")}
          >
            <PanelLeft size={16} />
          </button>
          <button
            title="Output panel"
            aria-label="Toggle Output panel"
            aria-pressed={layout.output}
            onClick={() => toggle("output")}
          >
            <PanelBottom size={16} />
          </button>
          <button
            title="Properties panel"
            aria-label="Toggle Properties panel"
            aria-pressed={layout.properties}
            onClick={() => toggle("properties")}
          >
            <PanelRight size={16} />
          </button>
        </div>
      </div>
      <div className="workspace-location">
        <Folder size={13} />
        <strong>{w.project?.name || "Untitled"}</strong>
        <ChevronRight size={12} />
        <span>
          {w.editor === "scene"
            ? "Scene model"
            : w.editor === "rf"
              ? "Channel data"
              : w.editor === "map"
                ? "Reconstruction"
                : w.editor === "bubble"
                  ? "Bubble dynamics"
                  : w.editor === "workflow"
                    ? "Model builder"
                    : w.editor === "live"
                      ? "Live simulation"
                      : w.editor === "ct"
                        ? "CT medium"
                        : w.editor === "benchmark"
                          ? "PAM benchmark"
                          : w.editor === "studies"
                            ? "Research studies"
                            : "Run history"}
        </span>
        <span className="location-save">
          {w.project
            ? w.draftStatus.startsWith("Invalid")
              ? "Invalid draft"
              : w.draftStatus
            : "Not saved"}
        </span>
      </div>
      {w.error ? (
        <div className="error-strip" role="alert">
          <span className="severity-error">Error</span>
          <span>{w.error.split("\n")[0]}</span>
          <button
            onClick={() => {
              setOutput("messages");
              setLayout((v) => ({ ...v, output: true }));
            }}
          >
            Show details
          </button>
          <button aria-label="Dismiss error" onClick={() => w.setError("")}>
            <X size={13} />
          </button>
        </div>
      ) : null}
      <div
        className="desktop-grid"
        style={{
          gridTemplateColumns: `${layout.project ? layout.left : 0}px ${layout.project ? 4 : 0}px minmax(280px,1fr) ${layout.properties ? 4 : 0}px ${layout.properties ? layout.right : 0}px`,
          gridTemplateRows: `minmax(180px,1fr) ${layout.output ? 4 : 0}px ${layout.output ? layout.bottom : 0}px`,
        }}
      >
        {layout.project ? (
          <aside className="project-dock" aria-label="Project panel">
            <div className="dock-title">
              <span>Project</span>
              <button
                aria-label="Hide Project panel"
                onClick={() => toggle("project")}
              >
                <X size={12} />
              </button>
            </div>
            <ProjectTree
              w={w}
              onSource={(i) => {
                setSource(i);
                setSourceFocus((v) => v + 1);
                setCategory("model");
                w.setEditor("scene");
              }}
              onMethod={showMethod}
            />
            <div className="workspace-variables">
              <div className="dock-title secondary-title">Model summary</div>
              {cfg ? (
                <dl>
                  <dt>Medium</dt>
                  <dd>{cfg.sound_speed_m_s} m/s</dd>
                  <dt>Sources</dt>
                  <dd>{cfg.sources.length}</dd>
                  <dt>Channels</dt>
                  <dd>{cfg.channels}</dd>
                  <dt>Sample rate</dt>
                  <dd>{cfg.sampling_hz / 1e6} MHz</dd>
                  <dt>Grid</dt>
                  <dd>
                    {cfg.grid_n} × {cfg.grid_n}
                  </dd>
                </dl>
              ) : null}
            </div>
          </aside>
        ) : null}
        {layout.project ? (
          <Splitter
            className="left-split"
            label="Resize Project panel"
            value={layout.left}
            min={170}
            max={340}
            onChange={(left) => setLayout((v) => ({ ...v, left }))}
          />
        ) : null}
        <main className="editor-dock" aria-label="Scientific workspace">
          <div
            className="document-tabs"
            role="tablist"
            aria-label="Workspace views"
          >
            {(
              [
                ["scene", "Scene", Radio],
                ["workflow", "Model builder", Grid2X2],
                ["live", "Live simulation", Play],
                ["rf", "RF data", Waves],
                ["bubble", "Bubble dynamics", Radio],
                ["ct", "CT medium", Grid2X2],
                ["map", "Reconstruction", Layers],
                ["benchmark", "Benchmark", Table2],
                ["studies", "Studies", Table2],
                ["runs", "Runs", Table2],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                role="tab"
                disabled={w.pending}
                aria-selected={w.editor === key}
                onClick={() => w.setEditor(key)}
              >
                <Icon size={14} />
                {label}
                {key === "runs" && w.runs.length ? (
                  <small>{w.runs.length}</small>
                ) : null}
              </button>
            ))}
          </div>
          {cfg && w.editor === "scene" ? (
            <div className="scene-workspace">
              <div className="editor-strip">
                <strong>Scene model</strong>
                <span>Draft</span>
                <div className="strip-space" />
                <span>
                  {cfg.sources.length} source
                  {cfg.sources.length === 1 ? "" : "s"} · {cfg.channels}{" "}
                  receivers
                </span>
                <button
                  title="Edit model properties"
                  onClick={() => properties("model")}
                >
                  <SlidersHorizontal size={13} />
                </button>
              </div>
              <ScenePlot
                onGestureStart={w.beginGesture}
                onGestureEnd={w.endGesture}
                selectedArray={selectedArray}
                onSelectArray={(i) => {
                  setSelectedArray(i);
                  setCategory("model");
                  setLayout((v) => ({ ...v, properties: true }));
                  setParameterFocus((v) => ({
                    kind: "probe",
                    token: v.token + 1,
                  }));
                }}
                cfg={cfg}
                onChange={w.editConfig}
                selectedSource={source}
                onSelectSource={(i) => {
                  setSource(i);
                  setSourceFocus((v) => v + 1);
                  setCategory("model");
                }}
                onCursor={setCursor}
                disabled={w.locked}
                reset={reset}
              />
              <SourceTable
                cfg={cfg}
                selected={source}
                onSelect={(i) => {
                  setSource(i);
                  properties("model");
                }}
              />
            </div>
          ) : null}
          {w.editor === "bubble" ? (
            <BubbleView
              trace={w.bubbleTrace}
              run={w.run}
              sourceIndex={w.bubbleSource}
              onSource={w.setBubbleSource}
            />
          ) : null}
          {w.editor === "studies" ? (
            <StudiesView key={w.project?.project_id || "none"} w={w} />
          ) : null}
          {w.editor === "ct" ? (
            <CTWorkspace
              w={w}
              onScene={() => w.setEditor("scene")}
              onExpand={() =>
                setLayout((v) => ({
                  ...v,
                  project: false,
                  properties: false,
                  output: false,
                }))
              }
            />
          ) : null}
          {w.editor === "workflow" ? (
            <WorkflowEditor
              w={w}
              onInspect={(kind) => {
                if (kind === "ct") {
                  w.setEditor("ct");
                  return;
                }
                setCategory(
                  kind === "reconstruct" || kind === "dsp"
                    ? "analysis"
                    : "model",
                );
                setLayout((v) => ({ ...v, properties: true }));
                setParameterFocus((v) => ({ kind, token: v.token + 1 }));
              }}
              onScene={() => {
                w.setEditor("scene");
                setCategory("model");
                setLayout((v) => ({ ...v, properties: true }));
                setParameterFocus((v) => ({
                  kind: "probe",
                  token: v.token + 1,
                }));
              }}
              onExpand={() =>
                setLayout((v) => ({
                  ...v,
                  project: false,
                  properties: false,
                  output: false,
                }))
              }
            />
          ) : null}
          {w.editor === "live" ? (
            <LiveView
              w={w}
              onExpand={() =>
                setLayout((v) => ({
                  ...v,
                  project: false,
                  properties: false,
                  output: false,
                }))
              }
            />
          ) : null}
          {w.editor === "rf" ? (
            w.run && w.rf && viewCfg ? (
              <div className="rf-workspace">
                <div className="editor-strip">
                  <strong>RF · {runLabel(w.run.id, w.runs)}</strong>
                  <span>
                    {viewCfg.samples.toLocaleString()} × {viewCfg.channels}
                  </span>
                  <div className="strip-space" />
                  <label>
                    Channel{" "}
                    <input
                      aria-label="Selected channel"
                      type="number"
                      min={0}
                      max={viewCfg.channels - 1}
                      value={Math.min(w.channel, viewCfg.channels - 1)}
                      onChange={(e) =>
                        w.setChannel(
                          Math.max(
                            0,
                            Math.min(
                              viewCfg.channels - 1,
                              Math.round(e.target.valueAsNumber || 0),
                            ),
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Signal{" "}
                    <select
                      aria-label="RF signal"
                      value={w.conditioned ? "processed" : "raw"}
                      onChange={(e) =>
                        w.setSignal(e.target.value as "raw" | "processed")
                      }
                    >
                      <option value="raw">Raw acquisition</option>
                      <option
                        value="processed"
                        disabled={
                          !w.run?.config.processing ||
                          w.run?.status !== "complete"
                        }
                      >
                        Conditioned · SciPy
                      </option>
                    </select>
                  </label>
                  <button
                    disabled={w.locked}
                    onClick={() => void w.exportRF("csv")}
                  >
                    CSV
                  </button>
                  <button
                    disabled={w.locked}
                    onClick={() => void w.exportRF("h5")}
                  >
                    HDF5
                  </button>
                </div>
                {w.captureChanged ? (
                  <div className="run-notice">
                    Scene or acquisition changed. Simulate to update RF data.
                  </div>
                ) : null}
                <div className="rf-plots">
                  <RasterPlot
                    array={w.rf}
                    title="RF overview"
                    display="signed"
                    domain={{
                      x0: 0,
                      x1: viewCfg.channels - 1,
                      y0: viewCfg.capture_t0_s * 1e6,
                      y1:
                        (viewCfg.capture_t0_s +
                          (viewCfg.samples - 1) / viewCfg.sampling_hz) *
                        1e6,
                    }}
                    xLabel="Channel (zero-based)"
                    yLabel="Receive time (µs)"
                    onCursor={setCursor}
                    onPick={(x) =>
                      w.setChannel(
                        Math.max(
                          0,
                          Math.min(viewCfg.channels - 1, Math.round(x)),
                        ),
                      )
                    }
                    reset={reset}
                  />
                  <div className="rf-traces">
                    <div className="trace-controls">
                      <label>
                        Spectrum{" "}
                        <select
                          aria-label="Spectrum content"
                          value={spectrumView}
                          onChange={(e) => setSpectrumView(e.target.value)}
                        >
                          <option value="signal">Signal FFT</option>
                          <option value="filter" disabled={!w.dspResponse}>
                            Receive filter response
                          </option>
                        </select>
                      </label>
                      <label>
                        Trace window{" "}
                        <select
                          aria-label="Trace window"
                          value={timeView}
                          onChange={(e) =>
                            setTimeView(e.target.value as "signal" | "record")
                          }
                        >
                          <option value="signal">Source arrivals</option>
                          <option value="record">Full record</option>
                        </select>
                      </label>
                      <span>
                        CH {Math.min(w.channel, viewCfg.channels - 1)}
                      </span>
                      <input
                        aria-label="Channel slider"
                        type="range"
                        min={0}
                        max={viewCfg.channels - 1}
                        value={Math.min(w.channel, viewCfg.channels - 1)}
                        onChange={(e) => w.setChannel(Number(e.target.value))}
                      />
                    </div>
                    <LinePlot
                      points={tracePoints}
                      title="Channel waveform"
                      xLabel="Receive time (µs)"
                      yLabel="Amplitude (a.u.)"
                      symmetric
                      xWindow={
                        timeView === "signal"
                          ? arrivalWindow(viewCfg)
                          : undefined
                      }
                    />
                    {spectrumView === "filter" && w.dspResponse ? (
                      <LinePlot
                        points={pairs(w.dspResponse, 1e-6)}
                        title="Receive filter · forward/backward response"
                        xLabel="Frequency (MHz)"
                        yLabel="Amplitude gain · DC/trend not shown"
                      />
                    ) : (
                      <LinePlot
                        points={spectrumPoints}
                        title="Amplitude spectrum"
                        xLabel="Frequency (MHz)"
                        yLabel="a.u. · Hann window"
                      />
                    )}
                  </div>
                </div>
                <div className="data-footnote">
                  Overview: {w.rf.shape[0]} signed peak bins. Traces and FFT use
                  all {viewCfg.samples} samples. Channel order follows array
                  order then local element order.{" "}
                  {w.conditioned
                    ? "Conditioned RF; CSV exports this conditioned trace. HDF5 retains all RF datasets."
                    : "Raw acquisition RF."}
                </div>
              </div>
            ) : (
              <EmptyView
                title={
                  w.arraysLoading ? "Loading RF data…" : "No RF data selected"
                }
                text="Simulate the scene or select an RF run in the Project panel."
                action={
                  canSimulate
                    ? { label: "Simulate RF", run: () => void w.simulate() }
                    : undefined
                }
              />
            )
          ) : null}
          {w.editor === "map" ? (
            w.run?.metrics && viewCfg && available.length ? (
              <div className="map-workspace">
                <div className="editor-strip result-strip">
                  <strong>{runLabel(w.run.id, w.runs)}</strong>
                  <div
                    className="method-tabs"
                    role="tablist"
                    aria-label="Reconstruction method"
                  >
                    {methodKeys.map((k) => (
                      <button
                        key={k}
                        role="tab"
                        aria-selected={w.method === k}
                        disabled={!w.maps[k]}
                        title={
                          available.includes(k)
                            ? methodLabels[k]
                            : "Not calculated in this run"
                        }
                        onClick={() => w.setMethod(k)}
                      >
                        {k.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <div className="strip-space" />
                  <button
                    aria-label="Tile results"
                    title="Tile result plots"
                    aria-pressed={tiled}
                    onClick={() => setTiled(!tiled)}
                  >
                    <Grid2X2 size={14} />
                  </button>
                  <button
                    aria-label="Fit plots"
                    title="Fit plots"
                    onClick={fit}
                  >
                    <Maximize2 size={14} />
                  </button>
                </div>
                <div className="display-strip">
                  <label>
                    Display{" "}
                    <select
                      aria-label="Map display"
                      value={display}
                      onChange={(e) =>
                        setDisplay(e.target.value as "db" | "linear")
                      }
                    >
                      <option value="db">Relative dB</option>
                      <option value="linear">Linear</option>
                    </select>
                  </label>
                  <label>
                    Range{" "}
                    <select
                      aria-label="Dynamic range"
                      value={floor}
                      onChange={(e) => setFloor(Number(e.target.value))}
                    >
                      <option value={-20}>20 dB</option>
                      <option value={-40}>40 dB</option>
                      <option value={-60}>60 dB</option>
                    </select>
                  </label>
                  <label>
                    Colour{" "}
                    <select
                      aria-label="Colour map"
                      value={palette}
                      onChange={(e) => setPalette(e.target.value as Palette)}
                    >
                      <option value="viridis">Viridis</option>
                      <option value="thermal">Thermal</option>
                      <option value="gray">Grayscale</option>
                    </select>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={truth}
                      onChange={(e) => setTruth(e.target.checked)}
                    />
                    Truth
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={profiles}
                      onChange={(e) => setProfiles(e.target.checked)}
                    />
                    Profiles
                  </label>
                  <button
                    className="text-command"
                    onClick={() => setHelp(true)}
                  >
                    Method…
                  </button>
                </div>
                <PeakControls
                  value={w.peakSettings}
                  onChange={w.setPeakSettings}
                  disabled={w.locked}
                />
                <PeakResults
                  compact
                  evaluation={w.peakReport?.methods[w.method]?.detections}
                />
                {w.draftDiffers || w.analysisDiffers ? (
                  <div className="run-notice">
                    {w.captureChanged
                      ? "Scene or acquisition changed. Simulate to update RF."
                      : "Draft analysis settings differ from this saved result."}
                    <button
                      disabled={w.locked}
                      onClick={() => void w.loadRunConfig()}
                    >
                      Load run into draft
                    </button>
                  </div>
                ) : null}
                <div
                  className={
                    tiled
                      ? "tile-results"
                      : `result-plots ${profiles ? "with-profiles" : ""}`
                  }
                >
                  {tiled ? (
                    available.map((k) =>
                      w.maps[k] ? (
                        <RasterPlot
                          key={k}
                          array={w.maps[k]!}
                          title={`${methodLabels[k]} · ${unitLabel(w.run!.methods[k]?.unit)}`}
                          detections={w.peakReport?.methods[k]?.detections}
                          domain={mapDomain(viewCfg)}
                          xLabel="Lateral x (mm)"
                          yLabel="Depth z (mm)"
                          display={display}
                          floor={floor}
                          palette={palette}
                          truth={
                            truth
                              ? viewCfg.sources.map((s) => [
                                  s.x_m * 1000,
                                  s.z_m * 1000,
                                ])
                              : []
                          }
                          peak={[
                            w.run!.metrics!.methods[k]!.peak_x_m * 1000,
                            w.run!.metrics!.methods[k]!.peak_z_m * 1000,
                          ]}
                          showCrosshair={crosshair}
                          onCursor={setCursor}
                          reset={reset}
                        />
                      ) : null,
                    )
                  ) : w.maps[w.method] && w.run.metrics.methods[w.method] ? (
                    <>
                      <RasterPlot
                        array={w.maps[w.method]!}
                        title={`${methodLabels[w.method]} · ${unitLabel(w.run.methods[w.method]?.unit)}`}
                        detections={w.peakReport?.methods[w.method]?.detections}
                        domain={mapDomain(viewCfg)}
                        xLabel="Lateral x (mm)"
                        yLabel="Depth z (mm)"
                        display={display}
                        floor={floor}
                        palette={palette}
                        truth={
                          truth
                            ? viewCfg.sources.map((s) => [
                                s.x_m * 1000,
                                s.z_m * 1000,
                              ])
                            : []
                        }
                        peak={[
                          w.run.metrics.methods[w.method]!.peak_x_m * 1000,
                          w.run.metrics.methods[w.method]!.peak_z_m * 1000,
                        ]}
                        selection={selection || undefined}
                        onPick={(x, y) => setSelection([x, y])}
                        onCursor={setCursor}
                        reset={reset}
                        showCrosshair={crosshair}
                      />
                      {profiles ? (
                        <Profiles
                          array={w.maps[w.method]!}
                          cfg={viewCfg}
                          selection={
                            selection || [
                              w.run.metrics.methods[w.method]!.peak_x_m * 1000,
                              w.run.metrics.methods[w.method]!.peak_z_m * 1000,
                            ]
                          }
                        />
                      ) : null}
                    </>
                  ) : (
                    <EmptyView title="Loading reconstruction…" />
                  )}
                </div>
                <div className="data-footnote">
                  <span>◇ Peak · + Ground truth</span>
                  <span>
                    {w.run.methods[w.method]?.status === "experimental"
                      ? "Experimental method"
                      : "Reference implementation"}{" "}
                    · {w.run.methods[w.method]?.method_version}
                  </span>
                  <span>
                    {viewCfg.grid_n} × {viewCfg.grid_n} ·{" "}
                    {display === "db" ? "10 log₁₀(P / max P)" : "Linear values"}
                  </span>
                </div>
              </div>
            ) : (
              <EmptyView
                title={
                  w.arraysLoading
                    ? "Loading reconstruction…"
                    : "No reconstruction selected"
                }
                text="Select RF data, choose methods in Analysis properties, then reconstruct."
                action={
                  canReconstruct
                    ? { label: "Reconstruct", run: reconstruct }
                    : undefined
                }
              />
            )
          ) : null}
          {w.editor === "runs" ? (
            <RunTable
              runs={w.runs}
              current={w.run?.id}
              locked={w.locked}
              select={(id) => void w.selectRun(id)}
            />
          ) : null}
          {w.editor === "benchmark" ? <BenchmarkView w={w} /> : null}
          {!cfg ? (
            <EmptyView title="Connecting to calculation engine…" />
          ) : null}
        </main>
        {layout.properties ? (
          <Splitter
            className="right-split"
            label="Resize Properties panel"
            value={layout.right}
            min={260}
            max={440}
            direction={-1}
            onChange={(right) => setLayout((v) => ({ ...v, right }))}
          />
        ) : null}
        {layout.properties ? (
          <aside className="properties-dock" aria-label="Properties panel">
            {cfg ? (
              <Inspector
                focus={parameterFocus}
                selectedArray={selectedArray}
                onSelectArray={setSelectedArray}
                backends={w.backends}
                cfg={cfg}
                onChange={w.editConfig}
                analysis={w.analysis}
                onAnalysis={w.editAnalysis}
                source={source}
                onSource={setSource}
                sourceFocus={sourceFocus}
                disabled={w.locked}
                draftStatus={w.draftStatus}
                category={category}
                onCategory={setCategory}
              />
            ) : (
              <div className="dock-title">Properties</div>
            )}
          </aside>
        ) : null}
        {layout.output ? (
          <Splitter
            className="bottom-split"
            label="Resize Output panel"
            value={layout.bottom}
            min={100}
            max={350}
            axis="y"
            direction={-1}
            onChange={(bottom) => setLayout((v) => ({ ...v, bottom }))}
          />
        ) : null}
        {layout.output ? (
          <section className="output-dock" aria-label="Output panel">
            <div
              className="output-tabs"
              role="tablist"
              aria-label="Output tabs"
            >
              <button
                role="tab"
                aria-selected={output === "messages"}
                onClick={() => setOutput("messages")}
              >
                Messages <small>{w.messages.length}</small>
              </button>
              <button
                role="tab"
                aria-selected={output === "measurements"}
                onClick={() => setOutput("measurements")}
              >
                Measurements
              </button>
              <button
                role="tab"
                aria-selected={output === "info"}
                onClick={() => setOutput("info")}
              >
                Run info
              </button>
              <div className="strip-space" />
              {output === "messages" ? (
                <button
                  className="clear-output"
                  onClick={() => w.setMessages([])}
                >
                  Clear
                </button>
              ) : null}
              <button
                className="dock-close"
                aria-label="Hide Output panel"
                onClick={() => toggle("output")}
              >
                <X size={12} />
              </button>
            </div>
            <div className="output-content" ref={outputRef}>
              {output === "messages" ? (
                <Messages messages={w.messages} />
              ) : output === "measurements" ? (
                <Measurements
                  run={w.run}
                  method={w.method}
                  select={showMethod}
                />
              ) : (
                <RunInfo run={w.run} />
              )}
            </div>
          </section>
        ) : null}
      </div>
      <footer className="instrument-status" role="status">
        <span className={`engine-indicator ${w.ready ? "ready" : ""}`} />
        <span>
          {!w.ready
            ? "Connecting"
            : w.busy
              ? w.job?.status === "cancelling"
                ? "Stopping…"
                : w.job?.stage === "simulate"
                  ? "Simulating RF…"
                  : w.job?.stage === "reconstruct"
                    ? "Reconstructing…"
                    : w.job?.stage
              : "Ready"}
        </span>
        {w.busy ? (
          <>
            <progress
              aria-label="Calculation progress"
              value={
                (cfg?.simulation || cfg?.bubble) &&
                w.job?.stage !== "reconstruct"
                  ? undefined
                  : w.job?.progress || 0
              }
              max={1}
            />
            {(cfg?.simulation || cfg?.bubble) &&
            w.job?.stage !== "reconstruct" ? null : (
              <span>{Math.round((w.job?.progress || 0) * 100)}%</span>
            )}
          </>
        ) : null}
        <span className="status-divider" />
        <span>{w.project?.name || "No project"}</span>
        <div className="strip-space" />
        {cursor ? (
          <span className="coordinate-readout">
            {w.editor === "rf"
              ? `CH ${Math.round(cursor.x)}  t ${cursor.y.toFixed(3)} µs`
              : `x ${cursor.x.toFixed(3)} mm  z ${cursor.y.toFixed(3)} mm`}
            {cursor.value !== undefined
              ? `  ${cursor.value.toExponential(3)}`
              : ""}
          </span>
        ) : null}
        <span className="status-divider" />
        <span>
          {(w.editor === "scene" ? cfg : viewCfg)?.coupling
            ? "jBubble → j-Wave → NumPy"
            : (w.editor === "scene" ? cfg : viewCfg)?.simulation
              ? "j-Wave → NumPy"
              : (w.editor === "scene" ? cfg : viewCfg)?.bubble
                ? "jBubble → NumPy"
                : "NumPy"}{" "}
          · CPU · float64
        </span>
        {w.run?.metrics ? (
          <span>{(w.run.metrics.runtime_ms / 1000).toFixed(3)} s</span>
        ) : null}
      </footer>
      <Modal
        open={newProject}
        title="New project"
        onClose={() => setNewProject(false)}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void w
              .openProject(true, projectName.trim())
              .then(() => setNewProject(false));
          }}
        >
          <label className="dialog-field">
            Name
            <input
              autoFocus
              value={projectName}
              maxLength={120}
              onChange={(e) => setProjectName(e.target.value)}
            />
          </label>
          <p>Choose a new project folder in the next dialog.</p>
          <div className="dialog-buttons">
            <button type="button" onClick={() => setNewProject(false)}>
              Cancel
            </button>
            <button
              className="default-button"
              type="submit"
              disabled={!projectName.trim() || w.locked}
            >
              Create
            </button>
          </div>
        </form>
      </Modal>
      <Modal
        open={exportOpen}
        title="Export experiment"
        onClose={() => {
          if (!presentationBusy) setExportOpen(false);
        }}
      >
        <dl className="export-summary">
          <dt>Run</dt>
          <dd>{w.run?.id.slice(0, 8)}</dd>
          <dt>Methods</dt>
          <dd>{available.map((k) => k.toUpperCase()).join(", ")}</dd>
          <dt>Format</dt>
          <dd>ZIP + companion folder</dd>
        </dl>
        <label className="check-row">
          <input
            type="checkbox"
            checked={rawExport}
            onChange={(e) => setRawExport(e.target.checked)}
          />
          Include raw RF data
        </label>
        <p>
          Configuration, maps, measurements, figures, citations and checksums
          are included.
        </p>
        <PresentationExports w={w} onBusy={setPresentationBusy} />
        <div className="dialog-buttons">
          <button
            disabled={presentationBusy}
            onClick={() => setExportOpen(false)}
          >
            Close
          </button>
          <button
            className="default-button"
            disabled={!canExport || presentationBusy}
            onClick={() => {
              setExportOpen(false);
              void w.exportBundle(rawExport);
            }}
          >
            Export ZIP…
          </button>
        </div>
      </Modal>
      <Modal
        open={about}
        title="About PAM Research Studio"
        className="about-dialog"
        onClose={() => setAbout(false)}
      >
        <AboutStudio />
        <div className="dialog-buttons">
          <button onClick={() => setAbout(false)}>Close</button>
        </div>
      </Modal>
      <Modal
        open={help}
        title="Method reference"
        className="method-dialog"
        onClose={() => setHelp(false)}
      >
        <div
          className="reference-methods"
          role="tablist"
          aria-label="Method reference tabs"
        >
          {methodKeys.map((k) => (
            <button
              role="tab"
              key={k}
              aria-selected={w.method === k}
              onClick={() => w.setMethod(k)}
            >
              {k.toUpperCase()}
            </button>
          ))}
        </div>
        <h2>{methodLabels[w.method]}</h2>
        <dl className="method-definition">
          <dt>Definition</dt>
          <dd>
            <code>{w.registry[w.method]?.definition}</code>
          </dd>
          <dt>Output</dt>
          <dd>
            {w.registry[w.method]?.quantity} ·{" "}
            {unitLabel(w.registry[w.method]?.unit)}
          </dd>
          <dt>Status</dt>
          <dd>{w.registry[w.method]?.status}</dd>
          <dt>Reference</dt>
          <dd>
            {w.registry[w.method]?.reference ||
              "Gyöngy & Coussios (2010), DOI 10.1121/1.3467491; explicit reference variant."}
          </dd>
        </dl>
        <p>
          Receive alignment: sₘ(u + distanceₘ/c). u is emission time;
          acquisition sample n occurs at t₀ + n/fₛ. Amplitude units are
          arbitrary.
        </p>
        {w.method === "rcb" ? (
          <p>
            The steering uncertainty constraint is solved independently of
            numerical loading. Spatial smoothing changes the effective aperture.
            Condition numbers are recorded in Run info.
          </p>
        ) : w.method === "atp" ? (
          <p>
            ATP requires known short-pulse timing. Known-emission mode uses
            receive propagation only. Plane-wave mode also uses (z − zₚₗₐₙₑ)/c.
            Ground-truth coordinates are not used to calculate the image.
          </p>
        ) : w.method === "tea" ? (
          <p>
            Coherent exposure is integrated without self-energy subtraction.
            This is an explicit TEA variant, not a claim of equivalence to all
            published formulations.
          </p>
        ) : null}
        <p>
          Error measures the global peak to nearest truth. FWHM is omitted for
          multiple sources and truncated lobes. Synthetic tests do not establish
          clinical validity.
        </p>
        <div className="dialog-buttons">
          <button onClick={() => setHelp(false)}>Close</button>
        </div>
      </Modal>
    </div>
  );
}
