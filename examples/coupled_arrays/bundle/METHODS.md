# One-way volume-flow coupling

Q=4*pi*R^2*Rdot [m^3/s]. The 2D line equivalent uses an explicit out-of-plane length L. j-Wave Sources injection=rho*c*Q/(2*L*dx); total density rate=rho*Q/(L*dx^2). The source FIR is causal, 80 dB Kaiser, full convolution; its group delay is retained and recorded. Workflow ATP uses the known drive clock plus this filter delay; exported analysis contains the effective injected-emission window. No 3D pressure equivalence or acoustic feedback is implied. Bubble 1 mm pressure is a diagnostic, not the injected source.

Wave frames are actual solver samples, spatially anti-aliased before preview decimation, with exact timestamps and extents. RF and solver state are unaffected by the observer. Multi-array channel order is array order then element order; point elements, arbitrary x-z centres/angles, no directivity or transmit steering. RCB uses full covariance without cross-array subarray averaging (up to 64 active channels).

# j-Wave simulation adapter v1.0.0 — experimental

RF in THIS package is calculated by the unmodified j-Wave 0.2.1 Fourier
k-space time-domain solver, not the analytic RF generator described below.
It uses 2D x-z linear acoustics, homogeneous sound speed/density, zero absorption
and an absorbing PML. A 2D point represents an infinite out-of-plane line source;
spreading and waveform phase differ from a 3D spherical point source.
The analytic 1/r switch is rejected. Mass-source drive and received amplitude are
arbitrary units, never calibrated pressure. No transmit field is used.

Off-grid source injection and receiver sampling use bilinear interpolation;
nominal coordinates and channel order are retained. Grid convergence is required
for each experiment. Propagation geometry/PML/domain are independent of the
reconstruction ROI. The configured CFL is a ceiling: the time step is an integer
subdivision of acquisition dt. Source is evaluated at the step midpoint; j-Wave
returns updated pressure at the step end. Initial zero pressure is prepended;
polyphase low-pass filtering precedes integer decimation to the acquisition clock.
Stored time origin and channel positions follow the ordinary RF contract.

config.simulation records requested settings; simulation_json in HDF5 and
environment.json simulation record the actual grid, dt, mapping, package versions,
device, precision, runner checksum and runtime. CPU float64 is enforced in a
separate interpreter. No GPU/WSL validation is claimed. Upstream recommends WSL2
on Windows; this native CPU adapter is locally tested only. j-Wave and JaxDF are
LGPL-3.0-only, installed separately and not copied into this repository.
Source: https://github.com/ucl-bug/jwave ; paper in references.bib.

The following reconstruction definitions still apply to this RF. The analytic
generation paragraph and RF=q(t-r/c) are comparison-model definitions only.

---

# Research reference methods v1.0.0

Coordinates: lateral x, elevational y=0, axial z; SI units. Straight-ray homogeneous
scalar propagation, not a full-wave solver. Arbitrary amplitude, not pressure.
Finite Gaussian-windowed cosine / Hann-windowed carrier / seeded broadband
waveform, optionally 4th-order zero-phase Butterworth source filtering (cropped
back to finite support). Linear interpolation for propagation and receive alignment.
Spreading is either absent or 0.03 m/r, with reciprocal compensation at candidates.
Noise SNR is based on full clean RF RMS across samples and channels, not pulse RMS.

RF[n,m] = q_m(t_capture0 + n/fs - r_m/c).
Aligned coherent mean b(r,u) = (1/M_active) sum_m w_m(r) RF_m(u + r_m/c).
DAS(r) = max over emission-time gate of b(r,u)^2 [a.u.^2].
TEA-style(r) = trapezoid integral over gate of b(r,u)^2 du [a.u.^2 s].
This is an explicitly defined coherent exposure variant: no self-energy subtraction,
no claim of equation-for-equation equivalence to a published TEA implementation.
Methods share RF, coordinates and interpolation. RCB uses a spatially smoothed
subarray covariance. ATP uses its own calibrated temporal window.
Integration step = gate_stride/fs; reduce stride for convergence studies/broadband.
Samples outside captured RF are zero. Gate is in SOURCE time, not receive time.

Display dB = 10 log10(map/max(map)); it does not alter linear arrays. Difference
image subtracts individually peak-normalized linear maps; not absolute quantities.
Localization: global peak to nearest truth. Multi-source errors do not establish
resolution of all sources. FWHM is half POWER width through global peak, linearly
interpolated; disabled for multiple sources and boundary-truncated half-power lobes.
Background ratio = maximum outside 2 mm truth disks / global maximum; not a clinical
false-positive rate. Runtime is shared selected-method wall time; array storage sizes are
reported separately and do not estimate peak process memory.

CF-DAS weights the coherent amplitude by CF^p, where CF=|sum y|^2/(M sum|y|^2).
RCB estimates the steering vector within a spherical uncertainty set, normalizes
its norm and solves distortionless weights on analytic-signal covariance with
spatial smoothing. Numerical covariance loading is independent of uncertainty.
RCB reports integrated analytic output energy / 2, not a copied TEA map.
ATP integrates a calibrated short emission window. A known-emitter case uses
u=t_emit+offset; a plane-wave case uses u=t_trigger+(z-z_plane)/c+offset.
It never obtains delays from the ground-truth source position. ATP is limited to
short pulse emissions and requires explicit timing calibration. No transmit field
or clinical excitation is simulated by this receive-only reference engine.

Method selection and all CF/RCB/ATP parameters are in experiment.yaml analysis.
CF, RCB and ATP are experimental; DAS/TEA are reference-only. Synthetic tests do
not constitute independent publication validation. EISRCB is not implemented.
j-Wave is a separate optional simulation adapter.
Context: Gyongy & Coussios (2010), DOI 10.1121/1.3467491 (see references.bib).
Research and education only. No clinical interpretation.
