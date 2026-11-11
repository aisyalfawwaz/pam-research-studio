import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  defaultAnalysis,
  rawRunAnalysis,
  restoreRunDraft,
  sameAnalysis,
  workflowForConfig,
  withMethodBlocks,
  withConditioning,
} from "../../../packages/workspace";
import {
  methodKeys,
  stableJSON,
  captureConfig,
  peakDefaults,
  peakSettingsSchema,
} from "../../../packages/contracts";
import type {
  Action,
  Analysis,
  BinaryArray,
  BackendInfo,
  Config,
  Job,
  Method,
  MethodInfo,
  ProjectInfo,
  Run,
  RunSummary,
  PeakSettings,
  BenchmarkReport,
} from "../../../packages/contracts";
import analysisDefaults from "../../../packages/contracts/analysis.json";
import {
  makeWorkflow,
  workflowSchema,
} from "../../../packages/contracts/workflow";
import type { Workflow } from "../../../packages/contracts/workflow";

export type Editor =
  | "scene"
  | "rf"
  | "map"
  | "runs"
  | "bubble"
  | "ct"
  | "benchmark"
  | "studies"
  | "workflow"
  | "live";
// Research studies share the same authenticated worker and immutable run store.
// CT anatomy is a separate document; acquisition/reconstruction remain shared.
export interface LiveFrame {
  config?: Config;
  run_id?: string;
  stage?: string;
  status?: string;
  pressure?: number[][];
  ct_mask?: number[][];
  rf?: number[][];
  sensor_now?: number[];
  extent?: number[];
  time_s?: number;
  radius_m?: number;
  radius_max_m?: number;
  rf_start_s?: number;
  step?: number;
  steps?: number;
  pam?: number[][];
  computed?: number;
  pam_method?: string;
}
export interface Message {
  id: number;
  time: string;
  level: "info" | "error" | "warning";
  text: string;
}
export const request = async <T>(action: Action, payload?: unknown) =>
  (await window.pam.request(action, payload)) as T;
function describe(error: unknown) {
  let value = error instanceof Error ? error.message : String(error);
  value = value.replace(
    /^Error invoking remote method '[^']+': (?:Error: )?/,
    "",
  );
  const start = value.indexOf("[");
  if (start >= 0) {
    try {
      const records = JSON.parse(value.slice(start)) as {
        message?: string;
        msg?: string;
        path?: string[];
        loc?: string[];
      }[];
      return records
        .map(
          (item) =>
            `${(item.path || item.loc || []).filter((p) => p !== "body" && p !== "config").join(".")}: ${item.message || item.msg}`,
        )
        .join("\n");
    } catch {
      /* Preserve an engine message that is not JSON. */
    }
  }
  return value;
}
const activeJob = (status?: string) =>
  status === "running" || status === "cancelling";

export function useWorkbench() {
  const [config, setConfig] = useState<Config | null>(null);
  const [analysis, setAnalysis] = useState<Analysis>(
    () =>
      ({
        ...analysisDefaults,
        methods: [...methodKeys],
        atp_timing_known: true,
      }) as Analysis,
  );
  const [registry, setRegistry] = useState<Partial<Record<Method, MethodInfo>>>(
    {},
  );
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [peakSettings, setPeakSettings] = useState<PeakSettings>(() => {
    try {
      return peakSettingsSchema.parse(
        JSON.parse(localStorage.getItem("pam.peaks.v1") || "null"),
      );
    } catch {
      return { ...peakDefaults };
    }
  });
  const [peakReport, setPeakReport] = useState<BenchmarkReport | null>(null);
  useEffect(() => {
    localStorage.setItem("pam.peaks.v1", JSON.stringify(peakSettings));
  }, [peakSettings]);
  useEffect(() => {
    setPeakReport(null);
    if (!run || run.status !== "complete") return;
    let active = true;
    const timer = setTimeout(() => {
      request<BenchmarkReport>("benchmark", {
        run_id: run.id,
        settings: {
          roi_radius_m: 0.002,
          histogram_bins: 100,
          peaks: peakSettings,
        },
      })
        .then((report) => {
          if (active) setPeakReport(report);
        })
        .catch((e) => {
          if (active) setError(String(e));
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [run?.id, peakSettings, project?.session_id]);
  const [editor, setEditor] = useState<Editor>("workflow");
  const [workflow, setWorkflowState] = useState<Workflow>(() => makeWorkflow());
  const [workflowAutosave, setWorkflowAutosave] = useState(false);
  const setWorkflow = useCallback((next: Workflow) => {
    setWorkflowState(next);
    setWorkflowAutosave(true);
  }, []);
  const [liveFrame, setLiveFrame] = useState<LiveFrame | null>(null);
  const [movie, setMovie] = useState<{
    frames: BinaryArray;
    times: BinaryArray;
  } | null>(null);
  const [ready, setReady] = useState(false);
  const [backends, setBackends] = useState<BackendInfo[]>([]);
  const [pending, setPending] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [draftStatus, setDraftStatus] = useState("Unsaved");
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [rawData, setRawData] = useState<{
    runId: string;
    array: BinaryArray;
  } | null>(null);
  const [processedData, setProcessedData] = useState<{
    runId: string;
    array: BinaryArray;
  } | null>(null);
  const [signalLoading, setSignalLoading] = useState(false);
  const [bubbleData, setBubbleData] = useState<{
    runId: string;
    source: number;
    array: BinaryArray;
  } | null>(null);
  const [bubbleSource, setBubbleSource] = useState(0);
  const bubbleTrace =
    bubbleData?.runId === run?.id &&
    bubbleData?.source ===
      Math.min(bubbleSource, (run?.config.sources.length || 1) - 1)
      ? bubbleData.array
      : null;
  const [trace, setTrace] = useState<BinaryArray | null>(null);
  const [spectrum, setSpectrum] = useState<BinaryArray | null>(null);
  const [dspResponse, setDSPResponse] = useState<BinaryArray | null>(null);
  const [ctMask, setCTMask] = useState<BinaryArray | null>(null);
  const [maps, setMaps] = useState<Partial<Record<Method, BinaryArray>>>({});
  const [channel, setChannel] = useState(31);
  const [signal, setSignal] = useState<"raw" | "processed">("raw");
  const conditioned =
    signal === "processed" &&
    !!run?.config.processing &&
    run?.status === "complete";
  const rawRF = rawData?.runId === run?.id ? rawData?.array || null : null;
  const rf = conditioned
    ? processedData?.runId === run?.id
      ? processedData?.array || null
      : null
    : rawRF;
  const [method, setMethod] = useState<Method>("das");
  const [arraysLoading, setArraysLoading] = useState(false);
  const history = useRef<{ past: Config[]; future: Config[] }>({
    past: [],
    future: [],
  });
  const sequence = useRef(0);
  const gesture = useRef({ active: false, recorded: false });
  const messageId = useRef(0);
  const savedDraft = useRef("");
  const busy = activeJob(job?.status);
  const locked = busy || pending || !ready;
  useEffect(() => {
    if (!project || busy || pending || !workflowAutosave) return;
    const timer = setTimeout(() => {
      request("saveWorkflow", {
        workflow: { ...workflow, analysis },
        session_id: project.session_id,
      }).catch((error) => log(String(error), "warning"));
    }, 450);
    return () => clearTimeout(timer);
  }, [workflow, analysis, project, busy, pending, workflowAutosave]);
  useEffect(() => {
    if (!busy) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const frame = await request<LiveFrame>("live");
        if (active) setLiveFrame(frame);
      } catch {
        // Keep the last complete atomic frame while a worker writes the next.
      } finally {
        if (active) timer = setTimeout(poll, 130);
      }
    };
    void poll().catch(() => {});
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [busy, job?.run_id]);
  useEffect(() => {
    setMovie(null);
    if (!run?.config.simulation) return;
    let active = true;
    Promise.all([
      window.pam.array(run.id, "wave"),
      window.pam.array(run.id, "wave_time"),
    ])
      .then(([frames, times]) => {
        if (active) setMovie({ frames, times });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [run]);

  const log = useCallback((text: string, level: Message["level"] = "info") => {
    const entry = {
      id: ++messageId.current,
      time: new Date().toLocaleTimeString("en-GB"),
      level,
      text,
    };
    setMessages((previous) => [...previous.slice(-199), entry]);
  }, []);
  const perform = useCallback(
    async (action: () => Promise<void>) => {
      setPending(true);
      setError("");
      try {
        await action();
      } catch (error) {
        const text = describe(error);
        setError(text);
        log(text, "error");
      } finally {
        setPending(false);
      }
    },
    [log],
  );
  const updateConfig = useCallback(
    (next: Config) => {
      if (config && stableJSON(config) !== stableJSON(next)) {
        if (!gesture.current.active || !gesture.current.recorded) {
          history.current = {
            past: [...history.current.past.slice(-49), config],
            future: [],
          };
          gesture.current.recorded = true;
        }
      }
      setConfig(next);
    },
    [config],
  );
  const undo = () => {
    const previous = history.current.past.pop();
    if (previous && config) {
      history.current.future.push(config);
      syncDiagram(previous);
      setConfig(previous);
    }
  };
  const editAnalysis = (next: Analysis) => {
    setAnalysis(next);
    setWorkflow(withMethodBlocks(workflow, next));
  };
  const syncDiagram = (next: Config) => {
    const nextAnalysis =
      !next.ct && analysis.receive_model === "ct_slowness"
        ? { ...analysis, receive_model: "homogeneous" as const }
        : analysis;
    if (nextAnalysis !== analysis) {
      setAnalysis(nextAnalysis);
      log(
        "CT medium detached; receive delays now use the homogeneous host model.",
      );
    }
    if (
      !!next.simulation !== !!config?.simulation ||
      !!next.bubble !== !!config?.bubble ||
      !!next.coupling !== !!config?.coupling ||
      !!next.ct !== !!config?.ct
    ) {
      setWorkflow(workflowForConfig(next, nextAnalysis));
      log(
        "Backend changed; the diagram now follows the selected source, propagation and analysis settings.",
      );
    } else if (!!next.processing !== !!config?.processing) {
      setWorkflow(withConditioning(workflow, !!next.processing));
    }
  };
  const editConfig = (next: Config) => {
    updateConfig(next);
    syncDiagram(next);
  };
  const redo = () => {
    const next = history.current.future.pop();
    if (next && config) {
      history.current.past.push(config);
      syncDiagram(next);
      setConfig(next);
    }
  };
  useEffect(() => {
    let live = true;
    request<BackendInfo[]>("backends")
      .then((value) => {
        if (live) setBackends(value);
      })
      .catch((error) => {
        if (live) log(`Backend detection: ${describe(error)}`, "warning");
      });
    return () => {
      live = false;
    };
  }, [log]);
  useEffect(() => {
    let live = true;
    Promise.all([
      request<Config>("demo"),
      request<Partial<Record<Method, MethodInfo>>>("methods"),
      request("health"),
    ])
      .then(([cfg, methods]) => {
        if (live) {
          setConfig(cfg);
          setRegistry(methods);
          setReady(true);
          log("Engine ready.");
        }
      })
      .catch((error) => {
        if (live) {
          setError(describe(error));
          log(describe(error), "error");
        }
      });
    return () => {
      live = false;
    };
  }, [log]);
  useEffect(() => {
    if (!project || !config || busy || pending) return;
    const snapshot = stableJSON(config);
    if (savedDraft.current === snapshot) {
      setDraftStatus("Saved");
      return;
    }
    let live = true;
    setDraftStatus("Modified");
    const timer = setTimeout(() => {
      request<{ warnings: string[] }>("saveDraft", {
        config,
        session_id: project.session_id,
      })
        .then(() => {
          if (live) {
            savedDraft.current = snapshot;
            setDraftStatus("Saved");
          }
        })
        .catch((error) => {
          if (live) setDraftStatus(`Invalid: ${describe(error)}`);
        });
    }, 600);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [config, project, busy, pending]);

  const jobId = job?.run_id;
  useEffect(() => {
    if (!busy || (!jobId && !job?.study_id)) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await request<Job>("job");
        if (!live) return;
        if (activeJob(next.status)) {
          setJob(next);
          timer = setTimeout(poll, 220);
          return;
        }
        const finalId = next.run_id || jobId;
        const [list, record] = await Promise.all([
          request<RunSummary[]>("runs"),
          finalId ? request<Run>("run", finalId) : Promise.resolve(null),
        ]);
        if (!live) return;
        setJob(next);
        setRuns(list);
        if (record && ["simulated", "complete"].includes(record.status)) {
          setRun(record);
          setEditor((previous) =>
            ["scene", "workflow", "rf", "map"].includes(previous)
              ? record.status === "simulated"
                ? "rf"
                : "map"
              : previous,
          );
          log(
            record.status === "simulated"
              ? `Simulation complete: ${record.config.samples} samples × ${record.config.channels} channels.`
              : `Reconstruction complete: ${Object.keys(
                  record.metrics?.methods || {},
                )
                  .map((k) => k.toUpperCase())
                  .join(
                    ", ",
                  )}; ${((record.metrics?.runtime_ms || 0) / 1000).toFixed(3)} s.`,
          );
        } else {
          const text =
            record?.error ||
            next.error ||
            `Run ${record?.status || next.status}.`;
          if (record?.status === "failed") setError(text);
          log(text, record?.status === "interrupted" ? "warning" : "error");
        }
      } catch (error) {
        if (live) {
          setError(describe(error));
          timer = setTimeout(poll, 1000);
        }
      }
    };
    timer = setTimeout(poll, 100);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [busy, jobId, job?.study_id, log]);

  useEffect(() => {
    const id = ++sequence.current;
    setRawData(null);
    setBubbleData(null);
    setTrace(null);
    setSpectrum(null);
    setDSPResponse(null);
    setCTMask(null);
    setMaps({});
    setArraysLoading(false);
    if (!run || !["simulated", "complete"].includes(run.status)) return;
    setArraysLoading(true);
    const available = methodKeys.filter((key) => run.metrics?.methods[key]);
    setMethod((previous) =>
      available.includes(previous) ? previous : available[0] || "das",
    );
    const tasks: Promise<void>[] = [
      window.pam
        .array(run.id, "rf")
        .then((array) => {
          if (sequence.current === id) setRawData({ runId: run.id, array });
        })
        .catch(() => {
          if (sequence.current === id)
            log("Raw RF is not included in this run.", "warning");
        }),
    ];
    if (run.config.ct)
      tasks.push(
        window.pam.array(run.id, "ct_mask").then((a) => {
          if (sequence.current === id) setCTMask(a);
        }),
      );
    if (run.status === "complete" && run.config.processing)
      tasks.push(
        window.pam.array(run.id, "dsp_response").then((a) => {
          if (sequence.current === id) setDSPResponse(a);
        }),
      );
    for (const key of available)
      tasks.push(
        window.pam.array(run.id, key).then((array) => {
          if (sequence.current === id)
            setMaps((previous) => ({ ...previous, [key]: array }));
        }),
      );
    Promise.all(tasks)
      .catch((error) => {
        if (sequence.current === id) {
          setError(describe(error));
          log(describe(error), "error");
        }
      })
      .finally(() => {
        if (sequence.current === id) setArraysLoading(false);
      });
    return () => {
      sequence.current++;
    };
  }, [run, log]);
  useEffect(() => {
    setProcessedData(null);
    setSignalLoading(false);
    if (!run || !conditioned) {
      return;
    }
    let active = true;
    setSignalLoading(true);
    window.pam
      .array(run.id, "rf_processed")
      .then((a) => {
        if (active) setProcessedData({ runId: run.id, array: a });
      })
      .catch((error) => {
        if (active)
          log(`Conditioned RF unavailable: ${describe(error)}`, "warning");
      })
      .finally(() => {
        if (active) setSignalLoading(false);
      });
    return () => {
      active = false;
    };
  }, [run, conditioned, log]);
  useEffect(() => {
    setTrace(null);
    setSpectrum(null);
    if (!run || !rf) return;
    let live = true;
    const selected = Math.min(channel, run.config.channels - 1);
    Promise.all([
      window.pam.array(
        run.id,
        conditioned ? "trace_processed" : "trace",
        selected,
      ),
      window.pam.array(
        run.id,
        conditioned ? "spectrum_processed" : "spectrum",
        selected,
      ),
    ])
      .then(([t, s]) => {
        if (live) {
          setTrace(t);
          setSpectrum(s);
        }
      })
      .catch((error) => {
        if (live) setError(describe(error));
      });
    return () => {
      live = false;
    };
  }, [run, rf, channel, conditioned]);

  const openProject = (create: boolean, name = "Point source") =>
    perform(async () => {
      const info = await window.pam.project(create, name);
      if (!info) return;
      let options = defaultAnalysis(info.draft),
        diagram = workflowForConfig(info.draft, options),
        autosave = true;
      try {
        const stored = await request<Workflow | null>("workflow");
        if (stored) {
          const parsed = workflowSchema.parse(stored);
          options = parsed.analysis || options;
          diagram = { ...parsed, analysis: options };
        }
      } catch (error) {
        autosave = false;
        log(
          `Saved diagram could not be loaded: ${describe(error)}. A diagram was generated from the draft; automatic diagram saving is paused until you edit or load a template.`,
          "warning",
        );
      }
      setProject(info);
      savedDraft.current = stableJSON(info.draft);
      setConfig(info.draft);
      setAnalysis(options);
      setWorkflowState(diagram);
      setWorkflowAutosave(autosave);
      setRuns(info.runs);
      setRun(null);
      setLiveFrame(null);
      setJob(null);
      setEditor("workflow");
      history.current = { past: [], future: [] };
      log(`${create ? "Created" : "Opened"} project: ${info.name}.`);
    });
  const save = () =>
    perform(async () => {
      if (config && project) {
        await request("saveDraft", { config, session_id: project.session_id });
        savedDraft.current = stableJSON(config);
        setDraftStatus("Saved");
        log("Project saved.");
      }
    });
  const preset = () =>
    perform(async () => {
      const cfg = await request<Config>("demo");
      updateConfig(cfg);
      const options = defaultAnalysis(cfg);
      setAnalysis(options);
      setWorkflow(workflowForConfig(cfg, options));
      setEditor("scene");
      log("Loaded preset: 64-channel point source. ATP emission time = 8 µs.");
    });
  const simulate = () =>
    perform(async () => {
      if (!config || !project) return;
      setRun(null);
      setLiveFrame(null);
      await request("saveDraft", { config, session_id: project.session_id });
      savedDraft.current = stableJSON(config);
      setJob(await request<Job>("simulate", config));
      log("Simulation started.");
    });
  const runWorkflow = (override?: Config) =>
    perform(async () => {
      if (!config || !project) return;
      const body = {
        workflow: { ...workflow, analysis },
        config: override || config,
        options: analysis,
      };
      const compiled = await request<{ config: Config; options: Analysis }>(
        "validateWorkflow",
        body,
      );
      await request("saveWorkflow", {
        workflow: body.workflow,
        session_id: project.session_id,
      });
      updateConfig(compiled.config);
      setAnalysis((previous) => ({
        ...previous,
        methods: compiled.options.methods,
      }));
      setLiveFrame(null);
      setRun(null);
      setEditor("live");
      setJob(await request<Job>("runWorkflow", body));
      log(
        "Workflow started: real source dynamics, propagation, RF and selected PAM methods.",
      );
    });
  const reconstruct = () =>
    perform(async () => {
      if (!run) return;
      setJob(
        await request<Job>("reconstruct", {
          input_run_id: run.id,
          options:
            config?.coupling && analysis.atp_timing_known
              ? {
                  ...analysis,
                  atp_emission_s:
                    analysis.atp_emission_s +
                    ((
                      run.provenance.simulation as {
                        coupling?: { source_delay_s?: number };
                      }
                    )?.coupling?.source_delay_s || 0),
                }
              : analysis,
          config,
        }),
      );
      log("Reconstruction started.");
    });
  const cancel = () =>
    perform(async () => {
      setJob(await request<Job>("cancel"));
      log("Cancellation requested.", "warning");
    });
  const activateRun = useCallback((value: Run, view?: Editor) => {
    setRun((previous) => (previous?.id === value.id ? previous : value));
    if (view) setEditor(view);
  }, []);
  const selectRun = (id: string, view?: Editor) =>
    perform(async () => {
      const value = await request<Run>("run", id);
      activateRun(value, view || (value.status === "complete" ? "map" : "rf"));
    });
  const exportBundle = (includeRaw: boolean) =>
    perform(async () => {
      if (!run) return;
      const result = await window.pam.exportBundle(run.id, includeRaw);
      if (result) log(`Exported ${result.zip_path}\nSHA-256 ${result.sha256}`);
    });
  const importBundle = () =>
    perform(async () => {
      const value = await window.pam.importBundle();
      if (value) {
        setRun(value);
        setRuns(await request<RunSummary[]>("runs"));
        setEditor("map");
        log(`Imported run ${value.id.slice(0, 8)}.`);
      }
    });
  const exportRF = (kind: "csv" | "h5") =>
    perform(async () => {
      if (!run) return;
      const result = await window.pam.exportRF(
        run.id,
        kind,
        Math.min(channel, run.config.channels - 1),
        conditioned ? "processed" : "raw",
      );
      if (result) log(`Exported ${result.path}`);
    });
  const loadRunConfig = () =>
    perform(async () => {
      if (run) {
        const restored = restoreRunDraft(run);
        updateConfig(restored.config);
        setAnalysis(restored.analysis);
        setWorkflow(restored.workflow);
        setEditor("workflow");
        log(
          "Loaded saved physical settings, raw analysis timing and method parameters into the draft." +
            (restored.workflow_rebuilt
              ? " The diagram was rebuilt to match the methods actually calculated."
              : ""),
        );
      }
    });
  const storedAnalysis = useMemo(() => {
    try {
      return run ? rawRunAnalysis(run) : null;
    } catch {
      return null;
    }
  }, [run]);
  useEffect(() => {
    setBubbleSource(0);
  }, [run?.id]);
  useEffect(() => {
    setBubbleData(null);
    if (!run?.config.bubble || !["simulated", "complete"].includes(run.status))
      return;
    let active = true;
    window.pam
      .array(
        run.id,
        "bubble",
        Math.min(bubbleSource, run.config.sources.length - 1),
      )
      .then((a) => {
        if (active)
          setBubbleData({
            runId: run.id,
            source: Math.min(bubbleSource, run.config.sources.length - 1),
            array: a,
          });
      })
      .catch((e) => {
        if (active) log(String(e), "error");
      });
    return () => {
      active = false;
    };
  }, [run, bubbleSource, log]);
  return {
    peakSettings,
    setPeakSettings,
    peakReport:
      peakReport?.run_id === run?.id &&
      stableJSON(peakReport?.settings.peaks) === stableJSON(peakSettings)
        ? peakReport
        : null,
    dspResponse,
    ctMask,
    signal,
    setSignal,
    conditioned,
    workflow,
    setWorkflow,
    runWorkflow,
    liveFrame,
    movie,
    bubbleTrace,
    bubbleSource,
    setBubbleSource,
    trackJob: setJob,
    backends,
    config,
    updateConfig,
    editConfig,
    editAnalysis,
    beginGesture: () => {
      gesture.current = { active: true, recorded: false };
    },
    endGesture: () => {
      gesture.current.active = false;
    },
    analysis,
    setAnalysis,
    registry,
    project,
    runs,
    run,
    editor,
    setEditor,
    ready,
    pending,
    job,
    busy,
    locked,
    draftStatus,
    error,
    setError,
    messages,
    setMessages,
    log,
    rf,
    rawRF,
    trace,
    spectrum,
    maps,
    channel,
    setChannel,
    method,
    setMethod,
    arraysLoading: arraysLoading || signalLoading,
    undo,
    redo,
    canUndo: !!history.current.past.length,
    canRedo: !!history.current.future.length,
    openProject,
    save,
    preset,
    simulate,
    reconstruct,
    cancel,
    selectRun,
    activateRun,
    exportBundle,
    importBundle,
    exportRF,
    loadRunConfig,
    draftDiffers:
      !!config && !!run && stableJSON(config) !== stableJSON(run.config),
    captureChanged:
      !!config &&
      !!run &&
      stableJSON(captureConfig(config)) !==
        stableJSON(captureConfig(run.config)),
    analysisDiffers:
      !!storedAnalysis && !sameAnalysis(analysis, storedAnalysis),
  };
}
export type Workbench = ReturnType<typeof useWorkbench>;
