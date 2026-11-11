# Multiple-source peak detection — 0.11

Reconstruction and Benchmark now show **P1…Pn** for independently detected local peaks and **S1…Sn** for configured ground truth. The earlier diamond and localization metric referred only to the global maximum; it was never a count of reconstructed sources. That legacy metric and the immutable maps remain intact and are labelled global-peak measurements.

## Controls

- **Peak threshold (dB):** relative linear-map power, `10 log10(map / global maximum)`. A more negative value includes weaker peaks and potentially more noise/sidelobes. Default −20 dB; the three-source demonstration uses −12 dB.
- **Minimum peak separation (mm):** physical Euclidean distance for suppression of nearby weaker detections. This is independent of grid aspect ratio. Default 1 mm; demonstration 2 mm. A larger separation can merge legitimate neighbouring detections.
- **Truth matching tolerance (mm):** maximum Euclidean error for assigning a detected peak to a configured source. Default 2 mm. This changes assignments and scores, never the detection coordinates or number of detected peaks.
- **Maximum detected peaks:** bounded 1–128, default 32. The detector never uses the number of ground-truth sources as its target count. A reached cap is flagged.

These controls are available in **Reconstruction** and **Benchmark** and persist locally. Open **Source localization** in Reconstruction for the per-source table, or inspect the expanded Benchmark tables. Green diamonds are matched; amber diamonds are unmatched. Dashed links connect matched peaks to their source coordinates. Truth and detection labels, coordinates, relative powers, errors and boundary flags are available without relying on colour alone. Method comparisons include matched/missed/extra counts, precision, recall, F1 and matched-source RMSE; rows can be sorted by recall, F1 or RMSE.

## Detector and matching definition

Detector `pam.peaks.regional_nms` **1.0.0** operates on the saved full-resolution nonnegative linear map, before display dB clipping, colour mapping, raster binning or zoom. A 3 × 3 maximum filter and 8-connected components identify maximum plateaus above threshold. A plateau whose equal-valued shelf connects to a higher value is rejected. Each true maximum plateau yields one actual grid pixel nearest its physical-coordinate centroid; ties use stable row/column order. Candidates are ordered by decreasing map value, then row/column. Greedy Euclidean minimum-separation suppression retains the strongest independent candidates, subject to the recorded cap. No subpixel or super-resolution precision is claimed.

Detection does not receive truth coordinates. Only after detection, a separate gated assignment maximizes the number of one-to-one matches and then minimizes total Euclidean error. Its rectangular cost matrix has a distinct dummy column for each truth source: valid normalized distances ≤1, unmatched cost `N + 1`, forbidden cost `2(N + 1)`, where N is the number of in-view truth sources. This prioritizes cardinality before distance, unlike nearest-first greedy assignment. A 1 pm numerical comparison allowance handles floating-point distance boundaries.

`TP = matched sources`, `FP = unmatched detections`, `FN = unmatched in-view sources`. Precision is `TP/(TP+FP)` and is unavailable with no detections; recall is `TP/(TP+FN)` and is unavailable without in-view truth. F1 is `2TP/(2TP+FP+FN)` and is unavailable without in-view truth. Mean error and RMSE use **matched sources only**; always inspect recall/misses alongside them. Zero/constant maps have no distinct detections. Out-of-map truth is listed explicitly and excluded from recall. Boundary peaks remain visible and are flagged. Tolerances below half a grid-cell diagonal receive a quantization note.

SciPy supplies the [maximum filter](https://docs.scipy.org/doc/scipy-1.16.3/reference/generated/scipy.ndimage.maximum_filter.html), connected components and [rectangular assignment solver](https://docs.scipy.org/doc/scipy-1.16.3/reference/generated/scipy.optimize.linear_sum_assignment.html). The regional-maximum consolidation, physical suppression and gated evaluation are original application code, with versioned definitions rather than a claim of published-method equivalence. The existing SciPy credit/license is retained; no dependency is added.

## Reports and limitations

Benchmark report **1.2.0** adds the full detector settings/version, all detected peak coordinates and per-source assignments, scalar detection scores and validity notes. CSV includes quoted JSON peak/truth tables, detector criteria and per-method scores; JSON preserves the full structure. PDF export from the experiment dialog uses the current peak settings, prints the source-match tables and annotates the maps. A study PDF retains its frozen study evaluation settings. Existing experiment bundles remain readable. Evaluation/export is read-only and does not rerun RF simulation or alter completed HDF5.

The detector does not establish that every local maximum is a physical bubble. Coherent-source cross terms, noise, limited aperture and sidelobes can produce extra peaks; weak sources can fall below threshold. Two unresolved sources may share one lobe and must not be counted twice. Increasing matching tolerance can increase recall without improving the reconstructed map. Keep detector settings identical for fair comparisons; the report records them. Settings/cap changes, grid spacing and the field of view affect scores. Resolving close sources ultimately depends on the acquisition and reconstruction physics.

## Actual three-source example

`examples/multiple_sources` contains real analytic RF for 64 channels, a 97 × 97 reconstruction grid, 1 µs pulses and 30 dB SNR. Source x/z positions are (−6,28), (0,35), (6,25) mm with RF amplitudes 1, 0.6, 0.3. DAS, TEA, CF and known-emission ATP run on the same RF. At −12 dB threshold, 2 mm separation and 2 mm matching tolerance, ATP detects and matches all three with no extra peaks. At −20 dB it detects five peaks, including two unmatched candidates. At 0.05 mm matching tolerance the three detections are unchanged but only one matches because of grid quantization. TEA has three detected peaks but only one lies within the 2 mm truth tolerance. These differing results are retained, not forced to agree with the configured source count.

The ZIP, settings-specific CSV/JSON reports, PDF and SHA-256 inventory are reproducible fixtures, not independent validation or clinical detection evidence.
