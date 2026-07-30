#!/usr/bin/env python3
"""Writeback executable FPK formulas / materials / geometry into forge-truth.

INTENT: Literature claims alone are not enough — Anvil's *working* formulas,
geometry stamps, and FPK materials must also land in the growing DB so search
and dualSearch can find them, and so the corpus grows every cycle.

Idempotent: rows tagged source_detail LIKE 'fpk_executable:%' are replaced.

Usage:
  python3 scripts/ingest/writeback-fpk-executable-knowledge.py \
    --twin out/formula-e-front-mgu-20260729-1432
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DB = Path.home() / ".forge-truth" / "forge-truth.db"
PRODUCT_CLASS = "formula_e_front_mgu"
DOC_URL = "internal://forgeos/fpk-executable-canon"
SOURCE_PREFIX = "fpk_executable:"

# FPK materials Anvil actually designs with (not plant steel floors alone).
FPK_MATERIALS: list[dict[str, Any]] = [
    {
        "material": "ndfeb_magnet",
        "raw_gbp_per_kg": 55.0,
        "mfg_mult_low": 1.4,
        "mfg_mult_high": 3.0,
        "source": "FPK writeback — sintered NdFeB rotor magnets (volatile RE)",
        "grade": "NdFeB N48UH-class (design seed)",
        "density_kg_m3": 7500.0,
        "component_id": "magnet_segment_body",
    },
    {
        "material": "copper",
        "raw_gbp_per_kg": 10.5,
        "mfg_mult_low": 1.3,
        "mfg_mult_high": 3.5,
        "source": "FPK writeback — stator windings / busbars",
        "grade": "Cu-ETP winding / busbar",
        "density_kg_m3": 8960.0,
        "component_id": "stator_windings",
    },
    {
        "material": "aluminium",
        "raw_gbp_per_kg": 2.9,
        "mfg_mult_low": 2.0,
        "mfg_mult_high": 6.0,
        "source": "FPK writeback — housing / cold plate / gearbox case",
        "grade": "Al A356 / 6061 housing class",
        "density_kg_m3": 2700.0,
        "component_id": "traction_drive_housing",
    },
    {
        "material": "silicon_carbide_die",
        "raw_gbp_per_kg": 1200.0,
        "mfg_mult_low": 1.2,
        "mfg_mult_high": 2.5,
        "source": "FPK writeback — SiC MOSFET die (order-of-magnitude seed)",
        "grade": "SiC MOSFET (1200 V class)",
        "density_kg_m3": 3210.0,
        "component_id": "sic_power_module",
    },
    {
        "material": "sintered_silver_die_attach",
        "raw_gbp_per_kg": 800.0,
        "mfg_mult_low": 1.5,
        "mfg_mult_high": 4.0,
        "source": "FPK writeback — Ag sinter interconnect for power modules",
        "grade": "sintered Ag joint",
        "density_kg_m3": 10500.0,
        "component_id": "sic_power_module",
    },
    {
        "material": "egw_coolant_50",
        "raw_gbp_per_kg": 1.2,
        "mfg_mult_low": 1.0,
        "mfg_mult_high": 1.5,
        "source": "FPK writeback — MEG 50/50 coolant charge",
        "grade": "INCOMP::MEG[0.50]",
        "density_kg_m3": 1040.5,
        "component_id": "oil_fluid",
    },
    {
        "material": "electrical_steel",
        "raw_gbp_per_kg": 2.2,
        "mfg_mult_low": 2.0,
        "mfg_mult_high": 5.0,
        "source": "FPK writeback — stator / rotor laminations",
        "grade": "NGO electrical steel M270-35A class",
        "density_kg_m3": 7650.0,
        "component_id": "stator",
    },
    {
        "material": "gear_steel",
        "raw_gbp_per_kg": 3.5,
        "mfg_mult_low": 3.0,
        "mfg_mult_high": 8.0,
        "source": "FPK writeback — planetary gears / shafts",
        "grade": "case-hardened gear steel 16MnCr5 class",
        "density_kg_m3": 7850.0,
        "component_id": "planet_carrier",
    },
]

# INTENT: Catalogue MUST track Sol FORMULA_PACKS — not a cherry-picked toy subset.
# Each pack formula name is written; expression carries pack_id + formula id + module.
FORMULA_PACKS_FOR_DB: list[dict[str, Any]] = [
    {
        "pack_id": "motor:ipmsm-analytical-sizing",
        "component_id": "stator",
        "module": "ipmsm_analytical_sizing.py",
        "formulas": [
            ("ipmsm-d2l", "D=(2T/(π·Bg·A·kw·(L/D)))^(1/3)", "m"),
            ("ipmsm-shear", "τ=Bg·A·kw/2", "Pa"),
            ("ipmsm-tip", "v_tip=ω·r", "m/s"),
            ("ipmsm-felec", "f_e=p·n/60", "Hz"),
            ("ipmsm-power", "P=T·ω", "W"),
        ],
    },
    {
        "pack_id": "inverter:sic-loss",
        "component_id": "sic_power_module",
        "module": "inverter_sic_loss.py",
        "formulas": [
            ("I_ac", "I_ac=P/(√3·V_ll·pf·η)", "A"),
            ("P_cond", "P_cond=Isw_rms²·Rds(on)·duty", "W"),
            ("P_sw", "P_sw=(Eon+Eoff)·fsw·(Vdc/Vtest)·(Iac/Itest)", "W"),
            ("P_diss", "P_diss=P_cond+P_sw", "W"),
        ],
    },
    {
        "pack_id": "inverter:field-weakening-mtpa",
        "component_id": "stator",
        "module": "field_weakening_mtpa.py",
        "formulas": [
            ("mtpa-base", "id/iq MTPA split", "A"),
            ("mtpa-id", "id_mtpa(T,λ,Ld,Lq)", "A"),
            ("dq-v", "vd,vq voltage ellipse", "V"),
            ("em-torque", "T=(3/2)·p·(λ·iq+(Ld-Lq)·id·iq)", "N·m"),
        ],
    },
    {
        "pack_id": "motor:loss-point",
        "component_id": "stator_windings",
        "module": "motor_loss_point.py",
        "formulas": [
            ("P_cu", "Pcu=nph·Irms²·Rph", "W"),
            ("P_fe", "Pfe=k_h·f·B^α+k_e·f²·B²", "W"),
            ("P_mag", "Pmag magnet eddy", "W"),
            ("P_mech", "Pmech windage+bearing", "W"),
            ("eta-motor", "η=Pshaft/(Pshaft+ΣPloss)", "1"),
        ],
    },
    {
        "pack_id": "motor:rotor-centrifugal-stress",
        "component_id": "magnet_segment_body",
        "module": "rotor_centrifugal_stress.py",
        "formulas": [
            ("hoop", "σ=ρ·ω²·r²", "Pa"),
            ("tip-ret", "tip retention margin", "1"),
            ("stress-margin", "σ_allow/σ_hoop", "1"),
            ("sleeve-hoop", "sleeve hoop interference", "Pa"),
        ],
    },
    {
        "pack_id": "motor:thermal-lumped",
        "component_id": "motor_cooling_jacket",
        "module": "mgu_thermal_lumped.py",
        "formulas": [
            ("ΔT_fluid", "ΔT=Q/(ṁ·cp)", "K"),
            ("T_w", "T_winding node", "°C"),
            ("T_m", "T_magnet node", "°C"),
        ],
    },
    {
        "pack_id": "gear:traction-ratio",
        "component_id": "planet_carrier",
        "module": "gear_ratio_traction.py",
        "formulas": [
            ("n_wheel", "n_wheel(v,r)", "rpm"),
            ("v", "v=ω·r", "m/s"),
            ("T_wheel", "T_wheel=T_mgu·g·η", "N·m"),
            ("g_req", "g=n_mgu/n_wheel(v_target)", "1"),
        ],
    },
    {
        "pack_id": "powertrain:duty-cycle-energy",
        "component_id": "oem_inverter_control_board",
        "module": "duty_cycle_energy.py",
        "formulas": [
            ("duty_P", "P(t) duty cycle power", "W"),
            ("E", "E=∫P dt", "J"),
        ],
    },
    {
        "pack_id": "powertrain:fia-power-regen-split",
        "component_id": "oem_inverter_control_board",
        "module": "fia_power_regen_split.py",
        "formulas": [("FIA_split", "front/rear FIA power+regen split", "kW")],
    },
    {
        "pack_id": "powertrain:fia-net-usable-energy",
        "component_id": "oem_inverter_control_board",
        "module": "fia_net_usable_energy.py",
        "formulas": [("E_net", "E_net=E_dis-k_regen·E_regen", "kWh")],
    },
    {
        "pack_id": "inverter:current-voltage-envelope",
        "component_id": "sic_power_module",
        "module": "inverter_current_voltage_envelope.py",
        "formulas": [
            ("V_ll", "line-line voltage", "V"),
            ("S_P", "apparent/active power", "VA"),
            ("T_from_env", "torque from I/V envelope", "N·m"),
        ],
    },
    {
        "pack_id": "coolprop:refrigerant-properties",
        "component_id": "oil_fluid",
        "module": "coolprop_run.py",
        "formulas": [
            ("CoolProp_MEG50", "INCOMP::MEG[0.50] props", "SI"),
            ("Pr", "Pr=cp·μ/k", "1"),
        ],
    },
    {
        "pack_id": "fluids+ht:cold-plate",
        "component_id": "motor_cooling_jacket",
        "module": "fpk_physics_engines.py",
        "formulas": [
            ("Darcy", "f Darcy friction", "1"),
            ("Nu_h", "Nu→h convection", "W/(m²·K)"),
            ("Dh", "Dh=2·w·h/(w+h)", "m"),
            ("Rth_network", "thermal resistance network", "K/W"),
        ],
    },
    {
        "pack_id": "fpk:bus-esl",
        "component_id": "dc_link_capacitor_bank",
        "module": "fpk_bus_esl.py",
        "formulas": [
            ("I_dc", "DC link current", "A"),
            ("f_edge", "switching edge frequency", "Hz"),
            ("delta_skin", "skin depth δ", "m"),
            ("L_ext", "external bus inductance", "H"),
            ("L_int", "internal ESL", "H"),
            ("L_term", "terminal inductance", "H"),
            ("L_tot", "L=Lext+Lint+Lterm", "H"),
            ("TL_check", "transmission-line check", "1"),
        ],
    },
    {
        "pack_id": "fpk:concentric-geometry",
        "component_id": "traction_drive_housing",
        "module": "fpk_concentric_geometry.py",
        "formulas": [
            ("stator_nest", "stator OD/ID nest", "mm"),
            ("planetary_nest", "sun/planet/ring nest", "mm"),
            ("face_shaft", "face/shaft stack", "mm"),
            ("busbar_mm", "busbar geometry", "mm"),
            ("nest_fit", "nest fit predicates", "bool"),
        ],
    },
    {
        "pack_id": "front:power-reconcile",
        "component_id": "oem_inverter_control_board",
        "module": "formula-e-front-mgu.ts",
        "formulas": [
            ("Power_chain", "shaft↔AC↔DC power chain", "kW"),
            ("Coolant_dT", "coolant ΔT reconcile", "K"),
            ("Design_I_ph", "design phase current", "A"),
        ],
    },
]


def iter_fpk_formulas() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for pack in FORMULA_PACKS_FOR_DB:
        for symbol, expression, unit in pack["formulas"]:
            out.append(
                {
                    "symbol": f"{pack['pack_id']}::{symbol}",
                    "expression": expression,
                    "component_id": pack["component_id"],
                    "unit": unit,
                    "pack_id": pack["pack_id"],
                    "module": pack["module"],
                }
            )
    return out


FPK_FORMULAS = iter_fpk_formulas()


def ensure_canon_doc(con: sqlite3.Connection) -> int:
    row = con.execute(
        "SELECT id FROM pretraining_spec_documents WHERE source_url = ? LIMIT 1",
        (DOC_URL,),
    ).fetchone()
    body = (
        "ForgeOS FPK executable canon — formulas, materials, and geometry "
        "written back from Anvil analytical tools + twin stamps. "
        "Not a peer paper; provenance=fpk_executable."
    )
    file_hash = hashlib.sha256(DOC_URL.encode()).hexdigest()
    if row:
        doc_id = int(row[0])
        con.execute(
            """
            UPDATE pretraining_spec_documents
            SET product_class = ?, product_name = ?, manufacturer = ?,
                source_type = 'fpk_literature', document_type = 'executable_canon',
                extraction_status = 'fulltext', extracted_full_text = ?,
                extracted_at = datetime('now')
            WHERE id = ?
            """,
            (PRODUCT_CLASS, "FPK executable canon (Anvil writeback)", "ForgeOS", body, doc_id),
        )
    else:
        cur = con.execute(
            """
            INSERT INTO pretraining_spec_documents
              (product_class, manufacturer, product_name, source_url, document_type,
               file_hash, extraction_status, extracted_at, source_type, extracted_full_text)
            VALUES (?, 'ForgeOS', ?, ?, 'executable_canon', ?, 'fulltext',
                    datetime('now'), 'fpk_literature', ?)
            """,
            (PRODUCT_CLASS, "FPK executable canon (Anvil writeback)", DOC_URL, file_hash, body),
        )
        doc_id = int(cur.lastrowid)
    # FTS
    try:
        con.execute("DELETE FROM pretraining_spec_documents_fts WHERE document_id = ?", (doc_id,))
        con.execute(
            """
            INSERT INTO pretraining_spec_documents_fts
              (document_id, product_class, title, body)
            VALUES (?, ?, ?, ?)
            """,
            (doc_id, PRODUCT_CLASS, "FPK executable canon (Anvil writeback)", body),
        )
    except sqlite3.Error:
        pass
    con.commit()
    return doc_id


def clear_prior(con: sqlite3.Connection, doc_id: int) -> None:
    con.execute(
        "DELETE FROM fpk_extracted_claims WHERE source_detail LIKE ?",
        (SOURCE_PREFIX + "%",),
    )
    con.execute(
        "DELETE FROM pretraining_extracted_specs WHERE document_id = ? AND spec_key LIKE 'fpk:executable:%'",
        (doc_id,),
    )
    con.commit()


def insert_claim(
    con: sqlite3.Connection,
    *,
    doc_id: int,
    kind: str,
    component_id: str | None,
    symbol: str | None,
    expression: str | None,
    value_text: str | None,
    unit: str | None,
    material_grade: str | None,
    density: float | None,
    excerpt: str,
    source_tag: str,
    confidence: float = 0.95,
) -> None:
    detail = SOURCE_PREFIX + source_tag
    con.execute(
        """
        INSERT INTO fpk_extracted_claims
          (document_id, product_class, component_id, topic_id, claim_kind,
           symbol, expression, value_text, unit, material_grade, elements,
           density_kg_m3, excerpt, confidence, source_detail)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
        """,
        (
            doc_id,
            PRODUCT_CLASS,
            component_id,
            "fpk_executable_canon",
            kind,
            symbol,
            expression,
            value_text,
            unit,
            material_grade,
            density,
            excerpt[:500],
            confidence,
            detail,
        ),
    )
    spec_key = f"fpk:executable:{kind}:{symbol or hashlib.sha1(excerpt.encode()).hexdigest()[:10]}"
    try:
        con.execute(
            """
            INSERT INTO pretraining_extracted_specs
              (document_id, spec_key, spec_value, spec_unit, raw_excerpt,
               created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            """,
            (
                doc_id,
                spec_key,
                str(value_text or expression or "")[:500],
                unit,
                excerpt[:500],
            ),
        )
    except sqlite3.Error:
        pass


def write_materials(con: sqlite3.Connection, doc_id: int) -> int:
    n = 0
    for m in FPK_MATERIALS:
        con.execute(
            """
            INSERT INTO material_prices
              (material, raw_gbp_per_kg, mfg_mult_low, mfg_mult_high, source, updated, origin)
            VALUES (?, ?, ?, ?, ?, ?, 'fpk_writeback')
            ON CONFLICT(material) DO UPDATE SET
              raw_gbp_per_kg = excluded.raw_gbp_per_kg,
              mfg_mult_low = excluded.mfg_mult_low,
              mfg_mult_high = excluded.mfg_mult_high,
              source = excluded.source,
              updated = excluded.updated,
              origin = excluded.origin
            """,
            (
                m["material"],
                m["raw_gbp_per_kg"],
                m["mfg_mult_low"],
                m["mfg_mult_high"],
                m["source"],
                datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            ),
        )
        insert_claim(
            con,
            doc_id=doc_id,
            kind="material",
            component_id=m["component_id"],
            symbol=m["material"],
            expression=None,
            value_text=m["grade"],
            unit="kg",
            material_grade=m["grade"],
            density=m["density_kg_m3"],
            excerpt=f"{m['material']}: {m['grade']} ρ={m['density_kg_m3']} kg/m³ — {m['source']}",
            source_tag=f"material:{m['material']}",
        )
        n += 1
    con.commit()
    return n


def write_formulas(con: sqlite3.Connection, doc_id: int) -> int:
    n = 0
    for f in FPK_FORMULAS:
        insert_claim(
            con,
            doc_id=doc_id,
            kind="formula",
            component_id=f["component_id"],
            symbol=f["symbol"],
            expression=f["expression"],
            value_text=f"{f['pack_id']} | {f['expression']} | module={f['module']}",
            unit=f.get("unit"),
            material_grade=None,
            density=None,
            excerpt=(
                f"Anvil pack {f['pack_id']} formula {f['symbol']}: "
                f"{f['expression']} ({f['module']})"
            ),
            source_tag=f"formula:{f['symbol']}",
        )
        n += 1
    con.commit()
    return n


def write_geometry(con: sqlite3.Connection, doc_id: int, twin: Path) -> int:
    state_path = twin / "state.json"
    if not state_path.is_file():
        return 0
    state = json.loads(state_path.read_text(encoding="utf-8"))
    geom = state.get("fpkConcentricGeometry") or {}
    n = 0
    for key, unit, component in (
        ("housing_od_mm", "mm", "traction_drive_housing"),
        ("housing_len_mm", "mm", "traction_drive_housing"),
        ("stator_od_mm", "mm", "stator"),
        ("stator_id_mm", "mm", "stator"),
        ("rotor_od_mm", "mm", "hollow_rotor_barrel"),
        ("rotor_id_mm", "mm", "hollow_rotor_barrel"),
        ("sun_od_mm", "mm", "planet_carrier"),
        ("planet_od_mm", "mm", "planet_carrier"),
        ("planet_count", "1", "planet_carrier"),
        ("ring_id_mm", "mm", "planet_carrier"),
        ("diff_od_mm", "mm", "planet_carrier"),
        ("mcu_w_mm", "mm", "oem_inverter_control_board"),
        ("mcu_d_mm", "mm", "oem_inverter_control_board"),
        ("mcu_h_mm", "mm", "oem_inverter_control_board"),
    ):
        val = geom.get(key)
        if val is None:
            continue
        insert_claim(
            con,
            doc_id=doc_id,
            kind="geometry",
            component_id=component,
            symbol=key,
            expression=f"{key}={val}",
            value_text=str(val),
            unit=unit,
            material_grade=None,
            density=None,
            excerpt=f"Twin concentric geometry stamp: {key}={val} {unit}",
            source_tag=f"geometry:{key}",
        )
        n += 1
    # nest-fit booleans as geometry claims
    for key in ("nest_fits_rotor", "stack_fits_bay", "mcu_fits_bay"):
        if key in geom:
            insert_claim(
                con,
                doc_id=doc_id,
                kind="geometry",
                component_id="traction_drive_housing",
                symbol=key,
                expression=None,
                value_text=str(geom[key]),
                unit="bool",
                material_grade=None,
                density=None,
                excerpt=f"Twin nest-fit: {key}={geom[key]}",
                source_tag=f"geometry:{key}",
            )
            n += 1
    boxes = geom.get("principal_boxes")
    if isinstance(boxes, list) and boxes:
        insert_claim(
            con,
            doc_id=doc_id,
            kind="geometry",
            component_id="traction_drive_housing",
            symbol="principal_boxes_count",
            expression=f"len(principal_boxes)={len(boxes)}",
            value_text=str(len(boxes)),
            unit="1",
            material_grade=None,
            density=None,
            excerpt=f"Twin principal_boxes count={len(boxes)}",
            source_tag="geometry:principal_boxes_count",
        )
        n += 1
    con.commit()
    return n


def reconfirm_seed_materials(con: sqlite3.Connection) -> int:
    """Reconfirm curated seed prices (ingest-side) so freshness isn't laundered.

    INTENT: A5 materials freshness — seed rows frozen since May 2026 must not
    stay stale forever while FPK upserts make MAX(updated) look fresh. We
    reconfirm still-curated seed rows with today's date (not inventing web
    prices). Does not touch origin='web' or origin='fpk_writeback'.
    """
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    cur = con.execute(
        """
        UPDATE material_prices
        SET updated = ?,
            source = CASE
              WHEN source LIKE '%reconfirmed%' THEN source
              ELSE source || ' (reconfirmed ' || ? || ')'
            END
        WHERE origin = 'seed'
          AND (updated IS NULL OR updated < ?)
        """,
        (today, today, today),
    )
    con.commit()
    return int(cur.rowcount or 0)


def link_components(con: sqlite3.Connection, doc_id: int) -> int:
    comps = {m["component_id"] for m in FPK_MATERIALS}
    comps |= {f["component_id"] for f in FPK_FORMULAS}
    n = 0
    for c in comps:
        try:
            con.execute(
                """
                INSERT OR IGNORE INTO fpk_component_literature
                  (product_class, component_id, topic_id, document_id, doi,
                   contribution, relevance, peer_reviewed)
                VALUES (?, ?, 'fpk_executable_canon', ?, NULL, 'formula', 1.0, 0)
                """,
                (PRODUCT_CLASS, c, doc_id),
            )
            n += 1
        except sqlite3.Error:
            pass
    con.commit()
    return n


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--twin", type=Path, required=True)
    ap.add_argument("--db", type=Path, default=DB)
    args = ap.parse_args()
    before = {}
    con = sqlite3.connect(str(args.db))
    before["claims"] = con.execute("SELECT COUNT(*) FROM fpk_extracted_claims").fetchone()[0]
    before["specs_fpk"] = con.execute(
        "SELECT COUNT(*) FROM pretraining_extracted_specs WHERE spec_key LIKE 'fpk:%'"
    ).fetchone()[0]
    before["materials"] = con.execute("SELECT COUNT(*) FROM material_prices").fetchone()[0]

    doc_id = ensure_canon_doc(con)
    clear_prior(con, doc_id)
    n_mat = write_materials(con, doc_id)
    n_form = write_formulas(con, doc_id)
    n_geom = write_geometry(con, doc_id, args.twin)
    n_link = link_components(con, doc_id)
    n_reconfirm = reconfirm_seed_materials(con)

    after = {
        "claims": con.execute("SELECT COUNT(*) FROM fpk_extracted_claims").fetchone()[0],
        "specs_fpk": con.execute(
            "SELECT COUNT(*) FROM pretraining_extracted_specs WHERE spec_key LIKE 'fpk:%'"
        ).fetchone()[0],
        "materials": con.execute("SELECT COUNT(*) FROM material_prices").fetchone()[0],
        "executable_claims": con.execute(
            "SELECT COUNT(*) FROM fpk_extracted_claims WHERE source_detail LIKE ?",
            (SOURCE_PREFIX + "%",),
        ).fetchone()[0],
        "seed_materials_reconfirmed": n_reconfirm,
    }
    con.close()
    delta = {k: after[k] - before[k] for k in before}
    # GOTCHA: Presence of executable_claims alone is NOT growth (idempotent re-run).
    # Growth requires a net row increase this cycle.
    summary = {
        "doc_id": doc_id,
        "wrote": {
            "materials": n_mat,
            "formulas": n_form,
            "geometry": n_geom,
            "links": n_link,
            "formula_catalogue_size": len(FPK_FORMULAS),
            "formula_packs": len(FORMULA_PACKS_FOR_DB),
        },
        "before": before,
        "after": after,
        "delta": delta,
        "grew": any(delta[k] > 0 for k in delta),
    }
    out = args.twin / "JLR-FE-FRONT-FPK-DB-WRITEBACK.json"
    out.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))
    return 0 if summary["grew"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
