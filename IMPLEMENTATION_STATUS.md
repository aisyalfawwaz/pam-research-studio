# Implementation status — 0.11.0 — 2026-11-11

The latest user request expands the earlier Milestone 0/1 scope to five methods and replaces the dashboard interface with an instrument-style desktop workspace.

The subsequent requests explicitly authorize j-Wave, jbubble, their end-to-end coupling, a drag/drop simulation builder, actual live visualization and multiple configurable arrays. All now run in the native developer app. Native Windows CPU was tested; WSL/GPU support is not claimed.

The latest request also authorizes open-source receive DSP and public head CT anatomy. Version 0.6 delivers actual SciPy conditioning, single-slice DICOM import, thresholded HU-to-fluid material maps, heterogeneous j-Wave propagation and matched water/CT PAM comparisons. The public anatomical example and whole-slice preset were exercised manually; automated tests use synthetic DICOM only. See [DSP/CT definitions, credit and numerical evidence](docs/DSP_AND_CT.md).

## Implemented and demonstrated

Version 0.11 adds truth-independent multiple local peaks (P1…Pn), physical separation/relative-power controls, independently adjustable truth matching tolerance, gated one-to-one assignments to S1…Sn, per-source coordinates/errors, missed and extra peak counts, precision/recall/F1 and matched-source RMSE. Reconstruction and Benchmark share persistent detection settings, annotated maps and inspection tables. Benchmark report 1.2 and CSV/JSON/PDF exports retain full criteria and assignments. Old global-peak metrics and completed maps remain unchanged. A real three-source RF fixture detects/matches all three with ATP at the documented settings; changing tolerance does not move or add peaks. See [definitions](docs/PEAK_DETECTION.md) and [fixture](examples/multiple_sources/README.md).

Version 0.11 verification: **88 Python tests, 29 TypeScript tests and all 16 native Electron stories passed**. A final native benchmark/multiple-source regression pair passed after preserving the actively selected method across document changes; report tests also passed after PDF pagination refinement. New and legacy bundles import without rewriting numerical data. The requested new private GitHub repository is [aisyalfawwaz/pam-research-studio](https://github.com/aisyalfawwaz/pam-research-studio).

Version 0.10 adds six integrated research capabilities: bounded Cartesian parameter sweeps; noise-free sampled convergence comparisons with RF reuse where appropriate; seeded Monte Carlo capture/calibration errors with descriptive trial intervals and bootstrap mean intervals; real heterogeneous independent bubble trajectories and per-source coupled volume flows; experimental CT straight-ray receive delays for all five methods; and numerical PDF/WebM presentation exports with provenance and hashes. Studies persist, cancel and resume as new journals without changing completed runs. Source selection, live replay, Properties, reports and exports use the same saved scientific data. See [definitions and limitations](docs/RESEARCH_STUDIES.md), [real example inventory](examples/research_refinements/evidence.json) and the latest build report for verification.

Verification: **83 Python tests, 28 TypeScript tests and all 15 native Electron stories pass**. Final report pagination and study-display checks also pass. Three experiment bundles reproduce numerically through the CLI. The visible native app opens the real example project; both 6-second WebM outputs decode and seek at 960 × 640 with 120 timestamped frames and matching HDF5/SHA-256 context. All 61 example file hashes were verified. Original dialogs and motion preferences are restored after the preview automation. Exact commands and numerical limits are recorded in BUILD_REPORT.md.

Version 0.9 adds actual R(t) playback to Bubble dynamics: automatic slow motion (respecting reduced motion), pause/restart/sample stepping, physical-time slider, selectable cycles/s and loop/end control; synchronized curve cursors and instantaneous values; fixed-scale radius, velocity arrows, equilibrium/rupture guides; and nominal coating regimes/effective tension derived from saved smooth Marmottant parameters. Maximum/minimum radius and first threshold crossing are directly inspectable. No fragments, jets or irreversible shell loss are invented. Full-document layout restores prior panels on exit. See [bubble motion definitions and credit](docs/BUBBLE_DYNAMICS.md).

Version 0.8 refines feature integration: atomic project/analysis/diagram restoration, per-open save guards, authoritative run-option recovery, synchronized method/DSP/backend controls and executable graphs, and raw acquisition replay with the real capture origin. Wide documents restore prior panel visibility and calculation completion respects inspection in other documents. Benchmark report 1.1 adds exact changed-field values, current-minus-reference score deltas, per-project selection and direct saved PAM/RF inspection. Numerical metric formulas and scientific solver limitations are unchanged.

Version 0.7 adds a dedicated benchmark document for the user's evaluation request. It calculates descriptive scores from full saved linear maps, includes physical truth masks and run-pair fingerprints, exposes region/bin validity, and exports CSV/JSON without modifying results. Definitions and frozen five-method/aperture evidence are in [PAM benchmark](docs/PAM_BENCHMARK.md).

| Area | Current capability |
|---|---|
| Multiple-source localization | Truth-independent regional maxima, plateau consolidation, physical NMS, adjustable power/separation/matching/cap; P/S markers and assignments, TP/FP/FN, precision/recall/F1, matched error/RMSE, per-source tables and reproducible report 1.2 exports |
| Research studies | One/two-axis sweeps, noise-free sampled convergence, up to 64 seeded uncertainty cases; bounded sequential execution, persistent journals, cancellation/resume, real metric plots, trial/bootstrap intervals and CSV/JSON/PDF |
| Bubble populations | Per-source independent radius, drive and coating overrides; actual trajectories, common RF normalization and separate coupled volume-flow columns; selected-source inspection/replay and verified HDF5 exchange |
| CT receive reconstruction | Optional fixed straight-ray slowness delays through saved HU-derived speed for all five methods; step/model/hash diagnostics and same-RF comparisons; no refraction or multipath correction |
| Research presentation | Numerical PDF plots/tables with context hashes; timestamped 960 × 640 VP8 WebM bubble/pipeline replay via Chromium WebCodecs and credited Mediabunny; preview, finite duration, actual-data provenance |
| PAM benchmark | Global peak error, lateral/axial half-power widths, truth-ROI concentration, background peak dB, signed contrast, CNR, histogram gCNR, normalized entropy and connected half-power area; configurable physical ROI/bins, stored preferences, validity notes, sortable all-method/run table and real paired maps |
| Benchmark provenance | Report 1.1.0, RF/capture/analysis/source/implementation fingerprints, exact changed contexts and score deltas, map hashes, matched/scenario labels, shared runtime/storage; standalone CSV/JSON and optional manifest-covered benchmark files; old packages remain readable |
| Desktop workspace | File/Edit/View/Simulation/Analysis/Help menus, grouped toolbar, Project tree, document tabs, Properties grid and Messages/Measurements/Run info dock |
| Layout | Resizable and hideable panels, persistent layout/theme, reset command; large and compact windows checked |
| Editing | Numeric SI conversions, draggable/keyboard source positions, source selection, model undo/redo, validated session-bound draft/diagram autosave and complete run-setting restoration |
| Model builder | Typed drag/drop blocks, compatible port wiring, cycle/connection/method validation, templates, graph undo/redo, block parameters, zoom/pan/fit, F7 execution; synchronized method/DSP/backend controls, saved graph and raw timing in provenance |
| Receive arrays | 1–8 arrays, 4–1024 total elements; per-array count, pitch/aperture, centre x/z and angle; full channel order, RF preview, index 1023 trace/CSV and paged 64-channel aperture controls |
| Capacity | 64 MiB raw RF and 96 MiB j-Wave receiver-history budgets; exact uniform-array RCB covariance accumulation, adaptive pixel batches and large-array work guard; multi-array RCB remains ≤64 active channels |
| Identity and credits | Original vector/PNG/Windows ICO emblem, native startup splash and persistent About panel; Aisy Fawwaz · MRes Project · Bioengineering · Imperial College London; separate full upstream library/method credits |
| Receive DSP | Real SciPy DC/trend removal, Butterworth SOS low/high/bandpass and notch; raw/conditioned RF, spectrum, numerical response, selected-signal CSV and immutable coefficient/hash provenance |
| CT anatomy | pydicom/GDCM single-slice import, immutable HU asset, spacing/crop/origin/window controls and real speed/density preview; bundled attributed CC BY 4.0 head CTA plus synthetic skull phantom |
| CT propagation / comparison | Actual j-Wave spatial c/rho fields; paired water/CT clocks and geometry, RF RMS and PAM peak errors; 0.25 MHz patch and whole-slice 0.1 MHz reference, export/import restores HU assets |
| Coupling | Real jbubble radial dynamics → causal filtered volume flow → conservative equivalent 2D j-Wave line source; explicit line length, source checksum and ATP group-delay correction |
| Live/replay | Actual ordered solver pressure/receiver observations, band-limited ≤64² display frames, real radial bubble motion, acquired RF prefix on replay, genuinely computed PAM chunks with uncomputed areas hatched; pause/play/seek and export/reimport |
| Plot inspection | Coordinate readout, pan, wheel/button zoom, fit, truth/peak markers, profile selection, colour maps, relative dB/linear, tiled results; explicit scene axis-scale control |
| Synthetic RF | Native offline homogeneous point-source simulator; single/multiple sources, deterministic noise, bandpass, optional spreading and correct acquisition/source timing |
| j-Wave | Actual j-Wave 0.2.1 2D Fourier k-space propagation; editable spacing/CFL/PML/density; bilinear geometry, clock resampling, CPU limits and process cancellation; experimental native Windows CPU |
| jbubble | Actual jbubble 0.2.0 free/lipid Keller–Miksis dynamics, configurable radius/drive/viscosity/ringdown/tolerance; dimensionless RF via 3D retarded monopole bridge; convergence/Mach/bandwidth guards |
| Bubble inspection | Full HDF5 trajectory; actual radius playback, physical clock/sampling controls and four synchronized plots; saved coating states/tension and event navigation; no-raw bundle replay; upstream/model credits |
| Runtime isolation | Separate Python 3.12/JAX 0.4.38 j-Wave and Python 3.13/JAX 0.8.2 jbubble environments; fixed scripts, no renderer-supplied executable, no silent fallback |
| RF explorer | Signed peak-bin overview, full selected trace and Hann amplitude spectrum; direct channel selection, CSV/HDF5 export |
| Passive DAS | Real peak coherent power computation; reference-only |
| TEA | Real coherent exposure integral, no self-energy subtraction; reference variant |
| CF-DAS | Coherence-weighted amplitude before power, configurable exponent; experimental |
| RCB | Spherical steering uncertainty optimizer, analytic Hermitian covariance, separate numerical loading and diagnostics; uniform-array spatial smoothing, full covariance for multiple/irregular arrays (≤64 active channels); experimental |
| ATP | Calibrated short-pulse window, known-emission and axial plane-wave variants, timing validation and no ground-truth coordinates used to calculate the map; experimental |
| Reanalysis | Grid, temporal gate, aperture and method parameters may change on the same RF; scene/acquisition changes require simulation |
| Persistence | Versioned SQLite metadata, immutable completed runs, HDF5 arrays, distinct capture/reconstruction configurations, interrupted-run recovery |
| Exchange | Actual maps, measurements, method options/identities, figures, source checksum, environment, citations and SHA-256 inventory; explicit raw RF choice; legacy two-method bundles remain readable |
| Security | Sandboxed/context-isolated renderer; fixed IPC operations and exact sender validation; token-authenticated dynamic-port loopback worker; restricted navigation and permissions |

## Validation

- **73 Python tests:** previous 71 plus stale project-session save rejection and authenticated detailed benchmark evaluation/export with actual reanalysis deltas.
- **26 TypeScript tests:** previous 21 plus physical bubble interpolation/clock, stored smooth-shell thresholds/tension/crossing, playback slowing/wrap/stop and malformed-trajectory rejection.
- **13 native Electron E2E scenarios:** previous twelve plus project/analysis/diagram restoration and preset execution; extended benchmark navigation/deltas and synthetic CT raw-replay/backend-switch coverage. No numerical results are mocked. Final command outcomes are recorded in BUILD_REPORT.md.
- Production build, Ruff, development renderer and CLI reproduction checks are recorded in BUILD_REPORT.md. Both isolated installed runtimes pass pip-audit with no known advisories.

Actual screenshots are under docs/images/, including the public CT anatomy, paired maps and real field replay. New paired packages are examples/ct_skull_patch and examples/ct_head_slice; earlier reference packages remain unchanged. Exact commands and evidence are in BUILD_REPORT.md.

The new synthetic `examples/pam_benchmark` freezes five maps/scores for full and alternating receive-channel selections on identical raw RF; both bundles reproduce. `comparison.csv`/JSON and actual UI images `pam-benchmark*.png` are provided. Histogram gCNR is a descriptive PAM adaptation with cited original authors, not a validated detection probability; no universal aggregate score or per-method timing is fabricated.

`examples/workspace_refinements` preserves the same frozen scientific data and original 0.7 provenance while adding 1.1 reports, exact aperture differences and deltas. Earlier example files are unchanged.

## Scientific status

No algorithm is labelled verified. CF, RCB and ATP are experimental implementations with explicit definitions and synthetic evidence. Independent publication-equation review, comparison with external implementations and experimental-data validation remain required for stronger claims.

RF and reconstruction units remain arbitrary/dimensionless. jbubble pressure plots are model predictions in Pa. Coupling is one-way radial dynamics → equivalent-line 2D acoustics, with no 3D pressure equivalence, feedback, bubble interactions, nonspherical deformation or jets. Element width/directivity, elevation, transmit steering and ADC saturation are absent. CT introduces experimental speed/density heterogeneity, **zero absorption and no elastic/shear physics**; air/soft tissue become host fluid and receive mapping remains uncorrected. No patient-specific HU calibration or 3D registration is claimed. Live physical time is distinct from CPU wall time; pressure previews are spatially band-limited displays. Global-peak/FWHM/background, RCB aperture and ATP timing limitations remain. See docs/WORKFLOW_AND_COUPLING.md and docs/DSP_AND_CT.md. No pressure/dose/safety/biological validity is claimed.

Runtime is shared wall time of selected methods; byte counts describe arrays, not peak process memory. The demo runs all five on CPU, without a universal runtime guarantee.

## Remaining work

- Independent numerical validation and broader fixtures across source separation, timing/medium errors and hardware.
- Generic raw RF/MAT/UFF/IQ imports, frequency-resolved PAM, inverse parameter fitting, experiment annotations and additional simulation adapters.
- EISRCB and other advanced methods beyond the five requested are not implemented or exposed as runnable.
- Two-way/3D multiphysics coupling, physical nonspherical breakup/fragmentation, 3D DICOM stacks, elastic/shear/absorbing skull propagation, refracted/multipath receive reconstruction, arbitrary hand-painted material fields and WSL/GPU execution are not implemented/tested. The new CT receive model is a fixed straight-ray approximation. k-Wave-python, USTB/PyBF/PyMUST and SimUSCav adapters are not installed. SimUSCav licensing remains unresolved.
- A bundled Python runtime, signed Windows installer, complete native redistribution audit, repository redistribution license and institutional/IP approval are not delivered. The native developer app is tested and usable.
- Hosted CI, Linux/macOS desktop execution and clean-machine installer tests are not claimed. A moderate minimatch advisory remains in the development-only electron-builder dependency tree; production JS/Python dependency audit results are recorded in BUILD_REPORT.md.
