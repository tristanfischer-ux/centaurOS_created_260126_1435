#!/usr/bin/env python3
"""Production FPK forge-truth DB consumer (chain-side, READONLY).

INTENT: One canonical read path for FPK claims / component literature /
material prices. Prove scripts MUST call this module — not parallel ad-hoc
SQL — so "DB is used" means the same consumer design paths use.

Mirrors `src/lib/pdf-engine-v2/lib/knowledge/fpk-literature-search.ts`
and the DB-first branch of `getMaterialPrice` in material-prices.ts.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

DEFAULT_DB = Path.home() / ".forge-truth" / "forge-truth.db"
DEFAULT_PRODUCT_CLASS = "formula_e_front_mgu"


def open_ro(db_path: Path | str = DEFAULT_DB) -> sqlite3.Connection:
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    return con


def lookup_fpk_claims(
    *,
    component_id: str | None = None,
    claim_kind: str | None = None,
    product_class: str = DEFAULT_PRODUCT_CLASS,
    k: int = 20,
    db_path: Path | str = DEFAULT_DB,
) -> list[dict[str, Any]]:
    """Mirror lookupFpkClaims() — extracted claims for a component/kind."""
    clauses = ["product_class = ?"]
    params: list[Any] = [product_class]
    if component_id:
        clauses.append("component_id = ?")
        params.append(component_id)
    if claim_kind:
        clauses.append("claim_kind = ?")
        params.append(claim_kind)
    params.append(k)
    con = open_ro(db_path)
    try:
        rows = con.execute(
            f"""
            SELECT id, document_id, component_id, claim_kind, symbol, expression,
                   value_text, unit, material_grade, excerpt, confidence, source_detail
            FROM fpk_extracted_claims
            WHERE {' AND '.join(clauses)}
            ORDER BY confidence DESC, id DESC
            LIMIT ?
            """,
            params,
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        con.close()


def lookup_fpk_component_literature(
    *,
    component_id: str,
    product_class: str = DEFAULT_PRODUCT_CLASS,
    k: int = 12,
    db_path: Path | str = DEFAULT_DB,
) -> list[dict[str, Any]]:
    """Mirror lookupFpkComponentLiterature()."""
    con = open_ro(db_path)
    try:
        rows = con.execute(
            """
            SELECT cl.document_id, cl.component_id, cl.topic_id, cl.doi, cl.contribution,
                   cl.peer_reviewed, d.product_name AS title, d.source_url,
                   substr(COALESCE(d.extracted_full_text, ''), 1, 400) AS excerpt
            FROM fpk_component_literature cl
            JOIN pretraining_spec_documents d ON d.id = cl.document_id
            WHERE cl.product_class = ?
              AND cl.component_id = ?
            GROUP BY cl.document_id
            ORDER BY cl.peer_reviewed DESC, cl.relevance DESC
            LIMIT ?
            """,
            (product_class, component_id, k),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        con.close()


def get_material_price_db_first(
    material: str,
    *,
    db_path: Path | str = DEFAULT_DB,
) -> dict[str, Any] | None:
    """Mirror getMaterialPrice() DB branch (no static TS fallback here)."""
    con = open_ro(db_path)
    try:
        row = con.execute(
            """
            SELECT material, raw_gbp_per_kg, mfg_mult_low, mfg_mult_high, source, updated, origin
            FROM material_prices WHERE material = ?
            """,
            (material,),
        ).fetchone()
        return dict(row) if row else None
    finally:
        con.close()


def stamp_fpk_db_reads(
    *,
    db_path: Path | str = DEFAULT_DB,
    product_class: str = DEFAULT_PRODUCT_CLASS,
) -> dict[str, Any]:
    """Production stamp: concrete reads a design path would make."""
    materials = [
        "ndfeb_magnet",
        "copper",
        "aluminium",
        "silicon_carbide_die",
        "electrical_steel",
        "gear_steel",
        "egw_coolant_50",
        "sintered_silver_die_attach",
    ]
    mat_hits = {m: get_material_price_db_first(m, db_path=db_path) for m in materials}
    components = ("stator", "sic_power_module", "motor_cooling_jacket", "planet_carrier")
    by_component = {
        c: {
            "claims": lookup_fpk_claims(
                component_id=c, product_class=product_class, k=8, db_path=db_path
            ),
            "literature": lookup_fpk_component_literature(
                component_id=c, product_class=product_class, k=5, db_path=db_path
            ),
        }
        for c in components
    }
    formulas = lookup_fpk_claims(
        claim_kind="formula", product_class=product_class, k=30, db_path=db_path
    )
    geometry = lookup_fpk_claims(
        claim_kind="geometry", product_class=product_class, k=30, db_path=db_path
    )
    return {
        "schema": "fpk-db-reads/v1",
        "consumer": "scripts/lib/fpk_db_consumer.py",
        "mirrors": [
            "fpk-literature-search.ts#lookupFpkClaims",
            "fpk-literature-search.ts#lookupFpkComponentLiterature",
            "material-prices.ts#getMaterialPrice (DB branch)",
        ],
        "material_price_hits": {k: v for k, v in mat_hits.items() if v},
        "material_price_hit_count": sum(1 for v in mat_hits.values() if v),
        "formula_claims": formulas,
        "geometry_claims": geometry,
        "by_component": {
            c: {
                "claim_count": len(v["claims"]),
                "literature_count": len(v["literature"]),
                "claim_symbols": [x.get("symbol") for x in v["claims"][:8]],
                "literature_docs": [
                    {"document_id": x.get("document_id"), "title": x.get("title")}
                    for x in v["literature"][:3]
                ],
            }
            for c, v in by_component.items()
        },
    }
