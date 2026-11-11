import { useState } from "react";
import type { Config } from "../../../packages/contracts";
export function ApertureMask({
  cfg,
  onChange,
}: {
  cfg: Config;
  onChange: (c: Config) => void;
}) {
  const [page, setPage] = useState(0);
  const pages = Math.ceil(cfg.channels / 64),
    current = Math.min(page, pages - 1);
  const active = new Set(
    cfg.active_channels || Array.from({ length: cfg.channels }, (_, i) => i),
  );
  const mask = (values: number[] | null) =>
    onChange({ ...cfg, active_channels: values });
  return (
    <>
      <div className="property-actions">
        <button onClick={() => mask(null)}>All channels</button>
        <button
          onClick={() =>
            mask(
              Array.from(
                { length: Math.ceil(cfg.channels / 2) },
                (_, i) => i * 2,
              ),
            )
          }
        >
          Alternate
        </button>
        <button
          onClick={() =>
            mask(
              Array.from({ length: Math.min(64, cfg.channels) }, (_, i) =>
                Math.round(
                  (i * (cfg.channels - 1)) / (Math.min(64, cfg.channels) - 1),
                ),
              ),
            )
          }
        >
          Spaced 64
        </button>
      </div>
      <div className="select-property property-row">
        <label htmlFor="mask-page">Channel range</label>
        <select
          id="mask-page"
          value={current}
          onChange={(e) => setPage(Number(e.target.value))}
        >
          {Array.from({ length: pages }, (_, i) => (
            <option key={i} value={i}>
              {i * 64}–{Math.min(cfg.channels - 1, i * 64 + 63)}
            </option>
          ))}
        </select>
      </div>
      <p className="property-note">
        {active.size} of {cfg.channels} active. Multi-array RCB accepts at most
        64 active channels. A spaced mask changes the effective aperture and may
        introduce grating lobes.
      </p>
      <div className="channel-mask">
        {Array.from(
          { length: Math.min(64, cfg.channels - current * 64) },
          (_, i) => i + current * 64,
        ).map((i) => (
          <label key={i}>
            <input
              type="checkbox"
              aria-label={`Use receiver ${i}`}
              checked={active.has(i)}
              onChange={(e) => {
                if (e.target.checked) active.add(i);
                else active.delete(i);
                mask([...active].sort((a, b) => a - b));
              }}
            />
            {i}
          </label>
        ))}
      </div>
    </>
  );
}
