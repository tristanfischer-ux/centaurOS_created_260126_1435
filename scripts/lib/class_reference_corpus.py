#!/usr/bin/env python3
"""Class-reference corpus — gold imagery + literature seeds for every product class.

INTENT (2026-07-29, Tristan): Every design class (bioreactor, FE rear MGU, …)
must be grounded in public exemplars — what good looks like (gold imagery as a
TRAINING CHECK) and what the literature says (constraints + formulas). Never
mesh-paste an OEM silhouette; form still follows function. The seed JSON is the
SOURCE list; forge-truth.db is the searchable store (vector + FTS).

FLOW:
  scripts/ingest/class-reference-seeds/<class>.json
    → scripts/ingest/ingest-class-reference-corpus.ts
    → pretraining_spec_documents (+ FTS5 on extracted_full_text)
    → dualSearch / search_class_literature() at design time
    → visual_invariants feed form grammar (human-encoded, not auto-CAD)

Usage:
  python3 scripts/lib/class_reference_corpus.py --selftest
  python3 scripts/lib/class_reference_corpus.py --list formula_e_rear_mgu
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
SEEDS_DIR = REPO_ROOT / "scripts" / "ingest" / "class-reference-seeds"

REQUIRED_SEED_KEYS = ("product_class", "visual_invariants", "literature", "gold_imagery")
VIEW_ROLES = frozenset({
    "exterior_shell",
    "cutaway_interior",
    "inverter_module",
    "cooling_path",
    "mount_structure",
    "packaging_context",
})
DOC_TYPES = frozenset({
    "regulation",
    "whitepaper",
    "datasheet",
    "report",
    "standard",
    "article",
    "application_note",
})


def seeds_dir() -> Path:
    return SEEDS_DIR


def list_seed_classes() -> list[str]:
    if not SEEDS_DIR.is_dir():
        return []
    return sorted(p.stem for p in SEEDS_DIR.glob("*.json"))


def load_seed(product_class: str) -> dict[str, Any]:
    """Load and lightly validate a class seed JSON.

    @description Returns the seed dict for product_class.
    @param product_class Chain product_class slug (filename stem).
    @returns Seed document.
    @throws FileNotFoundError | ValueError on missing/invalid seed.
    """
    path = SEEDS_DIR / f"{product_class}.json"
    if not path.is_file():
        raise FileNotFoundError(f"no class-reference seed: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    validate_seed(data, expect_class=product_class)
    return data


def validate_seed(data: dict[str, Any], *, expect_class: str | None = None) -> None:
    if not isinstance(data, dict):
        raise ValueError("seed must be a JSON object")
    for k in REQUIRED_SEED_KEYS:
        if k not in data:
            raise ValueError(f"seed missing key: {k}")
    pc = str(data.get("product_class") or "")
    if expect_class and pc != expect_class:
        raise ValueError(f"product_class mismatch: {pc!r} != {expect_class!r}")
    inv = data.get("visual_invariants")
    if not isinstance(inv, list) or not inv:
        raise ValueError("visual_invariants must be a non-empty list")
    for item in inv:
        if not isinstance(item, str) or len(item.strip()) < 12:
            raise ValueError(f"visual invariant too thin: {item!r}")
        # Anti-paste: invariants must not be OEM part numbers / named silhouettes.
        if re.search(r"\bMGU0[0-9]\b|\bI-TYPE\b|\b99X\b", item, re.I):
            raise ValueError(
                f"visual invariant must be function-forced, not OEM-named: {item!r}"
            )
    for lit in data.get("literature") or []:
        if not isinstance(lit, dict):
            raise ValueError("literature entries must be objects")
        if not lit.get("url") or not lit.get("title"):
            raise ValueError(f"literature entry needs title+url: {lit!r}")
        dt = str(lit.get("document_type") or "")
        if dt and dt not in DOC_TYPES:
            raise ValueError(f"unknown document_type: {dt}")
    for img in data.get("gold_imagery") or []:
        if not isinstance(img, dict):
            raise ValueError("gold_imagery entries must be objects")
        role = str(img.get("view_role") or "")
        if role and role not in VIEW_ROLES:
            raise ValueError(f"unknown view_role: {role}")
        if not img.get("url"):
            raise ValueError(f"gold_imagery entry needs url: {img!r}")


def literature_query_hints(product_class: str) -> list[str]:
    """Default hybrid-search queries for a class (design-time bootstrap)."""
    seed = load_seed(product_class)
    hints = list(seed.get("search_hints") or [])
    if not hints:
        hints = [
            product_class.replace("_", " "),
            " ".join(str(x) for x in (seed.get("visual_invariants") or [])[:2])[:120],
        ]
    return [h for h in hints if isinstance(h, str) and h.strip()]


def _selftest() -> None:
    classes = list_seed_classes()
    assert "formula_e_rear_mgu" in classes, (
        "formula_e_rear_mgu seed must exist (first class on the universal rail)"
    )
    seed = load_seed("formula_e_rear_mgu")
    assert len(seed["visual_invariants"]) >= 6
    assert len(seed["literature"]) >= 4
    assert any(
        str(x.get("document_type")) == "regulation" for x in seed["literature"]
    ), "FE seed must include FIA regulation"
    # Adversarial: OEM-named invariant must fail validation.
    bad = dict(seed)
    bad["visual_invariants"] = list(seed["visual_invariants"]) + [
        "Copy the Audi MGU05 silhouette exactly"
    ]
    try:
        validate_seed(bad, expect_class="formula_e_rear_mgu")
        raise AssertionError("OEM-named invariant should have failed")
    except ValueError:
        pass
    hints = literature_query_hints("formula_e_rear_mgu")
    assert hints, "search hints required"
    print("class_reference_corpus.py --selftest OK "
          f"({len(classes)} seeds; FE invariants={len(seed['visual_invariants'])})")


def main(argv: list[str]) -> int:
    if "--selftest" in argv:
        _selftest()
        return 0
    if "--list" in argv:
        i = argv.index("--list")
        pc = argv[i + 1] if i + 1 < len(argv) else ""
        if not pc:
            print("\n".join(list_seed_classes()) or "(no seeds)")
            return 0
        seed = load_seed(pc)
        print(json.dumps(seed, indent=2)[:8000])
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
