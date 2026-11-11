# PAM benchmark — report definition 1.1.0

Open **Benchmark** after reconstructing PAM, or choose **Analysis → Benchmark saved PAM results**. The document evaluates completed linear maps against their stored synthetic source coordinates. It works on earlier saved/imported experiments without rewriting them. Choose the current and optional reference run, inspect a method, set truth-disk radius (0.5–10 mm) and histogram bins (8–256 through the API; common choices in the UI). Radius/bins are saved as local preferences and are printed in every report.

## Quantities and interpretation

| Quantity | Definition / unit | Interpretation |
|---|---|---|
| Global peak error | Distance from global map maximum to nearest truth, mm | Lower is better for localization; does not establish that every source was detected |
| Lateral / axial FWHM | Interpolated half-power crossings through global peak, mm | Width of the measured map profile; unavailable for multiple sources or truncated lobes |
| ROI concentration | Spatial integral within union of truth disks / map integral, % | Higher places more map intensity near configured sources; this is not physical acoustic energy |
| Background peak | `10 log10(max outside truth disks / global peak)`, dB | Lower suppresses the exclusion-region background; not a PSF sidelobe measurement |
| Signed contrast | `10 log10(mean target / mean background)`, dB | Positive means a brighter target; zero means equal means; unavailable when either mean is zero |
| CNR | `abs(mean target−mean background) / sqrt(var target+var background)` | Dimensionless descriptive contrast; population variance; unavailable at zero combined variance; dynamic-range sensitive |
| gCNR | `1 − sum(min(target PMF, background PMF))`, 0–1 | Histogram separation; 0 overlapping, 1 disjoint. Can be high for a dark or misplaced target; inspect signed contrast and localization |
| Half-power area | Area of the 4-connected ≥half-peak component containing the global peak, mm² | A boundary asterisk flags possible truncation; smaller area alone does not establish correct focusing |
| Normalized entropy | `−sum(p log p)/log(N)`, `p=map/sum(map)` | Lower is more concentrated; a misplaced artefact can also have low entropy |
| Runtime / storage | Shared reconstruction ms, RF/map MiB, grid spacing mm | Run-level cost; not individual-method timings or measured peak RAM |

All regional statistics use the **linear** map. UI dB range, colour and zoom do not change scores. Spatial integrals use trapezoidal node weights, including half-width boundary nodes. Means, variances and histograms use grid pixels. gCNR uses common uniform bins over `map/global_peak` in [0,1]; the counts in each region are normalized independently. The same disk union defines target and background for every method. The disk boundary belongs to target. No tunable metric enters reconstruction itself.

Contrast/CNR/gCNR require at least eight target and eight background pixels. An empty region, zero map, zero variance or zero mean has explicit unavailable values where appropriate, never invented finite substitutes or infinities. Regional scores are disabled if any truth disk is clipped by the map boundary. The interface shows region pixel counts and warns immediately if a region contains fewer pixels than bins. Histogram estimates are resolution/bin dependent and can be optimistic with sparse samples. Inspect radius/bin/grid sensitivity; no confidence interval or Monte Carlo estimate is claimed.

There is **no combined 0–100 quality score**, clinical threshold or universal winner. Sort rows by a stated metric and inspect localization, contrast, concentration and widths together. Multiple-source global-peak error is not recall, precision or independent resolution. No PSNR/SSIM is reported because there is no calibrated reference image with a defined intensity scale.

## Comparing runs

Version 1.1 preserves the 1.0 numerical definitions. It adds explicit capture/analysis/method/implementation context and a server-computed pair assessment. **Inspect changed parameters** lists field paths and the actual current/reference values; complete contexts remain in JSON when the displayed list is bounded. This includes grid/gate/aperture/DSP and package/source identities. Evaluation-setting differences are recorded too. Method ordering alone does not change a fingerprint.

For each common method, **Δ = current − reference** is calculated from the unrounded scores. Missing values remain missing. A negative localization-error delta means reduced error; a negative gCNR delta means reduced histogram separation. Neither is a significance test or confidence interval. Pair deltas are useful for scenario comparisons too, but the changed settings remain visible. The map captions explicitly state that each display is independently normalized to 0 dB.

Current run, reference, method and sort selection persist per project across document changes. Selecting a benchmark run also selects the run used by the main Export command. **Inspect PAM** and **Inspect RF** navigate to that saved result; **Load saved settings** restores physical settings, method controls and raw source timing into the draft without changing the stored result. Properties/Project/Output visibility returns when leaving the wide document layout. A completed calculation preserves a document selected during execution.

Each report carries raw-RF SHA-256, capture and shared-analysis fingerprints, source-code identity, method options, method map hashes, metric version, settings and definitions. The UI labels a pair **Matched RF and settings** only when recorded fingerprints agree. Raw data can be omitted from an imported package while its integrity-checked stored RF hash remains available. Changes in RF, medium/capture, grid, temporal gate, active aperture, DSP, engine or method options label the pair **Scenario comparison** and list affected categories. These deliberate experiment comparisons remain useful, but do not isolate algorithm identity as the only changed variable.

Tables contain one row per run/method; the plot pair uses the selected method and independently normalized display dB. Dashed physical truth disks show the evaluation region and diamonds show global peaks. Per-run wall time is listed separately from method rows to avoid implying unavailable individual timing. Saved source settings are used, not the currently edited draft.

## Export and immutable records

**Export scores CSV…** writes one row per run/method with settings, SI metric values, region counts, validity warnings, map hash and shared runtime/storage. **Export report JSON…** includes definitions, fingerprints and pair-comparison status. Native file dialogs choose destinations; renderer IPC only accepts typed UUIDs, bounded settings and CSV/JSON enums.

Version 1.1 CSV adds current/reference role, matching status/reasons, raw/capture/analysis/engine hashes and delta columns on current rows. Reference-row deltas are empty. JSON includes full comparison contexts, detailed differences and per-method deltas. The authenticated read-only `/benchmarks/evaluate` endpoint and native exports use the same comparison implementation; duplicate run IDs are rejected.

New experiment ZIPs automatically include `benchmark.json` and `benchmark.csv` evaluated with the default 2 mm radius and 100 bins, covered by the SHA-256 manifest. Custom benchmark reports are exported separately and do not mutate completed runs. Older packages remain readable; new packages have two optional whitelisted report files and older application versions may reject them. Source HU/RF/map reproducibility is unchanged.

## Credit

gCNR follows the distribution-overlap definition introduced by **Alfonso Rodriguez-Molares, Ole Marius Hoel Rindal, Jan D’Hooge, Svein-Erik Måsøy, Andreas Austeng, Muyinatu A. Lediju Bell and Hans Torp**, *The Generalized Contrast-to-Noise Ratio: A Formal Definition for Lesion Detectability*, IEEE TUFFC 67(4), 745–759 (2020), [DOI 10.1109/TUFFC.2019.2956855](https://pubmed.ncbi.nlm.nih.gov/31796398/). The source discusses ultrasound lesion contrast; using histogram overlap on PAM truth disks here is a **descriptive adaptation**, not a validated PAM detection probability. The original implementation here uses NumPy/SciPy; no external metric code was copied. Credit appears in the app and exported bibliography.

## Numerical evidence

`examples/workspace_refinements` is the 0.8 report evidence: the frozen 0.7 full/alternating-aperture experiments are imported and re-exported with report 1.1. Their RF, maps, original solver provenance and observed runtime are retained; these are not new simulations or new algorithm validation. The report identifies the exact `analysis.active_channels` difference. Both packages reproduce all five maps at rtol=1e-10 / atol=1e-14. Regeneration script: `uv run python scripts/make-refinement-reference.py` (refuses an existing output folder). The original `examples/pam_benchmark` evidence remains untouched.

`examples/pam_benchmark` contains actual 64-channel, 4096-sample, 20 dB configured-SNR analytic RF; five 129² PAM maps for all 64 receivers and for 32 alternating active receivers on exactly the same raw capture. The scenario label identifies the aperture difference. Each region has 285 truth pixels and uses 100 histogram bins with a 2 mm disk. The 32-channel aperture still spans almost the full width, so it does not imply half the physical aperture width.

| Method | Full / alternate gCNR | Full / alternate ROI (%) | Full / alternate peak error (mm) |
|---|---:|---:|---:|
| DAS | 0.9405 / 0.9332 | 24.8647 / 24.8490 | 0 / 0 |
| TEA | 0.9707 / 0.9637 | 26.9888 / 26.9574 | 0.2344 / 0.2344 |
| CF-DAS | 0.9140 / 0.9097 | 30.1148 / 30.1088 | 0 / 0 |
| RCB | 0.9386 / 0.9422 | 22.3601 / 23.7902 | 0.2344 / 0.1875 |
| ATP | 0.9871 / 0.9846 | 53.4264 / 53.3641 | 0.2344 / 0.2344 |

These values describe this finite-grid fixture only. Higher gCNR does not guarantee lower error: this example explicitly shows that distinction. Stored shared runtimes are 6627.152 ms and 4086.246 ms, measured during other local verification work and unsuitable for a universal speed claim. Exact values, all metrics, map hashes and environment accompany the bundles and `comparison.json`/CSV.

Independent tests use an analytical Gaussian for half-power width and radial concentration (`1−exp(−r²/(2σ²))`), verify multiplicative-scale invariance, identical/disjoint histogram limits, shifted peaks, clipped/sparse truth regions, zero maps and degenerate variance. API/export/import tests check immutable files, earlier bundles and authentication/input boundaries. Native Electron tests calculate five real methods, change ROI/bins, compare an identical reimport and a different-grid reanalysis, export real CSV/JSON and inspect a compact window. No mock score, clinical input or hardware is used.
