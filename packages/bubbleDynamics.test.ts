import { describe, expect, it } from "vitest";
import {
  advanceBubbleTime,
  bubbleFrame,
  bubbleTrajectory,
  firstShellCrossing,
  radialMotion,
  savedShellLaw,
  shellRegime,
  surfaceTension,
} from "./bubbleDynamics";
import { configSchema } from "./contracts";
import type { Run } from "./contracts";
import template from "./contracts/coupled-template.json";

const rows = [
  [-2e-6, 2e-6, 0, 0, 0, 0],
  [-1e-6, 3e-6, 5, 20e3, 10e3, -10],
  [0, 1e-6, -10, -10e3, 50e3, 20],
  [1e-6, 2e-6, 0, 0, 0, 0],
];
const array = { shape: [4, 6], buffer: new Float32Array(rows.flat()).buffer };
const curve = bubbleTrajectory(array);
const record = {
  config: configSchema.parse(template.config),
  provenance: {
    simulation: {
      bubble: {
        shell_parameters: {
          R_buckle_ratio: 0.98058,
          chi: 0.5,
          sigma_rupture: 0.072,
          smoothing: 0.01,
        },
      },
    },
  },
} as unknown as Run;

describe("bubble trajectory inspection", () => {
  it("uses the nonzero stored clock and interpolates all six physical columns without changing samples", () => {
    const t = (curve.data[0] + curve.data[6]) / 2,
      f = bubbleFrame(curve, t);
    expect(f.radius_m).toBeCloseTo(2.5e-6, 12);
    expect(f.velocity_m_s).toBe(2.5);
    expect(f.drive_pa).toBe(10e3);
    expect(f.emission_pa).toBe(5e3);
    expect(f.acceleration_m_s2).toBe(-5);
    expect(f.index).toBeCloseTo(0.5, 12);
    expect(bubbleFrame(curve, -1).radius_m).toBe(curve.data[1]);
    expect(bubbleFrame(curve, 1).time_s).toBe(curve.end_s);
    expect(bubbleFrame(curve, NaN).time_s).toBe(curve.start_s);
    expect(curve.maxIndex).toBe(1);
    expect(curve.minIndex).toBe(2);
    expect(radialMotion(f, curve)).toBe("Expanding");
    expect(radialMotion(bubbleFrame(curve, 0), curve)).toBe("Compressing");
    expect(new Float32Array(array.buffer)[7]).toBeCloseTo(3e-6, 12);
  });
  it("derives nominal shell thresholds only from saved model parameters, including coupled provenance", () => {
    const law = savedShellLaw(record)!;
    expect(law.buckle_m).toBeCloseTo(
      0.98058 * record.config.bubble!.radius_m,
      14,
    );
    expect(law.rupture_m / law.buckle_m).toBeCloseTo(Math.sqrt(1.144), 14);
    expect(shellRegime(law.buckle_m * 0.99, law, true)).toBe("Buckled regime");
    expect(shellRegime((law.buckle_m + law.rupture_m) / 2, law, true)).toBe(
      "Elastic regime",
    );
    expect(shellRegime(law.rupture_m * 1.01, law, true)).toBe(
      "Shell rupture regime",
    );
    expect(shellRegime(1e-6, null, true)).toBe("Shell parameters unavailable");
    expect(shellRegime(1e-6, law, false)).toBe("Uncoated");
    expect(savedShellLaw({ ...record, provenance: {} })).toBeNull();
    const direct = {
      ...record,
      provenance: {
        simulation: (record.provenance.simulation as { bubble: unknown })
          .bubble,
      },
    };
    expect(savedShellLaw(direct)).toEqual(law);
    const crossing = firstShellCrossing(curve, law)!;
    expect(crossing).toBeGreaterThan(curve.start_s);
    expect(crossing).toBeLessThan(curve.data[6]);
    expect(bubbleFrame(curve, crossing).radius_m).toBeCloseTo(
      law.rupture_m,
      14,
    );
    expect(firstShellCrossing(curve, { ...law, rupture_m: 4e-6 })).toBeNull();
  });
  it("matches the smooth shell law's elastic limit, rounded corners and saturation without overflow", () => {
    const law = savedShellLaw(record)!;
    expect(surfaceTension(law.buckle_m, law)).toBeCloseTo(
      law.sigma * law.smoothing * Math.log(2),
      12,
    );
    expect(surfaceTension(law.rupture_m, law)).toBeCloseTo(
      law.sigma * (1 - law.smoothing * Math.log(2)),
      12,
    );
    const elastic = law.buckle_m * Math.sqrt(1 + (0.5 * law.sigma) / law.chi);
    expect(surfaceTension(elastic, law)).toBeCloseTo(law.sigma / 2, 12);
    expect(surfaceTension(law.buckle_m * 0.5, law)).toBeCloseTo(0, 12);
    expect(surfaceTension(law.buckle_m * 100, law)).toBe(law.sigma);
  });
  it("slows time by physical carrier cycles, wraps overshoot exactly, and stops at the true final sample", () => {
    const mid = advanceBubbleTime(curve.start_s, 0.25, 2, 1e6, curve, true);
    expect(mid.time_s - curve.start_s).toBeCloseTo(0.5e-6, 14);
    const stopped = advanceBubbleTime(curve.end_s, 1, 2, 1e6, curve, false);
    expect(stopped).toEqual({ time_s: curve.end_s, ended: true });
    const wrapped = advanceBubbleTime(curve.end_s, 0.25, 2, 1e6, curve, true);
    expect(wrapped.time_s).toBeCloseTo(curve.start_s + 0.5e-6, 14);
  });
  it("rejects incomplete, nonphysical or out-of-order trajectories rather than inventing motion", () => {
    expect(() => bubbleTrajectory({ ...array, shape: [4, 5] })).toThrow(
      /six-column/,
    );
    for (const change of [NaN, -1, 0]) {
      const data = new Float32Array(array.buffer.slice(0));
      data[7] = change;
      expect(() =>
        bubbleTrajectory({ ...array, buffer: data.buffer }),
      ).toThrow();
    }
    const data = new Float32Array(array.buffer.slice(0));
    data[6] = data[0];
    expect(() => bubbleTrajectory({ ...array, buffer: data.buffer })).toThrow(
      /time/,
    );
  });
});
