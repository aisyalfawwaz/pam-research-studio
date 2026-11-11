# Bubble motion inspector — 0.9

Open **Bubble dynamics** after a jbubble or coupled run. Playback starts automatically unless the system requests reduced motion. The illustration follows the saved radial trajectory; it is not a looping decorative animation. Pause, restart, step output samples, drag the time slider, or click a trace. Focus a trace and use Left/Right/Home/End to move its time cursor. All four curves and instantaneous readouts share that time. Maximum expansion, minimum radius and the first nominal shell-rupture crossing have direct navigation buttons.

The document expands to use the workspace; prior panel visibility returns on leaving. Event controls stay above the scrollable scientific content so seeking does not scroll the bubble out of view. Compact windows stack the diagram and plots. Each run resets its clock and controls. Playback stops when its document is unmounted or hidden. Loop can be disabled to stop exactly at the final stored sample.

## Physical data and timing

HDF5 `bubble/trajectory` stores six columns: source time s, radius m, radial velocity m/s, drive Pa, emission Pa at 1 mm and radial acceleration m/s². The existing bounded binary route returns the whole trajectory (at most 50,000 × 6 float32 values); no additional IPC or scientific runtime is needed. The on-screen values linearly interpolate between adjacent saved samples, preserving extrema and endpoints. HDF5 retains the original float64 output. Invalid shapes, nonfinite values, nonpositive radii and nonmonotonic time are rejected for visualization.

Time zero is the drive centre, with negative pre-centre time preserved. The radius inspector does not add propagation delay or the coupled source FIR delay: those belong to the acoustic acquisition/propagation path. The 1 mm emission plot is a source diagnostic, as before. Multiple configured identical bubbles share the stored radial solution; source weights are not independent nonlinear bubble drives.

Playback rates are carrier cycles per **wall-clock second**, not ultrasound real time: `Δt_source = Δt_wall × cycles_per_second / frequency_hz`. The display updates at approximately 30 Hz; it does not imply that microsecond physics runs at wall-clock speed. Pause freezes the sampled data and all four cursors. Background stalls are bounded; they do not fabricate missing physical samples.

Bubble radius is drawn at one fixed physical scale over the complete trace. The equilibrium ring, nominal rupture-radius guide, scale bar and signed velocity arrows use the same scale. There is no radius clipping or automatic frame-by-frame zoom. Shading illustrates a spherical section and is not a microscope/optical scattering simulation.

## Lipid coating state

The inspector reads `shell_parameters` from the run's original simulation provenance, including the nested coupled-bubble record. It never substitutes current draft values or undocumented preset constants. Missing constants produce an explicit unavailable state; free bubbles are uncoated.

For saved `r_b`, shell elasticity `χ` and rupture tension `σ_r`:

`R_b = r_b R₀`, `R_rupt = R_b sqrt(1 + σ_r/χ)`.

Below `R_b`, between the thresholds, and above `R_rupt`, the displayed **nominal regimes** are buckled, elastic and shell rupture. The effective surface tension uses the saved jbubble smooth law, with `y = χ[(R/R_b)²−1]/σ_r` and smoothing width `ε`:

`σ(R) = σ_r ε [softplus(y/ε) − softplus((y−1)/ε)]`.

The implementation uses equivalent stable expressions near saturation to avoid overflow/subtractive loss. Colour and coating dash style identify the nominal regime; the radius still follows R(t). First crossing is interpolated between adjacent saved radii; a missing crossing disables its button. The smooth law is continuous and reversible: it has no irreversible shell-loss event or fragment population. A dashed coating means **shell rupture regime**, not a resolved hole, gas-bubble fragmentation, jet, or nonspherical breakup. No intensity/drive threshold is invented to make a bubble explode.

Original model: **Philippe Marmottant, Sander van der Meer, Marcia Emmer, Michel Versluis, Nico de Jong, Sascha Hilgenfeldt and Detlef Lohse**, *A model for large amplitude oscillations of coated bubbles accounting for buckling and rupture*, JASA 118(6), 3499–3505 (2005), [DOI 10.1121/1.2109427](https://doi.org/10.1121/1.2109427). The logistic smoothing is the [jbubble contributors' smooth shell-law construction](https://github.com/imperial-nsb/jbubble/blob/main/jbubble/bubble/shell.py), checked against the installed 0.2.0 source. Credit is retained in About/splash and new bubble-bundle bibliographies. No upstream code is vendored or modified.

## Verification

TypeScript checks cover the negative source clock, interpolation/units/endpoints, extrema, motion sign, stored/nested/missing shell constants, analytical threshold/corner/elastic/saturation values, interpolated crossing, wall-clock slowing/wrap/stop and malformed-trajectory rejection. The native jbubble story compares the drawn radius with actual solver output, verifies the physical radius ratio and shell states, proves Play changes the drawing and Pause freezes it, checks four synchronized cursors, sample stepping and non-loop ending, then exports/imports without raw RF and inspects the same trajectory. Tests remain synthetic only.

Exact commands/results and native screenshots are in [BUILD_REPORT.md](../BUILD_REPORT.md). This inspector adds observation and playback, not a new bubble equation or independent physical validation.
