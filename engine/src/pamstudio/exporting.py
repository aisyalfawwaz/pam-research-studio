import json
import os
import shutil
import tempfile
import zipfile
from pathlib import Path
from uuid import uuid4

import h5py
import matplotlib
import numpy as np
import yaml

matplotlib.use("Agg")
from matplotlib import pyplot as plt

from .methods import ReconstructionOptions
from .models import ANALYSIS_CONFIG_FIELDS, Config
from .storage import METHODS, canonical, digest

REFERENCES = """@article{gyongy2010,
  author = {Gyongy, Miklos and Coussios, Constantin-C.},
  title = {Passive cavitation mapping for localization and tracking of bubble dynamics},
  journal = {Journal of the Acoustical Society of America},
  year = {2010}, volume = {128}, pages = {EL175--EL180}, doi = {10.1121/1.3467491}
}
@article{harris2020numpy,
  author = {Harris, Charles R. and others}, title = {Array programming with NumPy},
  journal = {Nature}, year = {2020}, doi = {10.1038/s41586-020-2649-2}
}
@article{virtanen2020scipy,
  author = {Virtanen, Pauli and others}, title = {SciPy 1.0: fundamental algorithms for scientific computing in Python},
  journal = {Nature Methods}, year = {2020}, doi = {10.1038/s41592-019-0686-2}
}
@article{mallart1994,
  author = {Mallart, Rene and Fink, Mathias},
  title = {Adaptive focusing in scattering media through sound-speed inhomogeneities: The van Cittert Zernike approach and focusing criterion},
  journal = {Journal of the Acoustical Society of America}, year = {1994},
  volume = {96}, pages = {3721--3732}, doi = {10.1121/1.410562}
}
@article{li2003rcb,
  author = {Li, Jian and Stoica, Petre and Wang, Zhisong},
  title = {On robust Capon beamforming and diagonal loading},
  journal = {IEEE Transactions on Signal Processing}, year = {2003},
  volume = {51}, number = {7}, pages = {1702--1715}, doi = {10.1109/TSP.2003.812831}
}
@article{davies2021atp,
  author = {Davies, Harry J. and Morse, Sophie V. and Copping, Matthew J. and Sujarittam, Krit and Bourgin, Victor D. and Tang, Meng-Xing and Choi, James J.},
  title = {Imaging With Therapeutic Acoustic Wavelets: Short Pulses Enable Acoustic Localization When Time of Arrival is Combined With Delay and Sum},
  journal = {IEEE Transactions on Ultrasonics, Ferroelectrics, and Frequency Control},
  year = {2021}, volume = {68}, number = {1}, pages = {178--190}, doi = {10.1109/TUFFC.2020.3026165}
}
"""

JWAVE_REFERENCE = """@article{stanziola2023jwave,
  author = {Stanziola, Antonio and Arridge, Simon R. and Cox, Ben T. and Treeby, Bradley E.},
  title = {j-Wave: An open-source differentiable wave simulator},
  journal = {SoftwareX}, year = {2023}, volume = {22}, pages = {101338},
  doi = {10.1016/j.softx.2023.101338}
}
"""
HEAD_CT_REFERENCE = """@dataset{blagosklonova_head_ct,
  author = {Blagosklonova, Evgenia and Dolotova, Daria and Polunina, Natalia and Grigorieva, Elena and Pakhomov, Denis and Krylov, Vladimir and Gavrilov, Andrey},
  title = {Open dataset of annotated DICOM images of head CTA for intracranial aneurysm detection},
  publisher = {Zenodo}, doi = {10.5281/zenodo.15697196},
  url = {https://zenodo.org/records/15697196}, note = {CC BY 4.0; one metadata-minimized axial slice; pixel values retained}
}
"""
JWAVE_NOTES = """# j-Wave simulation adapter v1.0.0 — experimental

RF in THIS package is calculated by the unmodified j-Wave 0.2.1 Fourier
k-space time-domain solver, not the analytic RF generator described below.
It uses 2D x-z linear acoustics, homogeneous sound speed/density unless a stored CT medium is selected, zero absorption
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

"""

JBUBBLE_REFERENCE = """@software{jbubble2026,
  author = {Tilbury, Callum Rhys and Mohammed, Shima and MacIntosh-LaRocque, Anthea and Xu, Rui and Moseley, Ben and Choi, James J.},
  title = {jbubble: differentiable microbubble dynamics in JAX},
  version = {0.2.0}, year = {2026}, date = {2026-10-06},
  url = {https://github.com/imperial-nsb/jbubble}
}
@article{marmottant2005,
  author = {Marmottant, Philippe and van der Meer, Sander and Emmer, Marcia and Versluis, Michel and de Jong, Nico and Hilgenfeldt, Sascha and Lohse, Detlef},
  title = {A model for large amplitude oscillations of coated bubbles accounting for buckling and rupture},
  journal = {Journal of the Acoustical Society of America}, year = {2005},
  volume = {118}, number = {6}, pages = {3499--3505}, doi = {10.1121/1.2109427}
}
"""
JBUBBLE_NOTES = """# jbubble adapter v1.0.0 — experimental

RF in THIS package originates from real jbubble 0.2.0 Keller-Miksis dynamics,
not the Gaussian analytic waveform described below. The selected free/lipid
preset uses a polytropic gas and Newtonian liquid. The lipid preset uses the
smooth Marmottant surface-tension law. Drive is a Hann-windowed sine whose
centre equals source emission_s. Density=1000 kg/m^3, ambient pressure=101325 Pa,
sound speed=config sound_speed_m_s; all gas/shell/pulse/solver parameters are in
environment.json simulation and HDF5 simulation_json. Solver is adaptive Dopri5;
failure/nonfinite radius, wall Mach>=0.1 and >1% emission energy above acquisition
Nyquist are rejected. Trajectories are sampled at >=128 points per drive cycle
and >=4 times acquisition fs, then polyphase-filtered before RF generation.

bubble/trajectory columns: source_time_s (drive centre=0), radius_m,
wall_velocity_m_s, drive_pa, emission_pa_at_1mm, wall_acceleration_m_s2.
Raw trajectory pressures are model predictions, not calibrated measurements.
jBubble QuasiAcoustic evaluates p(r)=rho/r*(R^2*Rddot+2*R*Rdot^2).
The bridge applies r/c ONCE to each receiver, using emitted pressure evaluated
at 1 mm scaled by 1 mm/r. RF is dimensionless pressure divided by configured
drive pressure (or 1 Pa for the zero-drive limit). Source amplitude scales
identical independent emissions; it does not alter drive pressure nonlinearly.
The 0.03 m/r reconstruction compensation changes only overall amplitude scale.

No bubble interactions, spatial driving field, attenuation, tissue constitutive
law, phase-dependent population distribution, gradient fitting or direct j-Wave
coupling is implemented. This is a 3D monopole RF bridge, distinct from j-Wave's
2D propagation. Finite integration may truncate free-bubble ringdown; final
relative emission and acquisition-band loss are recorded for inspection.
jbubble is MIT, upstream beta, installed separately without modified source.
Source/citation: https://github.com/imperial-nsb/jbubble ; references.bib.

The following reconstruction equations apply; the analytic Gaussian generation
paragraph is a comparison-model definition only. No experimental validity is claimed.

---

"""

METHOD_NOTES = """# Research reference methods v1.0.0

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
"""


def export_bundle(project, run_id, target, include_raw=False):
    run = project.run(run_id)
    if run["status"] != "complete":
        raise ValueError("Only completed reconstructions can be exported")
    target = Path(target).resolve()
    if target.suffix.lower() != ".zip":
        raise ValueError("Export filename must end with .zip")
    target.parent.mkdir(parents=True, exist_ok=True)
    folder = target.parent / (target.stem + "_files_" + uuid4().hex[:8])
    folder.mkdir()
    try:
        with h5py.File(project.file(run_id), "r") as stored:
            analysis = json.loads(stored.attrs.get("analysis_json", "{}"))
            input_config = json.loads(stored.attrs["config_json"])
        (folder / "experiment.yaml").write_text(
            yaml.safe_dump(
                {
                    "schema_version": "1.0",
                    "run_id": run_id,
                    "input_run_id": run["parent"],
                    "config": run["config"],
                    "methods": run["methods"],
                    "analysis": analysis,
                    "input_config": input_config,
                    "raw_included": include_raw,
                    "source_kind": "synthetic",
                    "warnings": run["warnings"],
                },
                sort_keys=True,
            ),
            encoding="utf-8",
        )
        for filename, value in [
            ("environment.json", run["provenance"]),
            ("metrics.json", run["metrics"]),
        ]:
            (folder / filename).write_text(canonical(value), encoding="utf-8")
        from .benchmark import benchmark_run, report_csv

        benchmark = benchmark_run(project, run_id)
        (folder / "benchmark.json").write_text(canonical(benchmark), encoding="utf-8")
        (folder / "benchmark.csv").write_text(report_csv([benchmark]), encoding="utf-8")
        fullwave = bool(run["config"].get("simulation"))
        coupled = bool(run["config"].get("coupling"))
        bubble = bool(run["config"].get("bubble"))
        ct_source = run["provenance"].get("simulation", {}).get("ct_source", {}).get("source", {})
        public_ct = ct_source.get("kind") == "public_deidentified_CT"
        (folder / "METHODS.md").write_text(
            (
                "# CT-derived propagation\n\nThe medium uses the stored CT HU slice/crop and physical in-plane spacing. Voxels below the chosen bone threshold, including air and soft tissue, become host fluid. Above threshold, bone_fraction=clip(HU/bone_HU,0,1); c and density interpolate linearly between configured host and bone endpoints. j-Wave propagates through actual spatial c/rho fields: 2D fluid reflection/refraction, zero absorption, no elastic/shear modes. Receive reconstruction still uses the homogeneous host speed and straight geometric delays, so skull-induced errors are deliberately uncorrected. HU endpoints are experimental user settings, not patient-specific calibration. Source/crop/geometry and authors/license are recorded in ct_source provenance; the source HU array is retained in HDF5.\n\n"
                if run["config"].get("ct")
                else ""
            )
            + (
                "## Anatomy attribution\n\nEvgenia Blagosklonova, Daria Dolotova, Natalia Polunina, Elena Grigorieva, Denis Pakhomov, Vladimir Krylov and Andrey Gavrilov. Open dataset of annotated DICOM images of head CTA for intracranial aneurysm detection. https://doi.org/10.5281/zenodo.15697196 ; CC BY 4.0, https://creativecommons.org/licenses/by/4.0/ . One axial slice selected and decompressed; pixel values, HU rescale and spacing retained; metadata rebuilt with public-reference identifiers and local-zero origin. The simulation uses a user-selected crop and experimental HU-to-fluid conversion. No author endorsement or patient-specific validation is implied. Original/derived instance hashes and modifications are retained in ct_source.\n\n"
                if public_ct
                else ""
            )
            + (
                "# Receive conditioning\n\nSciPy signal DC/linear-trend removal and Butterworth/notch second-order sections are applied to the full raw RF before reconstruction. Forward/backward odd-padded filtering has squared one-pass amplitude response and zero phase; it is offline/noncausal and can pre-ring. Raw RF, coefficients, exact settings, output checksum, response and clock are retained. Filtering is applied once; sampling frequency and t0 are unchanged.\n\n"
                if run["config"].get("processing")
                else ""
            )
            + (
                "# One-way volume-flow coupling\n\nQ=4*pi*R^2*Rdot [m^3/s]. The 2D line equivalent uses an explicit out-of-plane length L. j-Wave Sources injection=rho*c*Q/(2*L*dx); total density rate=rho*Q/(L*dx^2). The source FIR is causal, 80 dB Kaiser, full convolution; its group delay is retained and recorded. Workflow ATP uses the known drive clock plus this filter delay; exported analysis contains the effective injected-emission window. No 3D pressure equivalence or acoustic feedback is implied. Bubble 1 mm pressure is a diagnostic, not the injected source.\n\nWave frames are actual solver samples, spatially anti-aliased before preview decimation, with exact timestamps and extents. RF and solver state are unaffected by the observer. Multi-array channel order is array order then element order; point elements, arbitrary x-z centres/angles, no directivity or transmit steering. RCB uses full covariance without cross-array subarray averaging (up to 64 active channels).\n\n"
                if coupled
                else ""
            )
            + (JWAVE_NOTES if fullwave else JBUBBLE_NOTES if bubble else "")
            + METHOD_NOTES,
            encoding="utf-8",
        )
        (folder / "references.bib").write_text(
            REFERENCES
            + (JWAVE_REFERENCE if fullwave else "")
            + (JBUBBLE_REFERENCE if bubble else "")
            + (HEAD_CT_REFERENCE if public_ct else "")
            + "@article{rodriguezmolares2020gcnr,author={Rodriguez-Molares, Alfonso and Rindal, Ole Marius Hoel and D'Hooge, Jan and Masoy, Svein-Erik and Austeng, Andreas and Lediju Bell, Muyinatu A. and Torp, Hans},title={The Generalized Contrast-to-Noise Ratio: A Formal Definition for Lesion Detectability},journal={IEEE Transactions on Ultrasonics, Ferroelectrics, and Frequency Control},year={2020},volume={67},pages={745--759},doi={10.1109/TUFFC.2019.2956855}}\n"
            + (
                "@software{pydicom,author={Darcy Mason and pydicom contributors},title={pydicom},version={3.0.2},url={https://github.com/pydicom/pydicom}}\n@software{gdcm,author={Mathieu Malaterre and CREATIS and Thiago Franco de Moraes},title={GDCM and Python-GDCM},version={3.2.6},url={https://github.com/tfmoraes/python-gdcm}}\n"
                if run["config"].get("ct")
                else ""
            ),
            encoding="utf-8",
        )
        (folder / "REPRODUCE.txt").write_text(
            "From PAM Research Studio source checkout, after uv sync --locked:\n"
            + (
                (
                    "Install both optional runtimes: pwsh -File scripts/setup-jwave.ps1 ; pwsh -File scripts/setup-jbubble.ps1\n"
                    if coupled
                    else "Install the optional runtime first: pwsh -File scripts/setup-jwave.ps1\n"
                )
                if fullwave
                else "Install the optional runtime first: pwsh -File scripts/setup-jbubble.ps1\n"
                if bubble
                else ""
            )
            + "uv run python -m pamstudio.cli reproduce PATH_TO_THIS_FOLDER\n"
            "Requires this engine source and pinned environment. A package is data, never executable plugin code.\n",
            encoding="utf-8",
        )
        with (
            h5py.File(project.file(run_id), "r") as src,
            h5py.File(folder / "results.h5", "w") as out,
        ):
            for key, value in src.attrs.items():
                out.attrs[key] = value
            for key in src:
                if key not in ("rf", "rf_processed") or include_raw:
                    src.copy(key, out)
            out.attrs["raw_included"] = include_raw
        with h5py.File(folder / "results.h5", "r") as src:
            cfg = Config.model_validate(run["config"])
            x, z = src["grid/x_m"][:] * 1000, src["grid/z_m"][:] * 1000
            method_keys = list(run["methods"])
            cols = min(2, len(method_keys))
            rows = int(np.ceil(len(method_keys) / cols))
            fig, axes = plt.subplots(
                rows, cols, figsize=(5 * cols, 4 * rows), layout="constrained", squeeze=False
            )
            for ax, method in zip(axes.flat, method_keys):
                image = src[f"maps/{method}"][:]
                db = 10 * np.log10(np.maximum(image / max(image.max(), 1e-30), 1e-6))
                im = ax.imshow(
                    db,
                    extent=[x[0], x[-1], z[-1], z[0]],
                    aspect="auto",
                    vmin=-40,
                    vmax=0,
                    cmap="viridis",
                )
                ax.scatter(
                    [s.x_m * 1000 for s in cfg.sources],
                    [s.z_m * 1000 for s in cfg.sources],
                    marker="+",
                    c="white",
                )
                ax.set(
                    xlabel="Lateral x (mm)",
                    ylabel="Depth z (mm)",
                    title=method.upper() + " · relative dB",
                )
            for ax in list(axes.flat)[len(method_keys) :]:
                ax.set_visible(False)
            fig.colorbar(
                im, ax=list(axes.flat)[: len(method_keys)], label="10 log10(map / peak), dB"
            )
            fig.savefig(folder / "comparison.png", dpi=160)
            fig.savefig(folder / "comparison.svg")
            plt.close(fig)
        manifest = {
            "schema_version": "1.0",
            "algorithm": "sha256",
            "files": {
                file.name: {"sha256": digest(file), "bytes": file.stat().st_size}
                for file in sorted(folder.iterdir())
            },
        }
        (folder / "manifest.json").write_text(canonical(manifest), encoding="utf-8")
        temporary = target.with_name(target.name + "." + uuid4().hex + ".tmp")
        try:
            with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED) as archive:
                for file in folder.iterdir():
                    archive.write(file, file.name)
            os.replace(temporary, target)
        finally:
            temporary.unlink(missing_ok=True)
    except Exception:
        shutil.rmtree(folder)
        raise
    return {
        "zip_path": str(target),
        "folder_path": str(folder),
        "sha256": digest(target),
        "raw_included": include_raw,
    }


ALLOWED = {
    "experiment.yaml",
    "environment.json",
    "metrics.json",
    "METHODS.md",
    "references.bib",
    "REPRODUCE.txt",
    "results.h5",
    "comparison.png",
    "comparison.svg",
    "manifest.json",
}
BENCHMARK_FILES = {"benchmark.json", "benchmark.csv"}


def valid_inventory(names):
    names = set(names)
    return names == ALLOWED or names == ALLOWED | BENCHMARK_FILES


def verify_folder(folder):
    folder = Path(folder)
    manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("schema_version") != "1.0" or manifest.get("algorithm") != "sha256":
        raise ValueError("Unsupported bundle manifest")
    if not valid_inventory(set(manifest.get("files", {})) | {"manifest.json"}):
        raise ValueError("Bundle file inventory mismatch")
    for filename, record in manifest["files"].items():
        file = folder / filename
        if file.stat().st_size != record["bytes"] or digest(file) != record["sha256"]:
            raise ValueError(f"Bundle hash mismatch: {filename}")
    experiment = yaml.safe_load((folder / "experiment.yaml").read_text(encoding="utf-8"))
    if experiment.get("schema_version") != "1.0" or experiment.get("source_kind") != "synthetic":
        raise ValueError("Only synthetic schema 1.0 experiment bundles are supported")
    cfg = Config.model_validate(experiment["config"])
    methods = experiment.get("methods", {})
    if (
        not methods
        or not set(methods).issubset(METHODS)
        or any(methods[key] != METHODS[key] for key in methods)
    ):
        raise ValueError("Unsupported method identity or definition")
    if experiment.get("analysis"):
        options = ReconstructionOptions.model_validate(experiment["analysis"])
        if set(options.methods) != set(methods):
            raise ValueError("Analysis selection and map methods disagree")
    with h5py.File(folder / "results.h5", "r") as src:
        # Reject links, virtual datasets, external storage and unbounded array shapes BEFORE reading.
        seen = set()

        def inspect(group, depth=0):
            address = h5py.h5o.get_info(group.id).addr
            if depth > 4 or address in seen:
                raise ValueError("Cyclic or deeply nested HDF5 groups unsupported")
            seen.add(address)
            for name in group:
                if not isinstance(group.get(name, getlink=True), h5py.HardLink):
                    raise ValueError("External and symbolic HDF5 links are unsupported")
                node = group[name]
                if isinstance(node, h5py.Group):
                    inspect(node, depth + 1)
                elif (
                    node.is_virtual
                    or node.external
                    or node.size
                    > (8_388_608 if node.name in ("/rf", "/rf_processed") else 3_000_000)
                    or node.dtype.itemsize > 8
                    or (
                        node.dtype.kind != "f"
                        and not (
                            node.name in ("/probe/array_index", "/probe/element_index")
                            and node.dtype.kind in "iu"
                            and node.shape == (cfg.channels,)
                        )
                    )
                ):
                    raise ValueError("Unsupported or oversized HDF5 array")

        inspect(src)
        expected = {
            "grid/x_m": (cfg.grid_n,),
            "grid/z_m": (cfg.grid_n,),
            "probe/positions_xyz_m": (cfg.channels, 3),
        }
        expected.update({f"maps/{key}": (cfg.grid_n, cfg.grid_n) for key in methods})
        if experiment["raw_included"]:
            expected["rf"] = (1, cfg.samples, cfg.channels)
            if cfg.processing:
                expected["rf_processed"] = (1, cfg.samples, cfg.channels)
        elif "rf" in src or "rf_processed" in src:
            raise ValueError("RF present despite raw-data exclusion flag")
        for key, shape in expected.items():
            if key not in src or src[key].shape != shape or not np.isfinite(src[key][:]).all():
                raise ValueError(f"Invalid dataset {key}")
        if cfg.processing:
            import hashlib

            meta = json.loads(src.attrs.get("processing_json", "{}"))
            if (
                meta.get("id") != "pam.receive.scipy"
                or meta.get("settings") != cfg.processing.model_dump()
            ):
                raise ValueError("Receive conditioning settings and provenance disagree")
            if (
                "processing/response" not in src
                or src["processing/response"].shape != (513, 2)
                or not np.isfinite(src["processing/response"][:]).all()
            ):
                raise ValueError("Invalid receive filter response")
            if "rf_processed" in src and hashlib.sha256(
                src["rf_processed"][:].tobytes()
            ).hexdigest() != meta.get("rf_sha256"):
                raise ValueError("Conditioned RF checksum mismatch")
        elif "rf_processed" in src or "processing" in src:
            raise ValueError("Unexpected receive conditioning data")
        from .physics import receivers

        if (
            not np.array_equal(
                src["grid/x_m"][:], np.linspace(cfg.grid_x_min_m, cfg.grid_x_max_m, cfg.grid_n)
            )
            or not np.array_equal(
                src["grid/z_m"][:], np.linspace(cfg.grid_z_min_m, cfg.grid_z_max_m, cfg.grid_n)
            )
            or not np.array_equal(src["probe/positions_xyz_m"][:], receivers(cfg))
        ):
            raise ValueError("Grid or receiver coordinates disagree with configuration")
        counts = [a.elements for a in cfg.arrays] if cfg.arrays else [cfg.channels]
        for key, values in {
            "array_index": np.repeat(np.arange(len(counts)), counts),
            "element_index": np.concatenate([np.arange(n) for n in counts]),
        }.items():
            if f"probe/{key}" in src and not np.array_equal(src[f"probe/{key}"][:], values):
                raise ValueError("Probe channel membership disagrees with configuration")
        if src.attrs.get("methods_json") != canonical(methods) or set(src["maps"]) != set(methods):
            raise ValueError("Unsupported method identity or definition")
        if any(np.min(src[f"maps/{key}"][:]) < 0 for key in methods):
            raise ValueError("Power and exposure maps must be nonnegative")
        if (
            src.attrs.get("dimension_order") != "frame,sample,channel"
            or src.attrs.get("data_kind") != "rf_real"
        ):
            raise ValueError("Ambiguous channel axis or unsupported RF kind")
        if (
            src.attrs.get("sampling_frequency_hz") != cfg.sampling_hz
            or src.attrs.get("t0_s") != cfg.capture_t0_s
        ):
            raise ValueError("Sampling metadata mismatch")
        captured = Config.model_validate_json(src.attrs.get("config_json", "{}"))
        environment = json.loads((folder / "environment.json").read_text(encoding="utf-8"))
        if captured.ct:
            from .ct import acoustic_maps, asset_hash

            simulation = environment.get("simulation", {})
            source = simulation.get("ct_source")
            propagation = simulation.get("propagation", simulation)
            grid = propagation.get("plan", {})
            if (
                not source
                or "medium/hu" not in src
                or src["medium/hu"].shape != (captured.ct.rows, captured.ct.columns)
            ):
                raise ValueError("CT medium source pixels/geometry/provenance are missing")
            hu = src["medium/hu"][:]
            if not np.isfinite(hu).all() or asset_hash(hu, source) != captured.ct.asset_id:
                raise ValueError("CT medium source checksum mismatch")
            if (
                len(grid.get("shape", [])) != 2
                or np.prod(grid["shape"]) > 180_000
                or max(grid["shape"]) > 768
            ):
                raise ValueError("CT medium solver geometry exceeds bounds")
            _, speed, density = acoustic_maps(captured, {"hu": hu}, grid)
            for key, expected_map in (("sound_speed_m_s", speed.T), ("density_kg_m3", density.T)):
                if (
                    f"medium/{key}" not in src
                    or src[f"medium/{key}"].shape != expected_map.shape
                    or not np.array_equal(src[f"medium/{key}"][:], expected_map)
                ):
                    raise ValueError("CT material map disagrees with HU and parameters")
        elif "medium" in src:
            raise ValueError("Unexpected CT medium data")
        if environment.get("workflow"):
            from .workflow import Workflow

            Workflow.model_validate(environment["workflow"])
        if "wave" in src:
            if not captured.simulation or "wave/pressure" not in src or "wave/time_s" not in src:
                raise ValueError("Wave frames require a j-Wave capture and timestamps")
            pressure, times = src["wave/pressure"][:], src["wave/time_s"][:]
            simulation = environment.get("simulation", {})
            geometry = simulation.get("propagation", simulation).get("live_geometry", {})
            extent = np.asarray(geometry.get("extent_m", []), dtype=float)
            if (
                pressure.ndim != 3
                or not 2 <= len(pressure) <= 257
                or max(pressure.shape[1:]) > 64
                or geometry.get("pressure_shape") != list(pressure.shape[1:])
                or times.shape != (len(pressure),)
                or not np.isfinite(pressure).all()
                or not np.isfinite(times).all()
                or np.any(np.diff(times) <= 0)
                or extent.shape != (4,)
                or not np.isfinite(extent).all()
                or extent[1] <= extent[0]
                or extent[3] <= extent[2]
            ):
                raise ValueError("Invalid wave preview dimensions, geometry or clock")
        if captured.coupling:
            import hashlib

            simulation = environment.get("simulation", {})
            if simulation.get("id") != "jbubble-jwave" or "coupling/volume_flow" not in src:
                raise ValueError("Coupling source and provenance are missing")
            flow = src["coupling/volume_flow"][:]
            if (
                flow.ndim != 2
                or flow.shape[1]
                != (len(captured.sources) + 1 if any(s.bubble for s in captured.sources) else 2)
                or not 2 <= len(flow) <= 60_000
                or not np.isfinite(flow).all()
                or np.any(np.diff(flow[:, 0]) <= 0)
                or hashlib.sha256(flow.tobytes()).hexdigest()
                != simulation.get("coupling", {}).get("waveform_sha256")
            ):
                raise ValueError("Invalid coupled volume-flow waveform or checksum")
        if captured.bubble:
            simulation = json.loads(src.attrs.get("simulation_json", "{}"))
            provenance = json.loads((folder / "environment.json").read_text(encoding="utf-8"))
            if (
                simulation.get("id") not in ("jbubble", "jbubble-jwave")
                or (simulation.get("bubble", simulation)).get("version") != "0.2.0"
                or not (simulation.get("bubble", simulation)).get("converged")
                or simulation != provenance.get("simulation")
            ):
                raise ValueError("jbubble simulation provenance and array metadata disagree")
            if "bubble/trajectory" not in src:
                raise ValueError("Bubble trajectory is missing")
            trajectory = src["bubble/trajectory"][:]
            if (
                trajectory.ndim != 2
                or trajectory.shape[1] != 6
                or not 2 <= len(trajectory) <= 50_000
                or not np.isfinite(trajectory).all()
                or np.any(trajectory[:, 1] <= 0)
                or np.any(np.diff(trajectory[:, 0]) <= 0)
            ):
                raise ValueError("Invalid bubble trajectory")
            if any(s.bubble for s in captured.sources):
                if "bubble/population" not in src:
                    raise ValueError("Per-source radial trajectories are missing")
                population = src["bubble/population"][:]
                if (
                    population.ndim != 2
                    or population.shape[1] != 7
                    or not np.isfinite(population).all()
                ):
                    raise ValueError("Invalid bubble population")
                info = simulation.get("bubble", simulation)
                records = info.get("population", [])
                if len(records) != len(captured.sources) or set(population[:, 0]) != set(
                    range(len(captured.sources))
                ):
                    raise ValueError("Population source membership mismatch")
                for i, source in enumerate(captured.sources):
                    values = population[population[:, 0] == i, 1:]
                    if (
                        not 2 <= len(values) <= 50_000
                        or np.any(np.diff(values[:, 0]) <= 0)
                        or np.any(values[:, 1] <= 0)
                        or records[i].get("source_index") != i
                        or records[i].get("settings")
                        != (source.bubble or captured.bubble).model_dump()
                    ):
                        raise ValueError("Population trajectory or saved settings mismatch")
                if not np.array_equal(population[population[:, 0] == 0, 1:], trajectory):
                    raise ValueError("Primary and population trajectories disagree")
        elif "bubble" in src:
            raise ValueError("Unexpected bubble data for a non-bubble configuration")
        if captured.simulation:
            simulation = json.loads(src.attrs.get("simulation_json", "{}"))
            provenance = json.loads((folder / "environment.json").read_text(encoding="utf-8"))
            if (
                simulation.get("id") not in ("jwave", "jbubble-jwave")
                or (simulation.get("propagation", simulation)).get("version") != "0.2.1"
                or provenance.get("simulation") != simulation
            ):
                raise ValueError("j-Wave simulation provenance and array metadata disagree")
        if (
            experiment.get("input_config")
            and Config.model_validate(experiment["input_config"]).model_dump()
            != captured.model_dump()
        ):
            raise ValueError("Input configuration and captured metadata disagree")
        if (
            experiment.get("analysis")
            and json.loads(src.attrs.get("analysis_json", "{}")) != experiment["analysis"]
        ):
            raise ValueError("Analysis parameters and array metadata disagree")
        if captured.model_dump(exclude=ANALYSIS_CONFIG_FIELDS) != cfg.model_dump(
            exclude=ANALYSIS_CONFIG_FIELDS
        ):
            raise ValueError("Stored RF configuration disagrees with experiment")
        if (
            src.attrs.get("reconstruction_config_json")
            and Config.model_validate_json(src.attrs["reconstruction_config_json"]).model_dump()
            != cfg.model_dump()
        ):
            raise ValueError("Stored reconstruction configuration disagrees with experiment")
        if experiment["raw_included"]:
            import hashlib

            if hashlib.sha256(src["rf"][:].tobytes()).hexdigest() != src.attrs.get("rf_sha256"):
                raise ValueError("Raw RF content hash mismatch")
    return experiment


def import_bundle(project, path):
    with tempfile.TemporaryDirectory(prefix="pam-import-") as temp:
        folder = Path(temp)
        with zipfile.ZipFile(path) as archive:
            entries = archive.infolist()
            names = [entry.filename for entry in entries]
            if len(names) != len(set(names)) or not valid_inventory(names):
                raise ValueError("Unexpected, missing, duplicate or unsafe bundle paths")
            if sum(e.file_size for e in entries) > 192 * 1024**2:
                raise ValueError("Bundle exceeds 192 MiB uncompressed limit")
            for entry in entries:
                if (entry.external_attr >> 16) & 0o170000 == 0o120000:
                    raise ValueError("Symbolic ZIP links unsupported")
                with archive.open(entry) as src, (folder / entry.filename).open("wb") as dst:
                    shutil.copyfileobj(src, dst)
        experiment = verify_folder(folder)
        cfg = Config.model_validate(experiment["config"])
        run_id = project.begin(cfg)
        try:
            shutil.copyfile(folder / "results.h5", project.file(run_id))
            metrics = json.loads((folder / "metrics.json").read_text(encoding="utf-8"))
            provenance = json.loads((folder / "environment.json").read_text(encoding="utf-8"))
            provenance["imported_original_run_id"] = experiment["run_id"]
            provenance["imported_bundle_sha256"] = digest(path)
            with project.connection() as db:
                db.execute(
                    "UPDATE runs SET provenance=? WHERE id=? AND status='running'",
                    (canonical(provenance), run_id),
                )
            if cfg.ct:
                from .ct import put_asset

                with h5py.File(project.file(run_id), "r") as src:
                    asset = put_asset(
                        project, src["medium/hu"][:], provenance["simulation"]["ct_source"]
                    )
                if asset["asset_id"] != cfg.ct.asset_id:
                    raise ValueError("Imported CT asset identity mismatch")
            project.finish(run_id, "complete", metrics)
        except Exception as error:
            project.finish(run_id, "failed", error=str(error))
            raise
    return project.run(run_id)
