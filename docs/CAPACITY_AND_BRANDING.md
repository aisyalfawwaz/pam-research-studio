# Channel capacity and application identity — 0.5

## Capacity

The engine, renderer schemas, array editor, whitelisted IPC, API, selected-channel trace/CSV export and experiment importer support **4–1024 total receive channels**, distributed over 1–8 arrays. All channels are retained in acquisition RF; there is no hidden 64/128-channel truncation. The built-in default stays at 64 channels to keep the first demo quick.

Raw RF is float64 `[sample,channel]`, bounded to **8,388,608 values / 64 MiB**. Thus 1024 channels allow 8192 samples, or 512 channels allow 16384 samples. An oversized request is rejected before allocating RF. This budget excludes FFT/solver workspaces and does not promise a total-process memory ceiling.

The RF overview retains every channel and at most 512 temporal signed-peak bins: exactly **2,097,152 bytes** for 512×1024 float32. The IPC limit for this array kind matches that bound. HDF5 preview reads use bounded temporal slices instead of loading all RF first. Full-resolution raw data and traces remain unchanged. Import permits the larger RF shape within the same capture budget, while retaining bounded datasets, dtype checks, archive-size limits and link protections.

j-Wave receiver histories are capped at **12,582,912 float64 values / 96 MiB**, in addition to existing grid/step/cell-step bounds. Its live RF snapshot keeps every channel and at most `min(256,floor(65536/channels))` temporal peak bins. At 1024 channels this is 64 rows. It never decimates channel membership to make the display fit. These history limits remain distinct from full-wave domain memory. A long array with coarse pitch expands the domain and can be rejected even though its channel count is valid.

For uniform single arrays, large-channel RCB forms the same averaged contiguous-subarray covariance without a full N×N intermediate. For time-weighted aligned complex data Y and subarray length L, `C[i,j] = sum_(offset,t) Y[offset+i,t] conj(Y[offset+j,t]) / (offset_count * gate_duration)`. Hermitian symmetry fills the lower triangle. An independent random complex fixture compares this accumulation to full covariance and explicit slicing. Steering optimization, loading, normalization and method identity are unchanged.

RCB aligns only active channels and adapts its pixel batch to a **32 MiB scratch target**; this is a target for alignment/covariance scratch, not RSS or all FFT temporaries. For more than 128 active channels, reject a conservative covariance work estimate above **5 billion terms** (`pixels * channels * gate_samples * L²`) before allocating aligned data. Reduce grid/gate/subarray or choose DAS/TEA/CF/ATP. Multi-array/irregular RCB still uses full covariance with at most **64 active channels**; it does not incorrectly smooth across unrelated arrays. The Spaced 64 mask is an explicit option, not an invisible algorithm substitution, and can introduce grating lobes.

More channels do not independently guarantee spatial resolution or physical realism. Aperture, wavelength, pitch, sensor model, SNR and timing still determine information content. Point-receiver and one-way radial-to-2D coupling limitations remain unchanged. Start with DAS/TEA and a modest grid, inspect RF, then increase analysis cost deliberately.

## Identity and credit

The user supplied the displayed identity: **Aisy Fawwaz · MRes Project · Bioengineering · Imperial College London**. Project authorship is separate from upstream library and method authorship. The splash and About panel credit all jbubble authors from its upstream CITATION.cff, all j-Wave paper authors, and the existing PAM/TEA, CF, RCB and short-pulse/ATP research references. Credits do not claim that these authors endorse or co-authored this workbench. Institutional affiliation is text supplied by the user; the app does not use an institutional crest or third-party product logo.

Original artwork: a focal emitter, three wavefronts and a six-element receive array in navy/teal. The editable vector source is `apps/desktop/public/brand/app-icon.svg`; the native window/taskbar PNG is 512², and Windows ICO contains 16/24/32/48/64/128/256 px representations. Installer icon configuration points to that ICO; no packaged-installer validation is claimed. Rebuild these committed assets with `node scripts/render-icon.mjs` (uses the installed Electron renderer).

`packages/branding.ts` is the shared identity/credit source. `node scripts/build-branding.mjs` generates the local static splash document; build and dev entry points invoke it. The splash is a separate sandboxed, isolated BrowserWindow **without a preload or IPC bridge**. Its restrictive CSP disables scripts/network requests. It appears while the real sidecar starts, then closes once the workspace loads. The activity marker is indeterminate; there is no invented percentage or artificial waiting period. Help → About & credits retains the names/references after startup.

Authoritative credit sources checked 2026-11-11:

- [jbubble CITATION.cff](https://github.com/imperial-nsb/jbubble/blob/main/CITATION.cff): software authors, version and MIT license.
- [j-Wave upstream citation](https://github.com/ucl-bug/jwave#citation) and [published paper DOI](https://doi.org/10.1016/j.softx.2023.101338): authors and publication.
- Method references/DOIs already recorded in `docs/scientific-methods/reference.md` and exported bibliographies.
- [Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window): native splash/icon lifecycle and window isolation options.

## Evidence

The native 1024-channel analytic fixture executes **all five methods** and round-trips 32 MiB RF through export/import, including API index 1023. A separate actual coupled test runs **four 256-element arrays**, jbubble, j-Wave and DAS/TEA/CF/ATP, observing changing real solver frames and checking bounded live snapshots. Native Electron tests exercise actual startup credits/security, 2 MiB RF preview, the final receiver/CSV export, reconstruction and 64-channel mask pagination. Screenshots are retained under `docs/images`. These synthetic tests establish implementation behavior, not independent experimental validation.
