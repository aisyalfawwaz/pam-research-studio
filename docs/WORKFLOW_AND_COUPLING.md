# Model builder, arrays and coupled solver — 0.6

Version 0.10 adds per-source bubble overrides and separate volume-flow columns for heterogeneous independent sources. Source trajectories, strength normalization, waveform hashes and replay selection remain tied to the same immutable run. There is no bubble–bubble feedback. See [population and study definitions](RESEARCH_STUDIES.md); the original identical-source case below remains supported.

CT medium and SciPy receive-conditioning blocks extend this workflow in 0.6. Their actual input models, HU formula, matched comparisons, attribution and limitations are documented in [DSP and CT](DSP_AND_CT.md). Homogeneous propagation below remains the default; a selected CT asset supplies spatial sound speed and density to the same 2D solver.

The Model builder compiles a typed graph into the fixed scientific pipelines. Drag blocks from the library, move them on the canvas, connect compatible ports, select reconstruction methods, then **Validate** and **Run model / F7**. Click Parameters or double-click a block to open its physical controls. The Scene layout command opens actual source/receiver geometry. Graph edits have separate undo/redo, keyboard movement/deletion, zoom, pan and fit. Templates replace physical settings as well as connections. Graphs and raw editor analysis settings autosave in the project; every executed graph is copied into the immutable run's provenance.

Supported paths are analytic source → geometric propagation, reference source → j-Wave, jBubble → 3D monopole, and jBubble → volume-flow coupling → j-Wave. All produce RF for the same DAS, TEA, CF, RCB and ATP implementations. These are fixed supported blocks, not arbitrary code execution. Validation rejects cycles, incompatible/missing connections, duplicate method blocks, disconnected computation and unsupported combinations. A graph currently has one drive, scene, probe collection and propagator. Several reconstruction blocks consume the same RF independently.

## Multiple receive arrays

Model → Receive array controls **1–8 arrays, 4–1024 total channels**, with at least two elements per array (four for a single array). Edit element count, pitch (0.05–2 mm), centre-to-centre aperture, centre x/z and angle. Aperture changes pitch. Add/remove arrays, select an array in Scene, drag it or use arrow keys; Shift uses a 1 mm rather than 0.1 mm keyboard step. One drag is one undo operation. A paged aperture editor displays 64 channel toggles at a time; indices are zero-based. Capture memory and large-array CPU limits are in [capacity notes](CAPACITY_AND_BRANDING.md).

For array centre `(xc,zc)`, element `i`, pitch `d`, angle θ and M elements:

`offset=(i−(M−1)/2)d; x=xc+offset cosθ; z=zc+offset sinθ`.

Flatten channels in array-list order, then increasing local element index. HDF5 records `probe/positions_xyz_m`, `probe/array_index` and `probe/element_index`. Both analytic timing and j-Wave interpolation use these same actual coordinates; the reconstruction uses full receiver-to-pixel distances. Source-capture coverage is checked against all elements. Coincident receivers are rejected. A different pose/count requires new RF. Completed runs retain the original geometry.

These are passive, ideal point receivers. Element width, elevation, receive directivity, transmit steering/delays, electrical coupling and finite transducer impulse responses are absent. The editable aperture is the distance between first/last element centres. For several arrays or irregular layouts, RCB uses the complete active covariance and disables translation-based spatial smoothing across gaps. Its resource bound is 64 active channels in this mode; the other methods support 1024 total channels. Uniform single-array RCB supports 1024 with exact subarray accumulation and explicit work limits. Per-array pitch warnings use the coupled source stopband where applicable.

## One-way bubble → acoustic coupling

The installed, unmodified jbubble 0.2.0 CPU runtime solves radial Keller–Miksis dynamics. Its original free/lipid laws, constants, convergence checks and citation remain recorded. The second, separately installed j-Wave 0.2.1 CPU runtime solves homogeneous, linear, two-dimensional acoustics. They exchange arrays, not incompatible JAX objects.

From radius R (m) and wall velocity Rdot (m/s), form **Q3D=4πR²Rdot** (m³/s). Apply a causal, odd-length, 80 dB Kaiser FIR to Q at the saved trajectory sampling rate. Passband is the user setting, cutoff 1.25×passband and stopband 1.5×passband; retain the full convolution and its group delay `(taps−1)/(2 fs)`. The source never starts before the bubble trajectory. The acquisition must cover the full filtered source support and geometric travel times. A source checksum, filter definition and delay are saved.

An explicitly chosen out-of-plane equivalent length **L** converts to **Q2D=Q3D/L** (m²/s). In the native two-dimensional j-Wave Sources convention, inject the Pa-valued coefficient

`S=ρ c Q3D/(2 L dx)`.

j-Wave splits the mass source across two dimensions: the summed density rate is `2S/(c dx)=ρQ3D/(L dx²)`. Bilinear cell weights sum to one. This conserves the imposed equivalent-line volume flow. Source amplitude multiplies Q; it does not change nonlinear bubble dynamics. The 3D pressure-at-1-mm trajectory is a separate diagnostic and is **not** injected into j-Wave. No pre-applied `1/r` or second propagation delay is used. The solver handles field propagation and receiver sampling.

RF and stored display fields are `p2D/Pdrive`, dimensionless model predictions. Changing L changes amplitude by 1/L in linear propagation; it does not establish a physically unique 3D pressure. The point approximation requires `Rmax < dx/4`; existing CFL, bandwidth, domain and CPU limits also apply. The user must still establish convergence for a study.

ATP editor timing is in the drive/trigger clock. Graph compilation adds the causal filter group delay exactly once to the effective ATP emission/trigger setting; runs export that effective setting and retain raw editor timing in the workflow. Reproduce consumes the effective options directly. ATP's short window can omit bubble ringdown. No source truth location enters this timing correction.

This is **one-way** coupling: no acoustic feedback to the bubble, bubble interaction, resolved gas/liquid interface, nonspherical deformation, jet formation, nonlinear shock propagation or 3D tissue simulation. The radial visualization depicts the actual spherical radius solution. It cannot honestly show asymmetric bubble breakup.

## Live acquisition and replay

Workspace refinement (0.8): changing the method checkboxes updates reconstruction blocks; switching receive conditioning inserts/removes its connected DSP block while retaining unrelated block positions. A backend switch builds the corresponding source/propagation graph and preserves compatible solver spacing, bubble drive, geometry and DSP settings. CT is detached when choosing an analytic/monopole backend. Invalid remaining clock, mesh or gate settings are still rejected rather than silently altered. New-project/preset analysis defaults account for resource and ATP-clock constraints; explicit user method selections remain subject to the real engine validation.

Loading a completed run restores authoritative stored method options and raw editor timing. For coupled known-emission ATP, the causal source-filter delay is removed for editing and applied once at compilation/reconstruction. Unknown-emission timing is not shifted. Older saved diagrams whose method blocks disagree with the actual reconstruction are rebuilt with a visible message. Atomic project hydration and per-open session IDs prevent delayed draft/diagram autosaves from writing into a different project.

An ordered observation callback reads actual j-Wave pressure and bilinear receiver samples at solver step ends. The observer never changes solver state. It emits at most 257 snapshots per run and atomically replaces a small local NPZ; the UI polls while the job runs. Time shown is **physical simulation time**, not a claim that CPU calculations match ultrasound wall-clock time. The bubble uses source-relative time; the acoustic field and RF use the acquisition clock.

Pressure previews are Fourier low-pass filtered before spatial decimation to at most 64×64 samples. These are spatially band-limited field displays, not full-resolution scientific field exports. Physical x/z scale is equal; source and receiver overlays use the run's frozen geometry. Full acquisition RF is independently anti-alias filtered and decimated to its configured clock, with seeded noise applied afterwards. Live RF is a signed-peak-binned solver history before that processing. Replay displays the acquired RF prefix at the frame's time. Sensor colours during live acquisition indicate actual instantaneous values.

PAM reconstruction follows completed RF acquisition. The monitor reveals genuinely computed pixel chunks and hatches uncomputed pixels. It does not pretend the final image evolves causally during propagation. Replay explicitly labels the completed map **Final PAM**. Stored field frames, timestamps, bubble trajectory, coupling waveform, graph, geometry, RF and all selected maps survive export/reimport. Pause/play/seek replays the recorded samples rather than rerunning physics.

Replay always takes the **raw** acquisition overview, independently of the RF Explorer raw/conditioned selector. Its signed-peak bins appear only after the complete bin has been acquired, including a final short bin; the time axis uses the saved nonzero capture origin and sampling rate. Before capture, or when raw RF was omitted, the monitor explains why no acquired trace is shown. Zero-phase DSP is inspected separately and is not represented as a causal live acquisition.

## Reproducible example

`examples/coupled_arrays` is generated by `uv run python scripts/make-coupled-reference.py` without overwriting earlier fixtures. Its canonical template has two 16-element arrays, a 2 µm lipid bubble at (0,12) mm, a 0.5 MHz/20 kPa/4 µs drive, 0.25 mm j-Wave spacing, 1 mm equivalent length, 0.7 MHz coupling passband, 512 samples at 10 MHz and five 65² maps. Inspect `BENCHMARK.json` and the bundle's `METHODS.md`, manifests and citations. Reproduce with:

```powershell
uv run python -m pamstudio.cli reproduce examples/coupled_arrays/bundle
```

Evidence includes real native CPU execution, analytical receiver-arrival checks under rotated poses, causal-filter volume conservation, observer on/off RF invariance, inverse-length scaling, graph rejection tests and native Electron drag/undo/live/replay/export workflows. These implementation tests do not constitute independent scientific or experimental validation.
