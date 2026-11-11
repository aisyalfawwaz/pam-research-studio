import type { Config } from "../../../packages/contracts";
import { NumericProperty } from "./InstrumentControls";
const defaults = {
  remove_dc: true,
  detrend_linear: false,
  filter_kind: "bandpass" as const,
  low_hz: 0.2e6,
  high_hz: 2e6,
  order: 4,
  notch_hz: null as number | null,
  notch_q: 30,
};
export function DSPControls({
  cfg,
  onChange,
}: {
  cfg: Config;
  onChange: (c: Config) => void;
}) {
  const p = cfg.processing;
  const edit = (patch: Partial<NonNullable<Config["processing"]>>) =>
    onChange({ ...cfg, processing: { ...(p || defaults), ...patch } });
  return (
    <>
      <label className="check-row">
        <input
          type="checkbox"
          checked={!!p}
          onChange={(e) =>
            onChange({
              ...cfg,
              processing: e.target.checked
                ? {
                    ...defaults,
                    high_hz: Math.min(2e6, cfg.sampling_hz * 0.4),
                    low_hz: Math.min(0.2e6, cfg.sampling_hz * 0.1),
                  }
                : null,
            })
          }
        />
        Enable receive conditioning
      </label>
      {p ? (
        <>
          <label className="check-row">
            <input
              type="checkbox"
              checked={p.remove_dc}
              onChange={(e) => edit({ remove_dc: e.target.checked })}
            />
            Remove channel DC
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={p.detrend_linear}
              onChange={(e) => edit({ detrend_linear: e.target.checked })}
            />
            Remove linear trend
          </label>
          <div className="select-property property-row">
            <label htmlFor="receive-filter">Receive filter</label>
            <select
              id="receive-filter"
              value={p.filter_kind}
              onChange={(e) =>
                edit({ filter_kind: e.target.value as typeof p.filter_kind })
              }
            >
              <option value="none">None</option>
              <option value="lowpass">Low-pass</option>
              <option value="highpass">High-pass</option>
              <option value="bandpass">Band-pass</option>
            </select>
          </div>
          {p.filter_kind === "bandpass" || p.filter_kind === "highpass" ? (
            <NumericProperty
              label="Lower cutoff"
              unit="MHz"
              value={p.low_hz / 1e6}
              min={0.001}
              step={0.05}
              onChange={(v) => edit({ low_hz: v * 1e6 })}
            />
          ) : null}
          {p.filter_kind === "bandpass" || p.filter_kind === "lowpass" ? (
            <NumericProperty
              label="Upper cutoff"
              unit="MHz"
              value={p.high_hz / 1e6}
              min={0.001}
              step={0.05}
              onChange={(v) => edit({ high_hz: v * 1e6 })}
            />
          ) : null}
          <NumericProperty
            label="Filter order"
            value={p.order}
            min={2}
            max={8}
            step={1}
            onChange={(v) => edit({ order: v })}
          />
          <label className="check-row">
            <input
              type="checkbox"
              checked={p.notch_hz !== null}
              onChange={(e) =>
                edit({
                  notch_hz: e.target.checked
                    ? Math.min(1e6, cfg.sampling_hz * 0.3)
                    : null,
                })
              }
            />
            Notch rejection
          </label>
          {p.notch_hz !== null ? (
            <>
              <NumericProperty
                label="Notch frequency"
                unit="MHz"
                value={p.notch_hz / 1e6}
                step={0.05}
                onChange={(v) => edit({ notch_hz: v * 1e6 })}
              />
              <NumericProperty
                label="Notch Q"
                value={p.notch_q}
                min={2}
                max={100}
                step={1}
                onChange={(v) => edit({ notch_q: v })}
              />
            </>
          ) : null}
        </>
      ) : null}
      <p className="property-note">
        SciPy signal · offline zero-phase SOS filtering. Raw RF is preserved.
        Reconstruct (F6) applies this chain once; inspect Raw / Conditioned in
        RF data. In the model builder, connect an RF conditioning block.
        Filtering may pre-ring and changes amplitude; it does not change the
        acquisition clock.
      </p>
    </>
  );
}
