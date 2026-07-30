#!/usr/bin/env python3
"""Wire extracted FPK literature claims into canonical physics-tree leaves.

INTENT: Literature extraction is useful to the design only when every claim has
an auditable, exact component link. This front keeps literature advisory:
claim references never close race holds or upgrade ship readiness.

Usage:
  python3 scripts/fe-front-wire-fpk-claims.py \
    --twin out/formula-e-front-mgu-20260729-1432
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TWIN = ROOT / "out" / "formula-e-front-mgu-20260729-1432"
DEFAULT_DB = Path.home() / ".forge-truth" / "forge-truth.db"
DEFAULT_PRODUCT_CLASS = "formula_e_front_mgu"
REPORT_NAME = "JLR-FE-FRONT-FPK-CLAIM-WIRING.json"


TOKEN_ALIASES = {
    "pcb": "board",
    "controller": "control",
    "controllers": "control",
    "mosfet": "sic",
    "mosfets": "sic",
}
IGNORED_COMPONENT_TOKENS = {
    "assembly",
    "bank",
    "ev",
    "fpk",
    "front",
    "gen3",
    "hardware",
    "kit",
    "module",
    "oem",
    "permanent",
    "power",
    "system",
    "traction",
    "unitised",
    "unitized",
    "vehicle",
}
SAFE_COMPONENT_ALIASES = {
    # Electric-machine assembly names.
    "electric_motor": "motor_assembly",
    "front_fpk_motor": "motor_assembly",
    "motor": "motor_assembly",
    "permanent_magnet_motor": "motor_assembly",
    "traction_drive_motor": "motor_assembly",
    "traction_motor": "motor_assembly",
    # Inverter / MCU assembly names.
    "inverter": "mcu_assembly",
    "inverter_assembly": "mcu_assembly",
    "mcu_inverter": "mcu_assembly",
    "motor_inverter": "mcu_assembly",
    "sic_traction_inverter": "mcu_assembly",
    "traction_inverter": "mcu_assembly",
    "traction_motor_inverter": "mcu_assembly",
    # Reduction / differential assembly names.
    "gear": "transmission_assembly",
    "gear_set": "transmission_assembly",
    "gearbox": "transmission_assembly",
    "gearbox_assembly": "transmission_assembly",
    "planetary_reduction": "transmission_assembly",
    "planetary_reduction_ev": "transmission_assembly",
    # Hardware hints that name a standard joint/insert family, not a leaf ID.
    "gearbox_cover_bolt": "cover_bolt_set",
    "helicoil_bolt": "helicoil_set",
    "helicoil_bolt_preload_al_housing": "helicoil_set",
    "helicoil_insert": "helicoil_set",
}


def _atomic_write_json(path: Path, value: object) -> None:
    """Write JSON through an adjacent temporary file and atomic rename."""
    temp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        temp.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
        os.replace(temp, path)
    finally:
        temp.unlink(missing_ok=True)


def _leaf_ids(part_index: list[dict[str, Any]]) -> set[str]:
    """Return childless canonical node IDs from the flattened tree index."""
    parent_ids = {
        str(entry["parent_id"])
        for entry in part_index
        if entry.get("parent_id") is not None
    }
    return {
        str(entry["id"])
        for entry in part_index
        if entry.get("id") is not None and str(entry["id"]) not in parent_ids
    }


def _normalise_component_id(value: str) -> tuple[str, ...]:
    """Normalise low-risk component vocabulary for exact alias lookup."""
    tokens: list[str] = []
    for raw_token in re.split(r"[^a-zA-Z0-9]+", value.lower()):
        if not raw_token:
            continue
        token = TOKEN_ALIASES.get(raw_token, raw_token)
        if token.endswith("s") and len(token) > 3:
            token = token[:-1]
        if token in IGNORED_COMPONENT_TOKENS:
            continue
        tokens.append(token)
    return tuple(tokens)


def _unique_normalised_component_lookup(
    part_index: list[dict[str, Any]],
) -> dict[tuple[str, ...], str]:
    """Return normalised aliases only when one canonical node owns the key."""
    candidates: dict[tuple[str, ...], set[str]] = defaultdict(set)
    for entry in part_index:
        node_id = entry.get("id")
        if not isinstance(node_id, str):
            continue
        for raw_value in (node_id, entry.get("name")):
            if not isinstance(raw_value, str):
                continue
            key = _normalise_component_id(raw_value)
            if key:
                candidates[key].add(node_id)
    return {
        key: next(iter(values))
        for key, values in candidates.items()
        if len(values) == 1
    }


def _descendant_leaf_map(
    part_index: list[dict[str, Any]],
    leaf_ids: set[str],
) -> dict[str, set[str]]:
    """Map every canonical node to the childless leaves under it."""
    children: dict[str | None, list[str]] = defaultdict(list)
    for entry in part_index:
        node_id = entry.get("id")
        if not isinstance(node_id, str):
            continue
        parent_id = entry.get("parent_id")
        children[parent_id if isinstance(parent_id, str) else None].append(node_id)

    resolved: dict[str, set[str]] = {}

    def leaves_under(node_id: str) -> set[str]:
        if node_id in resolved:
            return resolved[node_id]
        child_ids = children.get(node_id, [])
        if not child_ids:
            resolved[node_id] = {node_id} if node_id in leaf_ids else set()
            return resolved[node_id]
        leaves: set[str] = set()
        for child_id in child_ids:
            leaves.update(leaves_under(child_id))
        resolved[node_id] = leaves
        return leaves

    for entry in part_index:
        node_id = entry.get("id")
        if isinstance(node_id, str):
            leaves_under(node_id)
    return resolved


def _resolve_component_targets(
    component_id: object,
    *,
    canonical_ids: set[str],
    leaf_ids: set[str],
    descendant_leaves: dict[str, set[str]],
    normalised_lookup: dict[tuple[str, ...], str],
) -> tuple[str, str, set[str]] | None:
    """Resolve an extracted claim hint to canonical leaf targets.

    INTENT: Raise literature visibility without pretending the extractor made
    an exact leaf assertion. Exact ancestors and deterministic aliases stay
    advisory and are recorded on every claim reference.
    """
    if not isinstance(component_id, str) or not component_id.strip():
        return None

    source_id = component_id.strip()
    matched_id: str | None = None
    is_alias = False
    if source_id in canonical_ids:
        matched_id = source_id
    elif source_id in SAFE_COMPONENT_ALIASES:
        alias_target = SAFE_COMPONENT_ALIASES[source_id]
        if alias_target in canonical_ids:
            matched_id = alias_target
            is_alias = True
    else:
        normalised_target = normalised_lookup.get(_normalise_component_id(source_id))
        if normalised_target is not None:
            matched_id = normalised_target
            is_alias = True

    if matched_id is None:
        return None
    targets = descendant_leaves.get(matched_id, set())
    if not targets:
        return None
    if matched_id in leaf_ids:
        policy = (
            "SAFE_COMPONENT_ALIAS_TO_LEAF"
            if is_alias
            else "EXACT_COMPONENT_ID_TO_LEAF"
        )
    else:
        policy = (
            "SAFE_COMPONENT_ALIAS_TO_DESCENDANT_LEAF"
            if is_alias
            else "EXACT_COMPONENT_ID_TO_DESCENDANT_LEAF"
        )
    return matched_id, policy, targets


def _claim_ref(
    row: sqlite3.Row,
    *,
    matched_component_id: str,
    target_leaf_id: str,
    match_policy: str,
) -> dict[str, Any]:
    """Build a compact, source-bearing reference without implying closure."""
    doi = row["doi"]
    source_url = row["source_url"]
    provenance = (
        "PEER_LITERATURE"
        if (isinstance(doi, str) and doi.strip())
        or (isinstance(source_url, str) and source_url.strip())
        else "ESTIMATE_UNVALIDATED"
    )
    return {
        "claim_id": int(row["id"]),
        "document_id": int(row["document_id"]),
        "topic_id": row["topic_id"],
        "claim_kind": row["claim_kind"],
        "symbol": row["symbol"],
        "expression": row["expression"],
        "value_text": row["value_text"],
        "unit": row["unit"],
        "material_grade": row["material_grade"],
        "elements": row["elements"],
        "density_kg_m3": row["density_kg_m3"],
        "excerpt": row["excerpt"],
        "page_hint": row["page_hint"],
        "confidence": row["confidence"],
        "source_detail": row["source_detail"],
        "doi": doi,
        "source_url": source_url,
        "source_component_id": row["component_id"],
        "matched_component_id": matched_component_id,
        "target_leaf_id": target_leaf_id,
        "match_policy": match_policy,
        "provenance": provenance,
        # GOTCHA: Literature can guide a design, but never resolves FIA,
        # dyno, HIL, supplier, FEA, or CFD evidence holds by itself.
        "closure_effect": "NONE",
    }


def _load_claim_rows(
    db_path: Path,
    *,
    product_class: str,
) -> tuple[int, int, list[sqlite3.Row]]:
    """Load eligible claims and aggregate skip counts from forge-truth."""
    if not db_path.is_file():
        raise FileNotFoundError(f"missing literature database: {db_path}")
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    try:
        counts = con.execute(
            """
            SELECT
              COUNT(*) AS claims_total,
              SUM(CASE WHEN claim_kind = 'no_claim' THEN 1 ELSE 0 END)
                AS claims_no_claim
            FROM fpk_extracted_claims
            WHERE product_class = ?
            """,
            (product_class,),
        ).fetchone()
        rows = con.execute(
            """
            SELECT
              c.id,
              c.document_id,
              c.component_id,
              c.topic_id,
              c.claim_kind,
              c.symbol,
              c.expression,
              c.value_text,
              c.unit,
              c.material_grade,
              c.elements,
              c.density_kg_m3,
              c.excerpt,
              c.page_hint,
              c.confidence,
              c.source_detail,
              d.source_url,
              (
                SELECT MAX(cl.doi)
                FROM fpk_component_literature cl
                WHERE cl.document_id = c.document_id
                  AND cl.doi IS NOT NULL
                  AND trim(cl.doi) <> ''
              ) AS doi
            FROM fpk_extracted_claims c
            LEFT JOIN pretraining_spec_documents d ON d.id = c.document_id
            WHERE c.product_class = ?
              AND c.claim_kind <> 'no_claim'
            ORDER BY c.id
            """,
            (product_class,),
        ).fetchall()
        return (
            int(counts["claims_total"] or 0),
            int(counts["claims_no_claim"] or 0),
            rows,
        )
    finally:
        con.close()


def wire_twin(
    *,
    twin: Path,
    db_path: Path,
    product_class: str = DEFAULT_PRODUCT_CLASS,
    stamped_at: str | None = None,
) -> dict[str, Any]:
    """Attach exact component claims to canonical leaves and write the report.

    Args:
        twin: Twin directory containing ``state.json``.
        db_path: forge-truth SQLite database.
        product_class: Claim namespace to read.
        stamped_at: Optional deterministic timestamp for tests.

    Returns:
        The complete claim-wiring report.

    Raises:
        FileNotFoundError: If the twin state or database is absent.
        ValueError: If the twin lacks a valid FPK physics-tree part index.
    """
    state_path = twin / "state.json"
    if not state_path.is_file():
        raise FileNotFoundError(f"missing twin state: {state_path}")
    state = json.loads(state_path.read_text(encoding="utf-8"))
    physics_tree = state.get("fpkPhysicsTree")
    if not isinstance(physics_tree, dict):
        raise ValueError("state.fpkPhysicsTree must be an object")
    part_index = physics_tree.get("part_index")
    if not isinstance(part_index, list) or not all(
        isinstance(entry, dict) for entry in part_index
    ):
        raise ValueError("state.fpkPhysicsTree.part_index must be an object array")

    leaf_ids = _leaf_ids(part_index)
    canonical_ids = {
        str(entry["id"])
        for entry in part_index
        if isinstance(entry.get("id"), str)
    }
    descendant_leaves = _descendant_leaf_map(part_index, leaf_ids)
    normalised_lookup = _unique_normalised_component_lookup(part_index)
    claims_total, claims_no_claim, rows = _load_claim_rows(
        db_path,
        product_class=product_class,
    )

    matched: dict[str, list[dict[str, Any]]] = defaultdict(list)
    unmatched_rows: list[sqlite3.Row] = []
    eligible_by_kind: Counter[str] = Counter()
    wired_by_kind: Counter[str] = Counter()
    resolved_component_ids: Counter[str] = Counter()
    attached_ref_count = 0
    for row in rows:
        kind = str(row["claim_kind"])
        eligible_by_kind[kind] += 1
        resolved = _resolve_component_targets(
            row["component_id"],
            canonical_ids=canonical_ids,
            leaf_ids=leaf_ids,
            descendant_leaves=descendant_leaves,
            normalised_lookup=normalised_lookup,
        )
        if resolved is not None:
            matched_component_id, match_policy, target_leaf_ids = resolved
            for target_leaf_id in sorted(target_leaf_ids):
                ref = _claim_ref(
                    row,
                    matched_component_id=matched_component_id,
                    target_leaf_id=target_leaf_id,
                    match_policy=match_policy,
                )
                matched[target_leaf_id].append(ref)
                attached_ref_count += 1
            wired_by_kind[kind] += 1
            resolved_component_ids[str(row["component_id"])] += 1
        else:
            unmatched_rows.append(row)

    # DECISION: Ancestor and alias matches are visible on each ref. The report
    # stays advisory: it raises discoverability without closing evidence holds.
    for entry in part_index:
        entry.pop("claim_refs", None)
        node_id = entry.get("id")
        if isinstance(node_id, str) and node_id in matched:
            entry["claim_refs"] = matched[node_id]

    now = stamped_at or datetime.now(ZoneInfo("Europe/London")).isoformat(
        timespec="seconds"
    )
    counts = {
        "tree_nodes": len(part_index),
        "tree_leaves": len(leaf_ids),
        "claims_total": claims_total,
        "claims_no_claim_skipped": claims_no_claim,
        "claims_eligible": len(rows),
        "claims_wired": sum(wired_by_kind.values()),
        "claim_refs_attached": attached_ref_count,
        "claims_unmatched": len(unmatched_rows),
        "claim_components_total": len(
            {
                str(row["component_id"])
                for row in rows
                if row["component_id"] is not None
            }
        ),
        "leaves_with_claim_refs": len(matched),
        "leaves_without_claim_refs": len(leaf_ids) - len(matched),
    }
    unmatched_component_ids = sorted(
        {
            str(row["component_id"])
            if row["component_id"] is not None
            else "<NULL>"
            for row in unmatched_rows
        }
    )
    report = {
        "schema": "fpk-claim-wiring/v1",
        "stamped_at": now,
        "source": "scripts/fe-front-wire-fpk-claims.py",
        "product_class": product_class,
        "database": str(db_path),
        "twin": str(twin),
        "matching_policy": (
            "EXACT leaf IDs; exact canonical ancestors fan out to childless "
            "leaves; safe deterministic aliases only when they resolve to one "
            "canonical node. All non-leaf/alias refs carry match metadata."
        ),
        "provenance_policy": (
            "PEER_LITERATURE only with DOI or source_url; "
            "otherwise ESTIMATE_UNVALIDATED"
        ),
        "closure_effect": "NONE",
        "ship_ok": False,
        "counts": counts,
        "eligible_claims_by_kind": dict(sorted(eligible_by_kind.items())),
        "wired_claims_by_kind": dict(sorted(wired_by_kind.items())),
        "matched_component_ids": sorted(matched),
        "resolved_component_ids": dict(sorted(resolved_component_ids.items())),
        "unmatched_component_ids": unmatched_component_ids,
        "claim_refs_by_component": {
            component_id: refs
            for component_id, refs in sorted(matched.items())
        },
        "unmatched_claims": [
            {
                "claim_id": int(row["id"]),
                "document_id": int(row["document_id"]),
                "component_id": row["component_id"],
                "claim_kind": row["claim_kind"],
                "closure_effect": "NONE",
            }
            for row in unmatched_rows
        ],
    }
    report_path = twin / REPORT_NAME
    summary = {
        key: report[key]
        for key in (
            "schema",
            "stamped_at",
            "source",
            "matching_policy",
            "provenance_policy",
            "closure_effect",
            "ship_ok",
            "counts",
            "eligible_claims_by_kind",
            "wired_claims_by_kind",
            "matched_component_ids",
            "unmatched_component_ids",
        )
    }
    summary["report"] = REPORT_NAME
    state["fpkClaimWiring"] = summary

    twin.mkdir(parents=True, exist_ok=True)
    _atomic_write_json(report_path, report)
    _atomic_write_json(state_path, state)
    return report


def main() -> int:
    """Run claim wiring from the command line."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--twin", type=Path, default=DEFAULT_TWIN)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--product-class", default=DEFAULT_PRODUCT_CLASS)
    args = parser.parse_args()
    try:
        report = wire_twin(
            twin=args.twin,
            db_path=args.db,
            product_class=args.product_class,
        )
    except (FileNotFoundError, ValueError, json.JSONDecodeError, sqlite3.Error) as error:
        print(f"[fpk-claim-wiring] ERROR: {error}", file=sys.stderr)
        return 1

    counts = report["counts"]
    print(
        "[fpk-claim-wiring] "
        f"leaves={counts['tree_leaves']} "
        f"with_refs={counts['leaves_with_claim_refs']} "
        f"claims={counts['claims_total']} "
        f"eligible={counts['claims_eligible']} "
        f"wired={counts['claims_wired']} "
        f"unmatched={counts['claims_unmatched']} "
        f"no_claim_skipped={counts['claims_no_claim_skipped']}"
    )
    print(f"[fpk-claim-wiring] report={args.twin / REPORT_NAME}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
