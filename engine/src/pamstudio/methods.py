"""Method identities are versioned independently of the numerical backend."""

from typing import Literal

from pydantic import Field, model_serializer, model_validator

from .models import Config, StrictModel

Method = Literal["das", "tea", "cf", "rcb", "atp"]


class ReconstructionOptions(StrictModel):
    receive_model: Literal["homogeneous", "ct_slowness"] = "homogeneous"
    ray_step_m: float = Field(default=0.00025, ge=0.00005, le=0.002)
    assumed_sound_speed_m_s: float | None = Field(default=None, ge=300, le=3000)
    assumed_receiver_offsets_m: list[tuple[float, float]] | None = Field(
        default=None, max_length=1024
    )
    methods: list[Method] = Field(
        default_factory=lambda: ["das", "tea"], min_length=1, max_length=5
    )
    cf_exponent: float = Field(default=1.0, ge=0, le=4)
    rcb_radius: float = Field(default=0.1, ge=0, lt=1)
    rcb_loading: float = Field(default=0.001, ge=1e-8, le=0.1)
    rcb_subarray: int = Field(default=16, ge=2, le=64)
    atp_timing_known: bool = False
    atp_mode: Literal["emission", "plane_wave"] = "emission"
    atp_emission_s: float = Field(default=8e-6, ge=-100e-6, le=200e-6)
    atp_window_s: float = Field(default=4e-6, ge=0.1e-6, le=20e-6)
    atp_plane_z_m: float = Field(default=0, ge=-0.15, le=0.15)

    @model_validator(mode="after")
    def unique(self):
        if len(set(self.methods)) != len(self.methods):
            raise ValueError("Select each reconstruction method only once")
        if "atp" in self.methods and not self.atp_timing_known:
            raise ValueError("ATP requires a known emission time or calibrated plane-wave trigger")
        return self

    @model_serializer(mode="wrap")
    def legacy(self, handler):
        value = handler(self)
        if self.receive_model == "homogeneous" and self.ray_step_m == 0.00025:
            value.pop("receive_model", None)
            value.pop("ray_step_m", None)
        for key in ("assumed_sound_speed_m_s", "assumed_receiver_offsets_m"):
            if getattr(self, key) is None:
                value.pop(key, None)
        return value


class ReconstructRequest(StrictModel):
    input_run_id: str = Field(pattern=r"^[a-f0-9-]{36}$")
    options: ReconstructionOptions = Field(default_factory=ReconstructionOptions)
    config: Config | None = None


METHODS = {
    "das": {
        "method_id": "pam.das.passive",
        "method_version": "1.0.0",
        "status": "reference-only",
        "quantity": "peak_coherent_power",
        "unit": "a.u.^2",
        "definition": "max_u (mean_m s_m(u + distance_m/c))^2",
    },
    "tea": {
        "method_id": "pam.tea.time_exposure",
        "method_version": "1.0.0",
        "status": "reference-only",
        "quantity": "coherent_exposure",
        "unit": "a.u.^2 s",
        "definition": "integral_gate (mean_m s_m(u + distance_m/c))^2 du; no self-energy subtraction",
    },
    "cf": {
        "method_id": "pam.cf.weighted_das",
        "method_version": "1.0.0",
        "status": "experimental",
        "quantity": "coherence_weighted_peak_power",
        "unit": "a.u.^2",
        "definition": "max_u [CF(u)^p mean_m y_m(u)]^2; CF=|sum y|^2/(M sum |y|^2)",
        "reference": "Mallart and Fink (1994), DOI 10.1121/1.410562",
    },
    "rcb": {
        "method_id": "pam.rcb.spherical",
        "method_version": "1.0.0",
        "status": "experimental",
        "quantity": "robust_coherent_exposure",
        "unit": "a.u.^2 s",
        "definition": "min_a a^H R^-1 a subject to ||a-a0||<=radius||a0||; norm-corrected steering, distortionless weights; analytic signal energy / 2",
        "reference": "Li, Stoica and Wang (2003), DOI 10.1109/TSP.2003.812831",
    },
    "atp": {
        "method_id": "pam.atp.short_pulse",
        "method_version": "1.0.0",
        "status": "experimental",
        "quantity": "timing_gated_coherent_exposure",
        "unit": "a.u.^2 s",
        "definition": "integral over calibrated emission-time window of (mean_m s_m(u+distance_m/c))^2 du; optional axial plane-wave excitation time",
        "reference": "Davies et al. (2021), DOI 10.1109/TUFFC.2020.3026165; source-emitter/plane-wave variants",
    },
}
