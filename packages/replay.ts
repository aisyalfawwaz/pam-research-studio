import type { BinaryArray, Config } from "./contracts";

// A signed peak bin can contain a future sample until its whole block is acquired.
export function replayRFPrefix(
  array: BinaryArray | null,
  cfg: Config,
  time: number,
) {
  if (!array || !Number.isFinite(time)) return null;
  const acquired = Math.max(
    0,
    Math.min(
      cfg.samples,
      Math.floor((time - cfg.capture_t0_s) * cfg.sampling_hz + 1e-6) + 1,
    ),
  );
  const block = Math.max(1, Math.ceil(cfg.samples / 512));
  const rows =
    acquired >= cfg.samples
      ? array.shape[0]
      : Math.min(array.shape[0], Math.floor(acquired / block));
  if (rows <= 0) return null;
  return {
    array: {
      shape: [rows, array.shape[1]],
      buffer: new Float32Array(array.buffer).slice(0, rows * array.shape[1])
        .buffer,
    },
    end_s:
      cfg.capture_t0_s +
      (Math.min(cfg.samples, rows * block) - 1) / cfg.sampling_hz,
  };
}
