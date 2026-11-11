"""DICOM → immutable HU asset → experimental fluid acoustic medium.

No patient/study identifiers are copied into project metadata. Tests use only
synthetic DICOM; the public example is separately attributed and user-requested.
"""

import hashlib
import importlib.metadata
import json
import os
from pathlib import Path

import h5py
import numpy as np
from scipy.ndimage import map_coordinates

ROOT = Path(__file__).resolve().parents[3]


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def asset_hash(hu, metadata):
    return hashlib.sha256(
        np.asarray(hu, dtype="<f4").tobytes() + canonical(metadata).encode()
    ).hexdigest()


def put_asset(project, hu, metadata):
    hu = np.asarray(hu, dtype="<f4")
    if hu.ndim != 2 or min(hu.shape) < 8 or max(hu.shape) > 1024 or not np.isfinite(hu).all():
        raise ValueError("CT HU slice must be finite, 8–1024 pixels per axis")
    identity = asset_hash(hu, metadata)
    folder = project.path / "assets"
    folder.mkdir(exist_ok=True)
    target = folder / (identity + ".h5")
    if not target.is_file():
        temporary = target.with_suffix(".tmp")
        with h5py.File(temporary, "w") as out:
            out.create_dataset("hu", data=hu, compression="gzip", shuffle=True)
            out.attrs["metadata_json"] = canonical(metadata)
            out.attrs["asset_id"] = identity
        os.replace(temporary, target)
    return {
        "asset_id": identity,
        "rows": hu.shape[0],
        "columns": hu.shape[1],
        "spacing_x_m": metadata["spacing_x_m"],
        "spacing_z_m": metadata["spacing_z_m"],
        "source": metadata["source"],
    }


def read_asset(project, settings):
    target = project.path / "assets" / (settings.asset_id + ".h5")
    if not target.is_file():
        raise ValueError(
            "CT asset is missing from this project; import its DICOM or experiment again"
        )
    with h5py.File(target, "r") as src:
        if src["hu"].shape != (settings.rows, settings.columns):
            raise ValueError("CT dimensions disagree with its immutable asset")
        hu = src["hu"][:]
        metadata = json.loads(src.attrs["metadata_json"])
    if asset_hash(hu, metadata) != settings.asset_id or any(
        metadata[k] != getattr(settings, k) for k in ("spacing_x_m", "spacing_z_m")
    ):
        raise ValueError("CT asset hash or spacing mismatch")
    return {"hu": hu, "metadata": metadata}


def read_dicom(path, source=None):
    import pydicom

    path = Path(path)
    if not path.is_file() or path.stat().st_size > 64 * 1024**2:
        raise ValueError("Choose a single CT DICOM instance no larger than 64 MiB")
    ds = pydicom.dcmread(path, stop_before_pixels=True)
    if (
        ds.get("Modality") != "CT"
        or int(ds.get("NumberOfFrames", 1)) != 1
        or int(ds.get("SamplesPerPixel", 1)) != 1
    ):
        raise ValueError("Only single-frame monochrome CT instances are supported")
    rows, columns = int(ds.Rows), int(ds.Columns)
    if (
        not 8 <= min(rows, columns)
        or max(rows, columns) > 1024
        or int(ds.BitsAllocated) not in (8, 16, 32)
    ):
        raise ValueError("CT dimensions/bit allocation exceed supported bounds")
    spacing = np.asarray(ds.PixelSpacing, dtype=float) / 1000
    if (
        spacing.shape != (2,)
        or not np.isfinite(spacing).all()
        or np.any(spacing < 0.00005)
        or np.any(spacing > 0.005)
    ):
        raise ValueError("CT requires finite physical PixelSpacing in millimetres")
    slope, intercept = float(ds.get("RescaleSlope", 1)), float(ds.get("RescaleIntercept", 0))
    if not np.isfinite([slope, intercept]).all() or slope <= 0 or "ModalityLUTSequence" in ds:
        raise ValueError(
            "CT requires a finite positive linear HU rescale; LUT conversion is unsupported"
        )
    ds = pydicom.dcmread(path)
    plugin = "gdcm" if ds.file_meta.TransferSyntaxUID.is_compressed else ""
    try:
        hu = (
            pydicom.pixels.pixel_array(ds, decoding_plugin=plugin).astype(np.float32) * slope
            + intercept
        )
    except Exception as error:
        raise ValueError(f"DICOM pixel decoder failed: {error}") from error
    if (
        hu.shape != (rows, columns)
        or not np.isfinite(hu).all()
        or hu.min() < -2048
        or hu.max() > 20000
    ):
        raise ValueError("DICOM rescaled values lie outside supported HU bounds")
    orientation = [float(v) for v in ds.get("ImageOrientationPatient", [1, 0, 0, 0, 1, 0])]
    if len(orientation) != 6 or not np.isfinite(orientation).all():
        raise ValueError("Invalid DICOM in-plane orientation")
    with path.open("rb") as source_file:
        original_hash = hashlib.file_digest(source_file, "sha256").hexdigest()
    metadata = {
        "spacing_x_m": float(spacing[1]),
        "spacing_z_m": float(spacing[0]),
        "orientation_patient": orientation,
        "rescale_slope": slope,
        "rescale_intercept": intercept,
        "original_file_sha256": original_hash,
        "decoder": "GDCM" if plugin else "pydicom native",
        "pydicom_version": importlib.metadata.version("pydicom"),
        "gdcm_version": importlib.metadata.version("python-gdcm") if plugin else None,
        "transfer_syntax_uid": str(ds.file_meta.TransferSyntaxUID),
        "source": source
        or {
            "kind": "user_selected_CT",
            "label": "User-selected single CT slice",
            "citation": "Source/license supplied by the user; not inferred from DICOM identifiers",
        },
        "coordinate_convention": "simulation x follows image columns; simulation z follows image rows; physical spacing retained; no patient 3D registration",
    }
    return hu, metadata


def import_dicom(project, path, source=None):
    return put_asset(project, *read_dicom(path, source))


def synthetic(project):
    size = 160
    spacing = 0.0004
    x = (np.arange(size) - (size - 1) / 2) * spacing
    z = np.arange(size) * spacing
    xx, zz = np.meshgrid(x, z)
    distance = np.hypot(xx, zz - 0.075)
    hu = np.where(distance < 0.055, 30.0, -1000.0)
    hu[(distance > 0.051) & (distance < 0.055)] = 1000.0
    return put_asset(
        project,
        hu,
        {
            "spacing_x_m": spacing,
            "spacing_z_m": spacing,
            "source": {
                "kind": "synthetic",
                "label": "Synthetic curved-skull HU phantom",
                "citation": "Original analytical geometry; no patient data",
            },
            "coordinate_convention": "x=column,z=row",
        },
    )


def public_example(project):
    folder = ROOT / "datasets/open_head_ct"
    if not (folder / "head_slice.dcm").is_file():
        raise ValueError(
            "Public CT example is not installed; import a CT DICOM or use the synthetic phantom"
        )
    source = json.loads((folder / "SOURCE.json").read_text(encoding="utf-8"))
    if (
        hashlib.sha256((folder / "head_slice.dcm").read_bytes()).hexdigest()
        != source["derived_instance_sha256"]
    ):
        raise ValueError("Public CT reference checksum mismatch")
    return import_dicom(project, folder / "head_slice.dcm", source)


def template(asset, whole=False):
    from .methods import ReconstructionOptions
    from .models import (
        BubbleSettings,
        Config,
        CouplingSettings,
        CTSettings,
        JWaveSettings,
        ProcessingSettings,
        ReceiveArray,
        Source,
    )
    from .workflow import Edge, Node, coupled_template

    graph, _, _ = coupled_template()
    graph.nodes = [n for n in graph.nodes if n.id != "method_rcb"]
    graph.edges = [e for e in graph.edges if "method_rcb" not in (e.source, e.target)]
    graph.nodes.extend(
        [Node(id="ct", kind="ct", x=260, y=230), Node(id="dsp", kind="dsp", x=920, y=40)]
    )
    for n in graph.nodes:
        if n.id == "probe":
            n.x = 480
        if n.id == "bubble_scope":
            n.x = 700
        if n.id == "rf_scope":
            n.x = 920
    for e in graph.edges:
        if e.source == "scene" and e.target == "prop":
            e.source = "ct"
        if e.source == "prop" and e.port == "rf":
            e.source = "dsp"
    graph.edges.extend(
        [
            Edge(source="scene", target="ct", port="scene"),
            Edge(source="prop", target="dsp", port="rf"),
        ]
    )
    public = asset["source"].get("kind") == "public_deidentified_CT"
    crop = (
        (20, 148, 128, 256)
        if public
        else (0, min(160, asset["rows"]), 0, min(160, asset["columns"]))
    )
    ct = CTSettings(
        **{k: asset[k] for k in ("asset_id", "rows", "columns", "spacing_x_m", "spacing_z_m")},
        crop=crop,
        origin_x_m=-0.032,
    )
    cfg = Config(
        channels=32,
        arrays=[ReceiveArray(elements=32, pitch_m=0.0005, z_m=0.004)],
        ct=ct,
        simulation=JWaveSettings(spacing_m=0.0005),
        bubble=BubbleSettings(drive_pa=20e3, ringdown_cycles=4),
        coupling=CouplingSettings(passband_hz=0.35e6),
        processing=ProcessingSettings(
            remove_dc=True, filter_kind="bandpass", low_hz=0.08e6, high_hz=0.6e6
        ),
        sampling_hz=5e6,
        samples=512,
        frequency_hz=0.25e6,
        duration_s=12e-6,
        sources=[Source(z_m=0.045)],
        grid_n=33,
        grid_x_min_m=-0.012,
        grid_x_max_m=0.012,
        grid_z_min_m=0.02,
        grid_z_max_m=0.06,
        gate_start_s=0,
        gate_end_s=72e-6,
        gate_stride=1,
    )
    options = ReconstructionOptions(
        methods=["das", "tea", "cf", "atp"], atp_timing_known=True, atp_window_s=12e-6
    )
    graph.analysis = options
    if whole:
        if not public:
            raise ValueError("The whole-slice preset requires the bundled public head reference")
        settings = ct.model_dump()
        settings.update(
            crop=(0, asset["rows"], 0, asset["columns"]),
            origin_x_m=-(asset["columns"] - 1) * ct.spacing_x_m / 2,
        )
        values = cfg.model_dump()
        values.update(
            ct=CTSettings(**settings),
            channels=64,
            arrays=[ReceiveArray(elements=64, pitch_m=0.001, x_m=0.02, z_m=0.004)],
            simulation=JWaveSettings(spacing_m=0.001),
            sources=[Source(x_m=0.02, z_m=0.12, emission_s=20e-6)],
            frequency_hz=0.1e6,
            duration_s=20e-6,
            capture_t0_s=-10e-6,
            sampling_hz=5e6,
            samples=2048,
            bubble=BubbleSettings(drive_pa=20e3, ringdown_cycles=2),
            coupling=CouplingSettings(passband_hz=0.1e6),
            processing=ProcessingSettings(
                remove_dc=True, filter_kind="bandpass", low_hz=0.02e6, high_hz=0.25e6
            ),
            grid_x_min_m=-0.02,
            grid_x_max_m=0.06,
            grid_z_min_m=0.08,
            grid_z_max_m=0.144,
            gate_start_s=20e-6,
            gate_end_s=120e-6,
            gate_stride=1,
        )
        cfg = Config(**values)
        options = ReconstructionOptions(
            methods=["das", "tea", "cf", "atp"],
            atp_timing_known=True,
            atp_emission_s=20e-6,
            atp_window_s=20e-6,
        )
        graph.analysis = options
    return {
        "asset": asset,
        "workflow": graph.model_dump(),
        "config": cfg.model_dump(),
        "options": options.model_dump(),
    }


def cropped_hu(settings, data):
    r0, r1, c0, c1 = settings.crop
    return data["hu"][r0:r1, c0:c1]


def acoustic_maps(cfg, data, grid):
    settings = cfg.ct
    hu = cropped_hu(settings, data)
    x = grid["origin_xz_m"][0] + np.arange(grid["shape"][0]) * grid["spacing_m"]
    z = grid["origin_xz_m"][1] + np.arange(grid["shape"][1]) * grid["spacing_m"]
    xx, zz = np.meshgrid(x, z, indexing="ij")
    sampled = map_coordinates(
        hu,
        [
            (zz - settings.origin_z_m) / settings.spacing_z_m,
            (xx - settings.origin_x_m) / settings.spacing_x_m,
        ],
        order=1,
        mode="constant",
        cval=0,
        prefilter=False,
    )
    fraction = (
        np.where(
            sampled >= settings.bone_threshold_hu, np.clip(sampled / settings.bone_hu, 0, 1), 0.0
        )
        if settings.contrast
        else np.zeros_like(sampled)
    )
    speed = cfg.sound_speed_m_s + (settings.bone_speed_m_s - cfg.sound_speed_m_s) * fraction
    density = (
        cfg.simulation.density_kg_m3
        + (settings.bone_density_kg_m3 - cfg.simulation.density_kg_m3) * fraction
    )
    return sampled, speed, density
