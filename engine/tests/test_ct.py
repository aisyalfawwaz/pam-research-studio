import json
import time

import h5py
import numpy as np
import pytest
from pamstudio.ct import import_dicom, read_asset, read_dicom, synthetic, template
from pamstudio.exporting import export_bundle, import_bundle, verify_folder
from pamstudio.jbubble_adapter import PYTHON as BUBBLE_PYTHON
from pamstudio.jobs import Jobs
from pamstudio.jwave_adapter import PYTHON as WAVE_PYTHON
from pamstudio.models import CTSettings, ReceiveArray
from pamstudio.storage import Project
from pamstudio.workflow import WorkflowRequest, compile_graph
from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import CTImageStorage, ExplicitVRLittleEndian


def synthetic_dicom(file):
    meta = FileMetaDataset()
    meta.TransferSyntaxUID = ExplicitVRLittleEndian
    meta.MediaStorageSOPClassUID = CTImageStorage
    meta.MediaStorageSOPInstanceUID = "2.25.123456789123456789"
    ds = FileDataset(str(file), {}, file_meta=meta, preamble=b"\0" * 128)
    ds.Modality = "CT"
    ds.Rows = 32
    ds.Columns = 40
    ds.PatientName = "SYNTHETIC^ONLY"
    ds.PatientID = "SYNTHETIC-TEST"
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.BitsAllocated = 16
    ds.BitsStored = 16
    ds.HighBit = 15
    ds.PixelRepresentation = 1
    ds.PixelSpacing = [0.5, 0.8]
    ds.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
    ds.RescaleSlope = 2
    ds.RescaleIntercept = -1000
    pixels = np.arange(32 * 40, dtype="<i2").reshape(32, 40)
    ds.PixelData = pixels.tobytes()
    ds.save_as(file, enforce_file_format=True)
    return ds, pixels


def test_synthetic_dicom_hu_units_orientation_and_metadata_minimization(tmp_path):
    file = tmp_path / "synthetic.dcm"
    ds, pixels = synthetic_dicom(file)
    hu, metadata = read_dicom(file)
    np.testing.assert_array_equal(hu, pixels * 2.0 - 1000)
    assert metadata["spacing_x_m"] == 0.0008 and metadata["spacing_z_m"] == 0.0005
    assert "SYNTHETIC^ONLY" not in json.dumps(metadata)
    assert "SYNTHETIC-TEST" not in json.dumps(metadata)
    project = Project(tmp_path / "project", create=True)
    asset = import_dicom(project, file)
    settings = CTSettings(**{k: v for k, v in asset.items() if k != "source"}, crop=(4, 20, 8, 32))
    np.testing.assert_array_equal(read_asset(project, settings)["hu"], hu)
    with h5py.File(project.path / "assets" / (asset["asset_id"] + ".h5"), "r+") as stored:
        stored["hu"][0, 0] += 1
    with pytest.raises(ValueError, match="hash"):
        read_asset(project, settings)
    ds.Modality = "MR"
    ds.save_as(file, enforce_file_format=True)
    with pytest.raises(ValueError, match="CT"):
        read_dicom(file)


@pytest.mark.skipif(
    not WAVE_PYTHON.is_file() or not BUBBLE_PYTHON.is_file(),
    reason="Install both optional runtimes",
)
def test_actual_synthetic_ct_contrast_dsp_coupling_and_asset_export_reimport(tmp_path):
    project = Project(tmp_path / "phantom", create=True)
    body = template(synthetic(project))
    body["config"].update(
        channels=8,
        grid_n=17,
        snr_db=None,
        arrays=[ReceiveArray(elements=8, pitch_m=0.0005, z_m=0.004).model_dump()],
    )
    jobs = Jobs()
    records = []
    try:
        for contrast in (False, True):
            body["config"]["ct"]["contrast"] = contrast
            request = WorkflowRequest(**{k: body[k] for k in ("workflow", "config", "options")})
            cfg, options, _ = compile_graph(request)
            accepted = jobs.start(project, cfg, options=options, workflow=body["workflow"])
            deadline = time.monotonic() + 120
            while jobs.busy() and time.monotonic() < deadline:
                time.sleep(0.1)
            assert jobs.snapshot()["status"] == "complete", jobs.snapshot()
            records.append(project.run(accepted["run_id"]))
        reference, skull = records
        before, after = [project.read_rf(r["id"]) for r in records]
        assert np.linalg.norm(after - before) / np.linalg.norm(before) > 0.05
        assert skull["config"]["processing"]
        with h5py.File(project.file(skull["id"]), "r") as stored:
            assert stored["medium/hu"].shape == (160, 160)
            assert stored["medium/sound_speed_m_s"][:].max() > 1500
            assert "rf_processed" in stored
        bundle = export_bundle(project, skull["id"], tmp_path / "ct.zip", True)
        verify_folder(bundle["folder_path"])
        target = Project(tmp_path / "imported", create=True)
        imported = import_bundle(target, bundle["zip_path"])
        assert read_asset(target, cfg.ct)["metadata"]["source"]["kind"] == "synthetic"
        np.testing.assert_array_equal(target.read_rf(imported["id"]), after)
    finally:
        jobs.shutdown()
