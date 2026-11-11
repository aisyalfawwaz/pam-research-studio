# Workspace refinement evidence — app 0.8 / report 1.1

These are real synthetic RF/maps imported from the frozen `examples/pam_benchmark` full/alternating-aperture experiments. Original 0.7 numerical provenance and measured reconstruction runtime are retained. The fresh exports add report 1.1 contexts, exact field changes and current-minus-reference deltas without changing the scientific arrays. Earlier examples remain untouched.

Current: 32 alternating active receivers. Reference: all 64 receivers on identical raw RF. Five methods, 129² grids, 2 mm truth disks, 100 histogram bins. `comparison.json` has full contexts/deltas; `comparison.csv` contains all ten method/run rows with role, matching reasons and SI deltas. Original gCNR and method references are preserved in each package's citations.

Reproduce:

```powershell
uv run python -m pamstudio.cli reproduce examples/workspace_refinements/full_aperture/bundle
uv run python -m pamstudio.cli reproduce examples/workspace_refinements/alternate_aperture/bundle
```

All five maps reproduce at rtol=1e-10, atol=1e-14. ZIP SHA-256 values and local demonstration project are recorded in `BENCHMARK.json`; manifest inventories cover each bundle. Open/import either ZIP through the desktop. The local `.local` demonstration project is machine-specific and can be rebuilt by importing the packages.

Generation: `uv run python scripts/make-refinement-reference.py`, which refuses to overwrite this existing evidence directory. This fixture is descriptive synthetic-truth evaluation, not independent physical or clinical validation.
