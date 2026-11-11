from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_serializer, model_validator

ANALYSIS_CONFIG_FIELDS = frozenset(
    {
        "grid_x_min_m",
        "grid_x_max_m",
        "grid_z_min_m",
        "grid_z_max_m",
        "grid_n",
        "gate_start_s",
        "gate_end_s",
        "gate_stride",
        "active_channels",
        "processing",
    }
)


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, validate_default=True)


class JWaveSettings(StrictModel):
    backend: Literal["jwave"] = "jwave"
    spacing_m: float = Field(default=0.0002, ge=0.00005, le=0.002)
    cfl: float = Field(default=0.3, ge=0.1, le=0.5)
    pml_cells: int = Field(default=20, ge=12, le=40)
    density_kg_m3: float = Field(default=1000, ge=500, le=3000)


class BubbleSettings(StrictModel):
    model: Literal["free", "lipid"] = "lipid"
    radius_m: float = Field(default=2e-6, ge=0.5e-6, le=10e-6)
    drive_pa: float = Field(default=100e3, ge=0, le=300e3)
    viscosity_pa_s: float = Field(default=0.001, ge=0.0001, le=0.01)
    ringdown_cycles: int = Field(default=8, ge=2, le=40)
    rtol: float = Field(default=1e-8, ge=1e-10, le=1e-5)


class Source(StrictModel):
    x_m: float = Field(default=0, ge=-0.1, le=0.1)
    z_m: float = Field(default=0.03, ge=0.001, le=0.15)
    emission_s: float = Field(default=8e-6, ge=0, le=100e-6)
    amplitude: float = Field(default=1, gt=0, le=10)
    bubble: BubbleSettings | None = None

    @model_serializer(mode="wrap")
    def legacy(self, handler):
        value = handler(self)
        if self.bubble is None:
            value.pop("bubble", None)
        return value


class ReceiveArray(StrictModel):
    name: str = Field(default="Array 1", min_length=1, max_length=40)
    elements: int = Field(default=16, ge=2, le=1024)
    pitch_m: float = Field(default=0.0003, ge=0.00005, le=0.002)
    x_m: float = Field(default=0, ge=-0.1, le=0.1)
    z_m: float = Field(default=0, ge=-0.1, le=0.15)
    angle_deg: float = Field(default=0, ge=-180, le=180)


class CouplingSettings(StrictModel):
    mode: Literal["volume_flow_2d"] = "volume_flow_2d"
    effective_length_m: float = Field(default=0.001, ge=1e-5, le=0.1)
    passband_hz: float = Field(default=1e6, ge=0.1e6, le=10e6)


class ProcessingSettings(StrictModel):
    remove_dc: bool = False
    detrend_linear: bool = False
    filter_kind: Literal["none", "lowpass", "highpass", "bandpass"] = "none"
    low_hz: float = Field(default=0.2e6, gt=0, le=40e6)
    high_hz: float = Field(default=2e6, gt=0, le=45e6)
    order: int = Field(default=4, ge=2, le=8)
    notch_hz: float | None = Field(default=None, gt=0, le=45e6)
    notch_q: float = Field(default=30, ge=2, le=100)


class CTSettings(StrictModel):
    asset_id: str = Field(pattern=r"^[a-f0-9]{64}$")
    rows: int = Field(ge=8, le=1024)
    columns: int = Field(ge=8, le=1024)
    spacing_x_m: float = Field(ge=0.00005, le=0.005)
    spacing_z_m: float = Field(ge=0.00005, le=0.005)
    crop: tuple[int, int, int, int]
    origin_x_m: float = Field(default=-0.032, ge=-0.3, le=0.3)
    origin_z_m: float = Field(default=0, ge=-0.3, le=0.3)
    contrast: bool = True
    bone_threshold_hu: float = Field(default=300, ge=100, le=1000)
    bone_hu: float = Field(default=1000, ge=500, le=3000)
    bone_speed_m_s: float = Field(default=2800, ge=1800, le=3500)
    bone_density_kg_m3: float = Field(default=1900, ge=1200, le=2500)

    @model_validator(mode="after")
    def valid_crop(self):
        r0, r1, c0, c1 = self.crop
        if not (
            0 <= r0 < r1 <= self.rows
            and 0 <= c0 < c1 <= self.columns
            and min(r1 - r0, c1 - c0) >= 8
        ):
            raise ValueError("CT crop must contain at least 8×8 pixels inside the source slice")
        if self.bone_threshold_hu >= self.bone_hu:
            raise ValueError("Bone threshold must be below the cortical HU endpoint")
        return self

    def extent(self):
        r0, r1, c0, c1 = self.crop
        return [
            self.origin_x_m,
            self.origin_x_m + (c1 - c0 - 1) * self.spacing_x_m,
            self.origin_z_m,
            self.origin_z_m + (r1 - r0 - 1) * self.spacing_z_m,
        ]


class Config(StrictModel):
    schema_version: Literal["1.0"] = "1.0"
    simulation: JWaveSettings | None = None
    bubble: BubbleSettings | None = None
    coupling: CouplingSettings | None = None
    arrays: list[ReceiveArray] | None = Field(default=None, min_length=1, max_length=8)
    processing: ProcessingSettings | None = None
    ct: CTSettings | None = None
    receiver_offsets_m: list[tuple[float, float]] | None = Field(default=None, max_length=1024)
    sound_speed_m_s: float = Field(default=1500, ge=300, le=3000)
    channels: int = Field(default=64, ge=4, le=1024)
    pitch_m: float = Field(default=0.0003, ge=0.00005, le=0.002)
    sampling_hz: float = Field(default=20e6, ge=1e6, le=100e6)
    samples: int = Field(default=4096, ge=512, le=16384)
    capture_t0_s: float = Field(default=0, ge=-100e-6, le=100e-6)
    frequency_hz: float = Field(default=1e6, ge=0.1e6, le=10e6)
    duration_s: float = Field(default=4e-6, ge=1e-6, le=20e-6)
    emission_kind: Literal["pulse", "harmonic", "broadband"] = "pulse"
    bandpass_hz: tuple[float, float] | None = None
    spreading: bool = False
    snr_db: float | None = Field(default=30, ge=-10, le=100)
    seed: int = Field(default=42, ge=0, le=2**32 - 1)
    sources: list[Source] = Field(default_factory=lambda: [Source()], min_length=1, max_length=8)
    active_channels: list[int] | None = None
    grid_x_min_m: float = Field(default=-0.012, ge=-0.1, le=0.1)
    grid_x_max_m: float = Field(default=0.012, ge=-0.1, le=0.1)
    grid_z_min_m: float = Field(default=0.015, ge=0.001, le=0.15)
    grid_z_max_m: float = Field(default=0.045, ge=0.001, le=0.15)
    grid_n: int = Field(default=128, ge=17, le=192)
    gate_start_s: float = Field(default=4e-6, ge=0, le=100e-6)
    gate_end_s: float = Field(default=12e-6, ge=0, le=400e-6)
    gate_stride: int = Field(default=4, ge=1, le=16)

    @model_validator(mode="after")
    def valid_physics(self):
        if any(s.bubble for s in self.sources) and not self.bubble:
            raise ValueError("Per-source bubble models require the jbubble backend")
        if self.receiver_offsets_m is not None:
            if len(self.receiver_offsets_m) != self.channels or any(
                abs(v) > 0.005 for p in self.receiver_offsets_m for v in p
            ):
                raise ValueError("Receiver offsets need one x/z pair per channel, bounded to 5 mm")
        if self.ct and not self.simulation:
            raise ValueError("CT-derived propagation requires the j-Wave backend")
        if self.processing:
            p = self.processing
            relevant = (
                [p.high_hz]
                if p.filter_kind == "lowpass"
                else [p.low_hz]
                if p.filter_kind == "highpass"
                else [p.low_hz, p.high_hz]
                if p.filter_kind == "bandpass"
                else []
            )
            if p.filter_kind == "bandpass" and p.low_hz >= p.high_hz:
                raise ValueError("Receive bandpass lower edge must be below its upper edge")
            if p.notch_hz is not None:
                relevant.append(p.notch_hz)
            if any(f >= self.sampling_hz / 2 for f in relevant):
                raise ValueError(
                    "Receive filter/notch frequencies must lie below acquisition Nyquist"
                )
        if self.channels * self.samples > 8_388_608:
            raise ValueError(
                "RF exceeds the 64 MiB CPU capture budget; reduce samples or channels (1024 channels support up to 8192 samples)"
            )
        if self.arrays:
            if sum(a.elements for a in self.arrays) != self.channels:
                raise ValueError(
                    "Total channels must equal the sum of receive-array elements (maximum 1024)"
                )
            import numpy as np

            from .geometry import receivers

            positions = receivers(self)
            if len(np.unique(np.round(positions, 10), axis=0)) != self.channels:
                raise ValueError("Receive elements overlap; move or rotate the arrays")
        if self.coupling:
            if not self.bubble or not self.simulation:
                raise ValueError("Volume-flow coupling requires both jbubble and j-Wave")
            if self.coupling.passband_hz * 1.5 >= self.sampling_hz / 2:
                raise ValueError("Coupling stopband must be below acquisition Nyquist")
        if self.bubble:
            if self.simulation and not self.coupling:
                raise ValueError(
                    "simultaneous jBubble and j-Wave selection requires explicit volume-flow coupling settings"
                )
            if self.emission_kind != "pulse" or self.bandpass_hz:
                raise ValueError(
                    "jBubble uses its own Hann sine drive; select pulse and disable analytic source bandpass"
                )
            if not self.spreading and not self.coupling:
                raise ValueError("jBubble RF requires spherical spreading and compensation")
            if self.coupling and self.spreading:
                raise ValueError("Coupled 2D propagation cannot use 3D 1/r compensation")
            if self.gate_stride != 1:
                raise ValueError(
                    "Nonlinear bubble emissions require gate stride 1 to avoid harmonic quadrature aliasing"
                )
            if self.duration_s * self.frequency_hz > 20:
                raise ValueError("jBubble drive is limited to 20 cycles per run")
        if self.frequency_hz * 4 > self.sampling_hz:
            raise ValueError("Use at least four acquisition samples per carrier period")
        if self.grid_x_max_m <= self.grid_x_min_m or self.grid_z_max_m <= self.grid_z_min_m:
            raise ValueError("Grid maximum must exceed minimum (coordinates are metres)")
        if self.gate_end_s <= self.gate_start_s:
            raise ValueError("Emission-time gate end must exceed start")
        if (self.gate_end_s - self.gate_start_s) * self.sampling_hz / self.gate_stride > 512:
            raise ValueError(
                "Gate exceeds 512 integration samples; narrow the gate or increase stride"
            )
        if self.sampling_hz / self.gate_stride < 4 * self.frequency_hz:
            raise ValueError("Gate quadrature requires at least four samples per carrier cycle")
        if self.emission_kind == "broadband" and self.gate_stride != 1:
            raise ValueError(
                "Broadband emission requires gate stride 1 to avoid quadrature aliasing"
            )
        if self.active_channels is not None:
            if (
                len(self.active_channels) < 2
                or len(set(self.active_channels)) != len(self.active_channels)
                or min(self.active_channels) < 0
                or max(self.active_channels) >= self.channels
            ):
                raise ValueError("Select at least two unique in-range receiver channels")
        if self.bandpass_hz:
            low, high = self.bandpass_hz
            if not 0 < low < high < self.sampling_hz / 2:
                raise ValueError("Bandpass must satisfy 0 < low < high < Nyquist")
            if high > self.sampling_hz / self.gate_stride / 2:
                raise ValueError("Bandpass exceeds integration Nyquist; reduce gate stride")
        capture_end = self.capture_t0_s + (self.samples - 1) / self.sampling_hz
        aperture = (self.channels - 1) * self.pitch_m / 2
        for source in self.sources:
            minimum = source.emission_s + source.z_m / self.sound_speed_m_s - self.duration_s / 2
            maximum = (
                source.emission_s
                + ((abs(source.x_m) + aperture) ** 2 + source.z_m**2) ** 0.5 / self.sound_speed_m_s
                + self.duration_s / 2
            )
            if self.bubble:
                maximum += (source.bubble or self.bubble).ringdown_cycles / self.frequency_hz
            if self.arrays or self.receiver_offsets_m:
                import numpy as np

                from .geometry import receivers

                distance = np.linalg.norm(receivers(self) - [source.x_m, 0, source.z_m], axis=1)
                if distance.min() < 0.0001:
                    raise ValueError("Keep source centres at least 0.1 mm from receivers")
                minimum = (
                    source.emission_s - self.duration_s / 2 + distance.min() / self.sound_speed_m_s
                )
                maximum = (
                    source.emission_s + self.duration_s / 2 + distance.max() / self.sound_speed_m_s
                )
                if self.bubble:
                    maximum += (source.bubble or self.bubble).ringdown_cycles / self.frequency_hz
            if minimum < self.capture_t0_s or maximum > capture_end:
                raise ValueError(
                    "Capture does not cover complete source arrivals; check time origin, samples and SI units"
                )
        return self

    @model_serializer(mode="wrap")
    def serialize_legacy(self, handler):
        value = handler(self)
        if self.simulation is None:
            value.pop("simulation", None)
        if self.bubble is None:
            value.pop("bubble", None)
        if self.coupling is None:
            value.pop("coupling", None)
        if self.arrays is None:
            value.pop("arrays", None)
        if self.processing is None:
            value.pop("processing", None)
        if self.ct is None:
            value.pop("ct", None)
        if self.receiver_offsets_m is None:
            value.pop("receiver_offsets_m", None)
        return value

    def warnings(self) -> list[str]:
        result = [
            "Homogeneous straight-ray scalar model; arbitrary amplitude, no calibrated pressure, scattering or nonlinear propagation."
        ]
        if self.simulation:
            result = [
                "Experimental j-Wave 2D linear acoustic propagation, homogeneous medium, absorbing PML. Line-source spreading differs from 3D point sources. Arbitrary amplitude; no calibrated pressure. Native Windows CPU is locally tested; upstream recommends WSL2."
            ]
        if self.bubble:
            result = [
                "Experimental jbubble Keller-Miksis dynamics with Hann sine drive, independent identical bubbles and quasi-acoustic spherical 3D propagation. RF is simulated emission pressure divided by drive pressure; plots in Pa are model predictions, not calibrated measurements. No bubble interactions, transmit field, attenuation or clinical inference."
            ]
            if any(
                s.emission_s + self.duration_s / 2 + self.bubble.ringdown_cycles / self.frequency_hz
                > self.gate_end_s
                for s in self.sources
            ):
                result.append(
                    "Reconstruction gate truncates the recorded bubble ringdown; increase its end time to include it."
                )
        if self.active_channels is not None and len(self.active_channels) < self.channels:
            result.append(
                "Receiver aperture contains disabled channels; spatial resolution may degrade."
            )
        if self.coupling:
            result = [
                "Experimental one-way jbubble volume-flow → j-Wave 2D coupling. An explicit out-of-plane equivalent line length defines the 3D-to-2D conversion. FIR bandwidth filtering, homogeneous medium and no acoustic feedback. RF is 2D model pressure divided by drive pressure; no 3D pressure equivalence or calibrated measurement."
            ]
        if self.arrays:
            result.append(
                "Receive layout uses point elements with actual array positions and angles; finite element width, directivity and transmit steering are not modelled."
            )
        if self.ct:
            result = [
                message.replace("homogeneous medium", "CT-derived fluid medium")
                for message in result
            ]
            result.append(
                "Experimental CT-derived 2D fluid c/rho model with thresholded HU mixture. Air/soft tissue are replaced by host fluid. No absorption or elastic/shear modes. Receive-delay model is recorded separately; optional CT slowness uses fixed rays without refraction. HU calibration is user-defined, not a patient-specific acoustic measurement."
            )
        upper_hz = 1.5 * self.coupling.passband_hz if self.coupling else self.frequency_hz
        if any(
            p > self.sound_speed_m_s / (2 * upper_hz)
            for p in ([a.pitch_m for a in self.arrays] if self.arrays else [self.pitch_m])
        ):
            result.append(
                "An array pitch exceeds half the shortest modelled wavelength; spatial aliasing is possible."
            )
        if self.emission_kind == "broadband":
            result.append("Broadband emission: use gate stride 1 for reliable exposure quadrature.")
        for source in self.sources:
            if not (
                self.grid_x_min_m <= source.x_m <= self.grid_x_max_m
                and self.grid_z_min_m <= source.z_m <= self.grid_z_max_m
            ):
                result.append("A ground-truth source lies outside the reconstruction grid.")
            if (
                source.emission_s - self.duration_s / 2 < self.gate_start_s
                or source.emission_s + self.duration_s / 2 > self.gate_end_s
            ):
                result.append("Emission-time gate truncates a source waveform.")
        if self.bubble and any(s.bubble for s in self.sources):
            result = [
                m.replace("independent identical bubbles", "independent per-source bubbles")
                for m in result
            ]
        return result


class ProjectRequest(StrictModel):
    path: str = Field(min_length=1, max_length=4096)
    name: str = Field(default="Point-source study", min_length=1, max_length=120)
    create: bool = False


class RunRequest(StrictModel):
    config: Config


class ExportRequest(StrictModel):
    path: str = Field(min_length=1, max_length=4096)
    include_raw: bool = False


class BundleRequest(StrictModel):
    path: str = Field(min_length=1, max_length=4096)
