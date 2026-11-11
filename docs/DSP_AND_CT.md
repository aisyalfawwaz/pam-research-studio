# Receive DSP and CT anatomy — 0.6

Version 0.10 adds **Analysis → Receive propagation → CT straight-ray slowness** on the same saved RF, with recorded quadrature spacing and HU identity. Matched water/CT runs require the same receive options. This remains a fixed-ray fluid approximation without refraction, shear, absorption or multipath. See [research studies and receive-delay definitions](RESEARCH_STUDIES.md); historical results below used homogeneous receive delays.

The complete supported path is **drive → jbubble radial dynamics → causal volume-flow FIR → heterogeneous j-Wave propagation → point receivers → SciPy receive conditioning → PAM → truth comparison → reproducible export**. Each stage executes numerical code. The original offline analytic pipeline and all five reconstruction methods remain available.

## Using the desktop

Workspace refinement (0.8): receive-conditioning controls update the Model builder's connected DSP stage. Switching CT/coupled propagation to an analytic or monopole backend detaches the unsupported CT input and rebuilds the runnable graph; compatible physical/receive settings are retained. Saved runs and HU assets remain immutable. Completed-run replay always uses raw acquisition, even when the RF Explorer is displaying zero-phase conditioned RF. Switching backends does not validate 2D fluid acoustics as a 3D skull or bubble model.

Create a project, open **CT medium**, then choose **Load public head CT**, **Synthetic skull phantom**, or **Import CT DICOM…**. Loading a template replaces the draft graph and physical parameters; completed runs remain immutable. The initial public example is a 64 mm skull patch at 0.25 MHz. **Whole slice · 0.1 MHz** prepares the entire public axial slice with a coarser 1 mm propagation grid and 64 receivers. This is still one 2D slice, not a 3D CT volume.

Inspect the actual HU pixels, window/level and estimated speed/density. Set crop indices, pixel-centre origin, bone HU threshold/endpoint and acoustic endpoints. Cyan marks the simulated anatomy crop; source pixels retain their physical spacing. Yellow receivers and red emitters use the same coordinates as the solvers. **Edit source / array placement** opens Scene, where arrays can be dragged and their count, pitch, pose and angle edited. A change in anatomy or acquisition requires new RF.

Use **Run water reference**, then **Run CT medium**. The comparison finds completed runs with the same asset, capture configuration, raw editor analysis, engine-source checksum and method identities, differing only in CT contrast. It displays actual raw-RF RMS, RMS ratio, global peak error and separately normalized PAM maps. Different map colours alone do not measure absolute transmission: inspect RMS and linear arrays as well. No improvement in localization is assumed. The Model builder retains the CT and DSP blocks and validates their connections.

Application 0.7 adds the general [Benchmark document](PAM_BENCHMARK.md) for these saved CT/water maps as well. Their different RF/medium are labelled as a scenario comparison. The coarse whole-slice grid may contain too few pixels in a 2 mm truth disk for gCNR; the interface reports this explicitly. A larger physical region, for example 6 mm with 16 histogram bins, can be inspected as a separately recorded evaluation choice. Changing the disk changes the question being measured; it does not improve the underlying reconstruction.

**Live simulation** shows real numerical pressure frames over the actual medium mask, bubble radius, received signals and completed PAM chunks. Simulation time is microseconds; CPU execution takes seconds. Replay shows the recorded field history and final maps, with no invented moving wavefronts.

## Open-source receive DSP

**Analysis → Receive conditioning** provides channel-wise DC removal, linear detrending, Butterworth low/high/bandpass filters (orders 2–8) and an optional notch with editable frequency/Q. `scipy.signal.butter(..., output="sos")`, `iirnotch`, `tf2sos`, `detrend` and `sosfiltfilt` perform the computation. All filter edges must be below acquisition Nyquist; bandpass edges must be ordered.

Filtering is applied once to a copy of the full raw RF before the selected methods. Forward/backward filtering uses odd endpoint padding, has zero phase and amplitude response `|H_one_pass(f)|²`, and is offline/noncausal. It can pre-ring and alter ATP amplitudes/timing sensitivity; inspect edges and compare with raw RF. Sampling rate and capture t0 do not change. This receive filter is separate from the causal source-volume-flow FIR, whose group delay is retained exactly once in coupled ATP timing.

RF explorer switches between **Raw RF** and **Conditioned RF**. Trace, spectrum and CSV export follow that selection. The spectrum panel can show the actual 513-point receive-filter response; DC/trend removal is not represented by this IIR transfer curve. HDF5 retains `rf`, `rf_processed`, SOS coefficients, settings, SciPy version, output checksum and response. Reanalysis can change receive DSP without regenerating the capture. Export without raw RF excludes both raw and conditioned arrays while retaining numerical response/provenance.

SciPy 1.16.3 is credited to Pauli Virtanen and the SciPy contributors (BSD-3-Clause). Citation: [SciPy 1.0](https://doi.org/10.1038/s41592-019-0686-2). DICOM uses pydicom 3.0.2 (Darcy Mason and contributors; MIT plus BSD dictionary notice) and GDCM/Python-GDCM 3.2.6 (Mathieu Malaterre, CREATIS and contributors; Python packaging by Thiago Franco de Moraes; BSD core/Apache-2.0 packaging). Full notices are retained in `docs/` and Help → About.

## CT import and acoustic model

Only a single monochrome CT instance is supported, 8–1024 pixels per axis and at most 64 MiB. pydicom reads pixel values; JPEG-lossless inputs explicitly use the GDCM decoder. Linear rescale produces `HU = pixel * RescaleSlope + RescaleIntercept`; positive finite `PixelSpacing` is converted from mm to metres. Unsupported multiframe, colour, modality LUT or non-CT inputs are rejected. Patient/study/private identifiers are not copied to the project metadata. Original file hash, decoder/version, spacing, orientation and an immutable HU/metadata hash are retained. The renderer accesses a fixed binary preview API and cannot supply an executable or arbitrary input path.

The simulation uses x along columns and z along rows. It preserves in-plane spacing, with a user-selected local origin. This is no patient-space 3D registration. HU is bilinearly sampled onto the j-Wave grid. With threshold T and endpoint B:

`f = 0 for HU < T; otherwise f = clip(HU / B, 0, 1)`

`c = c_host + f * (c_bone - c_host)`

`rho = rho_host + f * (rho_bone - rho_host)`

Air and soft tissue are replaced by host fluid; outside the crop is host fluid. Default T=300 HU, B=1000 HU, c_bone=2800 m/s and rho_bone=1900 kg/m³ are **experimental user settings**, not measured patient-specific properties. Contrast off sets f=0 while preserving the same planned grid and time step. CFL planning uses the configured maximum speed in both cases; wavelength checks use the minimum speed. Coupled emitters must occupy host-fluid voxels for the volume-injection calibration.

j-Wave propagates through the actual spatial speed/density fields, allowing fluid reflection, refraction and scattering. Its integrated time-domain path has **zero absorption, no shear or elastic modes, no 3D anatomy, no calibrated transducer response and no acoustic feedback into bubble dynamics**. The radial bubble remains spherical. Stored medium fields and exact geometry accompany the wave/RF history. PAM reconstruction still uses homogeneous straight receive delays: the CT comparison exposes resulting aberration instead of claiming CT correction. No clinical accuracy, safety or skull-transmission validation is claimed.

## Attributed public head CT

The bundled source is one axial instance from **Evgenia Blagosklonova, Daria Dolotova, Natalia Polunina, Elena Grigorieva, Denis Pakhomov, Vladimir Krylov and Andrey Gavrilov**, *Open dataset of annotated DICOM images of head CTA for intracranial aneurysm detection*, [Zenodo DOI 10.5281/zenodo.15697196](https://zenodo.org/records/15697196), under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Archive member `Studies/197/177.dcm` was obtained with bounded HTTP range requests; the 25.6 GB archive was not downloaded in full and its published archive MD5 is not claimed verified. The source instance SHA-256 is `86172d1615b15891a1683b0ba600941f115943d7711f51f7ed50a9b244170838`. The bundled derivative was decompressed and metadata rebuilt with public-reference identifiers/local-zero origin; pixel samples, HU rescale, orientation and spacing were preserved. Its SHA-256 is `07f10ec0d736d4a63cb8229c508a6dd1210f77e0d9b6555c053a9340b6572355`. `datasets/open_head_ct/SOURCE.json` and `ATTRIBUTION.md` describe the changes. Full attribution, DOI/license and both hashes are retained in exported experiments. Public-reference demonstrations were run manually at the user's request. Automated Python/Electron tests use **synthetic DICOM/phantoms only**.

## Frozen numerical demonstrations

Both examples use synthetic emitters and receivers, the public anatomical slice and real jbubble/j-Wave/SciPy calculations. The following are global peak errors on the selected grid, not general accuracy estimates:

| Example / medium | DAS (mm) | TEA (mm) | CF-DAS (mm) | ATP (mm) |
|---|---:|---:|---:|---:|
| 0.25 MHz skull patch / water | 5.000 | 2.500 | 5.000 | 0.000 |
| 0.25 MHz skull patch / CT | 6.643 | 6.933 | 6.643 | 3.250 |
| 0.1 MHz entire slice / water | 0.000 | 2.000 | 0.000 | 0.000 |
| 0.1 MHz entire slice / CT | 16.763 | 16.763 | 8.382 | 3.202 |

The patch stores RF `[1,512,32]` and a 200×200 solver medium. Relative RF L2 change is 1.367815, CT/water RMS ratio 0.493867. Whole-slice RF is `[1,2048,64]`, medium 360×360; relative RF L2 change 0.902413 and RMS ratio 0.903990. Phase shifts can make relative L2 change exceed one. The patch's water DAS bias and broad lobes are retained; 2D line-source waveforms, narrow bandwidth, receive-model mismatch and finite integration affect the map. Neither filtering nor ATP timing proves general superiority.

`examples/ct_skull_patch` and `examples/ct_head_slice` contain paired water/CT bundles, PNG maps and `BENCHMARK.json` with hashes, exact metrics, warnings, source checksums and environment. Each bundle is self-contained for HU input; no source DICOM download is needed to reproduce it:

```powershell
uv run python -m pamstudio.cli reproduce examples/ct_skull_patch/water/bundle
uv run python -m pamstudio.cli reproduce examples/ct_skull_patch/ct/bundle
uv run python -m pamstudio.cli reproduce examples/ct_head_slice/water/bundle
uv run python -m pamstudio.cli reproduce examples/ct_head_slice/ct/bundle
```

The installed optional locked runtimes are required. Manual regeneration uses `uv run python scripts/make-ct-reference.py` or `--whole`; these commands refuse existing example directories. These demonstrations establish an executable reproducible implementation, not mesh convergence or experimental validation.
