# Multiple-source localization and repository publication — 0.11 — 2026-11-11

The user's single-peak issue was the old global-argmax marker/metric. A separate truth-independent detector now reports regional maxima, consolidates plateaus, rejects non-maximum shelves, and applies relative-power threshold / physical separation / bounded cap. A separate global one-to-one gated assignment maximizes matched source count before localization error. It does not force a peak for each configured source. Main Reconstruction and Benchmark display P/S labels, matched/missed/extra tables, coordinates, errors, precision/recall/F1 and matched RMSE. Current criteria are preserved in CSV/JSON/PDF (report 1.2). Old maps and legacy global-peak records remain unchanged.

Full verification: 88 Python tests passed (262.46 s), 29 TypeScript tests, all 16 native stories passed (6.1 min). Final targeted Benchmark/multi-source tests passed (2, 30.5 s) after preserving the actively selected method across document changes. Nine scientific/report tests passed after PDF-only pagination refinement. The initial disclosure reset on recalculation and prior Benchmark-method override were found through actual UI inspection and corrected. Final marker-label contrast is covered by a fresh build and native source story. Details/commands in BUILD_REPORT.md; definitions in docs/PEAK_DETECTION.md.

The real 64-channel / 97-grid fixture has 3 unequal-amplitude sources and four methods. ATP at −12 dB / 2 mm separation / 2 mm matching detects and matches all 3 with no extras, RMSE 0.19432 mm. Lowering threshold to −20 dB retains 2 extra candidates; tightening matching to 0.05 mm changes only assignments, not the 3 detection coordinates. CF/DAS sidelobes and TEA misses remain visible. CLI reproduction passes at rtol=1e-10, atol=1e-14. All four PDF pages were rendered/inspected, and per-method table leads are kept with their tables.

The previous coupled two-bubble fixture is also evaluated read-only: CF/DAS/TEA each match 1 of 2 at 2 mm and 2 of 2 at 4 mm, without changing their 9/15/10 detected peak counts. This demonstrates tolerance-dependent matching rather than added resolution. No fragment count or source count is fabricated.

The user's explicit GitHub request is additive to the multi-source task. Created a new private repository under the authenticated owner aisyalfawwaz: https://github.com/aisyalfawwaz/pam-research-studio. Existing Git author settings retained. Initialized main/origin, ignored local environments/runtime/caches/logs and credential patterns, scanned publishable text for credential signatures (none), and protected byte-identical example/dataset checkout with .gitattributes. No code license is invented. Final commit/remote hash are recorded in delivery and the ignored local publication record. No credentials are stored in project files or emitted.

Native preview script scripts/preview-multipeak.mjs opens the actual frozen local project, checks all 3 markers and assignments, demonstrates stricter tolerance without moving peaks, inspects Benchmark, restores native dialogs and leaves the app at ATP reconstruction. Metadata is .local/multipeak-preview.json; scientific project .local/multiple-sources-0e0f46a3. Screenshots in docs/images/multiple-source-*.png. Original examples and prior reports remain preserved.

---

# Research refinements — 0.10 — 2026-11-11

The user's instruction to implement all six proposed refinements is delivered: real Cartesian sweeps; noise-free convergence checks with RF reuse; seeded actual capture/nominal calibration Monte Carlo with descriptive and bootstrap intervals; heterogeneous independent source bubbles; experimental CT straight-ray receive delays; and numerical PDF/WebM presentation exports. No fragmentation/jet animation is invented for a spherical radial solver. Detailed scope and limitations are in docs/RESEARCH_STUDIES.md.

Python: 83 passed (215.60 s), plus 4 population/report tests after PDF pagination refinement. TypeScript: 28 passed. Final full native Electron suite: 15 passed in 5.1 min (.local/research-e2e-release.log). Production build passes; a 529 kB main chunk warning remains. All five original methods, real optional CPU adapters, 1024-channel story, cancellation, export/import, saved settings and project flows are covered. Final project-open/tab race is fixed by disabling document navigation during pending project actions. Exact seeds remain unrounded in the study table and PDF inventories.

Intermittent zero-frame MediaRecorder output was reproduced under offscreen Windows tests. It was replaced by explicit WebCodecs VP8 frame encoding and Mediabunny 1.65.2 WebM muxing, software-preferred and independent of window repaint cadence. Both dedicated native video stories pass, including decoding and finite 2-second duration. Buffer and metadata validation, output budgets, encoder cleanup and hash companions remain enforced. Mediabunny MPL-2.0 original source/license, exact archive/integrity and original DOM type notices are retained; library and MRes author credits are separate. No upstream source is modified or FFmpeg executable installed.

New examples/research_refinements contains actual 4-case sweep, 3-grid convergence and 16 uncertainty trials, a real two-source jbubble→j-Wave population, and synthetic CT same-RF delay comparisons. Population, uncertainty and CT packages reproduce via CLI with recorded tolerances. All 13 pages across the five example PDFs were rendered and visually checked. Numerical results stay honest: sampled convergence may remain unestablished, missing metrics stay missing, and CT straight-ray correction does not universally improve localization. Original example bundles and completed HDF5 records are preserved.

Final native preview metadata/video checks are recorded in .local/research-preview.json; local scientific project is .local/research-v010-4008e2b7. Both 6-second outputs decode and seek; all 61 example hashes match, and each video has 120 timestamped frames with the original immutable HDF5 context. The visible window is responsive, left on Studies, with native file dialogs and motion preference restored. Final UI wording/exact-seed display received another successful production build and native study check (1 passed, 14.2 s). The previous 0.9 preview was closed gracefully only after verifying PID ancestry and executable location. Tests and manual preview run sequentially to avoid Windows focus interference. BUILD_REPORT.md records commands and results.

---

# Bubble motion inspector — 0.9 — 2026-11-11

The user's Bubble dynamics animation request is implemented with actual stored R(t), fixed scale, signed wall-motion arrows, instantaneous values and synchronized cursors on all four traces. Slow-motion playback has Play/Pause/restart/sample stepping, physical-time seek, cycles/s and loop/end controls. Extrema and first nominal shell-rupture crossing are directly inspectable. Coating states/effective tension derive only from the run's saved smooth Marmottant parameters. Missing parameters remain unavailable; free bubbles are uncoated. No fragment or jet animation is fabricated for this spherical radial model.

The inspector expands the workspace, restores panels on exit and keeps event buttons above scrolling content. It replays completed/imported trajectories even when RF was omitted. Original 2005 shell-model authors and jbubble's smooth-law contributors are credited in the app, model documentation and new bubble export bibliographies. TypeScript tests: 26 passed; Python: 73 passed; all 13 native Electron stories passed in 4.7 min. Exact commands are in BUILD_REPORT.md and `.local/bubble-motion-*.log`.

The final targeted jbubble story passed again in 45.0 s after the local inspector-scrolling adjustment. The native 0.9 app is visibly open with actual bubble playback running, no renderer errors and a responsive window; the helper console is hidden. Fresh demo project metadata is `.local/bubble-motion-preview.json`. It imports the original frozen jbubble reference without changing its numerical data or 0.3 provenance. Final images are `docs/images/bubble-motion-expanded.png`, `-compressed.png` and `-compact.png`; the display uses the real ~1.498–2.414 µm radius range. Reduced-motion pause and full/compact layouts were checked in the native preview.

---

# Historical workspace refinements — 0.8 — 2026-11-11

The user's refinement request is implemented across existing feature boundaries: project hydration/session-bound saves, complete authoritative run-option restoration, coherent method/DSP/backend graphs and preset defaults, raw capture-clock replay, restored panel visibility and stable completion navigation. Report 1.1 preserves numerical definitions while adding full comparison contexts, exact parameter differences and current-minus-reference deltas. Benchmark selection persists per project and links directly to stored RF/PAM and saved settings.

Verification uses real synthetic computation through the native app and sidecar. Full Python suite: 73 passed; TypeScript: 21 passed; all 13 native Electron scenarios passed in 4.4 min. Exact commands are in BUILD_REPORT.md. Both new report-1.1 evidence packages reproduce all five maps; original 0.7 scientific provenance/runtime are retained and earlier examples unchanged. No new library, new physics validation, installer or clinical capability is claimed.

An early restoration test exposed Properties controls bypassing graph synchronization; the handler was corrected. Native testing then exposed asynchronous completion stealing CT focus, followed by the need to preserve F5 navigation from Model builder. Both behaviours were corrected and exercised in the final suite. See `.local/refinements-v08-*.log` and the build report for evidence.

Final native 0.8 preview is open on the new synthetic refinement project, showing the actual full/alternating-aperture comparison, exact changed channel selection and score deltas. Ten rows and paired maps were checked without renderer errors; screenshots are `docs/images/workspace-refinements*.png`. The older preview was closed gracefully. No helper console is left visible.

---

# Historical implementation plan — 2026-11-10

Scope: PRD Milestones 0 and 1, native Windows offline NumPy CPU path.

1. Define analytical arrival, fractional-delay, t0, symmetry, channel-order and localization fixtures before implementing the engine.
2. Implement strict SI models, deterministic finite-duration analytic emission, shared receive-delay alignment, peak DAS power and separately integrated TEA-style exposure. Keep methods reference-only pending independent scientific review.
3. Add SQLite metadata, immutable HDF5 runs, atomic finalization, cancellation, bounded previews, reproducible export and validated reimport.
4. Add localhost authenticated FastAPI sidecar and a sandboxed Electron + React client with whitelisted IPC, native file dialogs and sidecar lifecycle management.
5. Demonstrate create/demo/simulate/RF/reconstruct/compare/export/reopen using real calculations; add Python, contract and Electron E2E coverage and Windows/Linux CI.
6. Record exact checks, results, scientific limitations and packaging status in IMPLEMENTATION_STATUS.md and BUILD_REPORT.md.

The initial Milestone 0/1 scope above is historical. Subsequent explicit user requests authorize the installed j-Wave/jbubble adapters, their coupling, 1024 channels, branding, receive DSP and a public CT anatomical reference. No third-party research source code is vendored. Automated tests remain synthetic-only; the public CT demonstrations are manual and user-requested. Repository redistribution license still requires owner decision.

## Handoff

Implemented the functional Milestone 0/1 native developer path and real sample bundle. Final checks: 23 Python tests, 4 TypeScript tests, 2 native Electron E2E scenarios; production build and CLI reproduction pass. Reviewed dark/light screenshots and corrected theme contrast. Exact evidence and remaining scope are in BUILD_REPORT.md and IMPLEMENTATION_STATUS.md. Python runtime packaging, signing and independent scientific validation remain undelivered release work.

## User-directed revision — 2026-11-11

User requested a substantially different MATLAB/KiCad/NI-style desktop UI, then explicitly expanded method scope to passive DAS, TEA, CF, RCB and ATP. This supersedes the temporary single-DAS decision and the earlier milestone-only scope for those algorithms. User asked work to continue while asleep; no further clarification is required.

Delivered version 0.2: full instrument workspace, direct geometry editing, real analysis controls, resizable panels and five calculated methods. RCB solves the spherical steering uncertainty problem; ATP uses explicit short-pulse timing, not truth coordinates. Reanalysis applies grid/gate/aperture changes to the same RF. Original runs and example remain intact. Current evidence: 31 Python, 5 TypeScript and 3 native Electron tests; both sample generations reproduce. See the current build/status reports and screenshots.

## User-directed library integration — 2026-11-11

User explicitly requested j-Wave integration while asleep, then jbubble after j-Wave. This supersedes the previous adapter deferral for these two libraries. Licenses/platform requirements were checked before installation. WSL is absent; the locally verified native JAX CPU route is explicitly experimental, with upstream j-Wave's WSL recommendation retained. No WSL/system-feature installation or reboot was attempted.

Version 0.3 integrates j-Wave 0.2.1/Python 3.12/JAX 0.4.38 and jbubble 0.2.0/Python 3.13/JAX 0.8.2 in separate pinned environments. Both run real scientific code into the existing RF/method pipeline. jbubble also provides a real trajectory document. It uses a separate 3D monopole bridge, not undisclosed forcing of the 2D j-Wave solver. Nonlinear harmonic quadrature and aperture issues are exposed. Full state, exact versions, hashes, model constants, diagnostics and citations persist in HDF5/export. No research implementation was copied. Current verification is in BUILD_REPORT.md.

## User-directed coupled workbench — 2026-11-11

The user explicitly requested simultaneous end-to-end jBubble/j-Wave, a drag/drop scientific workflow builder, actual live bubble/field/sensor/PAM visualization, and configurable multiple arrays/poses. This supersedes the earlier coupling deferral. Version 0.4 implements typed fixed blocks and a one-way conservative volume-flow-to-equivalent-line bridge, with explicit length, causal filtering and ATP group delay. Actual solver observations are band-limited only for display; RF is unchanged. Radius is radial, not invented nonspherical motion. The array editor changes physical coordinates, pitch/aperture, count and angle; channel membership persists. Tests and new immutable example are recorded in the v0.4 report. Earlier v0.1–0.3 fixtures remain preserved.

## Capacity, personal identity and next increment — 2026-11-11

User requested 1024 channels, a suitable logo and MATLAB-style researcher credits on startup, then supplied the exact identity Aisy Fawwaz / Imperial College London / Bioengineering. Version 0.5 delivers this with 61 Python, 11 contract and 9 native Electron scenarios passing, real 1024-channel coupled and five-method runs and a reproducible 1024-channel package. See current reports.

While this was finishing the user explicitly expanded the active task to open-source receive DSP/filtering and an openly sourced head CT/DICOM medium for heterogeneous propagation and effects on PAM, continuing autonomously while asleep. This supersedes the earlier heterogeneous-medium deferral. Source licenses were verified; automated tests remain synthetic-only and public CT demonstrations are separately documented manual user-requested runs.

## Delivered DSP and CT integration — 2026-11-11

Version 0.6 now executes SciPy receive conditioning and pydicom/GDCM HU import with real heterogeneous j-Wave speed/density fields. The CT workspace exposes crop/material settings, real HU image, source/array placement and matched water/CT PAM maps/RF RMS. The whole public axial slice runs at 0.1 MHz/1 mm spacing within CPU bounds. The fast 0.25 MHz skull patch remains the default. All source HU, native fields, raw/conditioned RF, bubble trajectory, causal volume flow, wave history, maps, citations, checksums and settings survive export/import.

All 66 Python, 13 contract and 11 native Electron scenarios passed; targeted checks after RF-layout/live-unit adjustments also passed. Four manual CT/water bundles and earlier 1024-channel/coupled bundles reproduced. Production JS and installed Python audits found no known advisories. Exact commands, hashes and unrounded numerical outcomes are in BUILD_REPORT.md and examples/*/BENCHMARK.json. Public reference authors and CC BY 4.0 attribution are in the dataset, app and exports. Main native developer app is running with the complete public-head comparison project open; helpers are hidden. No signed installer is delivered.

Do not overstate physics: radial bubbles remain spherical; CT is an experimental HU-to-fluid c/rho mixture, with air/soft tissue replaced by host fluid, zero absorption and no elastic/shear/3D model. Receive delays remain homogeneous/uncorrected. The public CT comparison shows numerical aberration, not patient-specific calibration or clinical validity. See docs/DSP_AND_CT.md.

## User-requested PAM evaluation — 2026-11-11

Version 0.7 implements the requested benchmark scores as a separate saved-result document. Definition `pam.benchmark.map` 1.0.0 provides peak localization, FWHM, truth-disk map concentration, background dB, signed contrast, CNR, gCNR, entropy and connected half-power area. Physical ROI/bin settings persist locally and accompany reports; sample/edge validity is explicit. No overall quality score, clinical probability or unmeasured per-method runtime is invented. Original gCNR authors are credited with DOI 10.1109/TUFFC.2019.2956855.

Reports derive from immutable stored linear maps, with same-RF/settings fingerprint matching, scenario labels, map hashes and native CSV/JSON export. New experiment bundles include manifest-covered default benchmark files; old packages remain readable and can be evaluated without mutation. The synthetic five-method 64-versus-32-alternating-channel fixture is in examples/pam_benchmark, with all scores and two reproduced bundles. Independent Gaussian/histogram/degenerate tests and actual desktop report/export/comparison checks are recorded in BUILD_REPORT.md. See docs/PAM_BENCHMARK.md for equations and the evidence.

Final verification: 71 Python tests, 14 contract tests and all 12 native Electron scenarios passed. Early native F6 UI waits were isolated by moving automated test windows outside the interactive desktop; production window behaviour is unchanged. Targeted benchmark tests passed again after null peak-marker and Windows CSV-ending checks. Fresh corrected bundles were regenerated and reproduced, preserving pre-release evidence under .local. The latest native app is visibly open on the actual Benchmark comparison project, with ten computed method/run rows and no renderer errors; its helper console is hidden.




