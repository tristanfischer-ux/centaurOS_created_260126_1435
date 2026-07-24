"""PHANTM actuator — baseline parameters (Dr Tony Hooley's exact v2 geometry, 2026-07-23).

CONFIDENTIAL — core IP. Scope: the actuator only (magnetics, mechanics, manufacture,
cost). Never anything about the RF, aperture, beam or feed.

Every dimension from brief §2/§3 is a named variable here; Tony's baseline is the
default. All lengths in mm unless suffixed _m / _um; masses kg; SI elsewhere.
Derived geometry lives in geometry.py — this file is inputs only.
"""

from dataclasses import dataclass, field

MM = 1e-3          # mm → m
UM = 1e-6          # µm → m
G_ACCEL = 9.80665  # m/s²


@dataclass
class TranslatorParams:
    # §2.1 — SMC bar, two opposite faces slotted identically.
    length_mm: float = 12.5
    width_toothed_mm: float = 1.549   # dimension between the two toothed faces (§2.2/§3 use 1.549)
    width_side_mm: float = 1.55       # transverse dimension (nominal 1.55 per §2.1)
    slot_depth_mm: float = 0.465
    slot_width_mm: float = 0.232
    land_width_mm: float = 0.232      # spacing between slots ⇒ tooth pitch = slot + land


@dataclass
class SlotSectionParams:
    # §2.2 — each pole-piece has two identical slot-sections facing the translator.
    axial_mm: float = 1.16            # along translator axis; carries 3 teeth (lands) at the tooth pitch
    transverse_mm: float = 1.708      # across the translator (wider than the 1.549 translator)
    depth_mm: float = 0.465           # radial thickness of the bar
    slot_width_mm: float = 0.232
    slot_depth_mm: float = 0.155
    slot_edge_inset_mm: float = 0.232 # each slot set this far in from opposite long edges
    separation_mm: float = 1.704      # toothed faces of the two slot-sections, held symmetrically apart


@dataclass
class BridgeParams:
    # §2.2 — joins one pair of slot-section ends into a single magnetic path
    # ("linearised horseshoe"); centre displaced axially to clear the coil.
    thickness_axial_mm: float = 0.232
    width_transverse_mm: float = 1.162
    length_radial_mm: float = 2.634   # spans slot-section + gap + translator + gap + slot-section
    centre_displaced_len_mm: float = 0.792
    centre_flat_len_mm: float = 0.729
    displacement_mm: float = 0.263    # axial clearance for the coil


@dataclass
class CoilParams:
    # §2.2 / §4.4 — Nc turns of enamelled copper around the bridge centre.
    n_turns: int = 20
    wire_diameter_bare_um: float = 50.0
    wire_diameter_od_um: float = 58.0   # enamelled OD, IEC 60317 grade-2 class for 50 µm bare
    supply_voltage_v: float = 1.0       # §4.5 rise-time case


@dataclass
class PolePlacementParams:
    # §2.3 — three identical pole-pieces along the translator.
    n_poles: int = 3
    inter_pole_gap_mm: float = 0.374  # spacing between adjacent pole-piece ends (Tony's figure)
    ideal_phase_offset_mm: float = 0.155  # brief: one third of the tooth pitch


@dataclass
class MaterialParams:
    # §3 — expose as variables; ranges in comments.
    smc_density_kg_m3: float = 7400.0      # Somaloy-type, 7300–7600
    smc_saturation_t: float = 1.5          # ~1.0–1.5 T polarisation knee
    ndfeb_br_t: float = 1.30               # N42-class default; 1.0–1.4 across grades
    ndfeb_mu_r: float = 1.05
    ndfeb_alpha_br_per_k: float = -0.0012  # Br temperature coefficient (−0.12 %/K)
    cu_resistivity_20c_ohm_m: float = 1.72e-8
    cu_alpha_per_k: float = 0.00393


@dataclass
class PhantmParams:
    translator: TranslatorParams = field(default_factory=TranslatorParams)
    slot_section: SlotSectionParams = field(default_factory=SlotSectionParams)
    bridge: BridgeParams = field(default_factory=BridgeParams)
    coil: CoilParams = field(default_factory=CoilParams)
    poles: PolePlacementParams = field(default_factory=PolePlacementParams)
    materials: MaterialParams = field(default_factory=MaterialParams)

    # §5.4 detent spec: Fd = detent_g_factor · g · Mt
    detent_g_factor: float = 5.0
    # §5.1 cell pitch per band (mm), ~λ/2
    cell_pitch_mm: dict = field(default_factory=lambda: {"50GHz": 3.0, "80GHz": 1.9, "160GHz": 0.94})


BASELINE = PhantmParams()
