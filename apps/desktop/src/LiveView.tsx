import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import type { Config, BinaryArray } from "../../../packages/contracts";
import type { Workbench } from "./useWorkbench";
import { RasterPlot } from "./plots";
import { receiverPositions } from "./arrayGeometry";
import { replayRFPrefix } from "../../../packages/replay";
import {
  bubbleFrame,
  bubbleTrajectory,
} from "../../../packages/bubbleDynamics";
function binary(matrix: number[][]): BinaryArray {
  const data = new Float32Array(matrix.flat());
  return {
    shape: [matrix.length, matrix[0]?.length || 1],
    buffer: data.buffer,
  };
}
function Field({
  matrix,
  extent,
  cfg,
  title,
  completed,
  sensorNow,
  mask,
}: {
  matrix: number[][];
  extent: number[];
  cfg: Config;
  title: string;
  completed?: number;
  sensorNow?: number[];
  mask?: number[][] | null;
}) {
  const ref = useRef<HTMLDivElement>(null),
    [size, setSize] = useState({ width: 500, height: 230 });
  useEffect(() => {
    const o = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    if (ref.current) o.observe(ref.current);
    return () => o.disconnect();
  }, []);
  const [h, w] = [matrix.length, matrix[0]?.length || 1];
  const peak = Math.max(
    completed === undefined ? 1e-12 : 1e-30,
    ...matrix.flat().map(Math.abs),
  );
  const raster = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const context = c.getContext("2d")!,
      im = context.createImageData(w, h);
    matrix.flat().forEach((v, i) => {
      let rgb: number[];
      if (completed !== undefined && i >= completed)
        rgb = (Math.floor(i / w) + i) % 2 ? [217, 222, 229] : [235, 238, 243];
      else if (completed !== undefined) {
        const t = Math.max(
          0,
          1 + (10 * Math.log10(Math.max(v / peak, 1e-4))) / 40,
        );
        rgb = [
          Math.round(250 * t),
          Math.round(220 * Math.sqrt(t)),
          Math.round(90 * (1 - t)),
        ];
      } else {
        const t = Math.max(-1, Math.min(1, v / peak));
        rgb =
          t >= 0
            ? [255, Math.round(255 * (1 - t)), Math.round(255 * (1 - t))]
            : [Math.round(255 * (1 + t)), Math.round(255 * (1 + t)), 255];
      }
      im.data.set([...rgb, 255], i * 4);
    });
    context.putImageData(im, 0, 0);
    return c.toDataURL();
  }, [matrix, completed, peak, w, h]);
  const unit = Math.min(
    Math.max(40, size.width - 64) / (extent[1] - extent[0]),
    Math.max(40, size.height - 53) / (extent[3] - extent[2]),
  );
  const width = (extent[1] - extent[0]) * unit,
    height = (extent[3] - extent[2]) * unit,
    left = 47 + (Math.max(40, size.width - 64) - width) / 2,
    top = 16;
  const x = (v: number) =>
      left + ((v - extent[0]) / (extent[1] - extent[0])) * width,
    y = (v: number) =>
      top + ((v - extent[2]) / (extent[3] - extent[2])) * height;
  const sensorPeak = Math.max(1e-30, ...(sensorNow || []).map(Math.abs));
  const boneRaster = useMemo(() => {
    if (!mask || mask.length !== h || mask[0]?.length !== w) return null;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext("2d")!,
      pixels = context.createImageData(w, h);
    mask
      .flat()
      .forEach((value, i) =>
        pixels.data.set(
          [30, 50, 65, Math.round(90 * Math.max(0, Math.min(1, value)))],
          i * 4,
        ),
      );
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL();
  }, [mask, w, h]);
  return (
    <section className="live-field">
      <header className="plot-heading">
        <span>{title}</span>
        <small>
          {completed === undefined
            ? `±${peak.toExponential(2)} ${cfg.coupling ? "p/Pdrive" : "a.u."}`
            : `${completed}/${w * h} grid points · relative dB`}
        </small>
      </header>
      <div ref={ref} className="live-field-body">
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="img"
          aria-label={title}
        >
          <image
            href={raster}
            x={left}
            y={top}
            width={width}
            height={height}
            preserveAspectRatio="none"
          />
          <rect
            x={left}
            y={top}
            width={width}
            height={height}
            className="axis-border"
          />
          {boneRaster ? (
            <image
              href={boneRaster}
              x={left}
              y={top}
              width={width}
              height={height}
              preserveAspectRatio="none"
            />
          ) : null}
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <text
                x={left + t * width}
                y={top + height + 16}
                textAnchor="middle"
              >
                {((extent[0] + t * (extent[1] - extent[0])) * 1000).toFixed(1)}
              </text>
              <text x={left - 5} y={top + t * height + 3} textAnchor="end">
                {((extent[2] + t * (extent[3] - extent[2])) * 1000).toFixed(1)}
              </text>
            </g>
          ))}
          {cfg.sources.map((s, i) => (
            <g key={i}>
              <path
                d={`M${x(s.x_m) - 4} ${y(s.z_m)}h8M${x(s.x_m)} ${y(s.z_m) - 4}v8`}
                stroke="#111"
                strokeWidth="1.4"
              />
            </g>
          ))}
          {completed === undefined
            ? receiverPositions(cfg).map(([sx, sz], i) => (
                <rect
                  key={i}
                  x={x(sx) - 2}
                  y={y(sz) - 2}
                  width="4"
                  height="4"
                  fill={
                    sensorNow && Math.abs(sensorNow[i] || 0) / sensorPeak > 0.1
                      ? "#111"
                      : "#07986d"
                  }
                >
                  <title>
                    CH {i}: x {(sx * 1000).toFixed(2)}, z{" "}
                    {(sz * 1000).toFixed(2)} mm
                  </title>
                </rect>
              ))
            : null}
          <text x={left + width / 2} y={size.height - 3} textAnchor="middle">
            Lateral x (mm)
          </text>
          <text
            transform={`translate(10 ${top + height / 2}) rotate(-90)`}
            textAnchor="middle"
          >
            Depth z (mm)
          </text>
        </svg>
      </div>
    </section>
  );
}
export function LiveView({
  w,
  onExpand,
}: {
  w: Workbench;
  onExpand: () => void;
}) {
  const [index, setIndex] = useState(0),
    [playing, setPlaying] = useState(false);
  const cfg = w.busy
    ? w.liveFrame?.config || w.config
    : w.run?.config || w.liveFrame?.config || w.config;
  const frames = w.movie?.frames,
    times = w.movie?.times;
  const timeValues = useMemo(
    () => (times ? new Float32Array(times.buffer) : null),
    [times],
  );
  const ctMask = useMemo(
    () =>
      w.ctMask
        ? Array.from({ length: w.ctMask.shape[0] }, (_, row) =>
            Array.from(
              new Float32Array(w.ctMask!.buffer).slice(
                row * w.ctMask!.shape[1],
                (row + 1) * w.ctMask!.shape[1],
              ),
            ),
          )
        : null,
    [w.ctMask],
  );
  useEffect(() => {
    setIndex(0);
    setPlaying(false);
  }, [w.run?.id]);
  useEffect(() => {
    if (!playing || !frames) return;
    const timer = setInterval(
      () =>
        setIndex((i) => {
          if (i >= frames.shape[0] - 1) {
            setPlaying(false);
            return i;
          }
          return i + 1;
        }),
      100,
    );
    return () => clearInterval(timer);
  }, [playing, frames]);
  const recorded = useMemo(() => {
    if (!cfg || !frames || !w.run) return null;
    const info = w.run.provenance.simulation as {
      propagation?: {
        live_geometry?: { pressure_shape: number[]; extent_m: number[] };
      };
      live_geometry?: { pressure_shape: number[]; extent_m: number[] };
    };
    const geo = info.propagation?.live_geometry || info.live_geometry;
    if (!geo) return null;
    const [h, width] = geo.pressure_shape,
      values = new Float32Array(frames.buffer);
    const start = index * frames.shape[1];
    return {
      pressure: Array.from({ length: h }, (_, row) =>
        Array.from(
          values.slice(start + row * width, start + (row + 1) * width),
        ),
      ),
      extent: geo.extent_m,
      time_s: timeValues?.[index * 2] || 0,
    };
  }, [frames, w.run, index, timeValues, cfg]);
  const currentPreview =
    !w.run || w.liveFrame?.run_id === w.run.id ? w.liveFrame : null;
  const frame = w.busy ? w.liveFrame : recorded || currentPreview;
  const time = frame?.time_s || 0;
  const curve = useMemo(
    () => (w.bubbleTrace ? bubbleTrajectory(w.bubbleTrace) : null),
    [w.bubbleTrace],
  );
  const sourceIndex = w.busy
    ? 0
    : Math.min(w.bubbleSource, (cfg?.sources.length || 1) - 1);
  const source = cfg?.sources[sourceIndex],
    bubble = source?.bubble || cfg?.bubble;
  let radius = w.busy ? w.liveFrame?.radius_m : undefined;
  if (radius === undefined && curve && cfg) {
    radius = bubbleFrame(curve, time - (source?.emission_s || 0)).radius_m;
  }
  radius = radius || bubble?.radius_m || 0;
  const maximumRadius =
    curve?.maxRadius_m ||
    w.liveFrame?.radius_max_m ||
    (bubble?.radius_m || 1) * 3;
  const radiusScale = 90 / Math.max(maximumRadius, bubble?.radius_m || 0);
  const pressure = frame?.pressure,
    extent = frame?.extent;
  let rf = w.busy && w.liveFrame?.rf ? binary(w.liveFrame.rf) : w.rawRF;
  let rfEnd = time;
  if (!w.busy && cfg) {
    const prefix = replayRFPrefix(w.rawRF, cfg, time);
    rf = prefix?.array || null;
    rfEnd = prefix?.end_s ?? time;
  }
  if (!rfEnd) rfEnd = (cfg?.capture_t0_s || 0) + 1e-6;
  const map = w.busy
    ? w.liveFrame?.pam
    : w.maps[w.method]
      ? Array.from({ length: w.maps[w.method]!.shape[0] }, (_, i) =>
          Array.from(
            new Float32Array(w.maps[w.method]!.buffer).slice(
              i * w.maps[w.method]!.shape[1],
              (i + 1) * w.maps[w.method]!.shape[1],
            ),
          ),
        )
      : w.liveFrame?.pam;
  return (
    <div className="live-workspace">
      <div className="model-toolbar">
        <strong>
          {w.busy
            ? "Live solver"
            : w.job?.status === "failed" || w.job?.status === "interrupted"
              ? "Interrupted solver preview"
              : w.run
                ? "Recorded solver frames"
                : "No completed simulation"}
        </strong>
        <span>t = {(time * 1e6).toFixed(3)} µs</span>
        <span>{w.job?.stage || "Ready"}</span>
        <div className="strip-space" />
        <button onClick={onExpand}>Expand monitor</button>
      </div>
      <div className="live-grid">
        <section className="bubble-monitor">
          <header className="plot-heading">
            <span>Bubble dynamics · S{sourceIndex + 1}</span>
            <small>
              {cfg?.bubble ? "Radial Keller–Miksis model" : "Reference source"}
            </small>
          </header>
          {cfg?.bubble ? (
            <svg
              viewBox="0 0 400 230"
              role="img"
              aria-label="Calculated bubble radius"
            >
              <defs>
                <radialGradient id="bubble-light" cx="35%" cy="30%">
                  <stop offset="0" stopColor="#edf8ff" />
                  <stop offset=".6" stopColor="#a8cde4" />
                  <stop offset="1" stopColor="#346d91" />
                </radialGradient>
              </defs>
              <circle
                cx="155"
                cy="115"
                r={(bubble?.radius_m || 0) * radiusScale}
                fill="none"
                stroke="#87939f"
                strokeDasharray="4 4"
              />
              <circle
                cx="155"
                cy="115"
                r={radius * radiusScale}
                fill="url(#bubble-light)"
                stroke="#284d64"
              />
              <line
                x1="155"
                y1="115"
                x2={155 + radius * radiusScale}
                y2="115"
                stroke="#17384f"
              />
              <text x="275" y="85">
                R = {(radius * 1e6).toFixed(3)} µm
              </text>
              <text x="275" y="110">
                R/R₀ = {(radius / (bubble?.radius_m || 1)).toFixed(3)}
              </text>
              <text x="275" y="140">
                Dashed: equilibrium
              </text>
              <text x="155" y="215" textAnchor="middle">
                Magnified radius view · spherical symmetry
              </text>
            </svg>
          ) : (
            <div className="monitor-wait">
              Reference waveform source. Bubble dynamics are not selected for
              this run.
            </div>
          )}
        </section>
        {pressure && extent && cfg ? (
          <Field
            matrix={pressure}
            extent={extent}
            cfg={cfg}
            title="Acoustic pressure · actual j-Wave field"
            sensorNow={w.busy ? w.liveFrame?.sensor_now : undefined}
            mask={cfg.ct ? (w.busy ? w.liveFrame?.ct_mask : ctMask) : null}
          />
        ) : (
          <div className="monitor-wait">
            Wave field appears when the time-domain solver starts. Compilation
            can take a few seconds.
          </div>
        )}
        {rf && cfg ? (
          <RasterPlot
            array={rf}
            domain={{
              x0: 0,
              x1: cfg.channels - 1,
              y0:
                ((w.busy ? w.liveFrame?.rf_start_s : cfg.capture_t0_s) || 0) *
                1e6,
              y1:
                1e6 *
                Math.max(
                  rfEnd,
                  ((w.busy ? w.liveFrame?.rf_start_s : cfg.capture_t0_s) || 0) +
                    1e-9,
                ),
            }}
            title={
              w.busy
                ? "Sensor signals · solver pressure before decimation"
                : "Sensor signals · acquired RF"
            }
            xLabel="Channel"
            yLabel="Receive time (µs)"
            display="signed"
          />
        ) : (
          <div className="monitor-wait">
            {w.busy
              ? "Receiver signals will appear as the solver computes them."
              : w.rawRF
                ? "No complete acquisition bin at this timestamp. Advance the replay to inspect recorded raw RF."
                : "Raw RF is not included in this run."}
          </div>
        )}
        {map && cfg ? (
          <Field
            matrix={map}
            extent={[
              cfg.grid_x_min_m,
              cfg.grid_x_max_m,
              cfg.grid_z_min_m,
              cfg.grid_z_max_m,
            ]}
            cfg={cfg}
            title={`${w.run?.status === "complete" && !w.busy ? "Final PAM" : "Partial PAM"} · ${(w.busy ? w.liveFrame?.pam_method : w.method) || "DAS"}`}
            completed={
              w.busy || w.run?.status !== "complete"
                ? w.liveFrame?.computed
                : cfg.grid_n ** 2
            }
          />
        ) : (
          <div className="monitor-wait">
            PAM starts after RF acquisition. Uncomputed points will remain
            hatched.
          </div>
        )}
      </div>
      <div className="replay-strip">
        <button
          aria-label="First wave frame"
          disabled={w.busy || !frames}
          onClick={() => setIndex(0)}
        >
          <SkipBack size={14} />
        </button>
        <button
          disabled={w.busy || !frames}
          onClick={() => {
            if (index >= (frames?.shape[0] || 0) - 1) setIndex(0);
            setPlaying(!playing);
          }}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}Replay
        </button>
        <input
          aria-label="Wave frame"
          type="range"
          min="0"
          max={Math.max(0, (frames?.shape[0] || 1) - 1)}
          value={index}
          disabled={w.busy || !frames}
          onChange={(e) => {
            setPlaying(false);
            setIndex(Number(e.target.value));
          }}
        />
        <button
          aria-label="Next wave frame"
          disabled={w.busy || !frames}
          onClick={() =>
            setIndex((i) => Math.min((frames?.shape[0] || 1) - 1, i + 1))
          }
        >
          <SkipForward size={14} />
        </button>
        <span>{frames ? `${index + 1}/${frames.shape[0]}` : "Streaming"}</span>
      </div>
      <div className="workflow-validation">
        Computed-time visualization, not hardware real-time. Pressure is signed;
        green marks receiver positions. 2D equivalent line source, one-way
        coupling, no acoustic feedback. Radius is magnified; wave frames are
        spatially band-limited display samples at equal physical scale.
        {cfg?.ct
          ? " Grey overlay: actual CT-derived material fraction. Heterogeneous fluid c/ρ; zero absorption, no shear modes."
          : ""}
      </div>
    </div>
  );
}
