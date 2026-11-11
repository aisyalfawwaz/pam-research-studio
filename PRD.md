# PAM Research Studio — Product Requirements Document

**Document ID:** PRS-PRD-001  
**Version:** 1.0  
**Date:** 2026-11-10  
**Status:** Proposed / implementation-ready for milestone 1  
**Product type:** Local-first, open-science desktop research workbench  
**Primary platform:** Windows 11 (x64); macOS/Linux planned  
**Primary users:** Ultrasound researchers, MRes/PhD students, experimental acoustics teams, algorithm developers, collaborating labs

> **Mission:** Make passive acoustic mapping (PAM) research reproducible, inspectable, extensible, and accessible through a serious desktop UI. A researcher should be able to define a cavitation-source scenario, synthesize or import raw receive-channel data, reconstruct the source with several PAM algorithms, evaluate performance against ground truth, and share a complete, attributable experiment with another lab.

> **Scope guardrail:** The platform is strictly for **research and education**, **not clinical diagnosis, treatment planning, therapeutic control, real-time patient monitoring, or a medical device**. Never imply that a synthetic reconstruction is evidence of patient safety or treatment efficacy.

---

## 1. Problem statement

Research code for acoustic simulation, microbubble dynamics, RF acquisition, and beamforming is fragmented across languages, institutions, data formats, and computing environments. The same nominal algorithm is often evaluated with different units, time origins, channel definitions, and metrics, making comparisons difficult. Existing tools may be excellent in their narrow domain but rarely cover the **passive-source-to-PAM-map-to-benchmark** workflow in one reproducible interface.

PAM Research Studio will solve this problem through a standardized data model, original transparent PAM algorithms, plugin adaptors for independently maintained packages, and provenance-rich experiments. This is a **collaboration platform**, not a claim of ownership of others' software or scientific contributions.

## 2. Goals and non-goals

### Goals
1. Deliver an **actually runnable** Windows desktop app, not just a prototype or mocked interface.
2. Create a fully offline built-in reference pipeline: simple synthetic passive source -> received RF -> DAS/TEA map -> quantitative metrics -> export.
3. Implement algorithm modules with documented math, tests, citations, and reproducible inputs.
4. Integrate compatible third-party frameworks using **versioned, testable adaptors**, preserving attribution and licensing.
5. Let collaborators compare algorithms on **identical channel data, array geometry, reconstruction grid, preprocessing, and metrics**.
6. Enable external investigators to contribute new algorithms, datasets, or adapters using a stable SDK and GitHub pull requests.
7. Enable independent reproduction by exporting config, seed, inputs or documented hashes, environment, code version, figures, metrics, and citations.
8. Explain scientific assumptions and known limitations within the UI.

### Non-goals (v1)
- Direct connection to clinical ultrasound transmit hardware; automatic treatment, hardware command and device actuation.
- Diagnosing cavitation type, blood-brain barrier opening, or patient outcomes from PAM reconstructions.
- Reimplementing an entire 2D/3D wave solver merely to avoid dependencies.
- Claiming all worldwide ultrasound libraries can be bundled or are compatible.
- Automatically granting academic co-authorship by virtue of contributing code.
- Cloud accounts, user data harvesting, public upload of clinical scans, or arbitrary execution of downloaded scripts.
- Exact equivalence of a plugin's output to the original publication without numerical validation.

## 3. Users and jobs-to-be-done

| Persona | Core job | Success definition |
|---|---|---|
| PAM learner | Learn delay alignment, RF concepts, DAS, Capon | Can inspect sensor traces and explain a reconstructed peak |
| Algorithm developer | Implement new reconstruction and compare against baselines | Submits plugin + unit tests + citation + benchmark output |
| Experimental researcher | Import raw multi-element channel recordings | Correct axis map, sampling metadata, and provenance |
| Microbubble researcher | Simulate bubble emissions with jbubble | Generates an emission waveform and links it to recorded channels |
| Physics simulator | Validate across medium assumptions using j-Wave/k-Wave | Can export solver settings, field, channel data, warnings |
| Principal investigator / collaborator | Review algorithm results across labs | Reproduce, diff, annotate, cite, and export figures and reports |

## 4. Product principles

- **Scientific truth over UI polish:** Label unvalidated models or conversions as experimental.
- **No invisible unit conversions:** SI internally; UI can display mm, µs, MHz, kPa. Show conversion source.
- **Immutable experiment runs:** Editing config creates a new run; never silently mutate finished results.
- **Original algorithms and adapters are distinct:** Code authored here vs external projects have separate provenance.
- **Graceful capability degradation:** Built-in NumPy CPU mode works without GPU, MATLAB, WSL, or internet.
- **Citation-first collaboration:** Every external package and method is traceable to authors, version, license, paper.
- **Privacy-by-default:** Data stays local unless the user deliberately exports or shares it.

## 5. End-to-end research workflow

1. **New project:** choose blank, tutorial, or published-example template. Record name, description, project owner, contributors, units, experiment protocol.
2. **Acoustic scene:** define 2D domain first (x,z in meters), homogeneous medium, source positions, source type (short pulse, harmonic emission, broadband event); later heterogeneous maps, skull, multiple dynamic emitters.
3. **Probe:** choose a virtual linear receive array (number of elements, pitch, locations, element sensitivity, sampling rate, centre frequency, receive time zero); later custom curved/matrix arrays.
4. **Generate / import:** built-in analytic propagation generates per-channel synthetic RF; alternatively import a supported source file or invoke an installed simulator adapter.
5. **Inspect RF:** channel heatmap, individual RF traces, FFT/PSD, temporal gate, optional filters; signal mask and saturations shown explicitly.
6. **Reconstruction:** choose algorithm(s) and parameters. All selected algorithms use identical calibrated data and a shared grid unless explicitly changed in a recorded experiment variant.
7. **Benchmark:** compare with known source locations and other algorithms; create 2D map, metrics, confidence checks, runtime/memory reports, and side-by-side overlays.
8. **Save/export:** freeze exact config, dependency versions, code commit, seed, input hashes, output, figures, metrics, citations, and methodology in a portable folder/ZIP.
9. **Collaborate:** read-only experiment package; review comments and author contributions; optionally submit algorithm module via GitHub PR. No implicit upload.

## 6. Functional requirements with priorities

### P0: Fully working first vertical slice (MVP)

**FR-001: Project lifecycle**  
Create/open/save projects from desktop UI; recover from crash; use OS file dialog. Store metadata in a versioned SQLite project DB, large numeric arrays separately in HDF5 or Zarr. Autosave draft configs, not mutable scientific results.

**FR-002: Validated input forms**  
Medium: sound speed in m/s, density optional for analytic model; receiver array geometry; source 2D position(s); time origin; emission model; sampling rate; number of samples; SNR; random seed; reconstruction grid in m. Validate sampling and ROI, physically implausible settings, channel coverage, and time bounds; display explicit warnings.

**FR-003: Analytic homogeneous-medium RF simulator**  
Built-in deterministic NumPy/SciPy reference engine: generate one or multiple time-limited passive acoustic source waveforms, propagate by geometric time-of-flight to array elements, perform fractional delays with documented interpolation, optionally geometric spreading, configurable band-limiting and additive Gaussian noise. Record amplitude convention; **do not claim full-wave scattering, nonlinear propagation, skull aberration, or calibrated pressure**. No transmit delays in this passive-receive path.

**FR-004: RF explorer**  
Plot [time x channel] RF heatmap, channel waveform, temporal spectrum, channel positions. Verify shape, units, sampling rate, clipping/saturation flags, channel mapping. Export CSV of limited ROI and HDF5 of full data.

**FR-005: Reference reconstruction algorithms**  
Implement at minimum a transparent passive Delay-and-Sum algorithm and a time-integrated acoustic exposure/power reconstruction (TEA-style) with rigorous definitions in docs. Use interpolation, aperture selection, time-gate and amplitude normalization. Output properly labelled linear maps and display-only dB maps. The TEA implementation must reference its precise definition and test cases; do not conflate TEA with generic DAS magnitude.

**FR-006: Reconstruction display**  
2D PAM map with physical axes (lateral x mm, axial z mm), adjustable but documented linear/dB display, peak marker, crosshairs, coordinate readout, ground-truth point overlay, axial/lateral profiles; do not misrepresent the colourbar as absolute pressure when output is arbitrary units.

**FR-007: Compare runs**  
Same RF, grid, temporal gate, and normalization. Show difference maps, peak-localization errors, lateral/axial FWHM where valid, background false-positive and time/memory. Disable or flag unsuitable metrics when source shape or PSF assumptions invalidate them.

**FR-008: Export research package**  
Create directory + ZIP containing `experiment.yaml`, `environment.json`, `manifest.json`, `metrics.json`, `results.h5`, images (PNG/SVG), method notes, bibliography (`references.bib`), package versions and SHA-256 file hashes. Explicit opt-in to include potentially identifiable raw data.

**FR-009: Onboarding tutorial**  
A built-in tiny single-source demo runnable offline in one click. “Show mathematics” panel explains delays, sampling, summation, map intensity and error metrics, with citations.

**FR-010: Basic test coverage**  
Pytest unit and integration tests; TypeScript unit tests; at least one Playwright Electron E2E smoke test. CI for Windows and Linux; no tests that require optional GPU or MATLAB for the default build.

### P1: Advanced beamforming and useful interoperability

**FR-101: Adaptive and robust PAM**  
Capon/MVDR with complex/Hermitian covariance, configurable snapshots, sample covariance, spatial smoothing as applicable, diagonal loading, steering-vector convention, numerical condition indicator; methodologically distinguish `MVDR + diagonal loading` from **true robust Capon beamforming (RCB)**. RCB, EISRCB and ATP-PAM get separate implementations, parameter pages and reference tests following source publications. **Do not label a placeholder implementation as an algorithm.**

**FR-102: Spectral / cavitation modalities**  
Optional narrowband harmonic, ultraharmonic, broadband and subharmonic frequency-selective maps; fully documented FFT/windowing convention, bandwidth definitions, harmonics exclusion, noise floor, and alias checking. These are descriptive spectral outputs, not automatic safety/biological outcome classifications.

**FR-103: Batch benchmarking**  
Parameter sweeps: source x/z, number of sources, SNR, number of elements, pitch, speed-of-sound error, missing or failed channels, sample frequency, bandwidth, diagonal loading, grid resolution, temporal gate; repeated Monte Carlo seed list; chart median/quantiles and confidence intervals.

**FR-104: Import formats**  
`NPY/NPZ`, `CSV` (small examples), `MAT v5` through SciPy, HDF5 including MATLAB v7.3 when compatible, and UFF using `pyuff-ustb` with explicit metadata/shape checks. Support both real RF and analytic IQ data, never assume identical data types. Vendor raw recordings only via documented, authorized file schemas; no claim of generic Philips/GE/Verasonics device compatibility.

**FR-105: Library adapter registry**  
Plugin manifest metadata; installed version/capability detection; health checks; code/license/citation status; CPU/GPU/Windows/WSL2/MATLAB requirements; per-adapter regression tests. Enable/discover optional environment on request, never invisibly install or execute code.

**FR-106: Reproducibility**  
Run provenance includes project version, OS, Python and Node versions, versions of each scientific package, git commit, numerical precision, backend, GPU/CPU info, random seed, protocol and config hashes. Export runnable CLI recipe with explicit environment setup.

### P2: Extended physics, investigator collaboration, quality

**FR-201:** j-Wave and k-Wave wave propagation adapters, via isolated environments, supported boundary conditions and sensor mappings, documented solver constraints and experimental cross-validation.

**FR-202:** `jbubble` bubble radius-vs-time, emitted acoustic-pressure waveform, and propagation coupling; explicitly distinguish a bubble ODE plus simplified radiation from a full 3D wave-field simulation.

**FR-203:** Multi-source and evolving bubble clouds; optional MATLAB-based SimUSCav interoperability through file handoff or separately licensed MATLAB runner; no silent translation of research MATLAB into “equivalent” Python.

**FR-204:** User-installed algorithm plugin SDK, paper metadata, validation certificate, regression fixtures, unit/coordinate schema. Plugin API is versioned and isolated.

**FR-205:** Collaborative project exchange (explicit export/import), notes, review states, ORCID, contribution roles (CRediT-style), changelogs and GitHub PR links. Attribution does **not** imply scientific co-authorship.

**FR-206:** Compare full-field heterogeneous media and documented skull phantoms, optional medically sourced images only with proper rights, de-identification, authorization, and research-ethics checks.

**FR-207:** Optional reproducible batch CLI / HPC executor (local first, remote later) reusing exact core engine and schema.

## 7. Research method registry

Each method entry must record:
- Unique ID (`pam.das.passive`, `pam.tea.time_exposure`, `pam.mvdr.sample_covariance`, `pam.rcb.robust`, `pam.eisrcb`, `pam.atp.short_pulse`, etc.).
- Paper DOI, complete reference, equation and assumptions, original authors.
- Passive/active applicability; emission type, narrowband/broadband assumptions, timing requirements and known failure modes.
- Input data constraints (RF/IQ, number of channels, snapshots, sampling, grid, sensors).
- Parameters with units/defaults and warnings.
- Output meaning and normalization; numerical precision, deterministic behavior.
- Validation fixtures, comparison against independent reference implementation or analytical case where available.
- Implementation owner, reviewers, stability level (`verified`, `experimental`, `reference-only`).

### Core scientific correctness requirements

1. Passive receive time-of-flight for receiver m and candidate source r is `tau_m(r)=||r-r_m||/c` only under straight-ray homogeneous assumptions; heterogeneous media require an appropriate travel-time model.
2. Define explicitly whether a reconstruction samples `s_m(t + tau_m)` or `s_m(t - tau_m)`, and align all timestamps with the source emission `t0`. Validate with a known point source; a sign error must be caught by tests.
3. Distinguish propagation delay, transmit focusing delays, and acquisition trigger/t0; never reuse active B-mode transmit delay formulas automatically in passive PAM.
4. On MVDR: covariance must be formed with consistent dimensionality, complex-conjugate transpose where appropriate, and meaningful snapshots. Provide stability guardrails for rank-deficient matrices. Prefer `solve` to explicit inversion.
5. RCB and EISRCB are distinct published approaches; their constraints and projections must be implemented from primary equations, independently validated, and tagged experimental until verification.
6. ATP-PAM is specifically linked to pulsed-source time-of-arrival (axial) and DAS localization (lateral); warn if acquisition lacks sufficiently known short-pulse timing or suitable waveform.
7. Spectral maps must clearly identify frequency bands, windowing, FFT scaling, and contribution of harmonics/ultraharmonics and broadband noise.
8. Numerical source localization metrics are computed in physical units and should not be inferred from figure pixel positions.
9. Support negative/positive coordinates and nonuniform probe geometry without swapping axes.
10. Keep the raw linear map invariant when the user changes visual brightness/dB range.

## 8. Standardized data contracts

### 8.1 ChannelData v1

```json
{
  "schema_version": "1.0",
  "data_kind": "rf_real",
  "shape": [1, 4096, 64],
  "dimension_order": ["frame", "sample", "channel"],
  "dtype": "float32",
  "sampling_frequency_hz": 20000000.0,
  "t0_s": 0.0,
  "receiver_positions_m": "stored in dataset /probe/positions_xyz_m [64,3]",
  "signal_unit": "arbitrary_unit",
  "array_storage_uri": "project-relative path only",
  "source": {"kind": "synthetic", "generator_id": "builtin.point_source.v1"}
}
```

Coordinate convention: right-handed, lateral x, elevational y, axial/depth z, SI units internally. The UI can display mm/µs/MHz. Reject files with missing shape or unknown sampling rate until a user-approved mapping is saved. Store complex IQ in an explicitly typed dataset and preserve its carrier or demodulation reference.

### 8.2 ReconstructionResult v1

Required fields: `method_id`, `method_version`, `input_run_id`, `x_grid_m`, `z_grid_m`, `map_linear`, `map_quantity` (e.g. `relative_power`, not assumed pressure), `normalization`, `time_gate_s`, `timing_convention`, `algorithm_parameters`, `warnings`, `runtime_ms`, `precision`, `provenance`, and optional `reference_truth`.

### 8.3 Experiment v1

Project -> immutable run -> source configuration, medium, probe, capture, preprocess DAG, algorithm(s), metrics, figures, files, parameters, environment, run status, citations, contributor annotations. Every run is identifiable by UUID and content hash. File read/write must be atomic.

## 9. External research library catalogue

**All integrations require up-to-date license review, platform/dependency checks, and a validated numerical adapter.** A row here is a *candidate*, not a claim that direct integration is already implemented.

| Library/project | Upstream | Purpose | Planned integration | Notes |
|---|---|---|---|---|
| j-Wave | https://github.com/ucl-bug/jwave | Differentiable wave propagation in JAX | P2 optional WSL2 subprocess on Windows, native environments elsewhere | README documents Windows through WSL; LGPL-3.0; do not pretend native Windows works |
| k-Wave MATLAB | https://github.com/ucl-bug/k-wave | Reference full-wave time-domain solver | P2 optional MATLAB/external job adapter | LGPL; MATLAB may require separate license |
| k-Wave-python | https://github.com/waltsims/k-wave-python | Python acoustic wave simulation / C++ backend | P2 separated Python runner | Current license file states LGPL-3.0; older package metadata may be inconsistent; verify release |
| jbubble | https://github.com/imperial-nsb/jbubble | Differentiable microbubble dynamics and acoustic emissions | P2 separate Python 3.13+ environment | MIT; beta API; research group must be credited |
| USTB + Python USTB | https://github.com/unioslo/USTB | Standard ultrasound processing, UFF, baseline checks | P1 UFF import and baseline comparison | MIT; Python implementation newer and incomplete vs MATLAB; citation norms |
| PyBF | https://github.com/Sergio5714/pybf | DAS and MV beamformer reference | P1 reference-only comparison or adapted if compatible | Apache-2.0; legacy environment (Python 3.6) needs isolation |
| PyMUST | https://github.com/creatis-ULTIM/PyMUST | Ultrasound RF/IQ simulations and processing | P2 optional simulation adapter | LGPL-3.0; ultrasound imaging focus, not automatically passive PAM |
| SimUSCav | https://github.com/creatis-ULTIM/SimUSCav | Simulated cavitation RF and ground-truth maps | P2 MATLAB/file adapter, or external reference datasets | Research scripts; **license not established**; do not bundle until permission/license verified |
| BabelBrain | https://github.com/ProteusMRIgHIFU/BabelBrain | Skull propagation / neuromodulation planning workflows | Research-oriented comparison and file exchange only | Distinct use case; do not silently claim direct computational interoperability |

Optional discovery backlog: vBeam, mach, QUPS, SUPRA, Field II, FOCUS, mSOUND, ultraspy. **Only promote after validating licensing, maintenance, input compatibility, and contribution to the PAM workflow.** Each integration card must display `available`, `requires setup`, `reference only`, `incompatible`, or `experimental`, as appropriate.

## 10. Desktop UI / UX specification

**Visual direction:** serious modern scientific instrument. Deep navy/slate with a restrained teal accent, legible numerical typography, high-contrast charts, carefully labelled units. Theme toggle. Accessible colours and keyboard operation. Avoid decorative gradients, marketing slogans, and fictitious real-time graphs.

**Shell:** left icon/sidebar navigation; top project name, run status, compute backend, CPU/GPU badge, save indicator; main scientific canvas; right contextual parameters inspector; bottom expandable logs/problems/provenance.

**Pages**
1. **Home / Projects:** recent projects, 1-click offline demo, templates, open experiment bundle, workspace settings.
2. **Scene Builder:** 2D x-z plane with draggable passive source icons and receiver array; numeric form is source of truth, live feasibility warnings, probe geometry inspector.
3. **Simulation Lab:** emission waveform, medium and grid choices; mode switch `Analytic CPU`/`External engine`; memory and approximate grid preview; start/cancel; run history.
4. **RF Explorer:** 2D RF channel-time heatmap, waveform cursor, FFT/PSD, filter preview, selected time gate; raw and processed comparison.
5. **PAM Reconstruction:** algorithm selector, per-algorithm parameter drawers, progress, image map, profiles and marker overlays, invalid-config warnings.
6. **Benchmark / Compare:** side-by-side maps on shared axes and display settings; metrics table; paired difference images; export plot.
7. **Research Library / Plugin Registry:** catalogue with original authors, paper, license, version, install instructions, tested platforms, validation status, citation action.
8. **Experiments / Collaboration:** searchable immutable runs, group annotations, author contributions, export package, GitHub issue/PR link, method report.
9. **Settings:** storage location, compute resource limits, decimal display, themes, redaction, optional engines, hardware capabilities, privacy.

**Interactions:** floating tooltips for terminology, optional 'show equation', undo/redo for parameter edits, autosave drafts, keyboard shortcuts, warnings in context, 100% transparent progress states, error recovery. No default telemetry.

## 11. Architecture

```text
Electron Desktop App
  ├─ Electron main process (OS dialogs, app lifecycle, secure IPC)
  ├─ Preload API (typed, allow-listed, context isolated)
  └─ React + TypeScript + Vite renderer
      ├─ Workspace & forms (Zustand or equivalent)
      ├─ Visualization (Plotly/WebGL for maps, downsampled RF views)
      └─ API client (typed requests/events)
               |
               v
Python sidecar (localhost-bound, ephemeral token; FastAPI / structured IPC)
  ├─ Project / experiment registry (SQLite, immutable results)
  ├─ Unified typed models (Pydantic, NumPy, h5py, xarray optional)
  ├─ Reference analytic RF simulator (NumPy/SciPy)
  ├─ PAM algorithms (DAS, TEA, then MVDR/RCB/EISRCB/ATP)
  ├─ Metrics / figures / export
  ├─ Job supervisor (start, cancel, progress, resource limits)
  └─ Adapter SDK / versioned plugin registry
       ├─ Native Python adapters in isolated venvs
       ├─ WSL2 adapter (j-Wave on Windows)
       ├─ MATLAB/file adapters where licensed
       └─ External tool runners with validated manifests
```

**Technology choices**
- UI: Electron, React, TypeScript strict mode, Vite, Tailwind or component primitives, Zustand, React Hook Form, Zod, Plotly.js (or other validated scientific chart renderer).
- Python scientific engine: Python 3.13 when packaging permits; NumPy, SciPy, Pydantic, FastAPI, Uvicorn, h5py, pytest, optional xarray/dask; keep minimal baseline requirements. Pin dependencies and lockfiles.
- Storage: SQLite for metadata; HDF5/Zarr for arrays and chunking; YAML/JSON for human-readable config.
- Optional GPU: JAX/CUDA in **separate managed env**; don't tie app startup to CUDA stack.
- Packaging: Electron Builder or Electron Forge; ship or provision a vetted signed Python sidecar; target Windows 11 x64 `.exe` installer; separate dev and production startup. Audit licenses before bundling.
- Developer ergonomics: pnpm, uv, Ruff, mypy/Pyright, ESLint, Prettier, Vitest, Pytest, Playwright Electron.
- Collaboration: Git + GitHub PR as first integration. No account login needed for local simulations.

### Security boundaries

1. Electron `nodeIntegration: false`, `contextIsolation: true`, restricted IPC, hardened Content Security Policy, no untrusted remote web content.
2. Python process listens on `127.0.0.1` only and requires a random startup bearer token; choose dynamic port; never expose API to LAN.
3. No unsanitized shell concatenation, `eval`, remote code auto-installation, or execution of user-uploaded Python on the default path.
4. Arbitrary external plugins run only after trusted-user opt-in and ideally in isolated env/process with file-access constraints; document sandbox limitations honestly.
5. Imported HDF5/MAT/ZIP resources are size-limited and schema-validated to prevent resource exhaustion and path traversal.
6. Native dialogs for file permissions; no auto-upload; redact paths/usernames/PHI from shared bundles where requested.
7. License scanner, dependency audit, contributor provenance and SBOM on release.

## 12. Performance and reliability requirements

- Baseline CPU app must boot and run the demo without internet, GPU, WSL2 or MATLAB.
- Reference smoke demo: 64-channel, 4096-sample synthetic RF data and 128×128 grid; choose practical default so it completes reliably on standard development Windows laptop. Record benchmark hardware instead of promising universal fixed runtime.
- Run/progress/cancel must be real, with cancellation preventing new artefacts from being labelled complete. Use coarse chunking and streamed progress for long processing.
- Large arrays are never sent as full JSON over the UI API; use array files, binary chunks, downsampled previews, or shared-memory-safe transport.
- Tests must check deterministic reproducibility given the same seed/version/backend/tolerance.
- Report numeric precision and potential CPU/GPU differences; verify scientifically meaningful tolerances.
- Project crash recovery and atomic finalization of outputs; incomplete runs marked failed/interrupted, not silently hidden.
- UI remains responsive during simulation, reconstruction, export, and plugin operations.
- Light and dark themes, 125–200% OS display scaling, keyboard navigation and clear accessible colours.

## 13. Numerical validation plan

**Golden fixtures**
1. **One source, homogeneous 2D:** predicted channel arrival times agree with analytic `distance/c` within interpolation and sampling tolerance. Peak localizes within grid-resolved tolerance.
2. **Mirror symmetry:** moving source from -x to +x in symmetric probe geometry mirrors channel delay pattern and map.
3. **Sound-speed mismatch:** perturb c in reconstruction, verify controlled degradation and documented quantitative metrics.
4. **Noise and seed:** same seed gives identical synthetic RF, different seed changes noise realization; localization statistics computed over repeated seeds.
5. **Missing channels:** no crash, correct sensor mapping, explicit warning and degraded spatial performance where expected.
6. **MVDR complex algebra:** covariance Hermitian positive semidefinite within tolerance, diagonal loading makes solve stable for test fixture, scan result finite; compare known 2- or 3-sensor analytical reference.
7. **Short-pulse ATP:** depth/time-of-arrival dependence verified on a validated pulse fixture; unsupported long/unknown timing flagged.
8. **Independent comparison:** where applicable compare source/beamforming output against USTB/PyBF or published code on exactly the same standard input.
9. **Exports:** re-import of bundle yields same config/data hashes, metrics and reconstruction within declared precision.
10. **Unit sanity:** detect mm↔m, µs↔s, channel-axis swaps, complex IQ versus real RF, t0 shifts, inconsistent sensor count.

**Quality gates**
- No algorithm marked `verified` until golden tests and paper-equation review pass.
- Every algorithm has a manuscript/documentation page listing assumptions, sample datasets, citations, failure modes and test evidence.
- Any numerical regression must be investigated; never quietly loosen tolerance just to obtain a green test.
- Validate on synthetic truth before claiming agreement on experimental recordings.

## 14. Collaboration and contribution model

**Plugin SDK**

```python
from typing import Protocol

class PAMAlgorithm(Protocol):
    manifest: "AlgorithmManifest"

    def validate(self, data: "ChannelData", cfg: "ReconstructionConfig") -> list[str]: ...
    def reconstruct(self, data: "ChannelData", cfg: "ReconstructionConfig") -> "ReconstructionResult": ...
```

The actual API should use well-defined Pydantic models and a stable schema, not pass arbitrary `dict` objects between plugins. Add template repository, sample unit test, `CITATION.cff`, and contributor checklist. Make it possible to install a known/signed or manually reviewed plugin from local files, with explicit trust warning.

**Academic acknowledgement:** record creator, upstream library/paper authors, software developers, numerical validators, dataset curators, experiment reviewers and ORCIDs. Export CRediT-style contributions and author-provided citations. **A GitHub contribution or integration is not by itself an entitlement to co-authorship on external studies**; journal authorship requires substantive contribution and agreement.

**Institutional/IP note:** verify Imperial College and any sponsor obligations before selecting the repository license, uploading lab data, using university logos, or publishing unpublished methods. Start private while approval is uncertain; make open-source release a separate, explicit decision.

## 15. Proposed project structure

```text
pam-research-studio/
├── README.md
├── PRD.md
├── AGENTS.md
├── LICENSES_THIRD_PARTY.md
├── CITATION.cff
├── pnpm-workspace.yaml
├── package.json
├── apps/
│   └── desktop/
│       ├── electron/main.ts
│       ├── electron/preload.ts
│       ├── src/components/
│       ├── src/pages/
│       ├── src/charts/
│       ├── src/state/
│       └── tests/
├── packages/
│   ├── contracts/                    # shared OpenAPI / JSON schemas + TS generation
│   └── plugin-sdk/                   # manifest specification + docs
├── engine/
│   ├── pyproject.toml
│   ├── src/pamstudio/
│   │   ├── api/
│   │   ├── models/
│   │   ├── project/
│   │   ├── physics/
│   │   │   └── analytic_point_source.py
│   │   ├── preprocessing/
│   │   ├── algorithms/
│   │   │   ├── das.py
│   │   │   ├── tea.py
│   │   │   ├── mvdr.py
│   │   │   ├── rcb.py
│   │   │   ├── eisrcb.py
│   │   │   └── atp.py
│   │   ├── metrics/
│   │   ├── adapters/
│   │   ├── exporters/
│   │   └── jobs/
│   └── tests/
├── examples/
│   └── point_source_64ch/
├── docs/
│   ├── scientific-methods/
│   ├── reference-papers/
│   ├── adaptors/
│   └── tutorials/
├── scripts/
└── .github/workflows/
```

**Important:** In milestone 1, do not create empty placeholder modules for unimplemented algorithms as if they work. Prefer a clearly labelled registry status and phase-specific files.

## 16. Milestones (build in order; each must be demoable)

### Milestone 0: Foundation + reference review
- Confirm platform requirements, original library links, citations, licenses, system dependencies and potential IP issues.
- Scaffold Electron+React+TypeScript and Python engine with secure local connection, error handling, smoke test and CI.
- Write strict API contracts, directory architecture and development setup.
- **Exit:** desktop starts on Windows, app connects to Python, health-check succeeds, a sample project can be created and reopened.

### Milestone 1: Research-grade offline vertical slice (**first required deliverable**)
- Implement form-based 2D point source + linear receive array + analytic RF simulation with deterministic seed and warnings.
- Show interactive RF heatmap and one-channel trace, perform passive DAS and a separately defined TEA-style reconstruction.
- Display PAM map with physical axes, ground-truth overlay, error metrics, side-by-side algorithm comparison.
- Save/reopen project; export complete reproducible experiment; add scientifically meaningful tests and demo data.
- **Exit:** on Windows without internet, user clicks *New Project -> Demo -> Simulate -> Reconstruct -> Compare -> Export*, and outputs are genuine numerical results, not pre-rendered placeholders.

### Milestone 2: Advanced PAM + standardized imports
- Real/complex RF/IQ imports, MATLAB/HDF5/UFF compatibility with schema verification.
- Capon/MVDR with covariance inspection; correct loading/precision controls; regression tests.
- Frequency filtering, Monte Carlo and parameter sweeps; full benchmark report.
- **Exit:** two algorithms run on identical imported synthetic RF and export comparable numeric results.

### Milestone 3: Paper-grounded robust PAM
- Implement RCB, EISRCB, and ATP-PAM **one at a time**, anchored to exact source methods and independent numerical validation.
- Method cards, equation panels, quality status, known-failure scenarios.
- **Exit:** every advanced algorithm has reproducible fixtures and documented comparisons, or remains disabled/experimental with reasons.

### Milestone 4: Scientific library adapters
- First implement USTB/UFF and one reference PyBF comparison where practical.
- Add isolated j-Wave (WSL2 Windows), k-Wave-python, and jbubble adapters only after environment checks and license review.
- Add MATLAB-based SimUSCav file handoff with author permission/license validation if necessary.
- **Exit:** two different physics backends can generate comparable channel-data contracts on a validated limited scene; errors and numerical discrepancies are reported.

### Milestone 5: Open collaboration / extended physics
- Standard plugin SDK + example plugin and CONTRIBUTING.md; experiment exchange, ORCID, citations, review comments, GitHub PR workflow.
- Optional heterogeneous/skull phantom benchmarks; performance and HPC planning.
- **Exit:** a collaborator can add a small algorithm in a separate branch, write a test, generate a comparative run, cite it, and submit a PR.

## 17. Acceptance criteria (Gherkin-style)

1. **Offline demo** — Given Windows without WSL/GPU/internet, when a user selects Demo and Run, then finite, nonzero RF traces and PAM maps are computed from configured parameters and a localization-error value appears.
2. **Correct units** — Given a source at known x/z and array in metres, when configured in mm in UI, then the same physical result is produced within tolerance.
3. **Data import** — Given an HDF5 channel dataset with ambiguous axes, when imported, then the system refuses reconstruction until the axis/time/sample-rate mapping is confirmed.
4. **Method comparison** — Given one saved RF run, when DAS and TEA use the same selected grid and time gate, then both inputs and settings can be audited in an exported manifest.
5. **Stability** — Given near-singular covariance, when MVDR is selected, then the app warns and provides a documented load/regularization path rather than plotting NaNs as a valid reconstruction.
6. **Adapter availability** — Given no WSL2 installed, when j-Wave is selected on Windows, then the UI states `Requires WSL2` with setup instructions and does not claim to run.
7. **Research provenance** — Given an exported experiment, when re-opened, then code version, random seed, library versions, source file hashes, citations and data parameters are accessible.
8. **Contribution** — Given a third-party method, when added, then manifest/license/citation/test requirements must pass validation before it can be labelled `verified`.
9. **Privacy** — Given local patient-derived data (if imported by an authorized user), when exporting, then raw-data inclusion is opt-in and the app never auto-uploads files.
10. **Cancellation** — Given a long-running job, when Cancel is pressed, then the job reaches an interrupted state and no partial output is misrepresented as finished.

## 18. Risks and mitigation

| Risk | Mitigation |
|---|---|
| Different physics semantics between libraries | Standard schema and explicitly scoped cross-validation tests |
| j-Wave on native Windows unsupported | Optional WSL2 sidecar; keep core CPU path native |
| jbubble needs Python 3.13+, JAX dependency issues | Isolated adapter environment / separate process |
| MATLAB or third-party licensing | External runner; never silently bundle unapproved code |
| Confusing active ultrasound with passive PAM | Separate source/receive model and TX/RX workflow labels |
| Mislabelled robust algorithm | Paper-equation verification and experimental status gating |
| Large memory / CPU processing | Chunked computations, dataset size checks, streaming, cancel and memory budget |
| Scientific claims overstated | Research-only disclaimer; provenance and validation status visible |
| Patient data leakage | Local-only default, explicit export redaction, no telemetry |
| University ownership/affiliation confusion | Verify institutional IP permissions and avoid unauthorized branding |

## 19. Initial bibliography / source register (verify at pinned version)

- UCL Biomedical Ultrasound Group, j-Wave: https://github.com/ucl-bug/jwave
- UCL Biomedical Ultrasound Group, k-Wave: https://github.com/ucl-bug/k-wave
- k-Wave-python: https://github.com/waltsims/k-wave-python
- Imperial Noninvasive Surgery & Biopsy Lab, jbubble: https://github.com/imperial-nsb/jbubble
- USTB/UltraSound ToolBox: https://github.com/unioslo/USTB
- PyBF: https://github.com/Sergio5714/pybf
- PyMUST: https://github.com/creatis-ULTIM/PyMUST
- SimUSCav: https://github.com/creatis-ULTIM/SimUSCav
- BabelBrain: https://proteusmrighifu.github.io/BabelBrain/
- ATP-PAM, *Imaging with therapeutic acoustic wavelets—short pulses enable acoustic localization when time of arrival is combined with delay and sum*, IEEE TUFFC (2021), DOI: 10.1109/TUFFC.2020.3026165, Imperial repository: https://spiral.imperial.ac.uk/entities/publication/2ce2d8b7-e3a7-4c2f-a007-e9d03f4148ec
- Eigenspace-based robust Capon PAM, *Passive acoustic mapping of cavitation using eigenspace-based robust Capon beamformer in ultrasound therapy*, PubMed: https://pubmed.ncbi.nlm.nih.gov/29137800/

## 20. Codex execution contract

1. Read `PRD.md` and `AGENTS.md` completely, then inspect the repository and summarize a concrete build plan in your working notes.
2. **Implement Milestone 0 + Milestone 1** before moving to advanced features. Do not attempt all integrations in a single pass.
3. Create a fully functioning runnable codebase; no fake charts, mock numerical results, or `TODO`-only algorithms advertised as available.
4. Define working validation fixtures **first**, especially for passive time-of-flight and source localization.
5. Use mature library primitives (NumPy/SciPy/JAX) but implement the transparent first-party reference beamformers explicitly.
6. Keep separate optional adapters and never assume native Windows support for j-Wave.
7. Maintain `IMPLEMENTATION_STATUS.md` showing completed, tested, experimental, blocked and future capabilities; be truthful.
8. Install dependencies and run static checks, unit tests, integration tests and E2E smoke test; record commands and outcomes in `BUILD_REPORT.md`.
9. Produce a Windows developer run command, packaged installer instructions and an offline demo; if packaging is not possible in the current environment, document exact steps without claiming packaging succeeded.
10. Stop only after Milestone 1 acceptance criteria are demonstrated or a real environment blocker is clearly documented. If time or tool limits intervene, prioritize a smaller working vertical slice instead of incomplete broad scaffolding.

---

**Product success is defined by independently reproducible scientific results and an ecosystem in which other researchers can meaningfully contribute, not by line count, number of integrated logos, or appearance of a polished dashboard.**
