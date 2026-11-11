import type { VideoMetadata } from "../../../packages/contracts";
import {
  bubbleFrame,
  bubbleTrajectory,
  radialMotion,
  savedShellLaw,
  shellRegime,
} from "../../../packages/bubbleDynamics";
import { replayRFPrefix } from "../../../packages/replay";
import type { Workbench } from "./useWorkbench";

const ink = "#203447",
  muted = "#536575",
  line = "#cbd5df",
  blue = "#176ca6";
function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size = 13,
  color = ink,
) {
  ctx.fillStyle = color;
  ctx.font = `${size}px Segoe UI, sans-serif`;
  ctx.fillText(value, x, y);
}
function panel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
) {
  ctx.fillStyle = "white";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = line;
  ctx.strokeRect(x, y, width, height);
  text(ctx, title, x + 10, y + 23, 14);
}
function raster(
  values: Float32Array,
  rows: number,
  columns: number,
  peak: number,
  kind: "pressure" | "power",
) {
  const canvas = document.createElement("canvas");
  canvas.width = columns;
  canvas.height = rows;
  const cx = canvas.getContext("2d")!,
    image = cx.createImageData(columns, rows);
  for (let i = 0; i < values.length; i++) {
    if (kind === "pressure") {
      const v = Math.max(-1, Math.min(1, values[i] / (peak || 1))),
        a = Math.sqrt(Math.abs(v));
      image.data.set(
        v >= 0
          ? [255, 255 * (1 - a), 255 * (1 - a), 255]
          : [255 * (1 - a), 255 * (1 - a), 255, 255],
        i * 4,
      );
    } else {
      const db = Math.max(
          -40,
          10 * Math.log10(Math.max(values[i] / (peak || 1), 1e-8)),
        ),
        a = (db + 40) / 40;
      image.data.set([255 * a, 220 * a, 80 + 120 * (1 - a), 255], i * 4);
    }
  }
  cx.putImageData(image, 0, 0);
  return canvas;
}
const absolutePeak = (data: Float32Array) => {
  let peak = 0;
  for (const x of data) peak = Math.max(peak, Math.abs(x));
  return peak;
};

export async function recordPresentationVideo(
  w: Workbench,
  mode: "bubble" | "pipeline",
  duration: number,
  fps: number,
  canvas: HTMLCanvasElement,
  onProgress: (fraction: number) => void,
  onPreview?: (blob: Blob) => void,
) {
  const run = w.run;
  if (!run) throw new Error("Select a saved simulation run");
  const cfg = run.config,
    sourceIndex = Math.min(w.bubbleSource, cfg.sources.length - 1);
  const curve = w.bubbleTrace ? bubbleTrajectory(w.bubbleTrace) : null;
  if (mode === "bubble" && !curve)
    throw new Error("Wait for the saved radial trajectory to load");
  if (mode === "pipeline" && !w.movie)
    throw new Error("This run has no saved wave field frames");
  const bubble = cfg.sources[sourceIndex].bubble || cfg.bubble;
  const simulation = run.provenance.simulation as {
    bubble?: unknown;
    propagation?: {
      live_geometry?: { pressure_shape: number[]; extent_m: number[] };
    };
    live_geometry?: { pressure_shape: number[]; extent_m: number[] };
  };
  const radial = (simulation?.bubble || simulation) as {
    population?: { simulation: unknown }[];
  };
  const localRun = {
    ...run,
    config: { ...cfg, bubble },
    provenance: {
      ...run.provenance,
      simulation: radial?.population?.[sourceIndex]?.simulation || radial,
    },
  };
  const law = savedShellLaw(localRun);
  const geo =
    simulation?.propagation?.live_geometry || simulation?.live_geometry;
  const fields = w.movie ? new Float32Array(w.movie.frames.buffer) : null;
  const times = w.movie ? new Float32Array(w.movie.times.buffer) : null;
  const start = mode === "bubble" ? curve!.start_s : times![0],
    end = mode === "bubble" ? curve!.end_s : times![times!.length - 2];
  canvas.hidden = false;
  canvas.width = 960;
  canvas.height = 640;
  const ctx = canvas.getContext("2d")!;
  const mime = "video/webm;codecs=vp8";
  const raw = w.rawRF ? new Float32Array(w.rawRF.buffer) : null,
    rawPeak = raw ? absolutePeak(raw) : 1;
  const fieldPeak = fields ? absolutePeak(fields) : 1;
  const map = w.maps[w.method],
    power = map ? new Float32Array(map.buffer) : null;
  const mapImage =
    map && power
      ? raster(power, map.shape[0], map.shape[1], absolutePeak(power), "power")
      : null;
  const plot = (
    column: number,
    scale: number,
    title: string,
    x: number,
    y: number,
    width: number,
    height: number,
    t: number,
  ) => {
    panel(ctx, x, y, width, height, title);
    if (!curve) return;
    let min = 0,
      max = 0;
    for (let i = 0; i < curve.count; i++) {
      const v = curve.data[i * 6 + column] * scale;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    const range = max - min || 1,
      px = (time: number) =>
        x +
        44 +
        ((time - curve.start_s) / (curve.end_s - curve.start_s)) * (width - 58),
      py = (v: number) => y + 35 + ((max - v) / range) * (height - 59);
    ctx.strokeStyle = blue;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const stride = Math.max(1, Math.ceil(curve.count / (width * 1.5)));
    let first = true;
    for (let i = 0; i < curve.count; i += stride) {
      let lo = i,
        hi = i;
      for (let j = i + 1; j < Math.min(curve.count, i + stride); j++) {
        if (curve.data[j * 6 + column] < curve.data[lo * 6 + column]) lo = j;
        if (curve.data[j * 6 + column] > curve.data[hi * 6 + column]) hi = j;
      }
      for (const k of lo < hi ? [lo, hi] : [hi, lo]) {
        const xx = px(curve.data[k * 6]),
          yy = py(curve.data[k * 6 + column] * scale);
        if (first) {
          ctx.moveTo(xx, yy);
          first = false;
        } else ctx.lineTo(xx, yy);
      }
    }
    ctx.stroke();
    ctx.strokeStyle = "#b8791d";
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(px(t), y + 32);
    ctx.lineTo(px(t), y + height - 24);
    ctx.stroke();
    ctx.setLineDash([]);
    text(ctx, max.toPrecision(3), x + 3, y + 40, 10, muted);
    text(ctx, min.toPrecision(3), x + 3, y + height - 24, 10, muted);
    text(
      ctx,
      `${(curve.start_s * 1e6).toFixed(1)} … ${(curve.end_s * 1e6).toFixed(1)} µs`,
      x + width / 2 - 55,
      y + height - 7,
      10,
      muted,
    );
  };
  const drawBubble = (
    time: number,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => {
    panel(
      ctx,
      x,
      y,
      width,
      height,
      `Bubble S${sourceIndex + 1} · recorded radial response`,
    );
    if (!curve || !bubble) {
      text(
        ctx,
        "Prescribed source; no radial bubble model",
        x + 14,
        y + height / 2,
      );
      return;
    }
    const local =
      mode === "bubble" ? time : time - cfg.sources[sourceIndex].emission_s;
    const frame = bubbleFrame(curve, local),
      r0 = bubble.radius_m,
      scale =
        (Math.min(width, height) * 0.31) /
        Math.max(curve.maxRadius_m, r0, law?.rupture_m || 0);
    const cx = x + width / 2,
      cy = y + height * 0.45,
      r = frame.radius_m * scale,
      regime = shellRegime(frame.radius_m, law, bubble.model === "lipid");
    const color =
      regime === "Shell rupture regime"
        ? "#c16b27"
        : regime === "Buckled regime"
          ? "#6656a6"
          : blue;
    ctx.strokeStyle = muted;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, r0 * scale, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);
    const gradient = ctx.createRadialGradient(
      cx - r / 3,
      cy - r / 3,
      0,
      cx,
      cy,
      r,
    );
    gradient.addColorStop(0, "#f5fbff");
    gradient.addColorStop(0.65, "#c4e1ef");
    gradient.addColorStop(1, "#447f9f");
    ctx.fillStyle = gradient;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    if (bubble.model === "lipid") {
      ctx.setLineDash(regime === "Shell rupture regime" ? [3, 5] : []);
      ctx.beginPath();
      ctx.arc(cx, cy, r + 3, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    text(
      ctx,
      `R ${(frame.radius_m * 1e6).toFixed(4)} µm · R/R₀ ${(frame.radius_m / r0).toFixed(3)}`,
      x + 15,
      y + height - 69,
      13,
    );
    text(
      ctx,
      `${radialMotion(frame, curve)} · v ${frame.velocity_m_s.toFixed(3)} m/s`,
      x + 15,
      y + height - 48,
      12,
    );
    text(ctx, regime, x + 15, y + height - 28, 12, color);
    text(
      ctx,
      local < curve.start_s || local > curve.end_s
        ? "Outside radial record: endpoint held"
        : "Fixed scale · illustrative shading · no fragments",
      x + 15,
      y + height - 10,
      10,
      muted,
    );
  };
  const draw = (fraction: number) => {
    const phase = mode === "pipeline" ? Math.min(1, fraction / 0.8) : fraction,
      t = start + (end - start) * phase;
    ctx.fillStyle = "#edf1f5";
    ctx.fillRect(0, 0, 960, 640);
    text(
      ctx,
      `PAM Research Studio | ${mode === "bubble" ? "Bubble dynamics" : "Recorded source → wave → RF → PAM"}`,
      14,
      25,
      17,
    );
    text(
      ctx,
      `t = ${(t * 1e6).toFixed(4)} µs ${mode === "bubble" ? "from drive centre" : "capture clock"} | slow motion`,
      14,
      46,
      12,
      muted,
    );
    if (mode === "bubble") {
      drawBubble(t, 12, 60, 338, 550);
      [
        [1, 1e6, "Radius (µm)"],
        [3, 0.001, "Drive (kPa)"],
        [4, 0.001, "Emission at 1 mm (kPa)"],
        [2, 1, "Wall velocity (m/s)"],
      ].forEach(([col, scale, title], i) =>
        plot(
          Number(col),
          Number(scale),
          String(title),
          360,
          60 + i * 137,
          588,
          132,
          t,
        ),
      );
    } else {
      drawBubble(t, 12, 60, 456, 267);
      panel(
        ctx,
        480,
        60,
        468,
        267,
        "Acoustic pressure · actual saved solver frame",
      );
      if (fields && times && geo) {
        let i = 0;
        while (i + 1 < w.movie!.frames.shape[0] && times[(i + 1) * 2] <= t) i++;
        const [h, width] = geo.pressure_shape,
          startIndex = i * w.movie!.frames.shape[1],
          pixels = raster(
            fields.subarray(startIndex, startIndex + h * width),
            h,
            width,
            fieldPeak,
            "pressure",
          );
        const aspect =
            (geo.extent_m[1] - geo.extent_m[0]) /
            (geo.extent_m[3] - geo.extent_m[2]),
          drawW = Math.min(420, 215 * aspect),
          drawH = drawW / aspect;
        ctx.drawImage(pixels, 714 - drawW / 2, 94, drawW, drawH);
        text(
          ctx,
          `Saved frame t = ${(times[i * 2] * 1e6).toFixed(3)} µs · fixed pressure scale`,
          492,
          315,
          11,
          muted,
        );
      }
      panel(ctx, 12, 338, 456, 272, "Received RF · raw acquisition prefix");
      const prefix = replayRFPrefix(w.rawRF, cfg, t);
      if (prefix) {
        const image = raster(
          new Float32Array(prefix.array.buffer),
          prefix.array.shape[0],
          prefix.array.shape[1],
          rawPeak,
          "pressure",
        );
        ctx.drawImage(image, 48, 375, 400, 196);
        text(
          ctx,
          `${(cfg.capture_t0_s * 1e6).toFixed(2)} … ${(prefix.end_s * 1e6).toFixed(2)} µs | channel 0 … ${cfg.channels - 1}`,
          28,
          594,
          11,
          muted,
        );
      } else
        text(
          ctx,
          raw
            ? "No complete RF bin acquired yet"
            : "Raw RF omitted from this package",
          29,
          480,
          12,
          muted,
        );
      panel(
        ctx,
        480,
        338,
        468,
        272,
        "Final PAM · computed after RF acquisition",
      );
      if (fraction >= 0.8 && mapImage) {
        ctx.drawImage(mapImage, 526, 376, 392, 200);
        text(
          ctx,
          `${w.method.toUpperCase()} · own peak 0 dB · x/z in saved physical ROI`,
          492,
          594,
          11,
          muted,
        );
      } else
        text(
          ctx,
          "Reconstruction follows completed acquisition",
          508,
          480,
          12,
          muted,
        );
    }
    text(
      ctx,
      "Aisy Fawwaz · MRes Project · Bioengineering · Imperial College London",
      14,
      630,
      11,
      muted,
    );
  };
  const { Output, BufferTarget, WebMOutputFormat, CanvasSource, Quality } =
    await import("mediabunny");
  const target = new BufferTarget();
  const output = new Output({ target, format: new WebMOutputFormat() });
  let encodedBytes = 0;
  const source = new CanvasSource(canvas, {
    codec: "vp8",
    quality: new Quality({ bitrate: 2_000_000 }),
    hardwareAcceleration: "prefer-software",
    keyFrameInterval: 1,
    onEncodedPacket(packet) {
      encodedBytes += packet.byteLength;
      if (encodedBytes > 31 * 1024 ** 2)
        throw new Error("Video exceeds the 32 MiB export budget");
    },
  });
  output.addVideoTrack(source, { frameRate: fps });
  try {
    await output.start();
    const count = Math.round(duration * fps);
    for (let i = 0; i < count; i++) {
      draw(i / (count - 1));
      await source.add(i / fps, 1 / fps);
      onProgress((i + 1) / count);
      if (i % 4 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    source.close();
    await output.finalize();
    if (!target.buffer)
      throw new Error("WebM encoder did not finalize a video");
    const blob = new Blob([target.buffer], { type: mime });
    if (blob.size < 64)
      throw new Error(
        `WebM encoder produced only ${blob.size} bytes; no video was saved`,
      );
    if (blob.size > 32 * 1024 ** 2)
      throw new Error("Video exceeds the 32 MiB export budget");
    onPreview?.(blob);
    const metadata: VideoMetadata = {
      mode,
      source_index: sourceIndex,
      fps,
      duration_s: duration,
      width: 960,
      height: 640,
      mime,
      method: w.method,
      physical_time_range_s: [start, end],
    };
    return window.pam.saveVideo(
      run.id,
      new Uint8Array(await blob.arrayBuffer()),
      metadata,
    );
  } finally {
    if (output.state !== "finalized" && output.state !== "canceled")
      await output.cancel();
  }
}
