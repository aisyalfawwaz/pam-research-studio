import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Crosshair, Hand, Maximize2, Minus, Plus } from "lucide-react";
import type { BinaryArray, Config } from "../../../packages/contracts";
import { relativeDB } from "../../../packages/contracts";
import { arrayList, receiverPositions } from "./arrayGeometry";

export type Bounds = { x0: number; x1: number; y0: number; y1: number };
export type Palette = "viridis" | "gray" | "thermal";
export type Cursor = { x: number; y: number; value?: number };
export const values = (array: BinaryArray) => new Float32Array(array.buffer);
export function peakValue(data: ArrayLike<number>) {
  let max = 0;
  for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i]));
  return max;
}
const VIRIDIS = [
  [68, 1, 84],
  [59, 82, 139],
  [33, 145, 140],
  [94, 201, 98],
  [253, 231, 37],
];
const THERMAL = [
  [0, 0, 4],
  [76, 16, 104],
  [182, 55, 81],
  [251, 135, 35],
  [252, 255, 164],
];
function colour(t: number, palette: Palette, signed = false) {
  t = Math.max(0, Math.min(1, t));
  if (signed)
    return t < 0.5
      ? [
          Math.round(36 + t * 438),
          Math.round(93 + t * 324),
          Math.round(178 + t * 154),
        ]
      : [
          255,
          Math.round(255 - (t - 0.5) * 370),
          Math.round(255 - (t - 0.5) * 398),
        ];
  if (palette === "gray") return [t * 255, t * 255, t * 255];
  const list = palette === "thermal" ? THERMAL : VIRIDIS;
  const f = t * (list.length - 1),
    i = Math.min(list.length - 2, Math.floor(f));
  return list[i].map((v, k) => Math.round(v + (list[i + 1][k] - v) * (f - i)));
}
function useSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 640, height: 400 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.max(200, width), height: Math.max(120, height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, ...size };
}
function ticks(low: number, high: number, count = 5) {
  const raw = (high - low) / count,
    scale = 10 ** Math.floor(Math.log10(raw || 1)),
    fraction = raw / scale;
  const step =
    (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * scale;
  const result: number[] = [];
  for (let x = Math.ceil(low / step) * step; x <= high + step * 1e-7; x += step)
    result.push(Math.abs(x) < step * 1e-7 ? 0 : x);
  return result;
}
function tickLabel(value: number, span: number) {
  if (Math.abs(value) >= 10000 || (value !== 0 && Math.abs(value) < 0.001))
    return value.toExponential(1);
  return value
    .toFixed(Math.max(0, Math.min(4, 2 - Math.floor(Math.log10(span || 1)))))
    .replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
}

export function RasterPlot({
  array,
  domain,
  title,
  xLabel,
  yLabel,
  display = "db",
  floor = -40,
  palette = "viridis",
  truth = [],
  truthRadius,
  peak,
  detections,
  selection,
  onPick,
  onCursor,
  reset = 0,
  showCrosshair = true,
}: {
  array: BinaryArray;
  domain: Bounds;
  title: string;
  xLabel: string;
  yLabel: string;
  display?: "db" | "linear" | "signed";
  floor?: number;
  palette?: Palette;
  truth?: [number, number][];
  truthRadius?: number;
  peak?: [number, number];
  detections?: import("../../../packages/contracts").PeakEvaluation;
  selection?: [number, number];
  onPick?: (x: number, y: number) => void;
  onCursor?: (cursor: Cursor) => void;
  reset?: number;
  showCrosshair?: boolean;
}) {
  const { ref, width, height } = useSize();
  const [view, setView] = useState(domain);
  const [pan, setPan] = useState(false);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; view: Bounds } | null>(null);
  const clip = useId().replace(/:/g, "");
  const [rows, cols] = array.shape;
  const data = useMemo(() => values(array), [array]);
  const max = useMemo(() => peakValue(data), [data]);
  const raster = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = cols;
    canvas.height = rows;
    const context = canvas.getContext("2d")!;
    const image = context.createImageData(cols, rows);
    for (let i = 0; i < data.length; i++) {
      const t =
        display === "signed"
          ? 0.5 + data[i] / (2 * (max || 1))
          : display === "db"
            ? (relativeDB(data[i], max, floor) - floor) / -floor
            : data[i] / (max || 1);
      const rgb = colour(t, palette, display === "signed");
      image.data.set([...rgb, 255], i * 4);
    }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL();
  }, [cols, rows, data, max, display, floor, palette]);
  const colours = useMemo(
    () =>
      Array.from({ length: 41 }, (_, i) => {
        const rgb = colour(i / 40, palette, display === "signed");
        return `rgb(${rgb.join(",")})`;
      }),
    [palette, display],
  );
  useEffect(() => {
    setView(domain);
    setHover(null);
  }, [domain.x0, domain.x1, domain.y0, domain.y1, reset]);
  const left = 58,
    top = 16,
    w = Math.max(70, width - 130),
    h = Math.max(50, height - 65);
  const px = (x: number) => left + ((x - view.x0) / (view.x1 - view.x0)) * w;
  const py = (y: number) => top + ((y - view.y0) / (view.y1 - view.y0)) * h;
  const bounded = useCallback(
    (next: Bounds) => {
      const sx = Math.min(
        domain.x1 - domain.x0,
        Math.max((domain.x1 - domain.x0) / 128, next.x1 - next.x0),
      );
      const sy = Math.min(
        domain.y1 - domain.y0,
        Math.max((domain.y1 - domain.y0) / 128, next.y1 - next.y0),
      );
      const x0 = Math.max(domain.x0, Math.min(domain.x1 - sx, next.x0));
      const y0 = Math.max(domain.y0, Math.min(domain.y1 - sy, next.y0));
      return { x0, x1: x0 + sx, y0, y1: y0 + sy };
    },
    [domain.x0, domain.x1, domain.y0, domain.y1],
  );
  const zoom = useCallback(
    (factor: number, center?: [number, number]) =>
      setView((old) => {
        const x = center?.[0] ?? (old.x0 + old.x1) / 2,
          y = center?.[1] ?? (old.y0 + old.y1) / 2;
        return bounded({
          x0: x + (old.x0 - x) * factor,
          x1: x + (old.x1 - x) * factor,
          y0: y + (old.y0 - y) * factor,
          y1: y + (old.y1 - y) * factor,
        });
      }),
    [bounded],
  );
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect(),
        v = viewRef.current;
      const x = v.x0 + ((event.clientX - rect.left - left) / w) * (v.x1 - v.x0),
        y = v.y0 + ((event.clientY - rect.top - top) / h) * (v.y1 - v.y0);
      zoom(event.deltaY > 0 ? 1.2 : 1 / 1.2, [x, y]);
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [w, h, zoom]);
  const locate = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x =
        view.x0 +
        ((event.clientX - rect.left - left) / w) * (view.x1 - view.x0),
      y =
        view.y0 + ((event.clientY - rect.top - top) / h) * (view.y1 - view.y0);
    return [
      Math.max(view.x0, Math.min(view.x1, x)),
      Math.max(view.y0, Math.min(view.y1, y)),
    ] as [number, number];
  };
  const inspect = (x: number, y: number) => {
    const ix = Math.max(
      0,
      Math.min(
        cols - 1,
        Math.round(((x - domain.x0) / (domain.x1 - domain.x0)) * (cols - 1)),
      ),
    );
    const iy = Math.max(
      0,
      Math.min(
        rows - 1,
        Math.round(((y - domain.y0) / (domain.y1 - domain.y0)) * (rows - 1)),
      ),
    );
    onCursor?.({ x, y, value: data[iy * cols + ix] });
  };
  const cross = hover || selection || peak;
  const dx = (domain.x1 - domain.x0) / Math.max(1, cols - 1),
    dy = (domain.y1 - domain.y0) / Math.max(1, rows - 1);
  return (
    <section className="plot-panel">
      <header className="plot-heading">
        <span>{title}</span>
        <div className="plot-tools" role="group" aria-label={`${title} tools`}>
          <button
            title="Inspect coordinates"
            aria-label={`Inspect ${title}`}
            aria-pressed={!pan}
            onClick={() => setPan(false)}
          >
            <Crosshair size={14} />
          </button>
          <button
            title="Pan"
            aria-label={`Pan ${title}`}
            aria-pressed={pan}
            onClick={() => setPan(!pan)}
          >
            <Hand size={14} />
          </button>
          <button
            title="Zoom in (+)"
            aria-label={`Zoom in ${title}`}
            onClick={() => zoom(1 / 1.5)}
          >
            <Plus size={14} />
          </button>
          <button
            title="Zoom out (−)"
            aria-label={`Zoom out ${title}`}
            onClick={() => zoom(1.5)}
          >
            <Minus size={14} />
          </button>
          <button
            title="Fit axes (Home)"
            aria-label={`Fit ${title}`}
            onClick={() => setView(domain)}
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </header>
      <div className="plot-body" ref={ref}>
        <svg
          ref={svg}
          width="100%"
          height="100%"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          tabIndex={0}
          aria-label={`${title}; ${xLabel}; ${yLabel}. Arrow keys move the profile cursor. Home fits axes.`}
          className={pan ? "pan-cursor" : "inspect-cursor"}
          onPointerDown={(event) => {
            if (pan) {
              drag.current = { x: event.clientX, y: event.clientY, view };
              event.currentTarget.setPointerCapture(event.pointerId);
            }
          }}
          onPointerMove={(event) => {
            if (drag.current) {
              const d = drag.current,
                sx = ((event.clientX - d.x) / w) * (d.view.x1 - d.view.x0),
                sy = ((event.clientY - d.y) / h) * (d.view.y1 - d.view.y0);
              setView(
                bounded({
                  x0: d.view.x0 - sx,
                  x1: d.view.x1 - sx,
                  y0: d.view.y0 - sy,
                  y1: d.view.y1 - sy,
                }),
              );
            } else {
              const point = locate(event);
              setHover(point);
              inspect(...point);
            }
          }}
          onPointerUp={(event) => {
            if (drag.current) {
              drag.current = null;
              event.currentTarget.releasePointerCapture(event.pointerId);
            } else {
              const point = locate(event);
              onPick?.(...point);
            }
          }}
          onPointerLeave={() => {
            if (!drag.current) setHover(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Home") {
              event.preventDefault();
              setView(domain);
            } else if (event.key === "+" || event.key === "=") {
              event.preventDefault();
              zoom(1 / 1.5);
            } else if (event.key === "-") {
              event.preventDefault();
              zoom(1.5);
            } else if (event.key.startsWith("Arrow")) {
              event.preventDefault();
              const old = selection ||
                peak || [(view.x0 + view.x1) / 2, (view.y0 + view.y1) / 2];
              const x = Math.max(
                domain.x0,
                Math.min(
                  domain.x1,
                  old[0] +
                    (event.key === "ArrowRight"
                      ? dx
                      : event.key === "ArrowLeft"
                        ? -dx
                        : 0),
                ),
              );
              const y = Math.max(
                domain.y0,
                Math.min(
                  domain.y1,
                  old[1] +
                    (event.key === "ArrowDown"
                      ? dy
                      : event.key === "ArrowUp"
                        ? -dy
                        : 0),
                ),
              );
              onPick?.(x, y);
              inspect(x, y);
            }
          }}
        >
          <defs>
            <clipPath id={clip}>
              <rect x={left} y={top} width={w} height={h} />
            </clipPath>
            <linearGradient id={`${clip}bar`} x1="0" x2="0" y1="1" y2="0">
              {colours.map((c, i) => (
                <stop key={i} offset={`${(i / 40) * 100}%`} stopColor={c} />
              ))}
            </linearGradient>
          </defs>
          <rect x={left} y={top} width={w} height={h} className="axis-paper" />
          <g clipPath={`url(#${clip})`}>
            <image
              href={raster}
              x={px(domain.x0 - dx / 2)}
              y={py(domain.y0 - dy / 2)}
              width={((domain.x1 - domain.x0 + dx) / (view.x1 - view.x0)) * w}
              height={((domain.y1 - domain.y0 + dy) / (view.y1 - view.y0)) * h}
              preserveAspectRatio="none"
              style={{ imageRendering: "pixelated" }}
            />
            {showCrosshair && cross ? (
              <g className="plot-crosshair">
                <line
                  x1={px(cross[0])}
                  x2={px(cross[0])}
                  y1={top}
                  y2={top + h}
                />
                <line
                  x1={left}
                  x2={left + w}
                  y1={py(cross[1])}
                  y2={py(cross[1])}
                />
              </g>
            ) : null}
            {truth.map(([x, y], i) => (
              <g key={i} className="truth-mark">
                {truthRadius ? (
                  <ellipse
                    cx={px(x)}
                    cy={py(y)}
                    rx={Math.abs(px(x + truthRadius) - px(x))}
                    ry={Math.abs(py(y + truthRadius) - py(y))}
                    fill="none"
                    strokeDasharray="4 3"
                  />
                ) : null}
                <circle cx={px(x)} cy={py(y)} r="5" />
                <path
                  d={`M${px(x) - 8},${py(y)}h16M${px(x)},${py(y) - 8}v16`}
                />
                <text x={px(x) + 8} y={py(y) + 16} className="truth-label">
                  S{i + 1}
                </text>
              </g>
            ))}
            {detections?.peaks.map((p) => {
              const x = p.x_m * 1000,
                y = p.z_m * 1000;
              const source = detections.truth.find(
                (t) => t.source_index === p.source_index,
              );
              return (
                <g
                  key={p.index}
                  data-testid="detected-peak"
                  data-peak-index={p.index}
                  data-source-index={p.source_index ?? "unmatched"}
                  className={`detected-peak ${p.source_index == null ? "unmatched" : "matched"}`}
                >
                  <title>{`P${p.index + 1}: x ${x.toFixed(3)} mm, z ${y.toFixed(3)} mm, ${p.relative_db.toFixed(2)} dB; ${p.source_index == null ? "unmatched" : `S${p.source_index + 1}, error ${(p.error_m! * 1000).toFixed(3)} mm`}`}</title>
                  {source && truth.length ? (
                    <line
                      x1={px(x)}
                      y1={py(y)}
                      x2={px(source.x_m * 1000)}
                      y2={py(source.z_m * 1000)}
                      strokeDasharray="3 2"
                    />
                  ) : null}
                  <path d={`M${px(x)},${py(y) - 6}l6,6l-6,6l-6,-6z`} />
                  <text x={px(x) + 8} y={py(y) - 8}>
                    P{p.index + 1}
                  </text>
                </g>
              );
            })}
            {peak && !detections ? (
              <g className="peak-mark">
                <path
                  d={`M${px(peak[0])},${py(peak[1]) - 6}l6,6l-6,6l-6,-6z`}
                />
              </g>
            ) : null}
          </g>
          {ticks(view.x0, view.x1).map((v) => (
            <g key={v}>
              <line
                x1={px(v)}
                x2={px(v)}
                y1={top + h}
                y2={top + h + 4}
                className="axis-stroke"
              />
              <text x={px(v)} y={top + h + 18} textAnchor="middle">
                {tickLabel(v, view.x1 - view.x0)}
              </text>
            </g>
          ))}
          {ticks(view.y0, view.y1).map((v) => (
            <g key={v}>
              <line
                x1={left - 4}
                x2={left}
                y1={py(v)}
                y2={py(v)}
                className="axis-stroke"
              />
              <text x={left - 8} y={py(v) + 4} textAnchor="end">
                {tickLabel(v, view.y1 - view.y0)}
              </text>
            </g>
          ))}
          <rect x={left} y={top} width={w} height={h} className="axis-border" />
          <text
            x={left + w / 2}
            y={height - 9}
            textAnchor="middle"
            className="axis-title"
          >
            {xLabel}
          </text>
          <text
            transform={`translate(14 ${top + h / 2}) rotate(-90)`}
            textAnchor="middle"
            className="axis-title"
          >
            {yLabel}
          </text>
          <rect
            x={left + w + 17}
            y={top}
            width="10"
            height={h}
            fill={`url(#${clip}bar)`}
            className="color-border"
          />
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <text key={f} x={left + w + 32} y={top + f * h + 4}>
              {display === "db"
                ? `${Math.round(floor * f)}`
                : display === "signed"
                  ? ((1 - 2 * f) * max).toExponential(1)
                  : ((1 - f) * max).toExponential(1)}
            </text>
          ))}
          <text x={left + w + 18} y={height - 24} className="color-unit">
            {display === "db" ? "dB" : display === "signed" ? "a.u." : "linear"}
          </text>
        </svg>
      </div>
    </section>
  );
}

export function LinePlot({
  points,
  title,
  xLabel,
  yLabel,
  xWindow,
  normalize = false,
  symmetric = false,
  onCursor,
  cursor,
  onSelectX,
}: {
  points: [number, number][];
  title: string;
  xLabel: string;
  yLabel: string;
  xWindow?: [number, number];
  normalize?: boolean;
  symmetric?: boolean;
  onCursor?: (cursor: Cursor) => void;
  cursor?: [number, number];
  onSelectX?: (x: number) => void;
}) {
  const { ref, width, height } = useSize();
  const visible = useMemo(
    () =>
      xWindow
        ? points.filter(([x]) => x >= xWindow[0] && x <= xWindow[1])
        : points,
    [points, xWindow?.[0], xWindow?.[1]],
  );
  const left = 57,
    top = 15,
    w = Math.max(70, width - 75),
    h = Math.max(35, height - 57);
  let xmin = xWindow?.[0] ?? visible[0]?.[0] ?? 0,
    xmax = xWindow?.[1] ?? visible.at(-1)?.[0] ?? 1;
  if (xmax <= xmin) xmax = xmin + 1;
  const bounds = useMemo(() => {
    let lo = 0,
      hi = 0;
    for (const [, y] of visible) {
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
    return [lo, hi];
  }, [visible]);
  let [ymin, ymax] = bounds;
  const scale = normalize ? Math.max(Math.abs(ymin), Math.abs(ymax), 1e-30) : 1;
  ymin /= scale;
  ymax /= scale;
  if (symmetric) {
    ymax = Math.max(-ymin, ymax);
    ymin = -ymax;
  }
  if (ymax <= ymin) ymax = ymin + 1;
  const padding = (ymax - ymin) * 0.06;
  ymax += padding;
  if (ymin < 0) ymin -= padding;
  const px = (x: number) => left + ((x - xmin) / (xmax - xmin)) * w,
    py = (y: number) => top + ((ymax - y) / (ymax - ymin)) * h;
  const sampled = useMemo(() => {
    if (visible.length < width * 3) return visible;
    const output: [number, number][] = [];
    const step = Math.ceil(visible.length / (width * 2));
    for (let i = 0; i < visible.length; i += step) {
      let lo = i,
        hi = i;
      for (let j = i; j < Math.min(i + step, visible.length); j++) {
        if (visible[j][1] < visible[lo][1]) lo = j;
        if (visible[j][1] > visible[hi][1]) hi = j;
      }
      if (lo < hi) output.push(visible[lo], visible[hi]);
      else output.push(visible[hi], visible[lo]);
    }
    return output;
  }, [visible, width]);
  const line = useMemo(
    () =>
      sampled
        .map(
          ([x, y], i) =>
            `${i ? "L" : "M"}${px(x).toFixed(2)},${py(y / scale).toFixed(2)}`,
        )
        .join(" "),
    [sampled, xmin, xmax, ymin, ymax, scale, w, h],
  );
  return (
    <section className="plot-panel line-panel">
      <header className="plot-heading">
        <span>{title}</span>
        <small>{yLabel}</small>
      </header>
      <div className="plot-body" ref={ref}>
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${title}; ${xLabel}; ${yLabel}`}
          tabIndex={onSelectX ? 0 : undefined}
          onClick={
            onSelectX
              ? (event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  const position =
                    ((event.clientX - rect.left) * width) / rect.width;
                  onSelectX(
                    Math.max(
                      xmin,
                      Math.min(
                        xmax,
                        xmin + ((position - left) / w) * (xmax - xmin),
                      ),
                    ),
                  );
                }
              : undefined
          }
          onKeyDown={
            onSelectX
              ? (event) => {
                  const x = cursor?.[0] ?? xmin,
                    delta = (xmax - xmin) / 200;
                  if (
                    ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                      event.key,
                    )
                  ) {
                    event.preventDefault();
                    onSelectX(
                      event.key === "Home"
                        ? xmin
                        : event.key === "End"
                          ? xmax
                          : Math.max(
                              xmin,
                              Math.min(
                                xmax,
                                x +
                                  (event.key === "ArrowLeft" ? -delta : delta),
                              ),
                            ),
                    );
                  }
                }
              : undefined
          }
          onPointerMove={(event) => {
            if (onCursor) {
              const rect = event.currentTarget.getBoundingClientRect();
              const x =
                xmin + ((event.clientX - rect.left - left) / w) * (xmax - xmin);
              const i = Math.max(
                0,
                Math.min(
                  visible.length - 1,
                  Math.round(
                    ((x - xmin) / (xmax - xmin)) * (visible.length - 1),
                  ),
                ),
              );
              onCursor({ x, y: visible[i]?.[1] ?? 0 });
            }
          }}
        >
          <rect x={left} y={top} width={w} height={h} className="axis-paper" />
          {ticks(xmin, xmax).map((v) => (
            <g key={v}>
              <line
                x1={px(v)}
                x2={px(v)}
                y1={top}
                y2={top + h}
                className="axis-grid"
              />
              <text x={px(v)} y={top + h + 18} textAnchor="middle">
                {tickLabel(v, xmax - xmin)}
              </text>
            </g>
          ))}
          {ticks(ymin, ymax, 3).map((v) => (
            <g key={v}>
              <line
                x1={left}
                x2={left + w}
                y1={py(v)}
                y2={py(v)}
                className="axis-grid"
              />
              <text x={left - 7} y={py(v) + 4} textAnchor="end">
                {tickLabel(v, ymax - ymin)}
              </text>
            </g>
          ))}
          <path d={line} className="trace-path" />
          {cursor && cursor[0] >= xmin && cursor[0] <= xmax ? (
            <g
              className="line-time-cursor"
              aria-label="Selected simulation time"
            >
              <line
                x1={px(cursor[0])}
                x2={px(cursor[0])}
                y1={top}
                y2={top + h}
              />
              <circle cx={px(cursor[0])} cy={py(cursor[1] / scale)} r="3.2" />
            </g>
          ) : null}
          <rect x={left} y={top} width={w} height={h} className="axis-border" />
          <text
            x={left + w / 2}
            y={height - 6}
            textAnchor="middle"
            className="axis-title"
          >
            {xLabel}
          </text>
        </svg>
      </div>
    </section>
  );
}

export function ScenePlot({
  selectedArray = 0,
  onSelectArray = () => {},
  onGestureStart = () => {},
  onGestureEnd = () => {},
  cfg,
  onChange,
  selectedSource,
  onSelectSource,
  onCursor,
  disabled,
  reset = 0,
}: {
  selectedArray?: number;
  onSelectArray?: (i: number) => void;
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
  cfg: Config;
  onChange: (cfg: Config) => void;
  selectedSource: number;
  onSelectSource: (i: number) => void;
  onCursor?: (cursor: Cursor) => void;
  disabled: boolean;
  reset?: number;
}) {
  const { ref, width, height } = useSize();
  const [zoom, setZoom] = useState(1);
  const [equalAxes, setEqualAxes] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<number | null>(null);
  const arrayDrag = useRef<{ index: number; dx: number; dz: number } | null>(
    null,
  );
  const arrays = arrayList(cfg),
    elements = receiverPositions(cfg);
  useEffect(() => setZoom(1), [reset]);
  const zmax = Math.max(
    50,
    cfg.grid_z_max_m * 1000 + 4,
    ...cfg.sources.map((s) => s.z_m * 1000 + 5),
    ...elements.map((p) => p[1] * 1000 + 5),
  );
  const zmin = Math.min(-6, ...elements.map((p) => p[1] * 1000 - 5));
  const half = Math.max(
    16,
    Math.abs(cfg.grid_x_min_m * 1000) + 3,
    Math.abs(cfg.grid_x_max_m * 1000) + 3,
    (cfg.channels - 1) * cfg.pitch_m * 500 + 3,
    ...cfg.sources.map((s) => Math.abs(s.x_m * 1000) + 4),
    ...elements.map((p) => Math.abs(p[0] * 1000) + 4),
  );
  const left = 57,
    top = 20,
    w = Math.max(70, width - 85),
    h = Math.max(50, height - 65);
  const common = Math.min(w / (half * 2), h / (zmax - zmin)) * zoom;
  const unitX = equalAxes ? common : (w / (half * 2)) * zoom,
    unitY = equalAxes ? common : (h / (zmax - zmin)) * zoom;
  const x = (mm: number) => left + w / 2 + mm * unitX,
    y = (mm: number) => top + (mm - zmin) * unitY;
  const xrange = [-w / (2 * unitX), w / (2 * unitX)],
    yrange = [zmin, h / unitY + zmin];
  const move = (index: number, mx: number, mz: number) =>
    onChange({
      ...cfg,
      sources: cfg.sources.map((s, i) =>
        i === index
          ? {
              ...s,
              x_m: Math.round(Math.max(-100, Math.min(100, mx)) * 100) / 100000,
              z_m: Math.round(Math.max(1, Math.min(150, mz)) * 100) / 100000,
            }
          : s,
      ),
    });
  const clip = useId().replace(/:/g, "");
  return (
    <section className="plot-panel scene-plot">
      <header className="plot-heading">
        <span>Scene geometry</span>
        <div className="plot-tools">
          <span className="plot-note">x–z plane</span>
          <button
            aria-label="Equal axis scale"
            title="Equal physical axis scale"
            aria-pressed={equalAxes}
            onClick={() => setEqualAxes(!equalAxes)}
          >
            1:1
          </button>
          <button
            aria-label="Zoom in scene"
            title="Zoom in"
            onClick={() => setZoom((v) => Math.min(5, v * 1.4))}
          >
            <Plus size={14} />
          </button>
          <button
            aria-label="Zoom out scene"
            title="Zoom out"
            onClick={() => setZoom((v) => Math.max(0.5, v / 1.4))}
          >
            <Minus size={14} />
          </button>
          <button
            aria-label="Fit scene"
            title="Fit scene"
            onClick={() => setZoom(1)}
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </header>
      <div className="plot-body" ref={ref}>
        <svg
          ref={svg}
          width="100%"
          height="100%"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Scene geometry with receive array and passive sources"
          onPointerMove={(event) => {
            const r = event.currentTarget.getBoundingClientRect(),
              mx = (event.clientX - r.left - left - w / 2) / unitX,
              mz = (event.clientY - r.top - top) / unitY + zmin;
            onCursor?.({ x: mx, y: mz });
            if (drag.current !== null && !disabled) move(drag.current, mx, mz);
            if (arrayDrag.current !== null && !disabled)
              onChange({
                ...cfg,
                arrays: arrays.map((a, i) =>
                  i === arrayDrag.current?.index
                    ? {
                        ...a,
                        x_m:
                          Math.round(
                            Math.max(
                              -100,
                              Math.min(100, mx - arrayDrag.current!.dx),
                            ) * 100,
                          ) / 100000,
                        z_m:
                          Math.round(
                            Math.max(
                              -100,
                              Math.min(150, mz - arrayDrag.current!.dz),
                            ) * 100,
                          ) / 100000,
                      }
                    : a,
                ),
              });
          }}
          onPointerUp={(event) => {
            drag.current = null;
            arrayDrag.current = null;
            onGestureEnd();
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            drag.current = null;
            arrayDrag.current = null;
            onGestureEnd();
          }}
        >
          <defs>
            <clipPath id={clip}>
              <rect x={left} y={top} width={w} height={h} />
            </clipPath>
          </defs>
          <rect x={left} y={top} width={w} height={h} className="axis-paper" />
          {ticks(xrange[0], xrange[1], 8).map((v) => (
            <g key={v}>
              <line
                x1={x(v)}
                x2={x(v)}
                y1={top}
                y2={top + h}
                className="axis-grid"
              />
              <text x={x(v)} y={top + h + 18} textAnchor="middle">
                {tickLabel(v, xrange[1] - xrange[0])}
              </text>
            </g>
          ))}
          {ticks(yrange[0], yrange[1], 7).map((v) => (
            <g key={v}>
              <line
                x1={left}
                x2={left + w}
                y1={y(v)}
                y2={y(v)}
                className="axis-grid"
              />
              <text x={left - 7} y={y(v) + 4} textAnchor="end">
                {tickLabel(v, yrange[1] - yrange[0])}
              </text>
            </g>
          ))}
          <g clipPath={`url(#${clip})`}>
            <rect
              x={x(cfg.grid_x_min_m * 1000)}
              y={y(cfg.grid_z_min_m * 1000)}
              width={Math.max(
                0,
                (cfg.grid_x_max_m - cfg.grid_x_min_m) * 1000 * unitX,
              )}
              height={Math.max(
                0,
                (cfg.grid_z_max_m - cfg.grid_z_min_m) * 1000 * unitY,
              )}
              className="roi-outline"
            />
            <text
              x={x(cfg.grid_x_min_m * 1000) + 5}
              y={y(cfg.grid_z_min_m * 1000) + 14}
              className="roi-label"
            >
              ROI · {cfg.grid_n} × {cfg.grid_n}
            </text>
            {arrays.map((a, i) => {
              const offset = arrays
                  .slice(0, i)
                  .reduce((sum, a) => sum + a.elements, 0),
                positions = elements.slice(offset, offset + a.elements);
              return (
                <g
                  key={i}
                  role="button"
                  tabIndex={0}
                  aria-label={`Select receive array ${i + 1}`}
                  className={
                    selectedArray === i
                      ? "array-symbol selected"
                      : "array-symbol"
                  }
                  onFocus={() => onSelectArray(i)}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    onSelectArray(i);
                    if (!disabled) {
                      const bounds = svg.current!.getBoundingClientRect();
                      arrayDrag.current = {
                        index: i,
                        dx:
                          (event.clientX - bounds.left - left - w / 2) / unitX -
                          a.x_m * 1000,
                        dz:
                          (event.clientY - bounds.top - top) / unitY +
                          zmin -
                          a.z_m * 1000,
                      };
                      onGestureStart();
                      svg.current?.setPointerCapture(event.pointerId);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (!disabled && event.key.startsWith("Arrow")) {
                      event.preventDefault();
                      const step = (event.shiftKey ? 1 : 0.1) / 1000;
                      onChange({
                        ...cfg,
                        arrays: arrays.map((other, j) =>
                          j === i
                            ? {
                                ...other,
                                x_m:
                                  other.x_m +
                                  (event.key === "ArrowRight"
                                    ? step
                                    : event.key === "ArrowLeft"
                                      ? -step
                                      : 0),
                                z_m:
                                  other.z_m +
                                  (event.key === "ArrowDown"
                                    ? step
                                    : event.key === "ArrowUp"
                                      ? -step
                                      : 0),
                              }
                            : other,
                        ),
                      });
                    }
                  }}
                >
                  <line
                    x1={x(positions[0][0] * 1000)}
                    y1={y(positions[0][1] * 1000)}
                    x2={x(positions.at(-1)![0] * 1000)}
                    y2={y(positions.at(-1)![1] * 1000)}
                    stroke="transparent"
                    strokeWidth="18"
                    pointerEvents="stroke"
                    className="array-drag-target"
                  />
                  <line
                    x1={x(positions[0][0] * 1000)}
                    y1={y(positions[0][1] * 1000)}
                    x2={x(positions.at(-1)![0] * 1000)}
                    y2={y(positions.at(-1)![1] * 1000)}
                    className="receiver-line"
                  />
                  {positions.map(([px, pz], j) => (
                    <rect
                      key={j}
                      x={x(px * 1000) - 2}
                      y={y(pz * 1000) - 3}
                      width="4"
                      height="6"
                      className={
                        cfg.active_channels &&
                        !cfg.active_channels.includes(offset + j)
                          ? "receiver-disabled"
                          : "receiver-mark"
                      }
                    />
                  ))}
                  <text
                    x={x(a.x_m * 1000)}
                    y={y(a.z_m * 1000) - 12}
                    textAnchor="middle"
                  >
                    {a.name} · {a.elements} ch · {a.angle_deg}°
                  </text>
                </g>
              );
            })}
            {cfg.sources.map((s, i) => (
              <g
                key={i}
                className={i === selectedSource ? "source selected" : "source"}
                role="button"
                tabIndex={0}
                aria-label={`Select source ${i + 1}`}
                aria-disabled={disabled}
                onFocus={() => onSelectSource(i)}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onSelectSource(i);
                  if (!disabled) {
                    drag.current = i;
                    onGestureStart();
                    svg.current?.setPointerCapture(event.pointerId);
                  }
                }}
                onKeyDown={(event) => {
                  if (!disabled && event.key.startsWith("Arrow")) {
                    event.preventDefault();
                    const step = event.shiftKey ? 1 : 0.1;
                    move(
                      i,
                      s.x_m * 1000 +
                        (event.key === "ArrowLeft"
                          ? -step
                          : event.key === "ArrowRight"
                            ? step
                            : 0),
                      s.z_m * 1000 +
                        (event.key === "ArrowUp"
                          ? -step
                          : event.key === "ArrowDown"
                            ? step
                            : 0),
                    );
                  }
                }}
              >
                <circle cx={x(s.x_m * 1000)} cy={y(s.z_m * 1000)} r="9" />
                <path
                  d={`M${x(s.x_m * 1000) - 6},${y(s.z_m * 1000)}h12M${x(s.x_m * 1000)},${y(s.z_m * 1000) - 6}v12`}
                />
                <text x={x(s.x_m * 1000) + 15} y={y(s.z_m * 1000) - 5}>
                  S{i + 1}
                </text>
                <text
                  className="source-coordinate"
                  x={x(s.x_m * 1000) + 15}
                  y={y(s.z_m * 1000) + 10}
                >
                  ({(s.x_m * 1000).toFixed(2)}, {(s.z_m * 1000).toFixed(2)}) mm
                </text>
              </g>
            ))}
          </g>
          <rect x={left} y={top} width={w} height={h} className="axis-border" />
          <text
            x={left + w / 2}
            y={height - 8}
            textAnchor="middle"
            className="axis-title"
          >
            Lateral x (mm)
          </text>
          <text
            transform={`translate(14 ${top + h / 2}) rotate(-90)`}
            textAnchor="middle"
            className="axis-title"
          >
            Depth z (mm)
          </text>
        </svg>
      </div>
      <footer className="plot-footnote">
        Drag a source or use arrow keys (0.1 mm; Shift: 1 mm). Axes:{" "}
        {equalAxes ? "equal physical scale" : "independent scale"}.
      </footer>
    </section>
  );
}
