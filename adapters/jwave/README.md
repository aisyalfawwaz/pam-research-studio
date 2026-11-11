# j-Wave CPU adapter 1.0.0

Application 0.6 additionally supplies **actual spatial sound-speed/density fields from a selected CT HU asset**, with retained input/native fields, matched water comparisons and medium overlay on the true field history. The homogeneous mode below remains the default. CT uses 2D fluid acoustics, zero absorption and no shear/elastic modes; see [CT model, calibration limits and citations](../../docs/DSP_AND_CT.md). The CT crop extends the physical solver domain; the ROI still does not affect propagation. CFL planning uses the maximum configured speed in both contrast states.

Optional, unmodified **j-Wave 0.2.1** / **JaxDF 0.2.8** / **JAX 0.4.38**. Original adapter glue lives in `runner.py` and `engine/src/pamstudio/jwave_adapter.py`. Install independently:

```powershell
pwsh -File scripts/setup-jwave.ps1
```

This uses Python 3.12 in `.adapters/jwave/.venv`; dependencies and wheel hashes are locked in this directory's `uv.lock`. Main engine dependencies are unchanged. Restart the app, then Model → Simulation backend → Solver → **j-Wave · 2D full wave**. Grid spacing, CFL ceiling, PML cells and homogeneous density are editable. Simulate produces the normal RF contract for all five reconstruction methods. No network is needed after setup.

The native Windows CPU path is **experimental and locally tested**, not an upstream Windows support claim. [j-Wave's README](https://github.com/ucl-bug/jwave) recommends WSL2; [JAX installation documentation](https://docs.jax.dev/en/latest/installation.html) supports native Windows x86-64 CPU. WSL is not installed on this test machine. No WSL/GPU installation, execution or validation is claimed.

Solver: 2D Fourier k-space linear acoustics, scalar homogeneous medium, zero absorption, absorbing PML. Domain derives from sources/receivers plus 12 interior padding cells and the configured PML; analysis ROI cannot change the propagated RF. Off-grid geometry uses bilinear source injection and receiver interpolation. Source waveform/phase/support match the documented finite reference drives. A 2D point source is an infinite out-of-plane **line** source, so amplitude/phase/spreading differ from 3D point propagation. No calibrated pressure is produced. Broadband and analytic 1/r modes are rejected, not silently approximated.

Time step is an integer subdivision of acquisition dt satisfying the CFL ceiling. Drive is evaluated at step midpoints; updated pressure is recorded at step ends. Initial zero pressure is included and polyphase anti-alias filtering precedes decimation. Extra solver samples protect the capture's right edge from resampling boundary padding. Both actual grid and time mapping are recorded in provenance/HDF5. The source-band estimate requires at least four spatial samples per estimated shortest wavelength. CPU caps: 180k cells, 768 per axis, 20k steps and 800 million cell-steps; 15 minute worker limit. These caps are resource controls, not convergence guarantees.

Cancellation terminates only the known adapter process tree. The renderer cannot choose an executable, script or command. Missing/failed runtimes disable this option and expose the setup reason; calculations never fall back to analytic RF. Adapter receives no sidecar bearer token.

Version 0.4 adds a separately selected **jbubble volume-flow source**, multi-array bilinear receiver geometry, and ordered actual pressure observations for the live monitor/replay. The coupled native source coefficient is `rho*c*Q3D/(2*L*dx)`; its causal FIR and equivalent line length are explicit. Live field previews are spatially low-pass filtered before decimation to ≤64² and do not affect acquisition RF. Source/receiver clocks, output frames, geometry and graph provenance persist in HDF5. See the [derivation and limitations](../../docs/WORKFLOW_AND_COUPLING.md). The standalone reference-drive mode above remains available.

Tests include actual arrivals, nonzero t0, channel order, determinism, late boundary residual, reanalysis, five-method reconstruction, metadata/export/import and process cancellation. `examples/jwave_64ch` contains the real full-size fixture. Synthetic checks do not replace grid/domain/PML convergence or independent experimental validation.

Upstream LGPL-3.0-only metadata and license were reviewed on 2026-11-11. Packages are installed, not vendored or modified. Preserve their notices for any redistribution; packaging is not delivered. Authors: Antonio Stanziola, Simon R. Arridge, Ben T. Cox, Bradley E. Treeby. Paper: [SoftwareX 22 (2023) 101338](https://doi.org/10.1016/j.softx.2023.101338). Installed inventory: `dependencies.json`; notices: `docs/JWAVE_THIRD_PARTY_NOTICES.txt`.
