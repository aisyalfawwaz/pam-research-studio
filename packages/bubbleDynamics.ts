import type { BinaryArray, Run } from "./contracts";

// Inspect the stored six-column jbubble trajectory; never synthesize motion.
export interface BubbleFrame {
  time_s: number;
  radius_m: number;
  velocity_m_s: number;
  drive_pa: number;
  emission_pa: number;
  acceleration_m_s2: number;
  index: number;
}
export interface BubbleTrajectory {
  data: Float32Array;
  count: number;
  start_s: number;
  end_s: number;
  minIndex: number;
  maxIndex: number;
  minRadius_m: number;
  maxRadius_m: number;
  maxVelocity_m_s: number;
}
export function bubbleTrajectory(trace: BinaryArray): BubbleTrajectory {
  const data = new Float32Array(trace.buffer),
    count = trace.shape[0];
  if (
    trace.shape.length !== 2 ||
    trace.shape[1] !== 6 ||
    count < 2 ||
    data.length !== count * 6
  )
    throw new Error("Expected a complete six-column bubble trajectory.");
  let minIndex = 0,
    maxIndex = 0,
    maxVelocity = 0;
  for (let i = 0; i < count; i++) {
    if (!(data[i * 6 + 1] > 0) || (i > 0 && !(data[i * 6] > data[(i - 1) * 6])))
      throw new Error(
        "Bubble radius must be positive and its time strictly increasing.",
      );
    for (let c = 0; c < 6; c++)
      if (!Number.isFinite(data[i * 6 + c]))
        throw new Error("Bubble trajectory contains a non-finite value.");
    if (data[i * 6 + 1] < data[minIndex * 6 + 1]) minIndex = i;
    if (data[i * 6 + 1] > data[maxIndex * 6 + 1]) maxIndex = i;
    maxVelocity = Math.max(maxVelocity, Math.abs(data[i * 6 + 2]));
  }
  return {
    data,
    count,
    start_s: data[0],
    end_s: data[(count - 1) * 6],
    minIndex,
    maxIndex,
    minRadius_m: data[minIndex * 6 + 1],
    maxRadius_m: data[maxIndex * 6 + 1],
    maxVelocity_m_s: maxVelocity,
  };
}
export function bubbleFrame(
  curve: BubbleTrajectory,
  time: number,
): BubbleFrame {
  const { data, count } = curve;
  const t = Math.max(
    curve.start_s,
    Math.min(curve.end_s, Number.isFinite(time) ? time : curve.start_s),
  );
  let lo = 0,
    hi = count - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >>> 1;
    if (data[mid * 6] <= t) lo = mid;
    else hi = mid;
  }
  const f = (t - data[lo * 6]) / (data[hi * 6] - data[lo * 6]);
  const v = (c: number) =>
    data[lo * 6 + c] + f * (data[hi * 6 + c] - data[lo * 6 + c]);
  return {
    time_s: t,
    radius_m: v(1),
    velocity_m_s: v(2),
    drive_pa: v(3),
    emission_pa: v(4),
    acceleration_m_s2: v(5),
    index: lo + f,
  };
}
export function radialMotion(frame: BubbleFrame, curve: BubbleTrajectory) {
  const tolerance = Math.max(1e-9, curve.maxVelocity_m_s * 1e-4);
  return frame.velocity_m_s > tolerance
    ? "Expanding"
    : frame.velocity_m_s < -tolerance
      ? "Compressing"
      : "Turning / near rest";
}
export interface ShellLaw {
  buckle_m: number;
  rupture_m: number;
  chi: number;
  sigma: number;
  smoothing: number;
}
export function savedShellLaw(run: Run): ShellLaw | null {
  if (run.config.bubble?.model !== "lipid") return null;
  const simulation = run.provenance.simulation as
    | { bubble?: unknown }
    | undefined;
  const info = (simulation?.bubble || simulation) as
    | { shell_parameters?: Record<string, number> }
    | undefined;
  const p = info?.shell_parameters;
  if (
    !p ||
    ![p.R_buckle_ratio, p.chi, p.sigma_rupture, p.smoothing].every(
      (v) => Number.isFinite(v) && v > 0,
    )
  )
    return null;
  const buckle_m = p.R_buckle_ratio * run.config.bubble.radius_m;
  return {
    buckle_m,
    rupture_m: buckle_m * Math.sqrt(1 + p.sigma_rupture / p.chi),
    chi: p.chi,
    sigma: p.sigma_rupture,
    smoothing: p.smoothing,
  };
}
// Nominal piecewise regimes of the saved smooth Marmottant law. The actual
// smooth transition is continuous, not an irreversible fragmentation event.
export function shellRegime(
  radius: number,
  law: ShellLaw | null,
  lipid: boolean,
) {
  if (!lipid) return "Uncoated";
  if (!law) return "Shell parameters unavailable";
  return radius <= law.buckle_m
    ? "Buckled regime"
    : radius >= law.rupture_m
      ? "Shell rupture regime"
      : "Elastic regime";
}
export function surfaceTension(radius: number, law: ShellLaw): number {
  const y = (law.chi * ((radius / law.buckle_m) ** 2 - 1)) / law.sigma;
  const softplus = (x: number) =>
    Math.max(0, x) + Math.log1p(Math.exp(-Math.abs(x)));
  // Outside the transition use equivalent stable expressions, avoiding
  // catastrophic subtraction of two large softplus values.
  const e = law.smoothing;
  const clamped =
    y > 1
      ? 1 +
        e * (Math.log1p(Math.exp(-y / e)) - Math.log1p(Math.exp((1 - y) / e)))
      : e * (softplus(y / e) - softplus((y - 1) / e));
  return Math.max(0, Math.min(law.sigma, law.sigma * clamped));
}
export function firstShellCrossing(
  curve: BubbleTrajectory,
  law: ShellLaw | null,
): number | null {
  if (!law) return null;
  const { data, count } = curve;
  if (data[1] >= law.rupture_m) return curve.start_s;
  for (let i = 1; i < count; i++) {
    const a = data[(i - 1) * 6 + 1],
      b = data[i * 6 + 1];
    if (a < law.rupture_m && b >= law.rupture_m) {
      const f = (law.rupture_m - a) / (b - a);
      return data[(i - 1) * 6] + f * (data[i * 6] - data[(i - 1) * 6]);
    }
  }
  return null;
}
export function advanceBubbleTime(
  time: number,
  elapsed_s: number,
  speed: number,
  frequency: number,
  curve: BubbleTrajectory,
  loop: boolean,
) {
  // speed is carrier cycles per wall-clock second; never claim real-time MHz.
  const next = time + (Math.max(0, elapsed_s) * speed) / frequency;
  if (next <= curve.end_s) return { time_s: next, ended: false };
  return loop
    ? {
        time_s:
          curve.start_s +
          ((next - curve.start_s) % (curve.end_s - curve.start_s)),
        ended: false,
      }
    : { time_s: curve.end_s, ended: true };
}
