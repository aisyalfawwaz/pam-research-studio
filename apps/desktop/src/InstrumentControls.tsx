import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { methodKeys, methodLabels } from "../../../packages/contracts";
import type { Analysis, Config } from "../../../packages/contracts";
import { ArrayEditor } from "./ArrayEditor";
import { ApertureMask } from "./ApertureMask";
import { DSPControls } from "./DSPControls";
import { selectBackend } from "../../../packages/workspace";
import type { Pipeline } from "../../../packages/contracts/workflow";

function numericText(value: number) {
  return Number(value.toPrecision(12)).toString();
}
export function NumericProperty({
  label,
  value,
  unit = "",
  onChange,
  step = "any",
  min,
  max,
  disabled = false,
  accessibleLabel,
}: {
  label: string;
  value: number;
  unit?: string;
  onChange: (v: number) => void;
  step?: number | "any";
  min?: number;
  max?: number;
  disabled?: boolean;
  accessibleLabel?: string;
}) {
  const id = useId();
  const [text, setText] = useState(() => numericText(value));
  useEffect(() => setText(numericText(value)), [value]);
  return (
    <div className="property-row">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        value={text}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        aria-label={accessibleLabel || `${label}${unit ? ` (${unit})` : ""}`}
        onChange={(event) => {
          setText(event.target.value);
          if (
            event.target.value !== "" &&
            Number.isFinite(event.target.valueAsNumber)
          )
            onChange(event.target.valueAsNumber);
        }}
        onBlur={() => {
          if (text === "" || !Number.isFinite(Number(text)))
            setText(numericText(value));
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setText(numericText(value));
            event.currentTarget.blur();
            event.stopPropagation();
          }
        }}
      />
      <span className="property-unit">{unit}</span>
    </div>
  );
}
export function SelectProperty({
  label,
  value,
  onChange,
  children,
}: React.PropsWithChildren<{
  label: string;
  value: string;
  onChange: (v: string) => void;
}>) {
  const id = useId();
  return (
    <div className="property-row select-property">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </div>
  );
}
function Group({
  title,
  children,
  open = true,
  focusToken = 0,
}: React.PropsWithChildren<{
  title: string;
  open?: boolean;
  focusToken?: number;
}>) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (focusToken && ref.current) {
      ref.current.open = true;
      ref.current.scrollIntoView({ block: "start" });
    }
  }, [focusToken]);
  return (
    <details ref={ref} className="property-group" open={open}>
      <summary>
        <ChevronDown size={12} />
        {title}
      </summary>
      <div>{children}</div>
    </details>
  );
}
export function Inspector({
  focus,
  selectedArray = 0,
  onSelectArray = () => {},
  backends,
  cfg,
  onChange,
  analysis,
  onAnalysis,
  source,
  onSource,
  disabled,
  draftStatus,
  category: tab,
  onCategory: setTab,
  sourceFocus = 0,
}: {
  focus?: { kind: string; token: number };
  selectedArray?: number;
  onSelectArray?: (i: number) => void;
  backends: import("../../../packages/contracts").BackendInfo[];
  cfg: Config;
  onChange: (cfg: Config) => void;
  analysis: Analysis;
  onAnalysis: (options: Analysis) => void;
  source: number;
  onSource: (i: number) => void;
  disabled: boolean;
  draftStatus: string;
  category: "model" | "analysis";
  onCategory: (category: "model" | "analysis") => void;
  sourceFocus?: number;
}) {
  const change = <K extends keyof Config>(key: K, value: Config[K]) =>
    onChange({ ...cfg, [key]: value });
  const focusFor = (kind: string) => (focus?.kind === kind ? focus.token : 0);
  const option = <K extends keyof Analysis>(key: K, value: Analysis[K]) =>
    onAnalysis({ ...analysis, [key]: value });
  const selected = Math.min(source, cfg.sources.length - 1),
    emitter = cfg.sources[selected];
  const scroll = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 0;
  }, [tab]);
  const editSource = <K extends keyof Config["sources"][number]>(
    key: K,
    value: Config["sources"][number][K],
  ) =>
    change(
      "sources",
      cfg.sources.map((s, i) => (i === selected ? { ...s, [key]: value } : s)),
    );
  return (
    <>
      <div className="dock-title">
        <span>Properties</span>
        <span className="dock-subtitle">
          {tab === "model" ? "Scene" : "Reconstruction"}
        </span>
      </div>
      <div
        className="property-tabs"
        role="tablist"
        aria-label="Property category"
      >
        <button
          role="tab"
          aria-selected={tab === "model"}
          onClick={() => setTab("model")}
        >
          Model
        </button>
        <button
          role="tab"
          aria-selected={tab === "analysis"}
          onClick={() => setTab("analysis")}
        >
          Analysis
        </button>
      </div>
      <div className="property-scroll" ref={scroll}>
        <fieldset disabled={disabled}>
          {tab === "model" ? (
            <>
              <Group title="Simulation backend" focusToken={focusFor("jwave")}>
                <SelectProperty
                  label="Solver"
                  value={
                    cfg.coupling
                      ? "coupled"
                      : cfg.simulation
                        ? "jwave"
                        : cfg.bubble
                          ? "jbubble"
                          : "analytic"
                  }
                  onChange={(v) => onChange(selectBackend(cfg, v as Pipeline))}
                >
                  <option value="analytic">Analytic · straight ray</option>
                  <option
                    value="coupled"
                    disabled={
                      !backends.find((b) => b.id === "jwave")?.ready ||
                      !backends.find((b) => b.id === "jbubble")?.ready
                    }
                  >
                    jBubble → j-Wave
                  </option>
                  <option
                    value="jwave"
                    disabled={!backends.find((b) => b.id === "jwave")?.ready}
                  >
                    j-Wave · 2D full wave
                  </option>
                  <option
                    value="jbubble"
                    disabled={!backends.find((b) => b.id === "jbubble")?.ready}
                  >
                    jBubble · 3D monopole RF
                  </option>
                </SelectProperty>
                <p className="property-note">
                  {backends.length === 0
                    ? "Detecting optional runtimes…"
                    : cfg.simulation
                      ? backends.find((b) => b.id === "jwave")?.message
                      : cfg.bubble
                        ? backends.find((b) => b.id === "jbubble")?.message
                        : "Straight-ray reference. Optional j-Wave and jBubble appear here when their isolated runtimes are ready."}
                </p>
                {cfg.simulation ? (
                  <>
                    <div className="read-property">
                      <span>Runtime</span>
                      <span>j-Wave 0.2.1 · CPU</span>
                    </div>
                    <NumericProperty
                      label="Propagation spacing"
                      unit="mm"
                      value={cfg.simulation.spacing_m * 1000}
                      min={0.05}
                      max={2}
                      step={0.025}
                      onChange={(v) =>
                        change("simulation", {
                          ...cfg.simulation!,
                          spacing_m: v / 1000,
                        })
                      }
                    />
                    <NumericProperty
                      label="CFL limit"
                      value={cfg.simulation.cfl}
                      min={0.1}
                      max={0.5}
                      step={0.05}
                      onChange={(v) =>
                        change("simulation", { ...cfg.simulation!, cfl: v })
                      }
                    />
                    <NumericProperty
                      label="PML thickness"
                      unit="cells"
                      value={cfg.simulation.pml_cells}
                      min={12}
                      max={40}
                      step={1}
                      onChange={(v) =>
                        change("simulation", {
                          ...cfg.simulation!,
                          pml_cells: v,
                        })
                      }
                    />
                    <NumericProperty
                      label="Density"
                      unit="kg/m³"
                      value={cfg.simulation.density_kg_m3}
                      min={500}
                      max={3000}
                      step={10}
                      onChange={(v) =>
                        change("simulation", {
                          ...cfg.simulation!,
                          density_kg_m3: v,
                        })
                      }
                    />
                    <p className="property-note">
                      Experimental 2D linear acoustics with absorbing
                      boundaries. Sources and receivers use bilinear
                      interpolation. The propagation grid is independent of the
                      reconstruction grid.
                    </p>
                  </>
                ) : null}
              </Group>
              {cfg.coupling ? (
                <Group
                  title="Volume-flow coupling"
                  focusToken={focusFor("coupler")}
                >
                  <NumericProperty
                    label="Equivalent out-of-plane length"
                    unit="mm"
                    value={cfg.coupling.effective_length_m * 1000}
                    min={0.01}
                    max={100}
                    step={0.1}
                    onChange={(v) =>
                      change("coupling", {
                        ...cfg.coupling!,
                        effective_length_m: v / 1000,
                      })
                    }
                  />
                  <NumericProperty
                    label="Source passband"
                    unit="MHz"
                    value={cfg.coupling.passband_hz / 1e6}
                    min={0.1}
                    max={10}
                    step={0.1}
                    onChange={(v) =>
                      change("coupling", {
                        ...cfg.coupling!,
                        passband_hz: v * 1e6,
                      })
                    }
                  />
                  <p className="property-note">
                    Q = 4πR²Ṙ. Conservative 2D mass injection with an explicit
                    equivalent line length and 80 dB FIR low-pass. One-way
                    source coupling; no acoustic feedback.
                  </p>
                </Group>
              ) : null}
              {cfg.bubble ? (
                <Group title="Bubble dynamics" focusToken={focusFor("bubble")}>
                  <SelectProperty
                    label="Bubble model"
                    value={cfg.bubble.model}
                    onChange={(v) =>
                      change("bubble", {
                        ...cfg.bubble!,
                        model: v as "free" | "lipid",
                      })
                    }
                  >
                    <option value="lipid">Lipid · smooth Marmottant</option>
                    <option value="free">Free · no shell</option>
                  </SelectProperty>
                  <div className="read-property">
                    <span>Equation</span>
                    <span>Keller–Miksis</span>
                  </div>
                  <NumericProperty
                    label="Equilibrium radius"
                    unit="µm"
                    value={cfg.bubble.radius_m * 1e6}
                    min={0.5}
                    max={10}
                    step={0.1}
                    onChange={(v) =>
                      change("bubble", { ...cfg.bubble!, radius_m: v / 1e6 })
                    }
                  />
                  <NumericProperty
                    label="Drive pressure"
                    unit="kPa"
                    value={cfg.bubble.drive_pa / 1000}
                    min={0}
                    max={300}
                    step={10}
                    onChange={(v) =>
                      change("bubble", { ...cfg.bubble!, drive_pa: v * 1000 })
                    }
                  />
                  <NumericProperty
                    label="Liquid viscosity"
                    unit="mPa·s"
                    value={cfg.bubble.viscosity_pa_s * 1000}
                    min={0.1}
                    max={10}
                    step={0.1}
                    onChange={(v) =>
                      change("bubble", {
                        ...cfg.bubble!,
                        viscosity_pa_s: v / 1000,
                      })
                    }
                  />
                  <NumericProperty
                    label="Ringdown"
                    unit="cycles"
                    value={cfg.bubble.ringdown_cycles}
                    min={2}
                    max={40}
                    step={1}
                    onChange={(v) =>
                      change("bubble", { ...cfg.bubble!, ringdown_cycles: v })
                    }
                  />
                  <NumericProperty
                    label="ODE relative tolerance"
                    value={cfg.bubble.rtol}
                    min={1e-10}
                    max={1e-5}
                    onChange={(v) =>
                      change("bubble", { ...cfg.bubble!, rtol: v })
                    }
                  />
                  <p className="property-note">
                    Default bubble settings apply unless a source overrides
                    them. Source amplitude is a coherent emission weight.
                    Homogeneous 3D propagation is selected by the model. No
                    bubble-to-bubble interactions.
                  </p>
                </Group>
              ) : null}
              <Group title="Medium" focusToken={focusFor("scene")}>
                <NumericProperty
                  label="Sound speed"
                  unit="m/s"
                  value={cfg.sound_speed_m_s}
                  min={300}
                  max={3000}
                  step={10}
                  onChange={(v) => change("sound_speed_m_s", v)}
                />
                <div className="read-property">
                  <span>Propagation</span>
                  <span>Homogeneous</span>
                </div>
                <div className="read-property">
                  <span>Coordinates</span>
                  <span>x, z (2D)</span>
                </div>
              </Group>
              <Group title="Receive array" focusToken={focusFor("probe")}>
                <ArrayEditor
                  cfg={cfg}
                  onChange={onChange}
                  selected={selectedArray}
                  onSelect={onSelectArray}
                />
                <NumericProperty
                  label="Channels"
                  disabled={!!cfg.arrays}
                  value={cfg.channels}
                  min={4}
                  max={1024}
                  step={1}
                  onChange={(v) => change("channels", v)}
                />
                {!cfg.arrays ? (
                  <>
                    <NumericProperty
                      label="Pitch"
                      disabled={!!cfg.arrays}
                      unit="mm"
                      value={cfg.pitch_m * 1000}
                      min={0.05}
                      max={2}
                      step={0.05}
                      onChange={(v) => change("pitch_m", v / 1000)}
                    />
                    <div className="read-property">
                      <span>Aperture</span>
                      <span>
                        {((cfg.channels - 1) * cfg.pitch_m * 1000).toFixed(2)}{" "}
                        mm
                      </span>
                    </div>
                    <div className="read-property">
                      <span>Array origin</span>
                      <span>x = 0; z = 0 mm</span>
                    </div>
                  </>
                ) : null}
              </Group>
              <Group title="Acquisition">
                <NumericProperty
                  label="Sample rate"
                  unit="MHz"
                  value={cfg.sampling_hz / 1e6}
                  min={1}
                  max={100}
                  step={1}
                  onChange={(v) => change("sampling_hz", v * 1e6)}
                />
                <NumericProperty
                  label="Samples"
                  value={cfg.samples}
                  min={512}
                  max={Math.min(16384, Math.floor(8_388_608 / cfg.channels))}
                  step={512}
                  onChange={(v) => change("samples", v)}
                />
                <NumericProperty
                  label="Time origin"
                  unit="µs"
                  value={cfg.capture_t0_s * 1e6}
                  min={-100}
                  max={100}
                  step={0.1}
                  onChange={(v) => change("capture_t0_s", v / 1e6)}
                />
                <div className="read-property">
                  <span>Record length</span>
                  <span>
                    {((cfg.samples / cfg.sampling_hz) * 1e6).toFixed(2)} µs
                  </span>
                </div>
              </Group>
              <Group
                title={cfg.bubble ? "Bubble drive" : "Source waveform"}
                focusToken={focusFor("drive") || focusFor("analytic_source")}
              >
                {cfg.bubble ? (
                  <div className="read-property">
                    <span>Waveform</span>
                    <span>Hann sine burst</span>
                  </div>
                ) : (
                  <SelectProperty
                    label="Waveform"
                    value={cfg.emission_kind}
                    onChange={(v) =>
                      onChange({
                        ...cfg,
                        emission_kind: v as Config["emission_kind"],
                        gate_stride: v === "broadband" ? 1 : cfg.gate_stride,
                      })
                    }
                  >
                    <option value="pulse">Gaussian pulse</option>
                    <option value="harmonic">Hann-windowed tone</option>
                    <option value="broadband" disabled={!!cfg.simulation}>
                      Broadband pulse
                    </option>
                  </SelectProperty>
                )}
                <NumericProperty
                  label="Centre frequency"
                  unit="MHz"
                  value={cfg.frequency_hz / 1e6}
                  min={0.1}
                  max={10}
                  step={0.1}
                  onChange={(v) => change("frequency_hz", v * 1e6)}
                />
                <NumericProperty
                  label="Pulse duration"
                  unit="µs"
                  value={cfg.duration_s * 1e6}
                  min={1}
                  max={20}
                  step={0.1}
                  onChange={(v) => change("duration_s", v / 1e6)}
                />
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={cfg.spreading}
                    disabled={!!cfg.simulation || !!cfg.bubble}
                    onChange={(e) => change("spreading", e.target.checked)}
                  />
                  1/r spreading and compensation
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={cfg.bandpass_hz !== null}
                    disabled={!!cfg.bubble}
                    onChange={(e) =>
                      change(
                        "bandpass_hz",
                        e.target.checked ? [0.5e6, 1.5e6] : null,
                      )
                    }
                  />
                  Source bandpass
                </label>
                {cfg.bandpass_hz ? (
                  <>
                    <NumericProperty
                      label="Low cutoff"
                      unit="MHz"
                      value={cfg.bandpass_hz[0] / 1e6}
                      onChange={(v) =>
                        change("bandpass_hz", [v * 1e6, cfg.bandpass_hz![1]])
                      }
                    />
                    <NumericProperty
                      label="High cutoff"
                      unit="MHz"
                      value={cfg.bandpass_hz[1] / 1e6}
                      onChange={(v) =>
                        change("bandpass_hz", [cfg.bandpass_hz![0], v * 1e6])
                      }
                    />
                  </>
                ) : null}
              </Group>
              <Group title={`Source ${selected + 1}`} focusToken={sourceFocus}>
                <SelectProperty
                  label="Selected source"
                  value={String(selected)}
                  onChange={(v) => onSource(Number(v))}
                >
                  {cfg.sources.map((_, i) => (
                    <option key={i} value={i}>
                      S{i + 1}
                    </option>
                  ))}
                </SelectProperty>
                <NumericProperty
                  label="Lateral x"
                  accessibleLabel={`Source ${selected + 1} x (mm)`}
                  unit="mm"
                  value={emitter.x_m * 1000}
                  step={0.1}
                  onChange={(v) => editSource("x_m", v / 1000)}
                />
                <NumericProperty
                  label="Depth z"
                  accessibleLabel={`Source ${selected + 1} z (mm)`}
                  unit="mm"
                  value={emitter.z_m * 1000}
                  step={0.1}
                  onChange={(v) => editSource("z_m", v / 1000)}
                />
                <NumericProperty
                  label="Emission centre"
                  unit="µs"
                  value={emitter.emission_s * 1e6}
                  step={0.1}
                  onChange={(v) => editSource("emission_s", v / 1e6)}
                />
                <NumericProperty
                  label="Amplitude"
                  unit={cfg.bubble ? "weight" : "a.u."}
                  value={emitter.amplitude}
                  step={0.1}
                  onChange={(v) => editSource("amplitude", v)}
                />
                {cfg.bubble ? (
                  <>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={!!emitter.bubble}
                        onChange={(e) =>
                          editSource(
                            "bubble",
                            e.target.checked ? { ...cfg.bubble! } : undefined,
                          )
                        }
                      />
                      Independent bubble parameters
                    </label>
                    {emitter.bubble ? (
                      <>
                        <SelectProperty
                          label="Source shell model"
                          value={emitter.bubble.model}
                          onChange={(v) =>
                            editSource("bubble", {
                              ...emitter.bubble!,
                              model: v as "free" | "lipid",
                            })
                          }
                        >
                          <option value="lipid">
                            Lipid · smooth Marmottant
                          </option>
                          <option value="free">Free bubble</option>
                        </SelectProperty>
                        <NumericProperty
                          label="Source radius"
                          unit="µm"
                          value={emitter.bubble.radius_m * 1e6}
                          min={0.5}
                          max={10}
                          onChange={(v) =>
                            editSource("bubble", {
                              ...emitter.bubble!,
                              radius_m: v * 1e-6,
                            })
                          }
                        />
                        <NumericProperty
                          label="Source drive"
                          unit="kPa"
                          value={emitter.bubble.drive_pa / 1000}
                          min={0}
                          max={300}
                          onChange={(v) =>
                            editSource("bubble", {
                              ...emitter.bubble!,
                              drive_pa: v * 1000,
                            })
                          }
                        />
                        <NumericProperty
                          label="Source viscosity"
                          unit="mPa·s"
                          value={emitter.bubble.viscosity_pa_s * 1000}
                          min={0.1}
                          max={10}
                          onChange={(v) =>
                            editSource("bubble", {
                              ...emitter.bubble!,
                              viscosity_pa_s: v / 1000,
                            })
                          }
                        />
                        <NumericProperty
                          label="Source ringdown"
                          unit="cycles"
                          value={emitter.bubble.ringdown_cycles}
                          min={2}
                          max={40}
                          step={1}
                          onChange={(v) =>
                            editSource("bubble", {
                              ...emitter.bubble!,
                              ringdown_cycles: v,
                            })
                          }
                        />
                        <p className="property-note">
                          Independent radial solve at this source; shared
                          frequency and host medium. No bubble–bubble feedback.
                          RF normalization uses the default bubble drive for
                          every source.
                        </p>
                      </>
                    ) : (
                      <p className="property-note">
                        Uses the default bubble model above.
                      </p>
                    )}
                  </>
                ) : null}
                <div className="property-actions">
                  <button
                    disabled={cfg.sources.length >= 8}
                    onClick={() => {
                      change("sources", [
                        ...cfg.sources,
                        { ...emitter, x_m: emitter.x_m + 0.003 },
                      ]);
                      onSource(cfg.sources.length);
                    }}
                  >
                    <Plus size={13} />
                    Add source
                  </button>
                  <button
                    disabled={cfg.sources.length === 1}
                    onClick={() => {
                      change(
                        "sources",
                        cfg.sources.filter((_, i) => i !== selected),
                      );
                      onSource(Math.max(0, selected - 1));
                    }}
                  >
                    <Trash2 size={13} />
                    Remove
                  </button>
                </div>
              </Group>
              <Group title="Noise">
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={cfg.snr_db !== null}
                    onChange={(e) =>
                      change("snr_db", e.target.checked ? 30 : null)
                    }
                  />
                  Add Gaussian noise
                </label>
                <NumericProperty
                  label="SNR"
                  unit="dB"
                  value={cfg.snr_db ?? 30}
                  disabled={cfg.snr_db === null}
                  min={-10}
                  max={100}
                  step={1}
                  onChange={(v) => change("snr_db", v)}
                />
                <NumericProperty
                  label="Random seed"
                  value={cfg.seed}
                  min={0}
                  step={1}
                  onChange={(v) => change("seed", v)}
                />
                <p className="property-note">
                  SNR uses the clean full-record RMS.
                </p>
              </Group>
            </>
          ) : (
            <>
              <Group title="Receive propagation">
                <SelectProperty
                  label="Receive delay model"
                  value={analysis.receive_model || "homogeneous"}
                  onChange={(v) =>
                    option("receive_model", v as Analysis["receive_model"])
                  }
                >
                  <option value="homogeneous">Homogeneous · distance/c</option>
                  <option value="ct_slowness" disabled={!cfg.ct}>
                    CT · straight-ray slowness
                  </option>
                </SelectProperty>
                {analysis.receive_model === "ct_slowness" ? (
                  <>
                    <NumericProperty
                      label="Ray quadrature step"
                      unit="mm"
                      min={0.05}
                      max={2}
                      value={analysis.ray_step_m * 1000}
                      onChange={(v) => option("ray_step_m", v / 1000)}
                    />
                    <p className="property-note">
                      Integrates 1/c along fixed rays through saved HU.
                      Experimental; no ray bending, diffraction, shear or
                      multipath correction. Compare with homogeneous delays on
                      the same RF.
                    </p>
                  </>
                ) : null}
                {analysis.assumed_sound_speed_m_s != null ||
                analysis.assumed_receiver_offsets_m ? (
                  <div className="property-note">
                    This run retains a recorded nominal calibration from an
                    uncertainty study. Actual capture geometry remains in the
                    run.
                    <button
                      type="button"
                      onClick={() => {
                        const {
                          assumed_sound_speed_m_s: _speed,
                          assumed_receiver_offsets_m: _offsets,
                          ...actual
                        } = analysis;
                        onAnalysis(actual);
                      }}
                    >
                      Use actual capture calibration
                    </button>
                  </div>
                ) : null}
              </Group>
              <Group title="Methods">
                <div className="method-checks">
                  {methodKeys.map((key) => (
                    <label className="check-row" key={key}>
                      <input
                        type="checkbox"
                        checked={analysis.methods.includes(key)}
                        onChange={(e) =>
                          option(
                            "methods",
                            e.target.checked
                              ? [...analysis.methods, key]
                              : analysis.methods.filter((k) => k !== key),
                          )
                        }
                      />
                      <span>{methodLabels[key]}</span>
                      <small>
                        {key === "das"
                          ? "Peak power"
                          : key === "tea"
                            ? "Exposure"
                            : key === "cf"
                              ? "Coherence"
                              : key === "rcb"
                                ? "Adaptive"
                                : "Time-gated"}
                      </small>
                    </label>
                  ))}
                </div>
                <div className="property-actions">
                  <button onClick={() => option("methods", [...methodKeys])}>
                    Select all
                  </button>
                  <button onClick={() => option("methods", ["das"])}>
                    DAS only
                  </button>
                </div>
              </Group>
              <Group
                title="RF conditioning · SciPy"
                focusToken={focusFor("dsp")}
              >
                <DSPControls cfg={cfg} onChange={onChange} />
              </Group>
              <Group title="Reconstruction grid">
                <NumericProperty
                  label="Grid size per axis"
                  value={cfg.grid_n}
                  min={17}
                  max={192}
                  step={1}
                  onChange={(v) => change("grid_n", v)}
                />
                <NumericProperty
                  label="x minimum"
                  unit="mm"
                  value={cfg.grid_x_min_m * 1000}
                  step={1}
                  onChange={(v) => change("grid_x_min_m", v / 1000)}
                />
                <NumericProperty
                  label="x maximum"
                  unit="mm"
                  value={cfg.grid_x_max_m * 1000}
                  step={1}
                  onChange={(v) => change("grid_x_max_m", v / 1000)}
                />
                <NumericProperty
                  label="z minimum"
                  unit="mm"
                  value={cfg.grid_z_min_m * 1000}
                  step={1}
                  onChange={(v) => change("grid_z_min_m", v / 1000)}
                />
                <NumericProperty
                  label="z maximum"
                  unit="mm"
                  value={cfg.grid_z_max_m * 1000}
                  step={1}
                  onChange={(v) => change("grid_z_max_m", v / 1000)}
                />
                <div className="read-property">
                  <span>Grid spacing (x, z)</span>
                  <span>
                    {(
                      ((cfg.grid_x_max_m - cfg.grid_x_min_m) /
                        (cfg.grid_n - 1)) *
                      1000
                    ).toFixed(3)}
                    ,{" "}
                    {(
                      ((cfg.grid_z_max_m - cfg.grid_z_min_m) /
                        (cfg.grid_n - 1)) *
                      1000
                    ).toFixed(3)}{" "}
                    mm
                  </span>
                </div>
              </Group>
              <Group title="Emission-time gate">
                <NumericProperty
                  label="Gate start"
                  unit="µs"
                  value={cfg.gate_start_s * 1e6}
                  step={0.1}
                  onChange={(v) => change("gate_start_s", v / 1e6)}
                />
                <NumericProperty
                  label="Gate end"
                  unit="µs"
                  value={cfg.gate_end_s * 1e6}
                  step={0.1}
                  onChange={(v) => change("gate_end_s", v / 1e6)}
                />
                <NumericProperty
                  label="Gate stride"
                  accessibleLabel="Gate stride (samples)"
                  unit="samples"
                  value={cfg.gate_stride}
                  min={1}
                  max={16}
                  step={1}
                  onChange={(v) => change("gate_stride", v)}
                />
                <p className="property-note">
                  Source time; receive delays are added per candidate.
                </p>
              </Group>
              {analysis.methods.includes("cf") ? (
                <Group title="CF weighting">
                  <NumericProperty
                    label="Amplitude exponent"
                    value={analysis.cf_exponent}
                    min={0}
                    max={4}
                    step={0.25}
                    onChange={(v) => option("cf_exponent", v)}
                  />
                  <p className="property-note">
                    CF = |Σy|² / (M Σ|y|²). Exponent 0 recovers DAS.
                  </p>
                </Group>
              ) : null}
              {analysis.methods.includes("rcb") ? (
                <Group title="RCB — spherical uncertainty">
                  <NumericProperty
                    label="Relative radius"
                    value={analysis.rcb_radius}
                    min={0}
                    max={0.95}
                    step={0.01}
                    onChange={(v) => option("rcb_radius", v)}
                  />
                  <NumericProperty
                    label="Numerical loading"
                    value={analysis.rcb_loading}
                    min={1e-8}
                    max={0.1}
                    step={0.001}
                    onChange={(v) => option("rcb_loading", v)}
                  />
                  <NumericProperty
                    label="Subarray length"
                    unit="ch"
                    value={analysis.rcb_subarray}
                    min={2}
                    max={64}
                    step={1}
                    onChange={(v) => option("rcb_subarray", v)}
                  />
                  <p className="property-note">
                    Analytic covariance with spatial smoothing. Steering
                    uncertainty is solved independently of numerical loading.
                  </p>
                </Group>
              ) : null}
              {analysis.methods.includes("atp") ? (
                <Group title="ATP timing">
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={analysis.atp_timing_known}
                      onChange={(e) =>
                        option("atp_timing_known", e.target.checked)
                      }
                    />
                    Emission / excitation time is known
                  </label>
                  <SelectProperty
                    label="Timing model"
                    value={analysis.atp_mode}
                    onChange={(v) =>
                      option("atp_mode", v as Analysis["atp_mode"])
                    }
                  >
                    <option value="emission">Known emission</option>
                    <option value="plane_wave">Axial plane wave</option>
                  </SelectProperty>
                  <NumericProperty
                    label={
                      analysis.atp_mode === "emission"
                        ? cfg.coupling
                          ? "Drive-time centre"
                          : "Emission centre"
                        : "Trigger centre"
                    }
                    unit="µs"
                    value={analysis.atp_emission_s * 1e6}
                    step={0.1}
                    onChange={(v) => option("atp_emission_s", v / 1e6)}
                  />
                  {cfg.coupling ? (
                    <p className="property-note">
                      Coupled runs apply the causal source-filter delay to this
                      drive/trigger clock. The effective injected-emission
                      window is recorded with each result.
                    </p>
                  ) : null}
                  <NumericProperty
                    label="Timing window"
                    unit="µs"
                    value={analysis.atp_window_s * 1e6}
                    step={0.1}
                    onChange={(v) => option("atp_window_s", v / 1e6)}
                  />
                  {analysis.atp_mode === "plane_wave" ? (
                    <NumericProperty
                      label="Reference plane z"
                      unit="mm"
                      value={analysis.atp_plane_z_m * 1000}
                      step={1}
                      onChange={(v) => option("atp_plane_z_m", v / 1000)}
                    />
                  ) : null}
                  <p className="property-note">
                    Short pulse required (≤ 5 cycles). The timing window is
                    independent of the broad emission-time gate.
                  </p>
                </Group>
              ) : null}
              <Group title="Receive aperture" open={false}>
                <ApertureMask cfg={cfg} onChange={onChange} />
              </Group>
            </>
          )}
        </fieldset>
        {draftStatus.startsWith("Invalid") ? (
          <div className="property-validation" role="status">
            {draftStatus}
          </div>
        ) : null}
      </div>
      <div className="property-footer">
        Values shown in mm, µs and MHz; stored in SI.
      </div>
    </>
  );
}
