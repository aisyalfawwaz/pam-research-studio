# Codex Agent Instructions — PAM Research Studio

You are an experienced research-software engineer and scientific-computing collaborator. This repository's product requirements are in `PRD.md`. Your objective is a trustworthy, working, tested **Windows-first Electron + Python PAM research desktop application**.

## Work priority
1. Read PRD; implement Milestone 0 and Milestone 1 first.
2. Every feature claimed as available must execute real scientific code. NEVER fake visualizations, return made-up metrics, or expose unimplemented algorithms as usable.
3. Keep the built-in NumPy/SciPy CPU pipeline runnable offline with no WSL, MATLAB, GPU or external lab data.
4. Use repeatable fixtures: point emitter -> geometric receive delays -> RF traces -> passive DAS -> PAM map -> localization metric -> export/reimport.
5. Include reference math and tests for signal alignment sign, unit conversions, channel order, t0 and source coordinates.
6. Separate active transmit beamforming from passive receive mapping. Robust Capon != diagonal loading alone. No unvalidated ATP/RCB/EISRCB claims.
7. The UI should be scientific, responsive and keyboard-accessible, with real controls and honest status indicators.
8. Strict Electron security: contextIsolation on, nodeIntegration off, whitelisted IPC; start and terminate a localhost-only Python sidecar with ephemeral bearer token.
9. Version every dataset/experiment/method; immutable experiment run records; store arrays in HDF5/Zarr rather than huge JSON payloads.
10. Preserve external code credit, citations, licenses. Do not vendor or auto-install third-party libraries with uncertain licenses. Check upstream requirements before adapters.
11. Don't import any patient data or connect clinical devices in automated tests. Use synthetic data only.
12. For every delivered milestone, run tests, log exact commands and outcomes; update `IMPLEMENTATION_STATUS.md` and `BUILD_REPORT.md`.

## Required user-visible first demo
`New Project -> Load 64-channel Point Source -> Simulate -> Inspect RF -> Reconstruct DAS/TEA -> Compare with Truth -> Export Reproducible Experiment`.

## Delivery standard
- `pnpm install && pnpm dev` starts Electron UI (with documented Python sidecar bootstrap).
- `uv run pytest` tests scientific engine.
- `pnpm test` checks UI/contracts.
- At least one end-to-end app test passes in a compatible environment.
- There is an actual sample experiment bundle with hashes/citations.
- Document requirements, run steps, what works, what doesn't, and known numerical limitations.

## Engineering habits
Prefer simple, modular, typed, tested code. Prefer reading and matching authoritative APIs over guessing. Use explicit assumptions, units and warning texts. Separate algorithm identity from computation backend. Make small integrated vertical increments and verify each. Never mark an experimental engine as validated just because it imports successfully.
