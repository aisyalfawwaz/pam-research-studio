# Five-method synthetic fixture — 0.2.0

`experiment.zip` and `bundle/` contain real computed RF/maps with raw RF included. `BENCHMARK.json` records the calculation timing, measurements, RCB conditions and uncertainty residual.

```powershell
uv run python -m pamstudio.cli reproduce examples/five_methods_64ch/bundle
```

In the desktop app, create/open a project and choose **File → Import experiment**. The dataset is synthetic: 64 receivers, 4096 samples, fs=20 MHz, one source at (0,30) mm, emission centre 8 µs, 1 MHz carrier, 4 µs duration, SNR 30 dB, seed 42. Grid: 128²; broad source-time gate 4–12 µs; stride 4. ATP uses known emission timing. RCB subarray=16, radius=0.1, numerical loading=0.001.

DAS/TEA are reference implementations; CF/RCB/ATP remain experimental. The example is not an experimental calibration or clinical measurement. Definitions and complete source references are in bundle/METHODS.md and references.bib. Manifest contains SHA-256 file hashes.
