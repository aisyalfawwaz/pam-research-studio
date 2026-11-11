import { NumericProperty } from "./InstrumentControls";
import { arrayList } from "./arrayGeometry";
import type { ArrayModel } from "./arrayGeometry";
import type { Config } from "../../../packages/contracts";
export function ArrayEditor({
  cfg,
  onChange,
  selected = 0,
  onSelect = () => {},
}: {
  cfg: Config;
  onChange: (c: Config) => void;
  selected?: number;
  onSelect?: (i: number) => void;
}) {
  const arrays = arrayList(cfg),
    index = Math.min(selected, arrays.length - 1),
    a = arrays[index];
  const commit = (next: ArrayModel[]) =>
    onChange({
      ...cfg,
      arrays: next,
      channels: next.reduce((s, a) => s + a.elements, 0),
      active_channels:
        next.reduce((s, a) => s + a.elements, 0) !== cfg.channels ||
        next.length !== arrays.length
          ? null
          : cfg.active_channels,
    });
  const edit = (patch: Partial<ArrayModel>) =>
    commit(arrays.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  return (
    <div className="array-editor">
      <NumericProperty
        label="Number of arrays"
        value={arrays.length}
        min={1}
        max={Math.min(8, arrays.length + Math.floor((1024 - cfg.channels) / 8))}
        step={1}
        onChange={(v) => {
          if (!Number.isInteger(v)) return;
          const next = arrays.slice(0, v);
          while (next.length < v)
            next.push({
              name: `Array ${next.length + 1}`,
              elements: 8,
              pitch_m: 0.0003,
              x_m: 0.01,
              z_m: 0.005 + next.length * 0.003,
              angle_deg: 90,
            });
          commit(next);
          onSelect(0);
        }}
      />
      <div className="select-property property-row">
        <label htmlFor="active-array">Receive array</label>
        <select
          id="active-array"
          value={index}
          onChange={(e) => onSelect(Number(e.target.value))}
        >
          {arrays.map((a, i) => (
            <option key={i} value={i}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div className="property-actions">
        <button
          disabled={arrays.length >= 8 || cfg.channels + 8 > 1024}
          onClick={() => {
            commit([
              ...arrays,
              {
                name: `Array ${arrays.length + 1}`,
                elements: 8,
                pitch_m: 0.0003,
                x_m: 0.01,
                z_m: 0.005 + arrays.length * 0.003,
                angle_deg: 90,
              },
            ]);
            onSelect(arrays.length);
          }}
        >
          Add array
        </button>
        <button
          disabled={arrays.length === 1}
          onClick={() => {
            commit(arrays.filter((_, i) => i !== index));
            onSelect(0);
          }}
        >
          Remove array
        </button>
      </div>
      <NumericProperty
        label="Array elements"
        value={a.elements}
        min={arrays.length === 1 ? 4 : 2}
        max={1024 - (cfg.channels - a.elements)}
        step={1}
        onChange={(v) => edit({ elements: v })}
      />
      <NumericProperty
        label="Array pitch"
        unit="mm"
        value={a.pitch_m * 1000}
        min={0.05}
        max={2}
        step={0.05}
        onChange={(v) => edit({ pitch_m: v / 1000 })}
      />
      <NumericProperty
        label="Array centre x"
        unit="mm"
        value={a.x_m * 1000}
        min={-100}
        max={100}
        step={0.1}
        onChange={(v) => edit({ x_m: v / 1000 })}
      />
      <NumericProperty
        label="Array centre z"
        unit="mm"
        value={a.z_m * 1000}
        min={-100}
        max={150}
        step={0.1}
        onChange={(v) => edit({ z_m: v / 1000 })}
      />
      <NumericProperty
        label="Array angle"
        unit="°"
        value={a.angle_deg}
        min={-180}
        max={180}
        step={5}
        onChange={(v) => edit({ angle_deg: v })}
      />
      <div className="read-property">
        <span>Centre-to-centre aperture</span>
        <span>{((a.elements - 1) * a.pitch_m * 1000).toFixed(2)} mm</span>
      </div>
      <NumericProperty
        label="Array aperture"
        unit="mm"
        value={(a.elements - 1) * a.pitch_m * 1000}
        min={(a.elements - 1) * 0.05}
        max={(a.elements - 1) * 2}
        step={0.1}
        onChange={(v) => edit({ pitch_m: v / 1000 / (a.elements - 1) })}
      />
      <div className="read-property">
        <span>Layout</span>
        <span>
          {arrays.length} arrays · {cfg.channels} channels
        </span>
      </div>
      <p className="property-note">
        Drag an array in Scene to position it. Positive angle rotates toward +z.
        Point receivers; no transmit steering or finite-element directivity. Up
        to 1024 total channels. Large arrays increase CPU time and acoustic
        domain size.
      </p>
    </div>
  );
}
