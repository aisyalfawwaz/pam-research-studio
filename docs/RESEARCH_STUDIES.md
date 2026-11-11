# Research studies and presentation exports

## Parameter studies

Open **Studies** after saving a project. Choose Sweep, Convergence or Uncertainty, edit the physical settings in Properties, then **Check study**. This validates every generated configuration and shows the case count and array-storage estimate. **Start study** executes cases sequentially with the normal scientific engine. Changing settings invalidates the checked plan. Each case is an immutable experiment with its own settings, seed, implementation fingerprint, RF and maps in HDF5.

Sweeps support one or two Cartesian axes, 2–8 distinct values per axis, and at most 64 cases. Axis labels specify units; recorded requests use SI. Available axes include source/array position and angle, pitch/count, frequency, host speed, SNR, reconstruction resolution, capture sampling, j-Wave spacing/CFL, default bubble radius/drive/ODE tolerance/ringdown, and CT quadrature spacing. A default bubble axis does not override explicitly configured per-source bubbles. Storage preflight bounds estimated raw/conditioned RF and maps to 2 GiB; solver previews and filesystem overhead are additional. Existing per-case CPU budgets still apply.

The table and plots show calculated per-method measurements. **Inspect PAM** and **Benchmark** open the selected real run. CSV/JSON exports contain the case inventory, settings, failures and available metrics; unavailable scores remain null. Stop cancels the current worker and remaining cases. After interruption or failure, **Resume as new study** creates a separate journal and reuses completed immutable cases only when the engine source fingerprint matches. A restarted app recognizes an abandoned running journal as interrupted. Editing engine source during a study stops subsequent cases rather than mixing implementations.

## Convergence

Choose a numerical axis, normally at least three refinements. Capture noise is disabled. Grid size, gate stride and CT ray step reuse the first recorded RF; acquisition sampling, propagation mesh/CFL and bubble tolerance/ringdown rerun the solver. A sampling-rate change preserves capture duration, subject to integer sample rounding and resource limits.

The finest available case is the reference: greatest grid size, capture rate or ringdown, or smallest gate stride, mesh spacing, CFL, ODE tolerance or ray step. Reports compare full linear maps using bilinear interpolation and relative L2 norm; RF is compared on a shared capture clock using linear interpolation. Zero reference energy uses a small denominator guard. The reference has zero self-error. Two nearest non-reference refinements must both meet the requested map tolerance to receive the stability label. This is a sampled stability check, not an analytical error bound, validated solver order or a guarantee of physical accuracy. Finite gates, interpolation, aperture ambiguity and accumulated exposure can cause nonmonotonic behavior.

Use a deterministic pulse when comparing capture sampling rates. A newly sampled broadband random realization changes with its sampling grid and is not a fixed continuous-time source for solver-convergence validation.

## Uncertainty

Trials draw independent seeded RF noise, Gaussian true host-speed error and independent element x/z placement error. The actual capture changes; reconstruction retains nominal host speed and sensor offsets. Both calibrations are recorded. No random draw is silently clipped or redrawn: invalid geometry or capture coverage fails explicitly. At least one stochastic input must be enabled. **Use actual capture calibration** clears the recorded nominal reconstruction override when deliberately reconstructing a trial with its true calibration.

Per-method summaries report valid/total counts, mean, sample SD, empirical 2.5–97.5% trial interval and a percentile-bootstrap 95% interval for the mean (2,000 resamples, seeded). Bootstrap intervals require at least eight valid values. The trial interval and mean interval answer different questions. Missing metrics and failed trials are retained in the inventory, not replaced by zeros. Small samples, grid quantization and an assumed Gaussian error model limit interpretation. These are simulation sensitivity estimates, not clinical confidence intervals or statistical evidence that one method is superior. Trials in CT perturb the host fluid term; HU-derived bone parameters are not independently randomized.

## Independent bubble populations

In **Model → Sources**, enable a source's bubble override to set its radius, coating/free model, drive and ringdown independently. Default settings still apply to other sources. Each unique radial configuration runs the real jbubble solver. Identical configurations share a solved trajectory, while all source positions, emission times and RF weights remain distinct. There is no bubble–bubble interaction, multiple scattering or acoustic feedback into radial dynamics.

Analytic monopole RF sums each source's retarded emission using one common reference drive normalization. The coupled j-Wave backend passes a separate filtered volume-flow column per source, preserving relative strengths. Conservation, finite-source support, source-size and propagation budget checks remain active. HDF5 retains all trajectories and volume flows. **Bubble dynamics → Inspect source** displays the selected trajectory and coating regime; replay/export uses that same source.

Radial shell-tension thresholds describe nominal coating regimes. They do not establish nonspherical rupture, jetting, fragmentation or bubble disappearance. Actual fragmentation requires a separately validated shape/interface model and is not displayed as animated debris.

## CT-aware receive delays

Select **Analysis → Receive propagation → CT · straight-ray slowness** for a run with its saved CT asset. The delay is `tau = integral ds / c_CT(x,z)` along the straight source-pixel-to-sensor segment, with trapezoidal quadrature and bilinear sampling of the same thresholded HU-to-fluid speed model used by propagation. Outside the crop the medium is host fluid. Ray quadrature is bounded to 8,193 points per ray. Its independent implementation identifier, version, HU hash and step are recorded in diagnostics.

This applies to DAS, TEA, CF, RCB and ATP delays; existing method identities remain intact. Geometric spreading remains the homogeneous distance model. Fixed rays do not model refraction, diffraction, shear, absorption, multipath or amplitude correction. CT-derived speeds are experimental, not patient-calibrated. Compare homogeneous and CT delays on the **same saved RF**, then use a ray-step convergence study. Correcting delay does not guarantee every map score improves: finite aperture, gate integration and fluid-model mismatch still matter.

## Reports and video

**Export → Export PDF report** produces an actual ReportLab PDF with numerical settings, maps, RF/trajectory plots, calculated scores, limitations and upstream credit. Studies have a separate PDF export. A companion `.report.json` stores the full run/study context, original HDF5 hash and PDF SHA-256. Reports do not modify completed records. No remote rendering service is used.

**Export WebM video** records a 960 × 640 canvas at a requested 20 fps for 2–20 seconds using Chromium WebCodecs VP8 and Mediabunny 1.65.2 with explicit frame timestamps. Bubble mode uses the selected saved radius, velocity, pressure and emission curves with a fixed radius scale. Pipeline mode uses actual recorded pressure frames, acquired raw RF prefixes and the final calculated PAM map, which appears only after acquisition and is held for inspection. It does not invent intermediate wave or PAM frames. A generated video can be previewed in the dialog. Main-process export checks the WebM signature and a 32 MiB budget, and writes a SHA-256 provenance companion `.webm.json`. Output is WebM, not MP4. Each frame has an explicit presentation timestamp and duration, independent of window repaint timing. Metadata distinguishes presentation frame rate from physical simulation time.

PDF generation uses ReportLab 5.1.0 (BSD) and existing Matplotlib fonts/plots. Video uses unmodified Mediabunny 1.65.2 (MPL-2.0) for muxing and Electron/Chromium WebCodecs for encoding, with no external executable. Library and scientific method credit remain separate from Aisy Fawwaz's MRes project credit.

