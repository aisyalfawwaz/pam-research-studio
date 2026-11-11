"""Prepare an attributed, metadata-minimized public CT reference (never run by tests).

Run with --input PATH to the already downloaded Studies/197/177.dcm instance.
The original archive record/entry/hashes are retained; source pixels are unchanged.
"""

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import pydicom
from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import CTImageStorage, ExplicitVRLittleEndian

parser = argparse.ArgumentParser()
parser.add_argument("--input", type=Path, required=True)
args = parser.parse_args()
expected = "86172d1615b15891a1683b0ba600941f115943d7711f51f7ed50a9b244170838"
raw = args.input.read_bytes()
if hashlib.sha256(raw).hexdigest() != expected:
    raise SystemExit("Original public instance hash mismatch")
root = Path(__file__).resolve().parents[1]
folder = root / "datasets/open_head_ct"
if (folder / "head_slice.dcm").exists():
    raise SystemExit("Existing public CT derivative preserved")
folder.mkdir(parents=True, exist_ok=True)
source = pydicom.dcmread(args.input)
pixels = source.pixel_array
meta = FileMetaDataset()
meta.TransferSyntaxUID = ExplicitVRLittleEndian
meta.MediaStorageSOPClassUID = CTImageStorage
meta.MediaStorageSOPInstanceUID = "2.25." + str(int(expected[:32], 16))
meta.ImplementationClassUID = "2.25.246831813324812923017922"
ds = FileDataset(str(folder / "head_slice.dcm"), {}, file_meta=meta, preamble=b"\0" * 128)
ds.SOPClassUID = meta.MediaStorageSOPClassUID
ds.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
ds.Modality = "CT"
ds.PatientName = "PUBLIC^REFERENCE"
ds.PatientID = "PUBLIC-CTA-REFERENCE"
ds.PatientIdentityRemoved = "YES"
ds.DeidentificationMethod = "Public reference; identifiers rebuilt; pixels unchanged"
ds.StudyInstanceUID = "2.25." + str(int(expected[16:48], 16))
ds.SeriesInstanceUID = "2.25." + str(int(expected[32:], 16))
ds.ImageType = ["DERIVED", "SECONDARY", "AXIAL"]
ds.SeriesDescription = "Public head CTA research reference slice"
ds.Rows, ds.Columns = pixels.shape
ds.SamplesPerPixel = 1
ds.PhotometricInterpretation = "MONOCHROME2"
ds.BitsAllocated = pixels.dtype.itemsize * 8
ds.BitsStored = ds.BitsAllocated
ds.HighBit = ds.BitsStored - 1
ds.PixelRepresentation = 1 if pixels.dtype.kind == "i" else 0
ds.PixelSpacing = source.PixelSpacing
ds.ImageOrientationPatient = source.ImageOrientationPatient
ds.ImagePositionPatient = [0, 0, 0]
ds.InstanceNumber = 1
ds.RescaleSlope = source.get("RescaleSlope", 1)
ds.RescaleIntercept = source.get("RescaleIntercept", 0)
ds.RescaleType = "HU"
ds.PixelData = np.asarray(pixels, dtype=pixels.dtype.newbyteorder("<")).tobytes()
ds.save_as(folder / "head_slice.dcm", enforce_file_format=True)
derived = (folder / "head_slice.dcm").read_bytes()
np.testing.assert_array_equal(pydicom.dcmread(folder / "head_slice.dcm").pixel_array, pixels)
credit = {
    "kind": "public_deidentified_CT",
    "label": "Public head CTA axial slice · study 197 / instance 177",
    "title": "Open dataset of annotated DICOM images of head CTA for intracranial aneurysm detection",
    "authors": [
        "Evgenia Blagosklonova",
        "Daria Dolotova",
        "Natalia Polunina",
        "Elena Grigorieva",
        "Denis Pakhomov",
        "Vladimir Krylov",
        "Andrey Gavrilov",
    ],
    "doi": "10.5281/zenodo.15697196",
    "url": "https://zenodo.org/records/15697196",
    "license": "CC BY 4.0",
    "license_url": "https://creativecommons.org/licenses/by/4.0/",
    "archive": "Dataset.zip",
    "archive_size": 25578845008,
    "archive_md5_published": "264ff9ee868c022d108b7c7aa7396d32",
    "archive_entry": "Studies/197/177.dcm",
    "original_instance_sha256": expected,
    "derived_instance_sha256": hashlib.sha256(derived).hexdigest(),
    "modifications": "One axial slice selected. Pixel samples and HU rescale/spacing retained exactly; decompressed to explicit little endian. Metadata rebuilt with public-reference identifiers; patient/study/private fields are not copied. ImagePosition reset to local zero; no patient 3D registration. No archive-wide MD5 verification is claimed for this partial download.",
}
(folder / "SOURCE.json").write_text(json.dumps(credit, indent=2) + "\n", encoding="utf-8")
(folder / "ATTRIBUTION.md").write_text(
    "# Public head CTA reference\n\n"
    + ", ".join(credit["authors"])
    + ". "
    + credit["title"]
    + " (2025). DOI: https://doi.org/"
    + credit["doi"]
    + ".\n\nLicensed under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). Source: "
    + credit["url"]
    + ".\n\n"
    + credit["modifications"]
    + "\n\nThis is an anatomical research input, not a calibrated skull acoustic measurement or clinical demonstration. Automated tests use synthetic DICOM only.\n",
    encoding="utf-8",
)
print(
    json.dumps(
        {
            "derived_sha256": credit["derived_instance_sha256"],
            "shape": list(pixels.shape),
            "bytes": len(derived),
        },
        indent=2,
    )
)
