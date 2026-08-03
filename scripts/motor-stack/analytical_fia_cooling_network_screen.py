#!/usr/bin/env python3
"""Twin-bound coupled coolant hydraulic + thermal network screen (CHT-style).

INTENT: Advance beyond isolated duct Δp screens and the lumped three-node
thermal model by coupling OpenFOAM jacket/cold-plate pressure drops, kit coolant
duty (60 °C / 12 L/min), winding + module losses, and convection resistances
derived from channel Re/Nu into one revision-bound screen with explicit
temperature and pressure margins.

This is still analytical — not conjugate heat transfer, not flow-bench
correlated. Status stays PARTIAL; ship_ok is permanently false.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence

import ijson

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_LIB = REPO_ROOT / "scripts" / "lib"
if str(SCRIPTS_LIB) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_LIB))

from fpk_physics_engines import (  # noqa: E402
    coolprop_egw_props,
    ht_nusselt_tube,
)

DEFAULT_TWIN = REPO_ROOT / "out" / "formula-e-front-mgu-20260729-1432"
SCHEMA = "forgeos.motor_stack.analytical_fia_cooling_network_screen/v1"

# Screening pump head when twin does not pin a kit manifold budget.
DEFAULT_PUMP_PRESSURE_BUDGET_KPA = 150.0

# Solid-path area-normalised resistances (K·m²/W). Documented screening seeds.
# DECISION: ~0.1 mm grease/solder TIM at k≈1 W/mK → 1e-4 K·m²/W — not the
# lumped 0.05 K/W magnet-path constant (that unit was wrongly copied here).
DEFAULT_JACKET_WALL_R_M2K_PER_W = 0.00012
DEFAULT_TIM_R_M2K_PER_W = 0.0001
DEFAULT_MAGNET_TO_WINDING_K_PER_W = 0.05
# Lumped-screen-compatible junction→coolant ceiling (motor:thermal-lumped seed).
DEFAULT_MODULE_TO_COOLANT_K_PER_W = 0.01

DEFAULT_WINDING_LIMIT_C = 180.0
DEFAULT_MAGNET_LIMIT_C = 150.0
DEFAULT_MODULE_LIMIT_C = 175.0

# Module wetted footprint per SiC device for cold-plate convection area seed.
DEFAULT_MODULE_FOOTPRINT_MM2 = 45_000.0
DEFAULT_SIC_MODULE_COUNT = 6


class FiaCoolingNetworkScreenError(RuntimeError):
    """Raised when twin binding or the coupled network model is invalid."""


@dataclass(frozen=True)
class LossInputs:
    """Motor and inverter heat rejection at the kit screening point."""

    copper_loss_w: float
    iron_loss_w: float
    magnet_loss_w: float
    inverter_loss_w: float
    coolant_flow_l_min: float
    coolant_inlet_c: float
    pump_pressure_budget_kpa: float
    winding_limit_c: float
    magnet_limit_c: float
    module_limit_c: float
    sic_module_count: int
    module_footprint_mm2: float
    jacket_wall_r_m2k_per_w: float
    tim_r_m2k_per_w: float
    magnet_to_winding_k_per_w: float
    module_to_coolant_k_per_w: float
    # Two-source LPTN screening constants — see the note at the winding node.
    slot_to_iron_k_per_w: float = 0.006
    iron_to_jacket_k_per_w: float = 0.0077


@dataclass(frozen=True)
class BranchHydraulics:
    """One coolant branch pressure-drop evidence bundle."""

    branch_id: str
    headline_delta_p_pa: float
    reynolds_number: float
    hydraulic_diameter_m: float
    developed_length_m: float
    channel_width_m: float
    channel_depth_m: float
    inlet_velocity_m_s: float | None
    artefact_ref: str
    pass_count: int | None = None


@dataclass(frozen=True)
class HydraulicResults:
    """Series coolant path pressure screen at kit flow."""

    topology: str
    coolant_flow_l_min: float
    coolant_inlet_c: float
    jacket_delta_p_pa: float
    cold_plate_delta_p_pa: float
    total_delta_p_pa: float
    total_delta_p_kpa: float
    pump_pressure_budget_kpa: float
    pressure_margin_kpa: float
    pressure_margin_ratio: float
    pressure_screen_ok: bool


@dataclass(frozen=True)
class ConvectionBranch:
    """Internal-flow convection resistance for one branch."""

    branch_id: str
    reynolds_number: float
    nusselt: float
    h_conv_w_m2k: float
    wetted_area_m2: float
    r_conv_k_per_w: float
    correlation: str


@dataclass(frozen=True)
class ThermalResults:
    """Coupled steady thermal network at kit coolant point."""

    coolant_jacket_outlet_c: float
    coolant_cold_plate_outlet_c: float
    coolant_bulk_jacket_c: float
    coolant_bulk_cold_plate_c: float
    winding_temperature_c: float
    magnet_temperature_c: float
    module_temperature_c: float
    winding_margin_c: float
    magnet_margin_c: float
    module_margin_c: float
    winding_margin_pct: float
    magnet_margin_pct: float
    module_margin_pct: float
    winding_below_limit: bool
    magnet_below_limit: bool
    module_below_limit: bool
    all_temperatures_below_limits: bool
    jacket_convection: ConvectionBranch
    cold_plate_convection: ConvectionBranch


@dataclass(frozen=True)
class NetworkResults:
    """Combined hydraulic + thermal coupled screen."""

    hydraulic: HydraulicResults
    thermal: ThermalResults
    motor_loss_w: float
    total_loss_w: float


def _raw_number(values: Mapping[str, Any], keys: Sequence[str]) -> float | None:
    for key in keys:
        raw = values.get(key)
        if isinstance(raw, Mapping):
            raw = raw.get("value")
        try:
            value = float(raw)
        except (TypeError, ValueError):
            continue
        if math.isfinite(value):
            return value
    return None


def _required_positive(values: Mapping[str, Any], keys: Sequence[str]) -> float:
    value = _raw_number(values, keys)
    if value is None or value <= 0.0:
        raise FiaCoolingNetworkScreenError(
            "Missing positive twin quantity; expected one of: " + ", ".join(keys)
        )
    return value


def _nonnegative(
    values: Mapping[str, Any],
    keys: Sequence[str],
    *,
    default: float = 0.0,
) -> float:
    value = _raw_number(values, keys)
    if value is None:
        return default
    if value < 0.0:
        raise FiaCoolingNetworkScreenError(
            "Loss quantity must be non-negative: " + ", ".join(keys)
        )
    return value


def _positive_or_default(
    values: Mapping[str, Any],
    keys: Sequence[str],
    default: float,
) -> float:
    value = _raw_number(values, keys)
    return value if value is not None and value > 0.0 else default


def loss_inputs_from_quantities(quantities: Mapping[str, Any]) -> LossInputs:
    """Build loss and limit inputs from orchestratorContract quantities."""

    inverter_kw = _required_positive(
        quantities, ("inverter_dissipated_kw", "total_inverter_loss_kw")
    )
    module_count = int(
        round(
            _positive_or_default(
                quantities,
                ("sic_module_count", "fpk_sic_module_count"),
                float(DEFAULT_SIC_MODULE_COUNT),
            )
        )
    )
    return LossInputs(
        copper_loss_w=_required_positive(
            quantities, ("mgu_copper_loss_w", "copper_loss_w")
        ),
        iron_loss_w=_nonnegative(quantities, ("mgu_iron_loss_w", "iron_loss_w")),
        magnet_loss_w=_nonnegative(
            quantities, ("mgu_magnet_loss_w", "magnet_loss_w")
        ),
        inverter_loss_w=inverter_kw * 1000.0,
        coolant_flow_l_min=_required_positive(
            quantities, ("coolant_flow_l_min",)
        ),
        coolant_inlet_c=_required_positive(
            quantities, ("coolant_inlet_c", "assumed_coolant_inlet_c")
        ),
        pump_pressure_budget_kpa=_positive_or_default(
            quantities,
            (
                "coolant_pump_pressure_budget_kpa",
                "kit_coolant_pressure_budget_kpa",
            ),
            DEFAULT_PUMP_PRESSURE_BUDGET_KPA,
        ),
        winding_limit_c=_positive_or_default(
            quantities,
            ("winding_temperature_limit_c", "maximum_winding_temperature_limit_c"),
            DEFAULT_WINDING_LIMIT_C,
        ),
        magnet_limit_c=_positive_or_default(
            quantities,
            ("magnet_temperature_limit_c", "maximum_magnet_temperature_limit_c"),
            DEFAULT_MAGNET_LIMIT_C,
        ),
        module_limit_c=_positive_or_default(
            quantities,
            ("module_temperature_limit_c", "maximum_module_temperature_limit_c"),
            DEFAULT_MODULE_LIMIT_C,
        ),
        sic_module_count=max(module_count, 1),
        module_footprint_mm2=_positive_or_default(
            quantities,
            ("sic_module_footprint_mm2", "fpk_sic_module_footprint_mm2"),
            DEFAULT_MODULE_FOOTPRINT_MM2,
        ),
        jacket_wall_r_m2k_per_w=_positive_or_default(
            quantities,
            ("thermal_resistance_jacket_wall_m2k_per_w",),
            DEFAULT_JACKET_WALL_R_M2K_PER_W,
        ),
        tim_r_m2k_per_w=_positive_or_default(
            quantities,
            ("thermal_resistance_tim_m2k_per_w",),
            DEFAULT_TIM_R_M2K_PER_W,
        ),
        magnet_to_winding_k_per_w=_positive_or_default(
            quantities,
            ("thermal_resistance_magnet_to_winding_k_per_w",),
            DEFAULT_MAGNET_TO_WINDING_K_PER_W,
        ),
        slot_to_iron_k_per_w=_positive_or_default(
            quantities, ("thermal_resistance_slot_to_iron_k_per_w",), 0.006),
        iron_to_jacket_k_per_w=_positive_or_default(
            quantities, ("thermal_resistance_iron_to_jacket_k_per_w",), 0.0077),
        module_to_coolant_k_per_w=_positive_or_default(
            quantities,
            (
                "thermal_resistance_module_to_coolant_k_per_w",
                "inverter_module_to_coolant_k_per_w",
            ),
            DEFAULT_MODULE_TO_COOLANT_K_PER_W,
        ),
    )


def _rect_hydraulic_diameter(width_m: float, depth_m: float) -> float:
    if width_m <= 0.0 or depth_m <= 0.0:
        raise FiaCoolingNetworkScreenError("Channel width and depth must be positive")
    return 2.0 * width_m * depth_m / (width_m + depth_m)


def _wetted_area_rect(width_m: float, depth_m: float, length_m: float) -> float:
    return 2.0 * (width_m + depth_m) * length_m


def _area_normalized_k_per_w(r_m2k_per_w: float, area_m2: float) -> float:
    """Convert K·m²/W interface resistance to K/W for contact area."""

    if area_m2 <= 0.0:
        raise FiaCoolingNetworkScreenError("Contact area must be positive")
    return r_m2k_per_w / area_m2


def _series_cold_plate_reynolds(branch: BranchHydraulics) -> float:
    """Scale OF per-pass Re to series serpentine full-flow Re.

    GOTCHA: openfoam_fia_cold_plate_case divides kit flow by pass_count for the
    rectangular-duct velocity screen. The kit cold plate is a series serpentine,
    so convection must use the full 12 L/min through each channel segment.
    """

    if branch.branch_id != "inverter_cold_plate":
        return branch.reynolds_number
    pass_count = branch.pass_count if branch.pass_count and branch.pass_count > 0 else 1
    return branch.reynolds_number * float(pass_count)


def branch_from_openfoam_artefact(
    artefact: Mapping[str, Any],
    *,
    branch_id: str,
    artefact_ref: str,
    length_key: str,
    length_fallback_keys: Sequence[str] = (),
) -> BranchHydraulics:
    """Extract branch hydraulics from a twin-bound OpenFOAM duct screen artefact."""

    pressure = artefact.get("pressure_drop")
    if not isinstance(pressure, Mapping):
        raise FiaCoolingNetworkScreenError(
            f"{branch_id}: missing pressure_drop in {artefact_ref}"
        )
    headline = pressure.get("headline_delta_p_pa")
    if not isinstance(headline, (int, float)) or float(headline) <= 0.0:
        raise FiaCoolingNetworkScreenError(
            f"{branch_id}: non-positive headline_delta_p_pa in {artefact_ref}"
        )
    channel = artefact.get("channel_geometry")
    if not isinstance(channel, Mapping):
        raise FiaCoolingNetworkScreenError(
            f"{branch_id}: missing channel_geometry in {artefact_ref}"
        )
    width_m = float(channel.get("channel_width_m") or 0.0)
    depth_m = float(channel.get("channel_depth_m") or 0.0)
    reynolds = float(channel.get("reynolds_number") or 0.0)
    if width_m <= 0.0 or depth_m <= 0.0 or reynolds <= 0.0:
        raise FiaCoolingNetworkScreenError(
            f"{branch_id}: incomplete channel geometry in {artefact_ref}"
        )
    length_m = float(channel.get(length_key) or 0.0)
    if length_m <= 0.0:
        for key in length_fallback_keys:
            length_m = float(channel.get(key) or 0.0)
            if length_m > 0.0:
                break
    if length_m <= 0.0:
        est = channel.get("estimated_full_path_length_m")
        if isinstance(est, (int, float)) and float(est) > 0.0:
            length_m = float(est)
    if length_m <= 0.0:
        raise FiaCoolingNetworkScreenError(
            f"{branch_id}: could not resolve developed length from {artefact_ref}"
        )
    velocity = channel.get("inlet_velocity_m_s")
    inlet_velocity = float(velocity) if isinstance(velocity, (int, float)) else None
    pass_raw = channel.get("pass_count")
    pass_count = (
        int(pass_raw)
        if isinstance(pass_raw, (int, float)) and int(pass_raw) > 0
        else None
    )
    return BranchHydraulics(
        branch_id=branch_id,
        headline_delta_p_pa=float(headline),
        reynolds_number=reynolds,
        hydraulic_diameter_m=_rect_hydraulic_diameter(width_m, depth_m),
        developed_length_m=length_m,
        channel_width_m=width_m,
        channel_depth_m=depth_m,
        inlet_velocity_m_s=inlet_velocity,
        artefact_ref=artefact_ref,
        pass_count=pass_count,
    )


def solve_hydraulic_series(
    losses: LossInputs,
    jacket: BranchHydraulics,
    cold_plate: BranchHydraulics,
) -> HydraulicResults:
    """Series coolant path: same mdot through jacket then cold plate."""

    total_pa = jacket.headline_delta_p_pa + cold_plate.headline_delta_p_pa
    budget_pa = losses.pump_pressure_budget_kpa * 1000.0
    margin_pa = budget_pa - total_pa
    margin_ratio = margin_pa / budget_pa if budget_pa > 0.0 else -1.0
    return HydraulicResults(
        topology="series_jacket_then_cold_plate",
        coolant_flow_l_min=losses.coolant_flow_l_min,
        coolant_inlet_c=losses.coolant_inlet_c,
        jacket_delta_p_pa=round(jacket.headline_delta_p_pa, 3),
        cold_plate_delta_p_pa=round(cold_plate.headline_delta_p_pa, 3),
        total_delta_p_pa=round(total_pa, 3),
        total_delta_p_kpa=round(total_pa / 1000.0, 4),
        pump_pressure_budget_kpa=losses.pump_pressure_budget_kpa,
        pressure_margin_kpa=round(margin_pa / 1000.0, 4),
        pressure_margin_ratio=round(margin_ratio, 4),
        pressure_screen_ok=margin_pa > 0.0,
    )


def _convection_branch(
    branch: BranchHydraulics,
    *,
    inlet_c: float,
    wetted_area_m2: float,
    reynolds_number: float | None = None,
) -> ConvectionBranch:
    """Derive h and R_conv from branch Re and CoolProp/ht correlations."""

    props = coolprop_egw_props(inlet_c)
    pr = props.get("prandtl")
    if not pr:
        pr = (
            float(props["cp_j_kgk"])
            * float(props["viscosity_pa_s"])
            / float(props["conductivity_w_mk"])
        )
    re = float(reynolds_number if reynolds_number is not None else branch.reynolds_number)
    conv = ht_nusselt_tube(
        reynolds=re,
        prandtl=float(pr),
        diameter_m=branch.hydraulic_diameter_m,
        length_m=branch.developed_length_m,
        conductivity_w_mk=float(props["conductivity_w_mk"]),
    )
    h = float(conv["h_conv_w_m2k"])
    if h <= 0.0 or wetted_area_m2 <= 0.0:
        raise FiaCoolingNetworkScreenError(
            f"{branch.branch_id}: non-positive convection conductance"
        )
    r_conv = 1.0 / (h * wetted_area_m2)
    return ConvectionBranch(
        branch_id=branch.branch_id,
        reynolds_number=round(branch.reynolds_number, 2),
        nusselt=round(float(conv["nusselt"]), 3),
        h_conv_w_m2k=round(h, 2),
        wetted_area_m2=round(wetted_area_m2, 5),
        r_conv_k_per_w=round(r_conv, 6),
        correlation=str(conv.get("correlation") or conv.get("engine") or "unknown"),
    )


def solve_thermal_network(
    losses: LossInputs,
    jacket: BranchHydraulics,
    cold_plate: BranchHydraulics,
    *,
    hydraulic: HydraulicResults,
) -> ThermalResults:
    """Coupled steady thermal network with series coolant temperature rise."""

    props = coolprop_egw_props(losses.coolant_inlet_c)
    rho = float(props["density_kg_m3"])
    cp = float(props["cp_j_kgk"])
    mdot = (losses.coolant_flow_l_min / 60.0 / 1000.0) * rho
    if mdot <= 0.0 or cp <= 0.0:
        raise FiaCoolingNetworkScreenError("Coolant mdot and cp must be positive")

    motor_loss = losses.copper_loss_w + losses.iron_loss_w + losses.magnet_loss_w
    winding_loss = losses.copper_loss_w + losses.iron_loss_w

    jacket_area = _wetted_area_rect(
        jacket.channel_width_m,
        jacket.channel_depth_m,
        jacket.developed_length_m,
    )
    cold_length = cold_plate.developed_length_m
    cold_area_channel = _wetted_area_rect(
        cold_plate.channel_width_m,
        cold_plate.channel_depth_m,
        cold_length,
    )
    module_area_m2 = (
        losses.sic_module_count * losses.module_footprint_mm2 / 1_000_000.0
    )
    if module_area_m2 <= 0.0:
        raise FiaCoolingNetworkScreenError("Module contact area must be positive")

    jacket_conv = _convection_branch(
        jacket,
        inlet_c=losses.coolant_inlet_c,
        wetted_area_m2=jacket_area,
    )
    cold_in = losses.coolant_inlet_c
    jacket_rise = motor_loss / (mdot * cp)
    jacket_out = cold_in + jacket_rise
    bulk_jacket = cold_in + 0.5 * jacket_rise

    cold_re = _series_cold_plate_reynolds(cold_plate)
    cold_conv = _convection_branch(
        cold_plate,
        inlet_c=jacket_out,
        wetted_area_m2=cold_area_channel,
        reynolds_number=cold_re,
    )
    cold_rise = losses.inverter_loss_w / (mdot * cp)
    cold_out = jacket_out + cold_rise
    bulk_cold = jacket_out + 0.5 * cold_rise

    r_jacket_wall = _area_normalized_k_per_w(
        losses.jacket_wall_r_m2k_per_w, jacket_area
    )
    r_tim = _area_normalized_k_per_w(losses.tim_r_m2k_per_w, module_area_m2)
    # ⭐ SAME DEFECT, INVERTER SIDE. The junction path was film + TIM only, which
    # omits everything INSIDE the module — die attach, substrate, baseplate — and
    # the cold-plate wall. Those dominate a SiC stack exactly as the slot
    # insulation dominates the stator. It left the module 42.8 K below the lumped
    # screen after the stator paths were reconciled to 0.1 K.
    # `module_to_coolant_k_per_w` is the SAME screening constant the lumped screen
    # already uses, so the two models now share one value rather than each
    # carrying a different partial chain. Junction-to-coolant for a SiC stack on a
    # cold plate is a datasheet R_th(j-c) plus the mounting stack — Bar B (B4
    # supplier data / B6 flow bench) closes it properly.
    r_module_junction = max(
        cold_conv.r_conv_k_per_w + r_tim, losses.module_to_coolant_k_per_w)

    # ⭐⭐ TWO SOURCES, TWO NODES (2026-08-03). This line used to read
    #     winding_t = bulk_jacket + winding_loss * (r_conv + r_jacket_wall)
    # which is wrong twice over:
    #   (a) it puts the ENTIRE motor loss on the winding node, but iron loss is
    #       generated IN THE IRON and never crosses the slot insulation; and
    #   (b) its only resistances are the coolant-side FILM and the jacket wall —
    #       no slot liner, no impregnation, no stator-iron conduction. Those
    #       dominate: the film is ~1.6% of the real path (see
    #       scripts/lib/stator_thermal_chain.py).
    # The result was a winding temperature 76 K BELOW the lumped screen's, on the
    # same twin with identical losses, reported as coupled_screen_ok TRUE while
    # the lumped screen showed the magnets in breach. Two screens of one machine
    # cannot disagree by 76 K and both be shipped.
    #
    # Correct structure: iron loss enters at the IRON node, copper at the WINDING
    # node one resistance further out.
    #     T_iron    = T_coolant + (Q_cu + Q_fe) * R_iron_to_coolant
    #     T_winding = T_iron    +  Q_cu         * R_slot
    #
    # ⚠ R_slot and R_iron_to_jacket are SCREENING CONSTANTS, not derived values.
    # A derived chain needs slot fill fraction, impregnation type and a measured
    # interface conductance, none of which this twin carries; an attempt to derive
    # them (stator_thermal_chain.py) lands outside the physical band and REFUSES
    # to publish a number rather than guess. These defaults are set so the coupled
    # model reproduces the lumped screen's calibrated total (~0.010 K/W
    # winding-to-coolant) with the CORRECT structure — they remove a duplicate
    # wrong model, they do not invent a new answer. Both are overridable from the
    # contract, and closing them properly is Bar B (flow bench, B6).
    r_slot = losses.slot_to_iron_k_per_w
    r_iron_extra = losses.iron_to_jacket_k_per_w
    r_iron_to_coolant = jacket_conv.r_conv_k_per_w + r_jacket_wall + r_iron_extra
    iron_t = bulk_jacket + winding_loss * r_iron_to_coolant
    winding_t = iron_t + losses.copper_loss_w * r_slot
    magnet_t = winding_t + losses.magnet_loss_w * losses.magnet_to_winding_k_per_w
    module_t = bulk_cold + losses.inverter_loss_w * r_module_junction

    winding_margin = losses.winding_limit_c - winding_t
    magnet_margin = losses.magnet_limit_c - magnet_t
    module_margin = losses.module_limit_c - module_t

    def _margin_pct(margin_c: float, limit_c: float) -> float:
        return 100.0 * margin_c / limit_c if limit_c > 0.0 else 0.0

    winding_ok = winding_t <= losses.winding_limit_c
    magnet_ok = magnet_t <= losses.magnet_limit_c
    module_ok = module_t <= losses.module_limit_c

    return ThermalResults(
        coolant_jacket_outlet_c=round(jacket_out, 3),
        coolant_cold_plate_outlet_c=round(cold_out, 3),
        coolant_bulk_jacket_c=round(bulk_jacket, 3),
        coolant_bulk_cold_plate_c=round(bulk_cold, 3),
        winding_temperature_c=round(winding_t, 3),
        magnet_temperature_c=round(magnet_t, 3),
        module_temperature_c=round(module_t, 3),
        winding_margin_c=round(winding_margin, 3),
        magnet_margin_c=round(magnet_margin, 3),
        module_margin_c=round(module_margin, 3),
        winding_margin_pct=round(_margin_pct(winding_margin, losses.winding_limit_c), 2),
        magnet_margin_pct=round(_margin_pct(magnet_margin, losses.magnet_limit_c), 2),
        module_margin_pct=round(_margin_pct(module_margin, losses.module_limit_c), 2),
        winding_below_limit=winding_ok,
        magnet_below_limit=magnet_ok,
        module_below_limit=module_ok,
        all_temperatures_below_limits=winding_ok and magnet_ok and module_ok,
        jacket_convection=jacket_conv,
        cold_plate_convection=cold_conv,
    )


def run_network_screen(
    losses: LossInputs,
    jacket: BranchHydraulics,
    cold_plate: BranchHydraulics,
) -> NetworkResults:
    """Solve the coupled hydraulic + thermal network."""

    hydraulic = solve_hydraulic_series(losses, jacket, cold_plate)
    thermal = solve_thermal_network(
        losses, jacket, cold_plate, hydraulic=hydraulic
    )
    motor_loss = losses.copper_loss_w + losses.iron_loss_w + losses.magnet_loss_w
    return NetworkResults(
        hydraulic=hydraulic,
        thermal=thermal,
        motor_loss_w=round(motor_loss, 3),
        total_loss_w=round(motor_loss + losses.inverter_loss_w, 3),
    )


def _read_section(state_path: Path, prefix: str) -> Mapping[str, Any]:
    with state_path.open("rb") as handle:
        section = next(ijson.items(handle, prefix), None)
    return section if isinstance(section, Mapping) else {}


def _stream_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _load_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise FiaCoolingNetworkScreenError(f"Missing artefact: {path}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise FiaCoolingNetworkScreenError(f"Invalid JSON object: {path}")
    return payload


def load_twin_binding(
    twin_dir: Path,
) -> tuple[LossInputs, BranchHydraulics, BranchHydraulics, str, dict[str, str]]:
    """Load quantities + upstream OpenFOAM artefacts from one twin directory."""

    state_path = twin_dir / "state.json"
    stack = twin_dir / "_motor_stack"
    jacket_path = stack / "openfoam_fia_water_jacket_case.json"
    cold_path = stack / "openfoam_fia_cold_plate_case.json"

    if not state_path.is_file():
        raise FiaCoolingNetworkScreenError(f"Twin state not found: {state_path}")

    last_error = "Twin state changed during selective-read attempts"
    for attempt in range(5):
        before = state_path.stat()
        quantities = _read_section(state_path, "orchestratorContract.quantities")
        if not quantities:
            quantities = _read_section(state_path, "engineeringContract.quantities")
        state_hash = _stream_sha256(state_path)
        after = state_path.stat()
        if (
            before.st_size == after.st_size
            and before.st_mtime_ns == after.st_mtime_ns
        ):
            losses = loss_inputs_from_quantities(quantities)
            jacket_art = _load_json(jacket_path)
            cold_art = _load_json(cold_path)
            jacket_ref = str(jacket_path.relative_to(twin_dir))
            cold_ref = str(cold_path.relative_to(twin_dir))
            jacket = branch_from_openfoam_artefact(
                jacket_art,
                branch_id="motor_water_jacket",
                artefact_ref=jacket_ref,
                length_key="estimated_full_path_length_m",
                length_fallback_keys=("duct_length_m",),
            )
            cold = branch_from_openfoam_artefact(
                cold_art,
                branch_id="inverter_cold_plate",
                artefact_ref=cold_ref,
                length_key="estimated_full_path_length_m",
                length_fallback_keys=("pass_length_m",),
            )
            upstream = {
                "water_jacket": jacket_ref,
                "cold_plate": cold_ref,
                "water_jacket_input_hash": str(
                    jacket_art.get("input_quantities_sha256") or ""
                ),
                "cold_plate_input_hash": str(
                    cold_art.get("input_quantities_sha256") or ""
                ),
            }
            return losses, jacket, cold, state_hash, upstream
        last_error = (
            f"Twin state changed during selective-read attempt {attempt + 1}/5"
        )
        time.sleep(0.25 * (attempt + 1))
    raise FiaCoolingNetworkScreenError(f"{last_error}; rerun on a stable stamp")


def input_binding_sha256(
    losses: LossInputs,
    jacket: BranchHydraulics,
    cold_plate: BranchHydraulics,
    upstream: Mapping[str, str],
) -> str:
    payload = {
        "losses": asdict(losses),
        "jacket": asdict(jacket),
        "cold_plate": asdict(cold_plate),
        "upstream_hashes": dict(upstream),
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode(
        "utf-8"
    )
    return hashlib.sha256(encoded).hexdigest()


def build_artifact(
    *,
    losses: LossInputs,
    jacket: BranchHydraulics,
    cold_plate: BranchHydraulics,
    results: NetworkResults,
    source_state_sha256: str,
    source_twin: str,
    upstream: Mapping[str, str],
) -> dict[str, Any]:
    """Build the permanently non-release coupled network screen artefact."""

    hydraulic = asdict(results.hydraulic)
    thermal = asdict(results.thermal)
    screen_ok = (
        results.hydraulic.pressure_screen_ok
        and results.thermal.all_temperatures_below_limits
    )
    return {
        "schema": SCHEMA,
        "status": "PARTIAL",
        "ship_ok": False,
        "source_twin": source_twin,
        "source_state_sha256": source_state_sha256,
        "input_binding_sha256": input_binding_sha256(
            losses, jacket, cold_plate, upstream
        ),
        "input_quantities": asdict(losses),
        "upstream_artefacts": dict(upstream),
        "branch_hydraulics": {
            "motor_water_jacket": asdict(jacket),
            "inverter_cold_plate": asdict(cold_plate),
        },
        "hydraulic_network": hydraulic,
        "thermal_network": thermal,
        "screening_results": {
            "motor_loss_w": results.motor_loss_w,
            "total_loss_w": results.total_loss_w,
            "pressure_screen_ok": results.hydraulic.pressure_screen_ok,
            "temperature_screen_ok": results.thermal.all_temperatures_below_limits,
            "coupled_screen_ok": screen_ok,
            "maximum_winding_temperature_c": results.thermal.winding_temperature_c,
            "maximum_magnet_temperature_c": results.thermal.magnet_temperature_c,
            "maximum_module_temperature_c": results.thermal.module_temperature_c,
            "total_delta_p_kpa": results.hydraulic.total_delta_p_kpa,
            "pressure_margin_kpa": results.hydraulic.pressure_margin_kpa,
        },
        "margins": {
            "winding_margin_c": results.thermal.winding_margin_c,
            "magnet_margin_c": results.thermal.magnet_margin_c,
            "module_margin_c": results.thermal.module_margin_c,
            "winding_margin_pct": results.thermal.winding_margin_pct,
            "magnet_margin_pct": results.thermal.magnet_margin_pct,
            "module_margin_pct": results.thermal.module_margin_pct,
            "pressure_margin_kpa": results.hydraulic.pressure_margin_kpa,
            "pressure_margin_ratio": results.hydraulic.pressure_margin_ratio,
            "limits_are_release_authority": False,
        },
        "model": {
            "name": "series_hydraulic_parallel_convection_thermal_network",
            "evidence_class": "analytical_cht_style_screen",
            "coolant_topology": "series_jacket_then_cold_plate",
            "pressure_basis": (
                "OpenFOAM headline_delta_p_pa per branch summed at kit flow"
            ),
            "convection_basis": (
                "CoolProp fluid props + ht/fluids Nu correlation at branch Re "
                "from OpenFOAM duct screens"
            ),
            "solid_resistance_basis": (
                "area-normalised TIM + jacket wall (K·m²/W ÷ contact area); "
                "module_to_coolant_k_per_w seed kept for lumped-screen parity"
            ),
        },
        "conjugate_heat_transfer": {
            "status": "OPEN",
            "statement": (
                "No solid/fluid conjugate mesh, TIM map, or transient lap duty."
            ),
        },
        "flow_bench": {
            "status": "OPEN",
            "statement": (
                "No measured jacket/cold-plate pressure-flow or heater-plate "
                "temperature correlation."
            ),
        },
        "honesty_notes": [
            "PARTIAL couples duct Δp evidence to convection-limited temperatures.",
            "coupled_screen_ok is a screening margin only — not release PASS.",
            "CHT, flow-bench, and heater-plate correlation remain OPEN.",
        ],
        "release_statement": (
            "Concept evidence only. Never claim thermal or hydraulic release, "
            "FIA race readiness, or permission to ship from this network screen."
        ),
    }


def _atomic_write_json(path: Path, payload: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def _synthetic_openfoam_jacket() -> dict[str, Any]:
    return {
        "pressure_drop": {"headline_delta_p_pa": 18_500.0},
        "channel_geometry": {
            "channel_width_m": 0.008,
            "channel_depth_m": 0.0035,
            "helix_turns": 5.0,
            "estimated_full_path_length_m": 2.45,
            "inlet_velocity_m_s": 7.14,
            "reynolds_number": 72_000.0,
        },
    }


def _synthetic_openfoam_cold_plate() -> dict[str, Any]:
    return {
        "pressure_drop": {"headline_delta_p_pa": 24_921.0},
        "channel_geometry": {
            "channel_width_m": 0.005345,
            "channel_depth_m": 0.001336,
            "pass_count": 8,
            "estimated_full_path_length_m": 1.44,
            "pass_length_m": 0.18,
            "inlet_velocity_m_s": 3.5,
            "reynolds_number": 15_657.0,
        },
    }


def _synthetic_quantities() -> dict[str, Any]:
    return {
        "mgu_copper_loss_w": {"value": 2180.0},
        "mgu_iron_loss_w": {"value": 136.0},
        "mgu_magnet_loss_w": {"value": 120.0},
        "inverter_dissipated_kw": {"value": 4.318},
        "coolant_flow_l_min": {"value": 12.0},
        "coolant_inlet_c": {"value": 60.0},
        "sic_module_count": {"value": 6},
    }


def run_selftest() -> int:
    """ProveCatch: coupling, sensitivity, and permanent OPEN holds."""

    losses = loss_inputs_from_quantities(_synthetic_quantities())
    jacket = branch_from_openfoam_artefact(
        _synthetic_openfoam_jacket(),
        branch_id="motor_water_jacket",
        artefact_ref="synthetic/jacket.json",
        length_key="estimated_full_path_length_m",
    )
    cold = branch_from_openfoam_artefact(
        _synthetic_openfoam_cold_plate(),
        branch_id="inverter_cold_plate",
        artefact_ref="synthetic/cold.json",
        length_key="estimated_full_path_length_m",
    )
    results = run_network_screen(losses, jacket, cold)
    artifact = build_artifact(
        losses=losses,
        jacket=jacket,
        cold_plate=cold,
        results=results,
        source_state_sha256="synthetic-selftest",
        source_twin="synthetic-selftest",
        upstream={"water_jacket": "synthetic", "cold_plate": "synthetic"},
    )

    hot = loss_inputs_from_quantities(
        {
            **_synthetic_quantities(),
            "mgu_copper_loss_w": {"value": 12_000.0},
            "inverter_dissipated_kw": {"value": 12.0},
        }
    )
    hot_results = run_network_screen(hot, jacket, cold)

    tight_budget = loss_inputs_from_quantities(
        {
            **_synthetic_quantities(),
            "coolant_pump_pressure_budget_kpa": {"value": 30.0},
        }
    )
    tight_hyd = solve_hydraulic_series(tight_budget, jacket, cold)

    checks = {
        "delta_p_couples_openfoam_branches": (
            abs(
                results.hydraulic.total_delta_p_pa
                - (18_500.0 + 24_921.0)
            )
            < 1.0
        ),
        "convection_resistances_positive": (
            results.thermal.jacket_convection.r_conv_k_per_w > 0.0
            and results.thermal.cold_plate_convection.r_conv_k_per_w > 0.0
            and results.thermal.jacket_convection.h_conv_w_m2k > 0.0
        ),
        "series_coolant_rises_monotonic": (
            results.thermal.coolant_jacket_outlet_c
            > losses.coolant_inlet_c
            and results.thermal.coolant_cold_plate_outlet_c
            > results.thermal.coolant_jacket_outlet_c
        ),
        "higher_loss_raises_temperatures": (
            hot_results.thermal.winding_temperature_c
            > results.thermal.winding_temperature_c
            and hot_results.thermal.module_temperature_c
            > results.thermal.module_temperature_c
        ),
        "tight_pump_budget_fails_pressure_screen": (
            tight_hyd.pressure_screen_ok is False
        ),
        "margins_reported": all(
            math.isfinite(value)
            for value in (
                results.thermal.winding_margin_pct,
                results.thermal.module_margin_pct,
                results.hydraulic.pressure_margin_ratio,
            )
        ),
        "open_holds_block_shipping": (
            artifact["status"] == "PARTIAL"
            and artifact["ship_ok"] is False
            and artifact["conjugate_heat_transfer"]["status"] == "OPEN"
            and artifact["flow_bench"]["status"] == "OPEN"
        ),
        "coupled_screen_ok_not_release_authority": (
            artifact["margins"]["limits_are_release_authority"] is False
        ),
        "kit_duty_temperature_screen_passes": (
            results.thermal.all_temperatures_below_limits
            and results.hydraulic.pressure_screen_ok
        ),
        "coupled_screen_ok_at_kit_duty": (
            artifact["screening_results"]["coupled_screen_ok"] is True
        ),
    }
    passed = all(checks.values())
    print(
        json.dumps(
            {
                "status": "PASS" if passed else "FAIL",
                "checks": checks,
                "screening_results": artifact["screening_results"],
                "hydraulic_network": artifact["hydraulic_network"],
                "thermal_temperatures_c": {
                    "winding": results.thermal.winding_temperature_c,
                    "magnet": results.thermal.magnet_temperature_c,
                    "module": results.thermal.module_temperature_c,
                    "coolant_outlet": results.thermal.coolant_cold_plate_outlet_c,
                },
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0 if passed else 1


def run_live_case(twin_dir: Path, output_path: Path | None = None) -> int:
    """Run and persist the coupled network screen against one live twin."""

    losses, jacket, cold, state_hash, upstream = load_twin_binding(twin_dir)
    results = run_network_screen(losses, jacket, cold)
    try:
        twin_label = str(twin_dir.resolve().relative_to(REPO_ROOT))
    except ValueError:
        twin_label = str(twin_dir.resolve())
    artifact = build_artifact(
        losses=losses,
        jacket=jacket,
        cold_plate=cold,
        results=results,
        source_state_sha256=state_hash,
        source_twin=twin_label,
        upstream=upstream,
    )
    destination = (
        output_path
        if output_path is not None
        else twin_dir
        / "_motor_stack"
        / "analytical_fia_cooling_network_screen.json"
    )
    _atomic_write_json(destination, artifact)
    sr = artifact["screening_results"]
    print(
        "FIA front-kit coupled cooling network screen: "
        f"Δp={sr['total_delta_p_kpa']:.2f} kPa "
        f"(margin {artifact['margins']['pressure_margin_kpa']:.2f} kPa); "
        f"T_winding={sr['maximum_winding_temperature_c']:.1f} °C "
        f"({artifact['margins']['winding_margin_pct']:.1f}% headroom), "
        f"T_module={sr['maximum_module_temperature_c']:.1f} °C "
        f"({artifact['margins']['module_margin_pct']:.1f}% headroom); "
        f"coupled_screen_ok={sr['coupled_screen_ok']}. "
        "CHT OPEN; flow bench OPEN; status PARTIAL; ship_ok false."
    )
    print(f"Artefact: {destination}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Run the FIA-bound coupled hydraulic + thermal cooling network screen."
        )
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--selftest", action="store_true")
    mode.add_argument("--twin", type=Path, help="live twin directory")
    parser.add_argument("--output", type=Path, help="optional artefact path")
    args = parser.parse_args()
    if args.selftest:
        if args.output is not None:
            parser.error("--output is only valid with --twin")
        return run_selftest()
    if args.twin is None:
        parser.error("--twin is required unless --selftest")
    return run_live_case(args.twin.resolve(), args.output)


if __name__ == "__main__":
    raise SystemExit(main())
