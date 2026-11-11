# Numerical methods — 0.7

Version 0.7 adds [versioned map benchmark metrics](../PAM_BENCHMARK.md): truth-region evaluation, histogram gCNR with original credit, concentration, contrast, entropy and half-power area, alongside localization/FWHM. These descriptive scores do not change reconstruction or establish clinical detection performance.

Version 0.6 adds [SciPy receive conditioning and CT-derived heterogeneous propagation](../DSP_AND_CT.md). When enabled, conditioning is applied once before all reconstruction methods; raw RF and clock are retained. CT changes actual j-Wave c/rho fields, while receive alignment below still uses the homogeneous host speed. The analytic RF equations describe the built-in comparison model only.

Simulation has four paths: the analytic reference below, optional [j-Wave 2D propagation](../../adapters/jwave/README.md), [jbubble with a 3D monopole bridge](../../adapters/jbubble/README.md), and [one-way jbubble volume-flow → j-Wave coupling](../WORKFLOW_AND_COUPLING.md). Optional backends are experimental, run unmodified pinned libraries in separate interpreters, and use the same reconstruction contracts. Full definitions, units, limits, citations and actual runtime metadata accompany exports. The analytic equations below do not describe library-generated RF. Nonlinear bubble emissions require full-rate gate quadrature (stride 1); harmonic aperture aliasing remains possible.

All methods are first-party numerical implementations with versioned identities, recorded parameters and synthetic tests. DAS/TEA remain reference implementations. CF, RCB and ATP remain experimental pending independent scientific review and cross-implementation validation. No clinical interpretation is supported.

## Common data and timing

Coordinates: x lateral, y elevational, z depth, right-handed; y=0 in the built-in scene. Receive channels follow array-list order then increasing local element offset; the original flat array follows increasing x. Internal distances/times are metres/seconds, calculations float64, display previews float32.

The synthetic receiver records `s_m(t)=q(t-distance_m/c)` with `t=capture_t0+n/fs`. Sources are finite Gaussian-windowed cosine pulses, Hann-windowed tones or seeded broadband pulses. Source contributions superpose linearly. Propagation and receive alignment use linear interpolation, zero outside support. Noise is reproducibly seeded using clean full-record RMS. Optional source filtering is zero-phase Butterworth, followed by finite-support cropping. Spreading is absent or 0.03 m/r with reciprocal candidate compensation.

For candidate r and emission time u, let `y_m(r,u)=w_m(r)s_m(u+distance_m(r)/c)` and `b=mean_m(y_m)`. The positive delay sign is independently tested. No active transmit-focusing delays are inserted into the passive path. The broad source-time gate uses `dt=gate_stride/fs`; actual sampled bounds are stored. All-zero/nonfinite output is rejected.

RF generation inputs are frozen. Reanalysis may change grid, broad gate and aperture; changes to medium/source/acquisition must regenerate RF. HDF5 stores captured and reconstruction configurations separately. Each reconstruction creates a new record.

## Passive DAS

ID `pam.das.passive`, version 1.0.0. `map=max_u b(r,u)^2`, units a.u.². This is peak coherent RF power, not an envelope or calibrated pressure. Finite temporal sampling can make peak power phase-sensitive. Baseline timing/localization/symmetry tests are in test_physics.py.

## TEA

ID `pam.tea.time_exposure`, version 1.0.0. `map=trapezoid_gate b(r,u)^2 du`, units a.u.² s. This explicitly defined coherent-exposure variant has no self-energy subtraction. It is separate from peak DAS power and does not claim equivalence to every published TEA formulation. Context: [Gyöngy & Coussios (2010)](https://doi.org/10.1121/1.3467491).

## CF-DAS

ID `pam.cf.weighted_das`, version 1.0.0. On real delayed RF, `CF=|Σy|²/(M Σ|y|²)`, bounded to [0,1]; zero denominator gives zero. The image is `max_u (CF^p b)^2`. The exponent acts on amplitude before squaring. p=0 recovers DAS. Tests check bounded suppression and the identity limit. Context: [Mallart & Fink (1994)](https://doi.org/10.1121/1.410562); [USTB's method documentation](https://unioslo.github.io/USTB/api/api/postprocess.html#coherence-factor).

## RCB

ID `pam.rcb.spherical`, version 1.0.0. Analytic receive data form a Hermitian, trapezoid-weighted sample covariance; overlapping contiguous subarrays are averaged for a uniform single array. Multiple/irregular arrays use the full active covariance without translation-based smoothing across gaps, limited to 64 active channels. Effective aperture and smoothing mode are recorded.

The steering estimate solves `min_a aᴴR⁻¹a`, subject to `||a−1||≤radius√L`. An eigenbasis secular equation is solved by bounded bisection. The estimate is norm-corrected to √L, then distortionless weights use linear/eigenbasis solves. Output is the unregularized weighted covariance exposure, multiplied by gate duration / 2 to account for analytic signal energy. No explicit matrix inverse is formed.

Numerical loading is `loading × trace(R)/L`, independent of the uncertainty radius. Radius zero yields the loaded MVDR limit; nonzero radius solves the actual constrained problem. Condition numbers and uncertainty residuals are stored. Tests compare a complex two-sensor solution with independent SLSQP optimization, verify unity response, the zero-radius limit and singular-covariance stability. This is a specified spherical RCB variant, not EISRCB. Primary basis: [Li, Stoica & Wang (2003)](https://doi.org/10.1109/TSP.2003.812831).

## ATP

ID `pam.atp.short_pulse`, version 1.0.0. The receive-aligned coherent signal is integrated only in a short predicted emission window. In known-emission mode its centre is the supplied emission time. In axial plane-wave mode it is `trigger+(z−reference_plane_z)/c`. This excitation-time model is separate from receive delay; no transmit field is simulated.

Timing must be explicitly known. The current implementation accepts pulse waveforms and windows of at most five carrier cycles. The window is centred, while the paper describes a start/duration convention; the exported centre and width define the conversion. Ground-truth source coordinates never determine the image. Tests perturb timing, check the plane-wave variant and change evaluation truth without changing RF to verify the image is invariant to truth. Experimental reference variants follow the timing-window principle in [Davies et al. (2021), equations 6–7 and simulation timing discussion](https://spiral.imperial.ac.uk/entities/publication/2ce2d8b7-e3a7-4c2f-a007-e9d03f4148ec).

## Display, metrics and limitations

Version 0.4 supports actual arbitrarily positioned/rotated point-receiver arrays and one-way radial jbubble → equivalent-line j-Wave coupling. All receive delays use the stored element coordinates. A causal filtered volume-flow source conserves imposed equivalent-line flow; its retained group delay is included once in graph ATP timing. Actual solver field previews and computed map chunks drive the live monitor. Full equations, dimensional conversion, clocks, preview filtering, limits and evidence are in [workflow and coupling](../WORKFLOW_AND_COUPLING.md). No nonspherical deformation, acoustic feedback, finite transducer directivity or 3D pressure equivalence is modelled.

Relative dB is `10 log10(map/map.max)`; colour, floor and zoom never change stored arrays. Each method has its own physical/arbitrary output dimension. Tiled plots share axes and display floor, not absolute cross-method calibration.

Localization is global peak to nearest truth, not proof that all sources are resolved. Half-power widths use interpolated crossings through the global peak and are unavailable for multiple sources or truncated lobes. Background ratio is the maximum outside 2 mm truth disks divided by global maximum; not a statistical false-positive rate. Shared method wall time and array byte counts are reported, not peak process memory.

The scalar homogeneous model omits scattering, heterogeneity, nonlinear propagation, directivity, elevation and ADC clipping. Narrow apertures have broad axial responses. ATP depends strongly on timing; spatial smoothing reduces RCB's effective aperture. Real experimental validity, robustness across hardware and biological effects are not established by these tests.

All source citations are included in exported references.bib alongside NumPy ([Harris et al.](https://doi.org/10.1038/s41586-020-2649-2)) and SciPy ([Virtanen et al.](https://doi.org/10.1038/s41592-019-0686-2)). No upstream research implementation has been vendored.
