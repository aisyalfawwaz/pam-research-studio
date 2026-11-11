import type { Config } from "../../../packages/contracts";
export type ArrayModel = NonNullable<Config["arrays"]>[number];
export function arrayList(cfg: Config): ArrayModel[] {
  return (
    cfg.arrays || [
      {
        name: "Array 1",
        elements: cfg.channels,
        pitch_m: cfg.pitch_m,
        x_m: 0,
        z_m: 0,
        angle_deg: 0,
      },
    ]
  );
}
export function receiverPositions(cfg: Config): [number, number][] {
  return arrayList(cfg)
    .flatMap((a) =>
      Array.from({ length: a.elements }, (_, i): [number, number] => {
        const d = (i - (a.elements - 1) / 2) * a.pitch_m,
          t = (a.angle_deg * Math.PI) / 180;
        return [a.x_m + d * Math.cos(t), a.z_m + d * Math.sin(t)];
      }),
    )
    .map(([x, z], i): [number, number] => [
      x + (cfg.receiver_offsets_m?.[i]?.[0] || 0),
      z + (cfg.receiver_offsets_m?.[i]?.[1] || 0),
    ]);
}
