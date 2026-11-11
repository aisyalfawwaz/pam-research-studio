# Windows packaging

The developer app is the tested delivery target. Source is offline-runnable after `uv sync --locked --python 3.13` and `pnpm install --frozen-lockfile`.

Version 0.6 additionally requires the pinned pydicom/Python-GDCM runtime and their complete native notices. Future packaging must include the attributed `datasets/open_head_ct` derivative and its SOURCE/ATTRIBUTION files, or explicitly omit the public-demo capability. The current checked-out developer app includes the dataset; no distributable installer is claimed.

Production startup deliberately does not depend on a developer's `.venv`. Electron main expects `resources/sidecar/pam-sidecar.exe`; package the scientific engine with Python and native NumPy/SciPy/HDF5 libraries in a separate build step. One viable build route to validate is PyInstaller in onedir mode, using an entry script importing `pamstudio.server.main`, then copying the complete onedir contents to repository `sidecar/`. Keep stdout/stdin enabled: the parent uses a private startup announcement and pipe lifetime to manage the worker. Do not use `--windowed` for the sidecar.

After a vetted runtime exists:

```powershell
pnpm package:dir
# For an NSIS installer after local smoke verification and license review:
pnpm exec electron-builder --win nsis
```

Before distributing: audit complete transitive licenses and native notices, produce SBOM, scan the packaged binary, test on a clean offline Windows account, verify process cleanup, configure signing certificates, and obtain repository/institutional redistribution approval. No certificates or institutional approval are available in this workspace. An Electron shell without a bundled Python runtime is not a completed scientific application installer.
