# Build report — 0.11.0 — 2026-11-11

The user requested more than the single displayed peak, with tolerance controls and comparison to multiple ground-truth sources, then explicitly requested committing the complete project to a new GitHub repository. The earlier UI displayed only the global argmax. This increment adds a separate, versioned local-peak detector and one-to-one source evaluation without changing the saved maps or their legacy global-peak metrics.

## Multiple-source implementation

- Detector `pam.peaks.regional_nms` 1.0.0 uses the full saved linear map, 3 × 3 maxima, 8-connected maximum-plateau consolidation (rejecting flat shelves connected to higher values), stable physical centre-nearest representatives, relative-power thresholding and amplitude-ordered Euclidean separation suppression. Detection has no truth input and never targets the configured source count. The cap is bounded to 128 and flagged if reached.
- Source matching is a separate gated rectangular assignment: maximize match cardinality before total distance, with unique dummy columns and explicit forbidden pairs. A peak can explain only one in-view source. Out-of-map truth, boundary peaks, quantization, missing scores and cap effects are explicit. No subpixel/super-resolution claim is made.
- Reconstruction/Benchmark show P1…Pn and S1…Sn, links, per-source coordinates/errors, all detected candidates, matched/missed/extra counts, precision, recall, F1 and matched-source mean/RMSE. Adjustable threshold, separation, truth tolerance and cap persist locally. Benchmark rows can sort by detection criteria. Legacy measurements are labelled global peaks.
- Benchmark report 1.2 contains full effective detector settings, identifiers and assignments. CSV includes quoted peak/truth JSON and criteria; JSON preserves the full structure. PDF accepts current evaluation settings through typed IPC/authenticated routes, prints source-match tables and annotated maps. Study reports retain frozen settings. Finished HDF5 is never modified by evaluation.
- Async map evaluation cancels stale responses and scopes results to run/settings. Expanded source tables stay expanded while criteria change. The active reconstruction method now takes priority over a previously stored Benchmark method, preventing an unexpected ATP→CF switch on document navigation. No new package or scientific backend is introduced.

## Verification

| Exact command | Observed outcome |
|---|---|
| `uv sync`, then `uv sync --locked` | Project metadata/lock updated to 0.11.0; existing dependency versions retained; locked sync passes |
| `uv run python scripts/export-contracts.py` | Config/analysis/OpenAPI contracts updated, including optional bounded peak settings and PDF evaluation request |
| `uv run ruff check engine/src/pamstudio engine/tests scripts/multipeak-evidence.py` | All checks passed |
| `uv run pytest engine/tests/test_peaks.py engine/tests/test_benchmark.py -q` | **10 passed**, 12.73 s; `.local/multipeak-science-targeted.log` |
| `uv run pytest` | **88 passed**, 4 warnings, 262.46 s; `.local/multipeak-pytest-full.log` |
| `uv run pytest engine/tests/test_peaks.py engine/tests/test_population_reports.py -q` after PDF-only pagination refinement | **9 passed**, 47.02 s; `.local/multipeak-report-final-tests.log` |
| `pnpm test` | **29 passed**, 4 files; `.local/multipeak-ts-final.log` |
| `pnpm test:e2e` | **16 passed**, 6.1 min, including the complete new multiple-source native story; `.local/multipeak-e2e-full.log` |
| Final `pnpm build` and `pnpm exec playwright test apps/desktop/tests/peaks.spec.ts apps/desktop/tests/benchmark.spec.ts` | Build passed; **2 passed**, 30.5 s, after preserving active method across document switches; `.local/multipeak-native-final.log` |
| Final `pnpm build` and `pnpm exec playwright test apps/desktop/tests/peaks.spec.ts` after label-contrast styling | Build passed; **1 passed**, 13.4 s; `.local/multipeak-label-final.log` |
| `node scripts/preview-multipeak.mjs --keep-open` | Actual saved run opened in native app; 3 P/S pairs, unchanged detections under stricter tolerance, Benchmark navigation, restored dialogs, readable labels and no renderer errors verified. Native app left at ATP reconstruction; `.local/multipeak-preview.json`, `docs/images/multiple-source-*.png` |
| `uv run python scripts/multipeak-evidence.py` | Actual 64-channel RF → four methods → three-source evaluation, threshold/tolerance variants, ZIP/PDF/CSV/JSON and hashes; `.local/multipeak-evidence.log` |
| `uv run python -m pamstudio.cli reproduce examples/multiple_sources/experiment_files_8ac778cf` | DAS, TEA, CF, ATP reproduced within rtol=1e-10, atol=1e-14; `.local/multipeak-reproduce.log` |
| `pdftoppm -scale-to 1100 -png examples/multiple_sources/localization.pdf .local/report-qa/multipeak-final` | All four PDF pages visually inspected; per-method text stays with its source table, global error label is explicit, maps are annotated and output is readable |

New scientific tests exercise unequal weak peaks and false positives, amplitude scale invariance, matching-only tolerance changes, unresolved plateaus, a greedy-assignment counterexample, anisotropic physical spacing, cap/flat/zero/boundary/out-of-view behavior, real three-source RF, read-only HDF5, exchange, quoted CSV and authenticated custom-PDF output. The native story changes all three controls and verifies P/S markers, per-source matches, raw RF/map hash preservation in exported reports and method consistency on navigation. Targeted visual testing identified and fixed disclosure reset during recalculation and a stored Benchmark-method override; PDF QA identified and corrected an orphaned per-method table lead.

The frozen example uses sources (−6,28), (0,35), (6,25) mm with RF amplitudes 1, 0.6, 0.3. ATP at −12 dB, 2 mm separation and 2 mm matching tolerance yields **3 detections / 3 matches / 0 extras**, matched RMSE **0.19432 mm**. At −20 dB it yields 5 detections, including 2 extras. At 0.05 mm matching tolerance the same 3 detection coordinates remain, with only 1 accepted match. CF/DAS have additional sidelobe candidates; TEA has 3 candidates but only 1 in-tolerance match. These outcomes are retained rather than forced to the source count.

The original coupled two-bubble example was also evaluated without changing its arrays: at 2 mm tolerance each of CF/DAS/TEA matches 1 of 2 sources; at 4 mm each matches 2. Their detected counts remain unchanged (9/15/10 respectively). This is tolerance-dependent geometric assignment, not improved image resolution. See `.local/multipeak-existing-population.log` and [detector definitions](docs/PEAK_DETECTION.md).

## Repository preparation

A new private repository was created under the verified authenticated account: [aisyalfawwaz/pam-research-studio](https://github.com/aisyalfawwaz/pam-research-studio). The existing project had no Git history; `main` and `origin` are initialized for the requested initial commit. Existing Git author settings are retained. Local environments, caches, sidecar runtimes, logs and build outputs are ignored. Credential-pattern scanning found no matches in publishable text files. Git attributes preserve exact example/dataset bytes so checkout cannot invalidate scientific manifests; source text uses LF. Original library/dataset attribution remains intact, and no repository redistribution license is invented. Publication SHA/status is recorded in the delivery and ignored local publication log.

---

# Historical build report — 0.10.0 — 2026-11-11

The user authorized all six proposed research refinements. This version connects actual scientific runs to a new Studies document, independent heterogeneous bubble populations, experimental CT receive delays, and PDF/WebM exports. The existing offline reference pipeline, five methods, security boundary, 1024-channel capacity and original example bundles remain available.

## Version 0.10 changes

- Parameter sweeps run a bounded one/two-axis Cartesian plan through the normal engine. Convergence studies disable capture noise and reuse RF for grid/gate/ray-step changes, or rerun acquisition when its sampling/solver settings change. Full linear-map and RF relative L2 errors use the finest sampled reference; no exact error/order is claimed.
- Uncertainty trials change true host speed, individual sensor x/z positions and actual seeded RF noise while reconstruction retains nominal calibration. Descriptive trial intervals and seeded percentile-bootstrap mean intervals retain valid/total counts and missing values. Stop/restart recovery, cancellation and resume-as-new journals preserve completed immutable runs and enforce matching engine source identity.
- Source-specific radius/coating/drive/ringdown overrides execute real jbubble radial solves. Monopole RF sums independent retarded sources with common normalization; coupled propagation passes one causal volume-flow waveform per source. HDF5, replay, source selection, exports and import validation retain the full population. No interactions, feedback, jets or fragments are fabricated.
- CT straight-ray receive reconstruction integrates slowness through the saved HU-derived fluid speed map with bounded trapezoidal quadrature. DAS, TEA, CF, RCB and ATP retain their method identities; receive-model identity/version/HU hash are separate diagnostics. The native story reconstructs the same recorded RF using both delay models. Switching to a backend without CT resets incompatible receive delays and the executable diagram together.
- PDF reports contain real numerical settings, maps, RF/trajectory plots, case inventories, scores, limitations and references, with a full companion JSON and SHA-256. WebM export records actual source curves or saved wave/RF/final-PAM replay at 960 × 640; the final map appears after acquisition. Native save validates typed bytes, EBML signature, size, metadata and immutable run context, and writes a hash/provenance companion. Recording has an actual canvas preview; no external video binary or remote rendering service is used.
- Electron retains contextIsolation, sandboxing, disabled node integration, sender checks and localhost token authentication. Study launches/resumes bind to the active project generation. Video data crosses the context bridge as a bounded Uint8Array. Recording uses software-preferred Chromium WebCodecs VP8 with an explicitly timestamped CanvasSource and unmodified Mediabunny 1.65.2 WebM muxing. It does not depend on compositor repaint timing; static/offscreen CT recording is exercised in the native test.

Mediabunny's exact npm metadata and original source license were checked before installation: version 1.65.2, MPL-2.0. Its source is unmodified; full license, source archive URL, lock integrity and original notices are retained in docs and in About. The two new transitive DOM type packages retain MIT notices. Primary API references: [writing output](https://mediabunny.dev/guide/writing-media-files), [CanvasSource and backpressure](https://mediabunny.dev/guide/media-sources). No FFmpeg runtime or remote media service is added.

## Verification

| Exact command | Observed outcome |
|---|---|
| `uv sync --locked` and `pnpm install --frozen-lockfile` | Final lockfiles accepted; local environments already up to date |
| `uv sync` | Project updated to 0.10.0; ReportLab 5.1.0 and charset-normalizer 3.5.2 locked; existing scientific dependencies retained |
| `uv run python scripts/export-contracts.py` | Config/analysis/OpenAPI/demo/template contracts regenerated; legacy persisted options still omit new default fields |
| `uv run ruff check engine/src/pamstudio engine/tests scripts/research-evidence.py` | All checks passed |
| `uv run pytest` | **83 passed**, 4 warnings, 215.60 s; `.local/research-pytest-full.log` |
| `uv run pytest engine/tests/test_population_reports.py -q` after PDF pagination refinement | **4 passed**, 40.49 s; `.local/research-report-final-tests.log` |
| `pnpm test` | **28 passed** across 4 files; `.local/research-unit-final.log` |
| `pnpm build` and `pnpm exec playwright test -g 'synthetic CT only\|bubble population'` | Final WebCodecs implementation: **2 passed**, 1.3 min; bubble duration verified as 2 s, both native files valid; `.local/research-webcodecs-native.log` |
| `pnpm test:e2e` | **15 passed**, 5.1 min; production TypeScript/Vite/Electron build passed; `.local/research-e2e-release.log` |
| Final `pnpm build` and `pnpm exec playwright test -g 'research studies:'` | Build passed; **1 passed**, 14.2 s after exact-seed display and final breadcrumb/population wording; `.local/research-study-display-final.log` |
| `node scripts/preview-research.mjs --keep-open` | Real saved project opened; bubble/pipeline WebM exports decoded and sought at 960 × 640, 6 s / 120 frames; study views inspected; no renderer errors. Native dialogs/motion preference restored; responsive visible app left on Studies. Evidence in `.local/research-preview.json` and `docs/images/research-*.png` |
| `uv run python scripts/research-evidence.py` | Actual 4-case sweep, 3-case convergence, 16 uncertainty trials and heterogeneous coupled population; all complete; `.local/research-evidence.log` |
| `uv run python -m pamstudio.cli reproduce examples/research_refinements/population-experiment_files_0d5e03f0` | DAS/TEA/CF reproduced within rtol=1e-7, atol=1e-12; `.local/research-population-reproduce.log` |
| `uv run python -m pamstudio.cli reproduce examples/research_refinements/ct-corrected-experiment_files_300aed14` | DAS/TEA/CF/ATP reproduced within rtol=1e-7, atol=1e-12; saved synthetic CT HU and exact same-RF comparison retained; `.local/research-ct-reproduce.log` |
| `uv run python -m pamstudio.cli reproduce examples/research_refinements/uncertainty-experiment_files_d52be58f` | DAS/TEA/CF reproduced within rtol=1e-10, atol=1e-14; `.local/research-trial-reproduce.log` |
| `pdftoppm -scale-to 1100 -png examples/research_refinements/uncertainty.pdf .local/report-qa/revised-uncertainty` and corresponding population/sweep/convergence/CT renders | All 13 report pages visually inspected. Population 3 pages, uncertainty 3, sweep 2, convergence 2, CT 3. Tables repeat headers and keep numerical values intact; no orphan plot headings. Hash/context companions match current PDFs |
| `uvx pip-audit --path .venv/Lib/site-packages --format json --output .local/research-pip-audit.json` | No known vulnerabilities found |
| `pnpm audit --prod --json` | Zero known production JavaScript advisories; `.local/research-pnpm-audit.json` |
| `uv run python scripts/license-inventory.py` | Installed package versions and original notices refreshed, including ReportLab BSD and charset-normalizer MIT |

New scientific assertions cover actual Monte Carlo mismatch with nominal reconstruction geometry, uniform CT analytical travel time and known-pulse localization, independently summed monopole RF, separate coupled flow columns/checksums, export/import population identity, immutable arrays, deterministic bootstrap summaries, cancellation/resume/recovery and authenticated project bindings. Native tests cover the complete study UI and exports, per-source physical controls, decodable WebM, CT correction on identical RF, and backend detachment.

Targeted testing found and fixed the ArrayBuffer/context-bridge mismatch, intermittent zero-frame MediaRecorder capture of offscreen documents (replaced with timestamped WebCodecs encoding), and CT delay options surviving a switch to the analytic backend. A project-open/tab race is fixed by disabling document navigation only while project actions are pending. A water/CT matching attempt during a live engine-source edit correctly refused to pair the runs; the final suite runs with frozen engine code. Earlier failed assertions in development concerned invalid test assumptions (unavailable sparse-mask gCNR and the established frame dimension of HDF5 RF), not replaced or fabricated metrics.

React review covered request/effect cleanup, project-scoped study selection, source/run-bound bubble buffers, fixed plot/radius scales, bounded UI summaries, encoder/output cleanup, Blob URL revocation, disabled export controls during recording, keyboard access and modal shortcut isolation. Native recording remains slow-motion presentation, not wall-clock real-time acoustics. Explicit frame count, duration, fps, encoder and muxer are recorded separately from physical simulation time. The Vite build warns about a roughly 529 kB main chunk and a lazily loaded 170 kB video chunk; it completes successfully.

Scientific limitations remain explicit: sampled convergence is not independent solver validation; bootstrap coverage is not clinically calibrated; Gaussian uncertainty is an assumed error model; bubbles are independent spherical radial models; coupling is one-way equivalent 2D line-source acoustics; CT is a thresholded single-slice fluid model and receive rays do not bend. Shear, absorption, multiple scattering feedback, physical fragmentation, 3D stacks, GPU validation and a signed/bundled installer are outside this delivered increment. Original institutional/project and upstream author credits are preserved. Detailed definitions: [research studies](docs/RESEARCH_STUDIES.md). Actual fixtures: [evidence](examples/research_refinements/evidence.json).

---

# Historical build report — 0.9.0 — 2026-11-11

The user requested a moving bubble illustration that corresponds to the simulated oscillation or breakup, rather than a stationary picture. **Bubble dynamics now plays the actual stored radial solution**, with fixed physical scale, velocity arrows, synchronized radius/drive/emission/velocity cursors and instantaneous numerical values. The saved smooth Marmottant shell parameters determine nominal buckled/elastic/rupture styling and effective surface tension. There is no invented fragmentation or explosion: the installed radial model does not resolve fragment populations or jets.

Play/Pause, restart, previous/next output sample, physical-time seek, selectable slow-motion cycles/s, loop/end control, chart click/keyboard seek and extrema/first-shell-crossing navigation are available. Playback starts automatically unless reduced motion is requested, and stops on document unmount/hiding. The bubble inspector expands the workspace and restores prior panels on exit. Event controls stay above scrollable scientific content. Existing trajectories, including packages omitting RF, work without another solve.

## Version 0.9 verification

| Exact command | Observed outcome |
|---|---|
| `pnpm check` | TypeScript passed |
| `pnpm test` | **26 passed**: previous 21 plus five bubble cases covering source clock/units/interpolation/extrema, saved shell provenance/thresholds/crossing, analytical smooth-law limits, slowing/wrap/end and invalid trajectory rejection |
| `pnpm exec playwright test -g 'jBubble CPU'` | **1 passed**, 40.4 s; real jbubble output compared with SVG radius, fixed-scale max/min ratio, rupture/buckling states, animation changes/Pause freeze, four time cursors, sample/keyboard controls, loop-off stop and no-RF export/reimport |
| `uv sync --locked` and `pnpm install --frozen-lockfile` | Final lockfiles accepted; local environments already up to date |
| `uv sync` | Project/lock metadata updated to 0.9.0; dependency versions unchanged |
| `uv run python scripts/export-contracts.py` | API version metadata refreshed; no new IPC/route |
| `uv run ruff check engine adapters` | All checks passed |
| `uv run pytest` | **73 passed**, 213.69 s; four existing upstream Starlette/GDCM warnings; log `.local/bubble-motion-pytest.log` |
| `pnpm build` and `pnpm exec playwright test -g 'synthetic CT only\|bubble population'` | Final WebCodecs implementation: **2 passed**, 1.3 min; bubble duration verified as 2 s, both native files valid; `.local/research-webcodecs-native.log` |
| `pnpm test:e2e` | Build passed; **all 13 native scenarios passed**, 4.7 min; extended actual jbubble motion/no-RF story 41.3 s; startup credits remain within splash viewport; log `.local/bubble-motion-e2e.log` |
| `uv run python scripts/license-inventory.py` | Installed 0.9 project metadata refreshed; upstream versions/licenses unchanged |
| Final `pnpm build` and `pnpm exec playwright test -g 'jBubble CPU'` after local scrolling adjustment | Build passed; **1 passed**, 45.0 s; final motion/clock/shell/no-RF story |
| `node scripts/preview-bubble-motion.mjs --keep-open` | Actual frozen synthetic jbubble package imported through native File menu; saved settings restored; reduced-motion pause, extrema, compact layout and resumed animation checked. Four synchronized traces, no renderer errors; latest native window `Responding=True`; playback left running with hidden helper console |

The first targeted script invocation passed its grep after `--`, which started all native tests instead of filtering; it was stopped and rerun with the explicit command above. Numerical assertions passed. Visual inspection of its initial screenshot exposed that event controls below the tall bubble panel could scroll the illustration out of sight; the controls were moved above the scrolling grid and the Bubble document given the same expanded layout as other scientific inspection documents. Full-suite testing uses that corrected layout. No scientific kernel or upstream package was changed.

After full-suite verification, a local CSS adjustment makes the left numerical inspector scroll independently while all four desktop traces share the available plot height. Compact windows retain stacked scrolling. The final targeted motion story and native preview check this layout; the simulation/IPC code is unchanged.

Native preview screenshots: [maximum expansion](docs/images/bubble-motion-expanded.png), [minimum radius](docs/images/bubble-motion-compressed.png), [compact layout](docs/images/bubble-motion-compact.png). The visible trajectory extrema are **1.4977297–2.4136605 µm**; its radius ratio and shell states are derived from the stored solution, not an animation preset. Preview imports the original `examples/jbubble_64ch` scientific data and preserves its 0.3 provenance; this is a 0.9 inspector demonstration, not a relabelled new simulation. The fresh local demonstration project and run ID are in `.local/bubble-motion-preview.json`. The earlier 0.8 preview was closed gracefully after checking process ancestry. An initial preview-helper locator used button instead of the File menu's menuitem role; the helper now selects the actual menu control and the complete preview passes.

`packages/bubbleDynamics.ts` validates the whole existing ≤50k × 6 binary trajectory and linearly interpolates physical columns at source time. Nominal thresholds are `Rb = r_b R0` and `Rrupt = Rb sqrt(1 + sigma_r/chi)`. Effective tension uses the saved smooth law with numerically stable softplus expressions. Missing provenance remains unavailable, and free bubbles are uncoated. First crossing is a reversible nominal regime crossing, not evidence of gas-bubble destruction or irreversible shell loss. These distinctions appear in the inspector and [model/timing documentation](docs/BUBBLE_DYNAMICS.md).

Primary references were checked against the installed jbubble 0.2.0 source and [upstream shell implementation](https://github.com/imperial-nsb/jbubble/blob/main/jbubble/bubble/shell.py). Original model credit is Marmottant, van der Meer, Emmer, Versluis, de Jong, Hilgenfeldt and Lohse (2005), [DOI 10.1121/1.2109427](https://doi.org/10.1121/1.2109427); the smooth-law construction is credited separately to jbubble contributors. Full credit is added to About/startup metadata and new bubble-bundle bibliographies. No new library, vendored source or license change was introduced.

React review covered bounded trajectory decoding, memoized curve geometry during animation, RAF/listener cleanup, hidden-document pause, stable per-run playback state, physical clock/radius scaling, unique SVG gradient/arrow IDs, keyboard seek and system reduced-motion preference. The existing full-rate trajectory remains in immutable HDF5; visualization makes no change to RF or PAM reconstruction. Original bubble examples remain untouched and usable.

---

# Historical build report — 0.8.0 — 2026-11-11

The user requested refinement of the existing features. This increment improves their connections and recoverability: project switching, authoritative saved analysis, synchronized executable diagrams, raw replay, benchmark context/deltas and document navigation. Existing numerical kernels, dependency versions and scientific limitations are retained.

## Version 0.8 changes

- Project metadata/draft and diagram hydrate together. A random per-open session ID accompanies native draft/diagram saves; the sidecar captures the project binding once and rejects stale generations with HTTP 409, including reopening the same project. A stable hashed project identity scopes benchmark selection. Legacy direct API save shapes remain accepted; native saves always supply their session.
- Loading saved settings restores physical config, actual method options and original editor timing. Known-emission coupled ATP subtracts its causal source-filter delay for editing and applies it exactly once at execution; unknown-emission timing is unchanged. Stale/malformed diagrams rebuild from authoritative settings with a visible log message. Completed records are never rewritten.
- Method checkboxes add/remove corresponding reconstruction blocks. Receive-conditioning toggles insert/remove the connected DSP stage while preserving unrelated positions. Backend selection preserves compatible drive/mesh parameters and detaches CT for analytic/monopole propagation. Presets/new projects get coherent initial graphs and resource/clock-aware method defaults; explicit choices still receive backend validation.
- RF buffers carry run IDs. Raw acquisition and conditioned inspection are separate; replay always uses raw RF and the saved capture origin, revealing only fully acquired signed-peak bins. Before acquisition/no-raw packages have explicit empty states. The synthetic coupled CT story checks replay raster equality under RF Explorer DSP switching.
- Wide CT/Live/Benchmark documents restore previous panel visibility. Completion retains another inspection document instead of unexpectedly switching it to Reconstruction, while Simulate/Reconstruct retain the normal RF/map path from the main editors. Benchmark selections persist per project, synchronize the main export run, and offer direct PAM/RF inspection and saved-setting restoration.
- Benchmark report `pam.benchmark.map` 1.1.0 adds full capture/analysis/method/implementation contexts, exact changed fields and per-common-method deltas, defined as current minus reference. The metric formulas are unchanged. UI and exports use the same authenticated comparison implementation. CSV adds role, pair reasons, fingerprints and delta columns; no significance estimate is invented.

## Version 0.8 verification

| Exact command | Observed outcome |
|---|---|
| `uv sync --locked` and `pnpm install --frozen-lockfile` | Final lockfiles accepted; local environments already up to date |
| `uv sync` | Local package/lock metadata updated to 0.8.0; no new dependency |
| `uv run python scripts/export-contracts.py` | Authenticated report evaluation and session-bound save request contracts generated |
| `uv run ruff check engine adapters` | All checks passed |
| `uv run pytest engine/tests/test_refinements.py` | **2 passed**, 3.05 s: project A/B/reopen session guards; actual reanalysis differences, deltas, CSV/JSON, auth and request boundaries |
| `uv run pytest` | **73 passed**, 188.25 s; four upstream Starlette/GDCM deprecation warnings; log `.local/refinements-v08-pytest.log` |
| `pnpm check` | TypeScript passed |
| `pnpm test` | **21 passed**: 14 existing and 7 workspace/replay cases, including stale diagrams, coupled known/unknown ATP clock, backend preservation and nonzero capture t0 |
| `pnpm exec playwright test apps/desktop/tests/benchmark.spec.ts` during implementation | **1 passed**, 13.0 s: actual score deltas, exact grid changes, saved-result navigation, panel restoration, selection persistence and native exports |
| `pnpm exec playwright test apps/desktop/tests/workspace.spec.ts` during implementation | **1 passed**, 10.0 s after connecting the Properties editor to the graph synchronization handler; initial test correctly exposed the missing connection |
| First full Electron pass / navigation regression pass | An early full pass exposed completion navigation stealing CT focus. Preserving inspection documents fixed that case; the next pass exercised real CT/DSP/replay/backend switch successfully in 51.0 s but exposed that the normal F5 path from Model builder also needs automatic RF navigation. That condition was corrected; the intermediate run was stopped, and the full suite restarted. Intermediate logs remain in `.local/refinements-v08-e2e.log` |
| Final `pnpm test:e2e` | Production build passed; **all 13 native scenarios passed**, 4.4 min. Log `.local/refinements-v08-e2e-final.log`; synthetic coupled CT/DSP/replay/backend switch 48.1 s, j-Wave 45.9 s, jbubble 39.5 s, workspace restoration/preset execution 9.1 s |
| Final `pnpm build` after aperture-label clarification | Passed; full-aperture `null` is displayed as “All captured channels”; no numerical/behaviour change; final native preview exercises the label |
| `uv run python scripts/make-refinement-reference.py` | Fresh report-1.1 evidence generated from imported immutable 0.7 synthetic RF/maps, preserving original scientific provenance and observed runtime |
| `uv run python -m pamstudio.cli reproduce examples/workspace_refinements/full_aperture/bundle` | **DAS/TEA/CF/RCB/ATP reproduced**, rtol=1e-10, atol=1e-14 |
| `uv run python -m pamstudio.cli reproduce examples/workspace_refinements/alternate_aperture/bundle` | **All five reproduced** at the same tolerance |
| `uv run python scripts/license-inventory.py` | Installed 0.8 project metadata refreshed; no upstream library or license changed |
| `node scripts/preview-benchmark.mjs --fixture examples/workspace_refinements --prefix workspace-refinements --show-changes --keep-open` | Actual native project opened, ten method/run rows, exact aperture difference, full-aperture label, delta readouts and paired maps visually inspected; no renderer errors. Latest app left open; visible main-window handle reports `Responding=True`, helper console hidden |

Artifact QA verified both new ZIP hashes and manifest inventories, ten valid CSV rows, blank reference-row deltas, no doubled Windows carriage returns, the exact aperture field difference and real signed deltas. Screenshots include `workspace-refinements-splash.png`, `workspace-refinements-ct.png`, `workspace-refinements-live.png` and `workspace-refinements-editor.png` under docs/images. The comparison view is captured from the native preview separately.

Final native comparison screenshots are [scores and exact changed settings](docs/images/workspace-refinements.png) and [actual paired PAM maps](docs/images/workspace-refinements-maps.png). The previous 0.7 preview was closed gracefully after verifying its process ancestry; the latest 0.8 preview uses the fresh refinement project.

The final native suite uses real numerical code and synthetic fixtures only. File-dialog targets are the only substitutes. Python tests cover exact authenticated evaluate/export behaviour and prove stale saves do not touch either project's stored data. TypeScript tests check coherent defaults, restored actual options, stale/malformed graph recovery, precise raw ATP timing, compatible solver settings, preserved graph positions and complete-bin replay. Native tests cover actual five-method comparison/export, multi-project restoration, preset F7 execution, 1024 channels, both optional CPU solvers, coupled propagation, synthetic CT/DSP/replay and cancellation/security boundaries. No patient input or device was used in automated verification.

`examples/workspace_refinements` imports the frozen 0.7 full/alternating-aperture evidence into a fresh project; it does not relabel those scientific runs as a new simulation. Both packages contain report 1.1 and preserve their original maps and 6627.152 / 4086.246 ms observations. Current is the 32-alternating-channel run, reference the full 64 channels on identical RF. The sole changed analysis field is `active_channels`; DAS ΔgCNR = **−0.007360569435327147**, ATP ΔgCNR = **−0.002506725360723938**, and both have zero Δpeak error. Complete values and other methods are in comparison CSV/JSON. These are descriptive scenario differences, not a significance or performance claim.

| Immutable report-1.1 ZIP | SHA-256 |
|---|---|
| `examples/workspace_refinements/full_aperture/experiment.zip` | `cba3f85a308bc1ea7d895753fbcdda0cfdd776be9f253018b2f4f9e8234dbf40` |
| `examples/workspace_refinements/alternate_aperture/experiment.zip` | `2e7603df65335e614e1301c4b6b82318db0cd3fa0cca9b76dee212f303bc2b4e` |

React review checked effect cleanup, bounded concurrent report/map requests, no reload of unchanged map arrays when ROI/bins change, stable run activation, run-associated RF buffers, typed IPC, named keyboard controls and document/panel state restoration. Numerical assumptions remain explicit: radial spherical one-way bubble coupling, 2D fluid CT propagation with zero absorption/no shear, homogeneous uncorrected receive delays, and reference/experimental PAM methods. The native developer build is delivered; a bundled Python executable, signed installer, independent algorithm validation and 3D multiphysics are not claimed.

---

# Historical build report — 0.7.0 — 2026-11-11

The user requested benchmark scores to evaluate PAM results. Version 0.7 adds **Benchmark**, a real saved-map evaluation document, with localization error, FWHM, truth-region concentration, background peak dB, signed contrast, CNR, histogram gCNR, connected half-power area and normalized entropy. Run/reference selectors, physical ROI/bin controls, visible sample/boundary validity, sorted method rows, paired map/ROI overlays and native CSV/JSON exports are implemented. All earlier simulation/DSP/CT/1024-channel functionality remains available.

## Version 0.7 verification

| Exact command | Observed outcome |
|---|---|
| `uv sync --locked` and `pnpm install --frozen-lockfile` | Final lockfiles accepted; local environments already up to date |
| `uv sync` | Local package updated to 0.7.0; no new runtime dependency |
| `uv run python scripts/export-contracts.py` | Current authenticated benchmark routes and strict request schemas generated |
| `uv run ruff check engine adapters` | All checks passed |
| `uv run pytest engine/tests/test_benchmark.py` | **5 passed**, 4.40 s; one existing Starlette/httpx deprecation warning |
| `uv run pytest` | **71 passed**, 185.51 s; four upstream Starlette/GDCM SWIG deprecation warnings |
| `pnpm check` | TypeScript passed |
| `pnpm test` | **14 passed** |
| `pnpm build` | Renderer, main/preload and generated splash compiled successfully |
| `pnpm exec playwright test apps/desktop/tests/benchmark.spec.ts` | **1 passed**, 12.7 s: actual five-method scores, ROI/bin controls, identical reimport and changed-grid comparisons, real CSV/JSON and compact layout |
| `pnpm test:e2e` / initial `pnpm exec playwright test` repeat | Build passed; initial combined runs were **11 passed / 1 failed**, then **10 passed / 2 failed** on native F6/measurement waits. The affected numerical reconstructions completed in their SQLite records, but a Benchmark view was observed instead of the expected panel. Manual inspection was concurrent in the first run; the second also showed UI waits. Test helpers now position automated windows outside the interactive desktop to reduce interference and attach bounded input-event diagnostics on failure; production window behaviour is unchanged |
| `pnpm exec playwright test -g 'jBubble CPU'` | Standalone native shortcut/scientific story **passed**, 33.9 s |
| `pnpm exec playwright test -g 'j-Wave native CPU\|jBubble CPU'` | Both native solver/F6 stories **passed**, 1.3 min with isolated automated windows |
| `uv run pytest engine/tests/test_benchmark.py` after nullable zero-peak guard | **5 passed**, 4.16 s; zero maps explicitly return no peak coordinates and the renderer omits the peak marker |
| Final `pnpm test:e2e` | Production build passed; **all 12 native Electron scenarios passed**, 3.8 min, including both solver/F6 stories and benchmark |
| `uv run pytest engine/tests/test_benchmark.py` after Windows CSV ending fix | **5 passed**, 4.05 s; CSV now avoids doubled carriage returns/blank rows on Windows |
| Final `pnpm exec playwright test apps/desktop/tests/benchmark.spec.ts` | **1 passed**, 11.3 s with explicit CSV byte/line checks after the ending fix |
| `uv run python scripts/make-benchmark-reference.py` | Fresh 129², five-method full/alternate-aperture bundles and numerical comparison CSV/JSON generated and hash-verified |
| `uv run python -m pamstudio.cli reproduce examples/pam_benchmark/full_aperture/bundle` | DAS/TEA/CF/RCB/ATP reproduced at rtol=1e-10, atol=1e-14 |
| `uv run python -m pamstudio.cli reproduce examples/pam_benchmark/alternate_aperture/bundle` | All five reproduced at the same tolerance |
| `node scripts/preview-benchmark.mjs` | Actual saved synthetic benchmark opened via native Open; ten method/run rows, region overlays and paired maps inspected; no renderer errors |
| `node scripts/preview-benchmark.mjs --keep-open` | Latest app left visibly open at Benchmark with the fresh full/alternate-aperture project; native handle observed with `Responding=True`; helper console hidden |
| `uv run python scripts/license-inventory.py` | Installed project-version inventory refreshed; production dependency versions unchanged from 0.6 |

Independent numerical checks compare Gaussian FWHM with `2 sqrt(2 ln 2) sigma` and radial concentration with `1-exp(-r²/(2 sigma²))`; test positive multiplicative scaling, identical/disjoint histograms, wrong peaks, clipped/sparse truth regions, zero maps and zero variance. Read-only assessment preserves the source HDF5 checksum. Actual benchmark bundle export/import, legacy two-method packages, token authorization and UUID/ROI/bin boundaries pass. A first test exposed floating-point concentration rounding slightly above one; the bounded fraction now clips only numerical roundoff to [0,1], and the analytical tests pass. A test setup initially addressed File as a button; its menuitem locator was corrected.

Benchmark uses saved **linear maps and configured synthetic truth**, with versioned metric identity `pam.benchmark.map` 1.0.0. Target is the union of physical disks; spatial integrals use trapezoidal weights. Contrast/CNR/gCNR require at least eight pixels in both regions; clipped disks disable regional scores. Sparse histograms and truncated half-power components are flagged. There is no fabricated aggregate score, individual method timing, RAM estimate, detection probability, Monte Carlo confidence interval or PSNR/SSIM against a nonexistent calibrated reference image. The original gCNR authors and DOI 10.1109/TUFFC.2019.2956855 appear in Benchmark, About, splash and exported references. Source equations and limitations: [PAM benchmark documentation](docs/PAM_BENCHMARK.md).

Run matching checks stored raw-RF hash, capture/medium, shared grid/gate/aperture/DSP settings, engine source and method options. Changed categories produce **Scenario comparison** rather than a claim of isolated algorithm improvement. ROI/bin preferences persist across document changes, every custom report records them, and old experiments can be evaluated without mutation. New ZIPs contain default-setting `benchmark.json`/CSV under the manifest; import accepts exactly the old inventory or the old inventory plus both fixed report files. Earlier bundles remain readable.

Fresh evidence uses 64-channel/4096-sample analytic RF with configured SNR 20 dB and a 129² grid, reconstructed with all 64 or 32 alternating active channels on **identical RF**. Each truth region contains 285 pixels, radius 2 mm, 100 bins. Full/alternate DAS gCNR is **0.940511 / 0.933151** with zero on-grid peak error; ATP gCNR **0.987100 / 0.984593** with **0.234375 mm** error. These different outcomes demonstrate why a single score is insufficient. All five rows, FWHM, background and other exact values are retained in `examples/pam_benchmark/comparison.json` and CSV. Shared runtime 6627.152 / 4086.246 ms was observed during other verification work; no universal performance claim is made. The pre-release archive with incorrect Windows CSV endings was preserved under `.local/pam-benchmark-csv-preflight-v07`; final examples were regenerated, hash-verified and both reproduced again after the fix.

| Immutable example ZIP | SHA-256 |
|---|---|
| `examples/pam_benchmark/full_aperture/experiment.zip` | `ce4a0caa272fbf7ea8984a8453a57214058a92d13f3df13413e29f009c48ecec` |
| `examples/pam_benchmark/alternate_aperture/experiment.zip` | `574bf57248a0ac1865539827a3bffb4b055af00570217cf49318f3c344cdcbc1` |

Implementation: `engine/src/pamstudio/benchmark.py`, fixed API/IPC and native export operations, `BenchmarkView.tsx`, physical-radius overlays in `RasterPlot`, and optional benchmark files in experiment export/import. React review checked typed boundaries, effect cancellation, bounded map requests, numeric formatting/units, unavailable values, keyboard selects/buttons and controlled internal scrolling at 1000×720. Screenshots are `docs/images/pam-benchmark.png`, `pam-benchmark-maps.png` and `pam-benchmark-compact.png`. No clinical inputs, new scientific dependency, external metric implementation or hardware connection was used in this increment.

## Historical 0.6 report — 2026-11-11

Version 0.6 integrates the user's requested **open-source receive DSP and open head CT DICOM anatomy** into the existing end-to-end desktop. Story: native CT selection → immutable HU asset → crop/physical coordinates/material settings → real jbubble dynamics → causal volume-flow bridge → real heterogeneous j-Wave pressure/receivers → raw RF → SciPy conditioning → PAM/truth metrics → water/CT comparison → self-contained export and reimport/reproduction. The previous 1024-channel, logo and researcher splash work remains available. Identity is **Aisy Fawwaz · MRes Project · Bioengineering · Imperial College London**.

## Version 0.6 verification

| Exact command | Observed outcome |
|---|---|
| `uv sync --locked` and `pnpm install --frozen-lockfile` | Final lockfiles accepted; local environments already up to date |
| `uv sync` | Main environment ready; pydicom 3.0.2 and python-gdcm 3.2.6 pinned; project version 0.6.0 |
| `uv run python scripts/export-contracts.py` | Generated current strict contracts/OpenAPI/presets |
| `uv run ruff check engine adapters` | All checks passed |
| `uv run pytest` | **66 passed**, 186.10 s; four upstream deprecation warnings (Starlette/httpx and three GDCM SWIG types) |
| `pnpm test` | **13 passed** |
| `pnpm build` and `pnpm exec playwright test -g 'synthetic CT only\|bubble population'` | Final WebCodecs implementation: **2 passed**, 1.3 min; bubble duration verified as 2 s, both native files valid; `.local/research-webcodecs-native.log` |
| `pnpm test:e2e` | Production TypeScript/renderer/main/preload build passed; **11 native Electron scenarios passed**, 3.9 min |
| `pnpm build` then `pnpm exec playwright test -g 'SciPy receive conditioning\|compact workspace'` | **2 passed**, 19.2 s after bounding the RF grid columns/overflow |
| `pnpm build` then `pnpm exec playwright test -g 'startup identity\|coupled model builder'` | **2 passed**, 44.6 s after changing live RF axis display to µs; scientific arrays unchanged |
| `uv run python scripts/make-ct-reference.py` | Manual public skull-patch water/CT runs, exported and hash-verified; 22.428 / 17.328 s including export |
| `uv run python scripts/make-ct-reference.py --whole` | Manual entire public axial-slice water/CT runs, exported and hash-verified; 56.082 / 50.988 s including export |
| `uv run python -m pamstudio.cli reproduce examples/ct_skull_patch/water/bundle` | DAS/TEA/CF/ATP reproduced, rtol=1e-7, atol=1e-12 |
| `uv run python -m pamstudio.cli reproduce examples/ct_skull_patch/ct/bundle` | DAS/TEA/CF/ATP reproduced, same tolerance |
| `uv run python -m pamstudio.cli reproduce examples/ct_head_slice/water/bundle` | DAS/TEA/CF/ATP reproduced, same tolerance |
| `uv run python -m pamstudio.cli reproduce examples/ct_head_slice/ct/bundle` | DAS/TEA/CF/ATP reproduced, same tolerance |
| `uv run python -m pamstudio.cli reproduce examples/array_1024ch/bundle` | All five earlier 1024-channel maps reproduced, rtol=1e-10, atol=1e-14 |
| `uv run python -m pamstudio.cli reproduce examples/coupled_arrays/bundle` | All five earlier coupled maps reproduced, rtol=1e-7, atol=1e-12 |
| `uv run python scripts/license-inventory.py` | Main installed dependency inventory/full collected notices refreshed; GDCM core and wrapper licenses retained separately |
| `uvx pip-audit --path .venv/Lib/site-packages --format json --output .local/main-pip-audit-v06.json` | No known vulnerabilities found |
| `pnpm audit --prod --json` | Zero known production JavaScript advisories |
| `node scripts/dev.mjs` and `node scripts/check-dev.mjs` | Real development renderer connected to actual sidecar without JavaScript/CSP errors; responsive native window observed |
| `node scripts/preview-public-ct.mjs` | Manual public whole-slice project opened through native Open; actual HU image, matched maps and field replay inspected; no renderer errors |
| `node scripts/preview-public-ct.mjs --keep-open` | Latest native app left open on the completed whole-head comparison project; visible window handle and `Responding=True` checked; background helper console hidden |

All automated Python/Electron CT cases use **synthetic DICOM/analytical skull phantoms only**. Public CT data was used only in the separately invoked manual demonstration explicitly requested by the user. Earlier test stories still execute real 1024-channel capture, final-channel CSV, array dragging, bubble/j-Wave physics, all five methods, cancellation, invalid-input rejection, export/reimport, security and compact layouts. Full-suite runtime included concurrent native verification; it is not a solver benchmark. React/TypeScript review checked typed fixed actions, effect cleanup on asset/run changes, immutable run pairing, keyboard controls, bounded binary buffers and strict input boundaries.

DSP executes installed SciPy signal routines: DC/detrend, Butterworth SOS and optional notch, forward/backward filtering once before reconstruction. Raw RF remains untouched. Exact SOS/settings/version/output hash/513-point response and conditioned RF are stored; CSV follows raw/conditioned selection. Reanalysis can change DSP. It is offline, noncausal and can pre-ring; capture clock is unchanged. The source's separate causal FIR retains its group delay exactly once for ATP.

CT uses pydicom/GDCM decoding and correct HU rescale/spacing, retains an immutable asset and copies no patient/study/private identifiers into project metadata. The bundled public derivative preserves original pixels and records both instance hashes, all seven authors, CC BY 4.0, modifications and DOI 10.5281/zenodo.15697196. Source: [Zenodo dataset](https://zenodo.org/records/15697196). Only one instance was fetched by HTTP ranges; archive-wide MD5 verification is not claimed. Full credits appear in About, CT source information, exported METHODS/references and [dataset attribution](datasets/open_head_ct/ATTRIBUTION.md). SciPy, pydicom and GDCM credits were added to the splash and persistent About panel.

Actual paired whole-slice evidence: RF `[1,2048,64]`, solver medium 360×360, relative RF L2 change **0.902413**, CT/water RMS ratio **0.903990**. Global DAS peak error changed **0 → 16.763 mm** with uncorrected receive delays; CF **0 → 8.382 mm**, ATP **0 → 3.202 mm**. These are coarse-grid example outcomes, not general accuracy or clinical claims. The patch's water DAS error **5.000 mm** and broad lobes remain visible. Both models retain all warnings and unrounded values. See [numerical definitions and evidence](docs/DSP_AND_CT.md).

| Immutable ZIP | SHA-256 |
|---|---|
| `examples/ct_skull_patch/water/experiment.zip` | `e5c6e464cd1c35acb5d680b3bac8b65a631ef3bc5af9c598ab8f3c239a7bb12c` |
| `examples/ct_skull_patch/ct/experiment.zip` | `5426d1762f32bde0ed9626dd4d66c8faf7346ba92d49e487d6fcaf53de197e63` |
| `examples/ct_head_slice/water/experiment.zip` | `191e47e548992208c1d73a7e11569ed11f584f0b4c55916eed95a81c496dc36b` |
| `examples/ct_head_slice/ct/experiment.zip` | `4283c061aff4c987ac3add3b6672e2d14914d5b9e31ba20b572c2febcb163cba` |

New primary modules are `ct.py`, `dsp.py`, `CTWorkspace.tsx` and `DSPControls.tsx`, integrated into fixed IPC, job, graph, storage, CLI and export paths. Completed CT runs preserve original HU, actual native sound-speed/density fields, raw/conditioned RF, trajectory, source flow, field movie, maps, graph, methods, versions and source checksums. Import restores the content-addressed HU asset. Rendered evidence is in `docs/images/ct_head_slice-*.png`, `dsp-response.png` and `startup-splash.png`.

Scientific limits: **2D linear fluid acoustics, zero absorption, no elastic/shear modes; air/soft tissue replaced by host fluid; user-defined HU mixture; homogeneous straight receive delays remain uncorrected.** No patient-space 3D registration, nonspherical bubble breakup, feedback, calibrated instrument response, mesh-convergence or experimental validation is implied. Entire-slice preset is 0.1 MHz/1 mm spacing to stay within the CPU budgets. The delivered target remains the native developer app; no signed/bundled installer, WSL/GPU or clinical claim is made. Main environment: Windows 11 x64, Python 3.13.12/SciPy 1.16.3; separately locked j-Wave 0.2.1 and jbubble 0.2.0 CPU runtimes are unchanged.

## Historical 0.5 report — 2026-11-11

Version 0.5 delivers the requested 1024-channel capacity, original application logo and native startup researcher credits. Identity was supplied explicitly by the user: **Aisy Fawwaz · MRes Project · Bioengineering · Imperial College London**. Newer DSP/CT requests are the next active increment; they are not claimed delivered by this report. Earlier sections below are historical.

## Version 0.5 verification

| Exact command | Observed outcome |
|---|---|
| `node scripts/render-icon.mjs` | Original SVG rendered to 512² PNG and seven-resolution Windows ICO |
| `uv sync --locked` and `pnpm install --frozen-lockfile` | Final lockfiles accepted; local environments already up to date |
| `uv sync` | Updated only local project version to 0.5.0; dependencies unchanged |
| `uv run python scripts/export-contracts.py` | Generated bounded 1024-channel schemas/OpenAPI/preset |
| `uv run ruff check engine adapters` | All checks passed |
| `uv run pytest` | **61 passed**, 131.40 s, one existing Starlette/httpx deprecation warning |
| `uv run pytest engine/tests/test_capacity.py` | **5 passed**, 26.72 s including native coupled 1024-channel execution |
| `pnpm check` | TypeScript passed |
| `pnpm test` | **11 passed** |
| `pnpm build` and `pnpm exec playwright test -g 'synthetic CT only\|bubble population'` | Final WebCodecs implementation: **2 passed**, 1.3 min; bubble duration verified as 2 s, both native files valid; `.local/research-webcodecs-native.log` |
| `pnpm test:e2e` | Build succeeded; **9 native Electron scenarios passed**, 2.8 min |
| `uv run python scripts/make-1024-reference.py` | Real 32 MiB RF and five 17² maps exported; total generation/export/verification 4.501 s |
| `uv run python -m pamstudio.cli reproduce examples/array_1024ch/bundle` | Five maps reproduced, rtol=1e-10, atol=1e-14 |
| `uv run python -m pamstudio.cli reproduce examples/coupled_arrays/bundle` | Earlier coupled fixture reproduced, rtol=1e-7, atol=1e-12 |

Actual capacity evidence: a noiseless 1024-element, 0.05 mm-pitch array with 4096 samples at 10 MHz, 17² grid, 6–10 µs gate, stride 2 and four-element RCB smoothing calculates all five methods. RF shape 4096×1024 is **33,554,432 bytes**; its full-channel 512-row float32 overview is **2,097,152 bytes**. Export/import preserves RF exactly, API/CSV channel 1023 works and index 1024 is rejected. The independent random complex covariance test agrees with explicit full covariance/subarray slicing within rtol/atol=1e-13. Adaptive RCB batch is 17 pixels; shared reconstruction observed **2578.502 ms**. All global peaks fall on the known (0,30) mm grid point; this exact-grid fixture does not establish subpixel accuracy or general resolution. RCB background/peak ratio is **0.982825**, retained rather than hidden.

The separate native coupling test has **four 256-element arrays**, actual jbubble and j-Wave execution, changing real solver frames, bounded full-channel live snapshots and actual DAS/TEA/CF/ATP maps. It intentionally omits full-covariance multi-array RCB, which remains limited to 64 active channels. Large uniform-array RCB uses exact subarray accumulation without an N×N intermediate, a 32 MiB scratch target and a conservative 5-billion covariance-term work guard for >128 active channels. Raw capture budget is 64 MiB; j-Wave receiver history budget is 96 MiB, alongside existing domain/CFL/step limits. Defaults remain 64 channels.

New E2E stories verify real splash names/affiliation, upstream authors, no splash IPC bridge, no layout overflow, persistent About credits, 1024-channel actual 2 MiB RF transfer, final-channel waveform/CSV, real DAS and aperture pagination. Startup now has two native windows, so test/dev helpers identify the workspace by its URL rather than assuming the first window is the workspace. Splash has no preload, scripts or network CSP permissions; it closes on actual engine/workspace readiness with no artificial wait or invented progress percentage. Existing sender validation and sandbox/context isolation remain intact. The original wavefront/receiver-array logo is used in the shell, splash, native window and configured future Windows installer.

New immutable example ZIP: `examples/array_1024ch/experiment.zip`, SHA-256 **`bb89884e968b589a8ef59731a9e8ad68251ea9dae264eb09a3cac04e7f2bf2b8`**. Raw RF, maps, exact options, source/array hashes, environment, figures, method bibliography and unrounded metrics are included. Earlier examples were preserved. Details and authoritative credit links are in docs/CAPACITY_AND_BRANDING.md. No new dependency was added in this increment; no signed installer or 3D/clinical validity is claimed.

## Historical 0.4 report — 2026-11-11

The user requested a coupled drag/drop simulation workbench, actual live bubble/acoustic/sensor/PAM visualization and configurable multiple receive arrays. Version 0.4 delivers this as a real native Windows Electron + Python pipeline. The version 0.3 and older reports below are historical; their old coupling limitations and source hashes describe those builds.

## Version 0.4 verification

Story: Model builder → validated, fixed typed graph over authenticated IPC → actual isolated jbubble dynamics → causal volume-flow coupling → actual isolated j-Wave propagation at the configured receiver coordinates → RF and five NumPy/SciPy PAM maps → immutable SQLite/HDF5 run → live/replay rendering and reproducible export/import.

Environment remains Windows 11 x64 build 26200, main Python 3.13.12; j-Wave 0.2.1/Python 3.12.12/JAX 0.4.38; jbubble 0.2.0/Python 3.13.12/JAX 0.8.2. No new third-party dependency, vendored research implementation, WSL/GPU installation or network requirement was introduced. The two locked optional runtimes retain their prior notices/audits. Native Windows CPU remains experimental.

| Exact command | Observed outcome |
|---|---|
| `uv run ruff format engine adapters` | Formatted changed Python files |
| `uv run ruff check engine adapters --fix` | Checks passed after formatting/import cleanup |
| `uv run ruff check engine adapters` | All checks passed |
| `uv run python scripts/export-contracts.py` | Regenerated schemas, OpenAPI and canonical coupled template |
| `uv run pytest` | **56 passed**, one existing Starlette/httpx deprecation warning, 119.48 s |
| `uv run pytest engine/tests/test_jbubble.py::test_model_boundaries_and_legacy_serialization` | **1 passed**, 1.91 s after clarifying the missing-coupling validation message |
| `pnpm test` | **9 passed** |
| `pnpm check` | TypeScript passed |
| `pnpm build` | Production renderer and Electron main/preload built; 1770 modules, renderer JS 436.76 kB / gzip 131.26 kB |
| `pnpm exec playwright test` | **7 passed**, 2.4 min, actual native Electron and scientific runtimes |
| `pnpm exec playwright test -g 'coupled model builder'` | **1 passed**, 33.6 s; added assertions for saved raw ATP clock and exactly-once effective filter delay, retained a wave-visible replay screenshot |
| `uv run python scripts/make-coupled-reference.py` | Actual end-to-end two-array fixture, 23.823 s observed wall time, immutable package below |
| `uv run python -m pamstudio.cli reproduce examples/coupled_arrays/bundle` | All five maps reproduced, rtol=1e-7, atol=1e-12 |
| `uv run python -m pamstudio.cli reproduce examples/five_methods_64ch/bundle` | Original five-method analytic maps reproduced, rtol=1e-10, atol=1e-14 |
| `uv run python -m pamstudio.cli reproduce examples/jwave_64ch/bundle` | Earlier standalone j-Wave maps reproduced, rtol=1e-7, atol=1e-12 |
| `uv run python -m pamstudio.cli reproduce examples/jbubble_64ch/bundle` | Earlier standalone jbubble maps reproduced, rtol=1e-7, atol=1e-12 |
| `node scripts/check-dev.mjs` | Development renderer connected to the real sidecar without JavaScript/CSP errors |

The running developer app is launched by `node scripts/dev.mjs` (same entry point as `pnpm dev`) with a hidden helper console and visible Electron window. Vite binds only 127.0.0.1:5173; the Python sidecar retains its dynamic loopback port and ephemeral bearer token. The final window reports PAM Research Studio, a nonzero native handle and Responding=True. Logs/PID are under `.local/app-v04.*` and `.local/app-v04-launcher.pid`.

### Boundary evidence and fixes

| Boundary | Result and evidence |
|---|---|
| UI → model | Real palette/node movement and undo, typed connections, graph validation, physical array controls; screenshots retained |
| Model → IPC/API | Fixed Zod/Pydantic workflow schemas; duplicate/missing/type-invalid graphs rejected; existing untrusted IPC/offline tests pass |
| API → science | Actual installed solvers execute; live tests observe several distinct solver timestamps and native RF/trajectories |
| Science → data | Completed HDF5 contains bubble trajectory, filtered Q, movie/timestamps, actual receiver positions/channel membership, RF and all five maps |
| Data → UI | Live pressure, RF and radial motion; genuinely computed partial PAM, final-map replay; no renderer exceptions in E2E |
| Data → exchange | Graph/raw editor clock and effective method options preserved; native numerical test exports/imports actual movie; CLI reproduces maps |

During integration the new integer array/element channel indices initially failed the old float-only HDF5 importer. It now admits only these two bounded integer vectors, validates them against the configuration, and retains external-link/shape protections. Windows worker-log handles briefly remaining after taskkill could obscure cancellation during temporary-directory cleanup; bounded owned-directory cleanup retries preserve the original cancellation. Native cancellation tests pass. The new rotated-array drag test exposed a thin pointer target; an 18 px transparent hit stroke now makes selection reliable, preserves the grab offset and records one undo entry per gesture. All seven final E2E scenarios pass.

React changes were reviewed against the react-best-practices skill: bounded binary movie transfers, independent array loads in parallel, polling/observer cleanup, frozen run geometry, typed contracts, keyboard operations and accessible names. Canvas resize fits/centres the graph; live state is attached to the correct run. Actual light/compact/dark instrument screenshots and new model/live/multi-array screenshots were inspected.

### Coupled scientific evidence

Original bridge math: `Q3D=4*pi*R^2*Rdot`, `Q2D=Q3D/L`; native j-Wave source `S=rho*c*Q3D/(2*L*dx)` gives summed density rate `rho*Q3D/(L*dx^2)`. The causal 80 dB Kaiser FIR retains its group delay; no 3D far-field pressure is injected and propagation delay is not applied twice. The template's delay is **7.171428571 µs**; raw drive clock is 8 µs, effective ATP centre **15.171428571 µs**. Full derivation, units, native clock conventions and assumptions are in docs/WORKFLOW_AND_COUPLING.md and exported METHODS.md.

New Python evidence checks typed graph semantics, delay applied once, invalid graph rejection, arbitrary rotated channel order, actual geometric arrival errors ≤0.1 µs, pose-dependent RF, full-covariance RCB on several arrays, causal filter/DC volume conservation, actual changing live observations, observer on/off RF equality (rtol=1e-10/atol=1e-14), inverse-line-length amplitude scaling (rtol=1e-9/atol=1e-14), and exact stored movie preservation through export/import. The position fixture moves only the second array by 4 mm: first-array RF remains bit-identical and second-array peak change exceeds 0.1 arbitrary units. The Electron array test edits count/aperture/pose, drags and undoes, generates two different actual RF captures and verifies the first record stays unchanged.

`examples/coupled_arrays` uses the canonical two-array template: two 16-element arrays (one horizontal at −3,0 mm; one vertical at 9,8 mm), 2 µm lipid bubble at 0,12 mm, 0.5 MHz/20 kPa/4 µs drive, 0.25 mm propagation grid, L=1 mm, passband=0.7 MHz, 512 samples/10 MHz, seeded SNR 30 dB, five 65² maps. Actual saved shapes:

- RF: **1×512×32** float64.
- Bubble trajectory: **841×6**; filtered volume flow: **1845×2**.
- Spatially band-limited pressure previews: **211×60×63** plus 211 physical timestamps.
- Five maps: **65×65** each; shared reconstruction wall time **3910.252 ms**.

All five methods locate the global peak at **(0.125, 11.750) mm**, nearest-truth error **0.279508 mm**. Their widths/background ratios differ; this is not an independent accuracy validation or claim that every method improves with additional arrays. RCB records 32-channel full covariance, smoothing disabled, uncertainty residual 0.10000000000000012. Full unrounded measurements and timing scope are in BENCHMARK.json.

Package ZIP is 5,639,699 bytes; SHA-256 **`14e675ea204e8509382147ac9622b16b538f6f2eaf136f72e7f0b798f2e1a20b`**. Its generation-time engine source SHA-256 is **`fe24a4809b1ee4651f29bff07e1e06bd2f2b832fd32f3fa3dfedb9f7dfd93166`**; later clarification of a validation error message does not alter numerical reproduction. Runner/lock/config/source-waveform hashes, raw editor options, effective options, upstream citations and license references are included. Earlier fixtures were not overwritten.

### Material limits

Live time is physical solver time, not ultrasound wall-clock hardware real time. At most 257 field frames, spatially low-pass filtered to ≤64², are display previews; full-resolution field histories are not claimed. Bubble shape is spherical radial motion. Coupling is one-way equivalent-line 2D linear acoustics with explicit L; no acoustic feedback, nonspherical breakup/jets, 3D pressure equivalence, heterogeneous tissue, finite element directivity or transmit steering. Multiple arrays support ≤128 total channels; irregular/multi-array RCB supports ≤64 active channels. All stronger independent scientific, experimental and packaging limitations below still apply. No clinical/device inputs were used.

## Historical 0.3 report — 2026-11-11

The user explicitly requested j-Wave followed by jbubble while away. Both are implemented as real optional CPU pipelines with isolated pinned interpreters, fixed file-based workers, honest failure/cancellation and complete run provenance. The existing instrument workspace and five reconstruction methods remain operational. Earlier reports below are historical.

## Current verification

Native Windows 11 x64 build 26200. Main engine Python 3.13.12; optional j-Wave Python 3.12.12/JAX 0.4.38; optional jbubble Python 3.13.12/JAX 0.8.2. WSL is absent. Upstream j-Wave recommends WSL2; native CPU here is explicitly experimental and locally tested, not an upstream support claim. No GPU/system-feature installation or WSL execution was performed.

| Exact command | Observed outcome |
|---|---|
| `uv sync --locked` and `pnpm install --frozen-lockfile` | Final lockfiles accepted; local environments already up to date |
| `uv sync` | Main engine updated to 0.3.0, scientific dependencies unchanged |
| `pwsh -File scripts/setup-jwave.ps1` | Locked isolated environment ready; actual j-Wave import and JAX CPU device probe passed |
| `pwsh -File scripts/setup-jbubble.ps1` | Locked isolated environment ready; actual jbubble import and JAX CPU device probe passed |
| `uv run ruff check engine adapters` | Passed |
| `uv run pytest -q` | **48 passed**, 91.30 s; one upstream Starlette TestClient/httpx deprecation warning |
| `pnpm test` | **7 passed** |
| `pnpm build` and `pnpm exec playwright test -g 'synthetic CT only\|bubble population'` | Final WebCodecs implementation: **2 passed**, 1.3 min; bubble duration verified as 2 s, both native files valid; `.local/research-webcodecs-native.log` |
| `pnpm test:e2e` | Production TypeScript/renderer/main/preload build passed; **5 native Electron tests passed**, 1.8 min |
| `uv run python scripts/export-contracts.py` | Updated bounded bubble/j-Wave settings, source serialization, array kind and OpenAPI 0.3.0 |
| `node scripts/check-dev.mjs` with local Vite | Real development renderer/sidecar connected with no JavaScript/CSP errors |
| `node scripts/dev.mjs` and `node scripts/check-dev.mjs` | Final development app opened a responsive visible PAM Research Studio window; real worker connection passed. Earlier app window closed normally. Electron GUI remains open for the user; helper console is hidden |
| `uv run python scripts/make-jwave-reference.py` | Generated real 64×4096 RF and five 128² maps with metadata/citations |
| `uv run python scripts/make-jbubble-reference.py` | Generated real 1681×6 trajectory, 64×4096 RF and five 128² maps with actual model constants/citations |
| `uv run python -m pamstudio.cli reproduce examples/jwave_64ch/bundle` | All five maps reproduced, rtol=1e-7, atol=1e-12 |
| `uv run python -m pamstudio.cli reproduce examples/jbubble_64ch/bundle` | All five maps reproduced, rtol=1e-7, atol=1e-12 |
| `uv run python -m pamstudio.cli reproduce examples/five_methods_64ch/bundle` | Original five-method analytic package reproduced, rtol=1e-10, atol=1e-14 |
| `uv run python -m pamstudio.cli reproduce examples/point_source_64ch/bundle` | Original two-method package reproduced, rtol=1e-10, atol=1e-14 |
| `.adapters/jwave/.venv/Scripts/python.exe scripts/adapter-inventory.py jwave` | Recorded 28 installed distributions and notices |
| `.adapters/jbubble/.venv/Scripts/python.exe scripts/adapter-inventory.py jbubble` | Recorded 18 installed distributions and notices |
| `uvx pip-audit --path .adapters/jwave/.venv/Lib/site-packages --format json --output .local/jwave-pip-audit.json` | **No known vulnerabilities found** |
| `uvx pip-audit --path .adapters/jbubble/.venv/Lib/site-packages --format json --output .local/jbubble-pip-audit.json` | **No known vulnerabilities found** |

Electron scenarios: actual j-Wave selection → RF → five maps; actual jbubble controls → four trajectory plots → RF → five maps; original instrument/export/import/reopen/display invariance; invalid/offline/cancelled runs; compact window and reanalysis without new RF. The file dialogs select temporary folders; no numerical RF, trajectories or maps are mocked. Screenshots from all scenarios were retained and visually inspected. Bubble properties were placed immediately after backend selection and the plot caption was matched to the instrument text scale.

### Actual numerical evidence

j-Wave fixture: 0.2 mm propagation spacing, CFL ceiling 0.3, 20 PML cells, 1000 kg/m³, 64-channel array, 4096 samples/20 MHz, 1 MHz finite Gaussian pulse, source (0,30) mm, emission 8 µs, SNR 30 dB, seed 42. Maximum numerical envelope timing error vs nominal distance/c: **0.05 µs**. Actual tests also verify off-grid channel order, absolute arrivals within 0.15 µs on an independent small scene, integer acquisition-origin reindexing, repeatability, late boundary residual, reanalysis and cancellation. Native child startup initially exposed a blocking Windows WMI processor query inside `platform.platform()`; the adapter now records OS information without that query, and the Electron test passes.

jbubble fixture: real lipid Keller–Miksis solution, R0=2 µm, Hann sine 1 MHz/100 kPa/4 µs, 8 ringdown cycles, viscosity=1 mPa·s, ambient=101325 Pa, density=1000 kg/m³, c=1500 m/s, Dopri5 rtol=1e-8/atol=1e-10. Rmax/R0=**1.20683025**, Rmin/R0=**0.74886487**, peak wall Mach=**0.00373526**, predicted peak emission at 1 mm=**219.723675 Pa**; solver converged. Tests independently verify the radiation identity against radius/velocity/acceleration, zero-drive equilibrium, weak-drive proportionality, receiver timing and acquisition origin, stored trajectory export/import without RF, and worker-tree cancellation. Finite-support interpolation snaps only sample-coordinate roundoff below 1e-8 samples to preserve exact-clock boundaries.

| Global peak error (mm) | j-Wave RF | jbubble RF |
|---|---:|---:|
| DAS | 0.151255 | 2.010096 |
| TEA | 0.366713 | 2.246083 |
| CF-DAS | 0.151255 | 2.010096 |
| RCB | 0.598062 | 4.843441 |
| ATP | 0.366713 | 1.774171 |

The jbubble case is **not well-localized by every method**. Its nonlinear spectrum exceeds the aperture's spatial Nyquist and roughly 0.432% of full emission energy lies above acquisition Nyquist. Anti-alias filtering, full-rate gate quadrature and actual warnings/measurements are retained; high background/peak ratios near 1 are not hidden. This is a working calculation/exchange fixture, not independent scientific validation or a universal performance improvement. The two libraries use separate physical models: 2D j-Wave propagation versus 3D quasi-acoustic monopole radiation from independent identical jbubble trajectories. Simultaneous coupling is rejected explicitly.

Observed worker calculation times: j-Wave **17780.402 ms**, shared five-map reconstruction **8781.649 ms**; jbubble **2435.296 ms**, shared reconstruction **17908.007 ms**. Worker timings include compilation/calculation/output but exclude interpreter import/startup; tests/fixture generation sometimes ran concurrently. These are observations, not isolated benchmarks or UI latency promises.

Both fixtures record engine source SHA-256 `c10689a5313bb214866e5fb80a531af91e483c3a032b5ee477482ccc854618c1`, matching the current engine. Each separately records its runner and dependency-lock hashes. ZIP SHA-256:

- j-Wave: `fc70d4edcd6fc19a8e9f49df804c17e4510d28755beb2d67db8c2e756f6a74a9`
- jbubble: `4d766750698f3313c37964f6e7ad6123a7d8283e3b6f212d9dbc79554d31b398`

Licenses were checked before installation: j-Wave/JaxDF LGPL-3.0-only, jbubble MIT. No research implementation was copied, translated or modified. Runtime inventories, notices, upstream citations, setup and limitations are in adapters/jwave, adapters/jbubble and LICENSES_THIRD_PARTY.md. No packaged Python runtime, signed installer, WSL/GPU validation, interacting bubbles or heterogeneous-field editor is delivered. The historical development-only electron-builder minimatch advisory remains; no new baseline dependency was introduced.

## Historical 0.2 verification — 2026-11-11

The current build replaces the original dashboard with an instrument workspace and adds CF-DAS, constrained RCB and short-pulse ATP to the existing passive DAS/TEA engine. The original 0.1 report is retained below as historical evidence.

## Current verification

Same native Windows 11 x64 machine and baseline dependencies as the prior report. Engine/application version: **0.2.0**. No new scientific dependency or external research implementation was installed.

| Exact command | Outcome |
|---|---|
| `uv sync --locked` and `pnpm install --frozen-lockfile` | Final lockfiles accepted; local environments already up to date |
| `uv sync` | Updated the local engine package/lockfile to 0.2.0 |
| `uv run ruff check engine` | Passed |
| `uv run pytest -q` | **31 passed**; one upstream TestClient/httpx deprecation warning |
| `pnpm test` | **5 passed** |
| `pnpm build` | Strict TypeScript, renderer and Electron main/preload build passed |
| `pnpm dev` + `node scripts/check-dev.mjs` | Development Electron renderer connected to the real Python worker with no JavaScript/CSP errors |
| `pnpm build` and `pnpm exec playwright test -g 'synthetic CT only\|bubble population'` | Final WebCodecs implementation: **2 passed**, 1.3 min; bubble duration verified as 2 s, both native files valid; `.local/research-webcodecs-native.log` |
| `pnpm test:e2e` | **3 passed**: five-method workflow; invalid model/offline cancellation; reanalysis/compact layout |
| `uv run python scripts/export-contracts.py` | Updated request/config/analysis schemas, registry snapshot and OpenAPI |
| `uv run python scripts/make-instrument-reference.py` | Generated actual five-method example with 64×4096 RF, five 128² maps, options, diagnostics, figures and citations |
| `uv run python -m pamstudio.cli reproduce examples/five_methods_64ch/bundle` | Reproduced **DAS, TEA, CF, RCB, ATP**, rtol=1e-10, atol=1e-14 |
| `uv run python -m pamstudio.cli reproduce examples/point_source_64ch/bundle` | Original DAS/TEA package remains reproducible at the same tolerances |

The full-size five-method reference reconstruction took **6591.787 ms** on this machine. This is an observed wall time, not a real-time or cross-machine performance promise. ZIP SHA-256: `2382d6e3b20d7653bf3939e4289961c8fa0686ad7032d6c114ba7351e430cd00`.

| Method | Peak error (mm) | Lateral FWHM (mm) | Axial FWHM (mm) | Background / peak |
|---|---:|---:|---:|---:|
| DAS | 0.59806 | 2.16370 | 12.62205 | 0.97204 |
| TEA | 0.36671 | 2.17891 | 11.95723 | 0.98691 |
| CF-DAS | 0.59806 | 1.93305 | 12.48359 | 0.97016 |
| RCB | 0.59806 | 1.42693 | 12.07694 | 0.99718 |
| ATP | 0.36671 | 2.17885 | 6.05155 | 0.92400 |

These results expose limitations rather than imply universal improvement: RCB's background ratio is high in this fixture; all methods have broad axial responses. ATP uses the known 8 µs emission centre and 4 µs window. RCB uses a 16-channel smoothed subarray, relative uncertainty radius 0.1 and numerical loading 0.001. Recorded maximum uncertainty residual is 0.10000000000000017; raw/loaded condition maxima are 621083.875 and 15567.010.

The RCB complex two-sensor steering estimate matches independent SLSQP constrained optimization within 2e-6 and passes the zero-radius MVDR limit/unity-response/singular-covariance checks. ATP tests show timing-dependent depth response, reject unknown/long-pulse timing and verify that changing evaluation truth does not change the calculated map. These are implementation checks, not independent experimental validation.

UI verification used the actual Electron process and engine. Checked source keyboard editing/undo, RF channel selection, all five maps, display-invariant records, real resizers, menus, theme, tiled maps, export/import, reopening, sparse method selection, grid changes on the same RF and a compact 1100×800 window. Captured screenshots were visually reviewed; geometry framing, axis scaling, selected-property navigation and measurement scrolling were corrected. No numerical maps or traces were mocked.

Scientific definitions and primary citations are in docs/scientific-methods/reference.md; interface decisions/references are in docs/UI_DESIGN.md. No upstream implementation was copied. Completed 0.1 results and the original example package were preserved.

## Historical 0.1 verification — 2026-11-10

Native execution environment: Windows 11 x64, build 26200; CPU identifier `AMD64 Family 25 Model 80 Stepping 0, AuthenticAMD`. Node 24.18.1, pnpm 11.25.0, uv 0.10.6, uv-managed CPython 3.13.12. Baseline numerical packages: NumPy 2.3.4, SciPy 1.16.3, h5py 3.15.1. Electron 45.3.0, React 19.3.1, Vite 8.3.7, strict TypeScript 5.9.3. Exact environment is locked in the two dependency lockfiles; installed Python inventory is under docs.

## Executed checks

| Exact command | Observed outcome |
|---|---|
| `uv sync --python 3.13` | Provisioned CPython and installed scientific environment; cross-volume hardlink fallback to copy was informational |
| `uv sync --locked` and `pnpm install --frozen-lockfile` | Final lockfiles accepted; local environments already up to date |
| `uv sync` | Updated final locked FastAPI 0.162.4, Starlette 1.10.0 and pytest 9.2.0 after advisory review |
| `pnpm install --frozen-lockfile` | Passed on final lockfile |
| `node scripts/ensure-electron.mjs` | Confirmed official cached Electron binary ready for offline use |
| `uv run ruff check engine` | Passed after import organization and formatting |
| `uv run pytest -q` | **23 passed**; remaining upstream warning concerns TestClient's deprecated httpx compatibility path, not test failures |
| `pnpm test` | **4 passed**; SI conversion, power dB behavior, Python default-contract parity and unsafe input rejection |
| `pnpm build` | Passed strict TypeScript and production renderer/main/preload bundling |
| `pnpm build` and `pnpm exec playwright test -g 'synthetic CT only\|bubble population'` | Final WebCodecs implementation: **2 passed**, 1.3 min; bubble duration verified as 2 s, both native files valid; `.local/research-webcodecs-native.log` |
| `pnpm test:e2e` | **2 passed**, native Electron + real Python: full project/RF/maps/export/import/reopen and invalid-input/offline/cancellation scenarios |
| `pnpm dev` | Started Vite + Electron with automatically launched Python sidecar |
| `node scripts/check-dev.mjs` | Passed against the running development server: real engine health, no observed JavaScript/CSP errors |
| `pnpm peers check` | No peer dependency issues |
| `uv run python scripts/export-contracts.py` | Generated Config JSON Schema, Python default fixture and OpenAPI request contract |
| `uv run python scripts/license-inventory.py` | Generated installed Python dependency inventory and collected license notices |
| `uvx pip-audit --path .venv/Lib/site-packages --format json --output .local/pip-audit-final.json` | **No known vulnerabilities found** after updates |
| `pnpm audit --prod --json` | **Zero known production dependency advisories** |
| `pnpm audit --json` | One remaining moderate advisory: minimatch under electron-builder's development/installer tree, GHSA-g3hv-75wg-m249. Packaging is not released; upstream upgrade/compatibility validation remains a release gate |
| `uv run python scripts/make-reference.py` | Generated actual full-size RF, maps, metrics, PNG/SVG, HDF5 and reproducible bundle |
| `uv run python -m pamstudio.cli reproduce examples/point_source_64ch/bundle` | Reproduced both linear maps with **rtol=1e-10, atol=1e-14** after manifest verification |
| `node scripts/check-sidecar.mjs` | Expected explicit failure: a bundled Python executable has not been produced. Developer startup remains functional |

The Electron workflow tests substitute the native file-dialog selections with temporary paths. RF, reconstruction, metrics, arrays, persistence, bundle hashing and reimport all execute real production code. The cancellation scenario blocks external Chromium HTTP/HTTPS requests and verifies that the interrupted reconstruction never appears as complete. Python API tests also verify bearer authentication, origin rejection, array dimensions and bounds.

## Full-size reference result

Configuration: 64 centered receive elements, pitch 0.3 mm, c=1500 m/s, one emitter at (0,30) mm, emission centre 8 µs, 1 MHz Gaussian-windowed carrier, duration 4 µs, fs=20 MHz, 4096 samples, 30 dB full-record SNR, seed 42, 128×128 grid, source-time gate 4–12 µs, stride 4.

Final shared DAS+TEA reconstruction wall time: **1171.780 ms** on this machine. No universal runtime claim is made.

| Metric | Passive DAS | TEA-style coherent exposure |
|---|---:|---:|
| Peak x (mm) | -0.09449 | +0.09449 |
| Peak z (mm) | 30.59055 | 30.35433 |
| Global-peak error (mm) | 0.59806 | 0.36671 |
| Lateral half-power width (mm) | 2.16370 | 2.17891 |
| Axial half-power width (mm) | 12.62205 | 11.95723 |
| Background peak / global peak | 0.97204 | 0.98691 |

The broad axial response and high background ratios are real limitations of this example. The UI and method notes expose them. A submillimetre global-peak error does not imply submillimetre axial resolution.

Sample ZIP SHA-256: `d7f71449e8f711c2f24353deb98a2ad0389c93c0736dc3d4c2796ffcc5e788dc`. Each included file is separately hashed in the manifest. Source version is 0.1.0 with an engine source checksum; there is no fabricated Git commit for the initially empty, uncommitted workspace.

## Issues found and resolved during verification

- Fixed the initial SQLite INSERT column/placeholder mismatch; persistence/reopen/import tests now pass.
- Updated electron-builder from an older release whose Git subdependency was rejected by pnpm supply-chain checks; retained the checks. Updated the React Vite plugin to match Vite 8. Configured explicit dependency build permissions.
- Downloaded and verified the official Electron runtime during setup; concurrent initial download delayed the first launch test. Subsequent native launches pass.
- A Windows provenance `git` child process stalled waiting for captured-pipe EOF under the attached Electron debugger. A traceback identified `subprocess.communicate`. Replaced provenance subprocesses with filesystem Git metadata reads and source checksums; no timeout suppression or longer test tolerance was used as a fix.
- Fixed the job polling transition and made job acceptance stable even if the worker completes before the response is sent.
- Fixed draft comparison to ignore JSON property order, preserving accurate frozen-run change indicators.
- Validated default numeric types and compare parsed scientific configurations semantically, avoiding false import mismatches from `1500` vs `1500.0` JSON representations.
- Updated Zod, Vitest, FastAPI/Starlette and pytest after dependency advisory scans. Final science and Electron checks run against the updated dependencies.

## Limits of this evidence

No independent external beamformer comparison, clinical validation, hosted CI run, Linux/macOS local smoke, bundled Python runtime or signed installer was performed. No advanced algorithm or external simulator adapter is implemented. Exact remaining scope and release gates are in IMPLEMENTATION_STATUS.md. No tests use patient data or device connections.






