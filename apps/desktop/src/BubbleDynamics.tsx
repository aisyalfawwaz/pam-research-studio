import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Play, Pause, SkipBack, StepBack, StepForward } from "lucide-react";
import type { BinaryArray, Run } from "../../../packages/contracts";
import {
  advanceBubbleTime,
  bubbleFrame,
  bubbleTrajectory,
  firstShellCrossing,
  radialMotion,
  savedShellLaw,
  shellRegime,
  surfaceTension,
} from "../../../packages/bubbleDynamics";
import type {
  BubbleFrame,
  BubbleTrajectory,
  ShellLaw,
} from "../../../packages/bubbleDynamics";
import { LinePlot } from "./plots";

function BubbleSection({
  curve,
  frame,
  run,
  law,
}: {
  curve: BubbleTrajectory;
  frame: BubbleFrame;
  run: Run;
  law: ShellLaw | null;
}) {
  const id = useId().replace(/:/g, ""),
    r0 = run.config.bubble!.radius_m;
  const extent = Math.max(curve.maxRadius_m, r0, law?.rupture_m || 0) * 1.28;
  const scale = 133 / extent,
    r = frame.radius_m * scale;
  const regime = shellRegime(
    frame.radius_m,
    law,
    run.config.bubble!.model === "lipid",
  );
  const color =
    regime === "Shell rupture regime"
      ? "#c16b27"
      : regime === "Buckled regime"
        ? "#6656a6"
        : "#22799a";
  const moving =
    Math.abs(frame.velocity_m_s) > Math.max(1e-9, curve.maxVelocity_m_s * 1e-4);
  const arrowLength =
    12 +
    17 *
      Math.min(1, Math.abs(frame.velocity_m_s) / (curve.maxVelocity_m_s || 1));
  const bar_m = 10 ** Math.floor(Math.log10(extent * 0.6));
  return (
    <svg
      viewBox="0 0 380 345"
      role="img"
      aria-label="Simulated bubble cross-section"
      className="bubble-section"
    >
      <defs>
        <radialGradient id={`${id}-gas`} cx="32%" cy="25%" r="80%">
          <stop offset="0" stopColor="#f5fbff" />
          <stop offset="0.58" stopColor="#d1e8f3" />
          <stop offset="0.88" stopColor="#8eb8cf" />
          <stop offset="1" stopColor="#437a9b" />
        </radialGradient>
        <marker
          id={`${id}-arrow`}
          viewBox="0 0 6 6"
          refX="5"
          refY="3"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L6,3 L0,6" fill={color} />
        </marker>
      </defs>
      <line x1="24" x2="356" y1="165" y2="165" className="bubble-axis" />
      <line x1="190" x2="190" y1="12" y2="318" className="bubble-axis" />
      <circle cx="190" cy="165" r={r0 * scale} className="bubble-equilibrium" />
      {law ? (
        <circle
          cx="190"
          cy="165"
          r={law.rupture_m * scale}
          className="bubble-rupture-guide"
        />
      ) : null}
      <circle
        cx="190"
        cy="165"
        r={r}
        fill={`url(#${id}-gas)`}
        stroke={color}
        strokeWidth="2.5"
        data-testid="bubble-boundary"
        data-radius-m={frame.radius_m}
        data-motion={radialMotion(frame, curve)}
        data-shell-regime={regime}
      />
      {run.config.bubble!.model === "lipid" ? (
        <circle
          cx="190"
          cy="165"
          r={r + 3}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={
            regime === "Shell rupture regime"
              ? "3 5"
              : regime === "Buckled regime"
                ? "2 2"
                : undefined
          }
        />
      ) : null}
      {moving
        ? Array.from({ length: 8 }, (_, i) => {
            const angle = (i * Math.PI) / 4,
              a = r + 12,
              b = a + arrowLength,
              expanding = frame.velocity_m_s > 0;
            return (
              <line
                key={i}
                x1={190 + (expanding ? a : b) * Math.cos(angle)}
                y1={165 + (expanding ? a : b) * Math.sin(angle)}
                x2={190 + (expanding ? b : a) * Math.cos(angle)}
                y2={165 + (expanding ? b : a) * Math.sin(angle)}
                stroke={color}
                strokeWidth="1.6"
                markerEnd={`url(#${id}-arrow)`}
              />
            );
          })
        : null}
      <line x1="190" x2={190 + r} y1="165" y2="165" stroke="#234657" />
      <circle cx="190" cy="165" r="2" fill="#234657" />
      <line
        x1="28"
        x2={28 + bar_m * scale}
        y1="320"
        y2="320"
        className="bubble-scale"
      />
      <line x1="28" x2="28" y1="316" y2="324" className="bubble-scale" />
      <line
        x1={28 + bar_m * scale}
        x2={28 + bar_m * scale}
        y1="316"
        y2="324"
        className="bubble-scale"
      />
      <text x="28" y="310">
        {(bar_m * 1e6).toPrecision(2)} µm
      </text>
      <text x="352" y="335" textAnchor="end">
        Fixed physical scale · spherical section
      </text>
    </svg>
  );
}

export function BubbleDynamics({
  trace,
  run,
}: {
  trace: BinaryArray;
  run: Run;
}) {
  const decoded = useMemo(() => {
    try {
      return { curve: bubbleTrajectory(trace), error: "" };
    } catch (error) {
      return { curve: null, error: String(error) };
    }
  }, [trace]);
  if (!decoded.curve)
    return (
      <div className="monitor-wait" role="alert">
        {decoded.error}
      </div>
    );
  return <BubblePlayback key={run.id} curve={decoded.curve} run={run} />;
}

function BubblePlayback({ curve, run }: { curve: BubbleTrajectory; run: Run }) {
  const [time, setTime] = useState(curve.start_s),
    [playing, setPlaying] = useState(
      () => !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
  const [loop, setLoop] = useState(true),
    [speed, setSpeed] = useState(2);
  const timeRef = useRef(time),
    loopRef = useRef(loop),
    speedRef = useRef(speed);
  timeRef.current = time;
  loopRef.current = loop;
  speedRef.current = speed;
  const law = useMemo(() => savedShellLaw(run), [run]);
  const crossing = useMemo(() => firstShellCrossing(curve, law), [curve, law]);
  const frame = bubbleFrame(curve, time),
    motion = radialMotion(frame, curve);
  const regime = shellRegime(
    frame.radius_m,
    law,
    run.config.bubble!.model === "lipid",
  );
  const curves = useMemo(
    () =>
      [1, 3, 4, 2].map((column) =>
        Array.from({ length: curve.count }, (_, i): [number, number] => [
          curve.data[i * 6] * 1e6,
          curve.data[i * 6 + column] *
            (column === 1 ? 1e6 : column === 3 || column === 4 ? 0.001 : 1),
        ]),
      ),
    [curve],
  );
  useEffect(() => {
    if (!playing) return;
    let raf = 0,
      last = 0;
    const tick = (stamp: number) => {
      if (!last) last = stamp;
      if (stamp - last >= 32) {
        const next = advanceBubbleTime(
          timeRef.current,
          Math.min(0.1, (stamp - last) / 1000),
          speedRef.current,
          run.config.frequency_hz,
          curve,
          loopRef.current,
        );
        last = stamp;
        timeRef.current = next.time_s;
        setTime(next.time_s);
        if (next.ended) {
          setPlaying(false);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const hide = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [playing, curve, run.config.frequency_hz]);
  const seek = (t: number) => {
    setPlaying(false);
    const value = Math.max(curve.start_s, Math.min(curve.end_s, t));
    timeRef.current = value;
    setTime(value);
  };
  const step = (direction: number) => {
    const at =
      direction > 0
        ? Math.floor(frame.index + 1e-6) + 1
        : Math.ceil(frame.index - 1e-6) - 1;
    seek(curve.data[Math.max(0, Math.min(curve.count - 1, at)) * 6]);
  };
  const toggle = () => {
    if (!playing && time >= curve.end_s) {
      timeRef.current = curve.start_s;
      setTime(curve.start_s);
    }
    setPlaying((p) => !p);
  };
  return (
    <div className="bubble-replay">
      <div
        className="bubble-playback-controls"
        role="group"
        aria-label="Bubble playback controls"
      >
        <button
          onClick={toggle}
          aria-label={
            playing ? "Pause bubble playback" : "Play bubble playback"
          }
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}{" "}
          {playing ? "Pause" : "Play"}
        </button>
        <button
          onClick={() => seek(curve.start_s)}
          aria-label="Restart bubble playback"
        >
          <SkipBack size={14} />
        </button>
        <button onClick={() => step(-1)} aria-label="Previous bubble sample">
          <StepBack size={14} />
        </button>
        <button onClick={() => step(1)} aria-label="Next bubble sample">
          <StepForward size={14} />
        </button>
        <label>
          Playback{" "}
          <select
            aria-label="Bubble playback rate"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          >
            {[0.25, 1, 2, 5, 10].map((v) => (
              <option key={v} value={v}>
                {v} cycles/s
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={loop}
            onChange={(e) => setLoop(e.target.checked)}
          />{" "}
          Loop
        </label>
        <span className="bubble-playback-clock">
          t = {(time * 1e6).toFixed(4)} µs · drive-centred
        </span>
        <span>Slow motion · recorded solution</span>
      </div>
      <div className="bubble-time-control">
        <span>{(curve.start_s * 1e6).toFixed(2)} µs</span>
        <input
          type="range"
          aria-label="Bubble time (µs)"
          min={curve.start_s * 1e6}
          max={curve.end_s * 1e6}
          step="any"
          value={time * 1e6}
          aria-valuetext={`${(time * 1e6).toFixed(4)} microseconds from drive centre`}
          onChange={(e) => seek(Number(e.target.value) * 1e-6)}
        />
        <span>{(curve.end_s * 1e6).toFixed(2)} µs</span>
      </div>
      <div
        className="bubble-event-controls"
        role="group"
        aria-label="Bubble events"
      >
        <button onClick={() => seek(curve.data[curve.maxIndex * 6])}>
          Maximum expansion
        </button>
        <button onClick={() => seek(curve.data[curve.minIndex * 6])}>
          Minimum radius
        </button>
        {law ? (
          <button
            disabled={crossing === null}
            onClick={() => crossing !== null && seek(crossing)}
          >
            First shell rupture crossing
          </button>
        ) : null}
        {law && crossing === null ? (
          <span>No rupture threshold crossing in this trace.</span>
        ) : null}
        <span>Click a curve to seek · arrow keys step its time cursor</span>
      </div>
      <div className="bubble-dynamics-grid">
        <section
          className="bubble-animation-panel"
          aria-label="Bubble motion and shell state"
        >
          <header className="plot-heading">
            <strong>Calculated bubble motion</strong>
            <span>{motion}</span>
          </header>
          <BubbleSection curve={curve} frame={frame} run={run} law={law} />
          <dl className="bubble-instant-values">
            <div>
              <dt>Radius</dt>
              <dd data-testid="bubble-radius-readout">
                {(frame.radius_m * 1e6).toFixed(4)} µm
              </dd>
            </div>
            <div>
              <dt>R/R₀</dt>
              <dd>
                {(frame.radius_m / run.config.bubble!.radius_m).toFixed(4)}
              </dd>
            </div>
            <div>
              <dt>Wall velocity</dt>
              <dd>{frame.velocity_m_s.toFixed(3)} m/s</dd>
            </div>
            <div>
              <dt>Drive</dt>
              <dd>{(frame.drive_pa * 0.001).toFixed(3)} kPa</dd>
            </div>
            <div>
              <dt>Emission at 1 mm</dt>
              <dd>{(frame.emission_pa * 0.001).toFixed(3)} kPa</dd>
            </div>
            <div>
              <dt>Surface tension</dt>
              <dd>
                {law
                  ? `${(surfaceTension(frame.radius_m, law) * 1000).toFixed(3)} mN/m`
                  : "—"}
              </dd>
            </div>
          </dl>
          <div className="bubble-shell-state">
            <strong>{regime}</strong>
            <span>
              {law
                ? `Nominal Marmottant thresholds · Rb ${(law.buckle_m * 1e6).toFixed(3)} µm · Rrupt ${(law.rupture_m * 1e6).toFixed(3)} µm`
                : run.config.bubble!.model === "free"
                  ? "Free gas–liquid interface; no lipid shell."
                  : "Saved shell constants are required to classify the coating."}
            </span>
          </div>
          <div className="bubble-physical-note">
            Stored R(t); illustrative shading. Dashed grey: R₀.{" "}
            {law
              ? "Dotted orange: nominal rupture radius. Dashed coating: rupture regime, reversible in this smooth shell law. "
              : ""}
            The radial model retains one spherical bubble; fragmentation and
            jets are not resolved.
          </div>
        </section>
        <div className="bubble-plots">
          <LinePlot
            points={curves[0]}
            title="Bubble radius"
            xLabel="Time from drive centre (µs)"
            yLabel="Radius (µm)"
            cursor={[time * 1e6, frame.radius_m * 1e6]}
            onSelectX={(x) => seek(x * 1e-6)}
          />
          <LinePlot
            points={curves[1]}
            title="Driving pressure"
            xLabel="Time from drive centre (µs)"
            yLabel="Model pressure (kPa)"
            symmetric
            cursor={[time * 1e6, frame.drive_pa * 0.001]}
            onSelectX={(x) => seek(x * 1e-6)}
          />
          <LinePlot
            points={curves[2]}
            title="Radiated emission at 1 mm"
            xLabel="Source time from drive centre (µs)"
            yLabel="Model pressure (kPa)"
            symmetric
            cursor={[time * 1e6, frame.emission_pa * 0.001]}
            onSelectX={(x) => seek(x * 1e-6)}
          />
          <LinePlot
            points={curves[3]}
            title="Bubble wall velocity"
            xLabel="Time from drive centre (µs)"
            yLabel="Wall velocity (m/s)"
            symmetric
            cursor={[time * 1e6, frame.velocity_m_s]}
            onSelectX={(x) => seek(x * 1e-6)}
          />
        </div>
      </div>
    </div>
  );
}
