#!/usr/bin/env python3
"""Restamp FE-front advisory quality sections from live evidence.

@description The FE-front twin has deterministic tabs above the Bar-A floor, but
advisory quality sections can remain frozen at an earlier LLM/self-audit score.
This script recomputes only the two advisory sections that the half-done plan
calls out: bill_of_materials and performance_card.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


DEFAULT_TWIN = Path("out/formula-e-front-mgu-20260729-1432")
QUALITY_PASS_FLOOR = 9.0


def _load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, dict):
        raise ValueError(f"{path} did not contain a JSON object")
    return data


def _write_json(path: Path, data: dict[str, Any]) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _num(value: Any) -> float | None:
    try:
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _rows(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [row for row in value if isinstance(row, dict)]


def _line_value(row: dict[str, Any]) -> float:
    return _num(row.get("line_gbp")) or _num(row.get("total_gbp")) or 0.0


def _row_name(row: dict[str, Any]) -> str:
    for key in ("name", "word_name", "requirement", "item", "description"):
        value = str(row.get(key) or "").strip()
        if value:
            return value
    return "unnamed bill line"


def _blank(value: Any) -> bool:
    return value is None or str(value).strip() in {"", "\u2014", "-"}


def _metric_id(metric: dict[str, Any]) -> str:
    return str(metric.get("id") or metric.get("key") or metric.get("label") or "").strip()


def assess_bill_of_materials(state: dict[str, Any], ledger: dict[str, Any]) -> dict[str, Any]:
    """Return an honest advisory score for the concept bill of materials."""
    bom_rows = _rows(state.get("requirementsBom"))
    ledger_rows = _rows(ledger.get("rows"))
    values = [_line_value(row) for row in bom_rows]
    total = round(sum(values), 2)
    priced = sum(1 for value in values if value > 0)
    zero_names = [_row_name(row) for row, value in zip(bom_rows, values) if value <= 0]
    top = max(values) if values else 0.0
    top_share = top / total if total > 0 else 0.0
    cost_stack = state.get("costStack") if isinstance(state.get("costStack"), dict) else {}
    raw_materials = _num(cost_stack.get("raw_materials_bom_gbp") if cost_stack else None)
    raw_sync_ok = raw_materials is not None and abs(raw_materials - total) <= max(1.0, 0.05 * max(total, 1.0))

    score = 10.0
    defects: list[str] = []
    if len(bom_rows) < 40 or total <= 0:
        score = 7.0
        defects.append(
            f"Bill is not concept-complete yet: {len(bom_rows)} lines, GBP {total:,.0f} total."
        )
    elif len(bom_rows) < 80:
        score = min(score, 8.5)
        defects.append(
            f"Bill has {len(bom_rows)} lines; below the FE-front concept completeness band."
        )

    if bom_rows:
        price_ratio = priced / len(bom_rows)
        if price_ratio < 0.95:
            score = min(score, 8.0)
            defects.append(
                f"Only {priced}/{len(bom_rows)} bill lines carry positive prices."
            )
        elif zero_names:
            score = min(score, 9.0)
            defects.append(
                f"Concept bill is {priced}/{len(bom_rows)} priced; residual GBP 0 line(s): "
                + "; ".join(zero_names[:4])
            )

    if not raw_sync_ok:
        score = min(score, 8.5)
        defects.append("Cost-stack raw-material anchor does not match the live bill total.")

    if top_share > 0.55:
        score = min(score, 8.5)
        defects.append(f"Largest bill line is {top_share:.0%} of total; check rollup dominance.")
    elif top_share > 0.40:
        score = min(score, 9.0)
        defects.append(
            f"Largest bill line is {top_share:.0%} of total; acceptable for a concept "
            "traction assembly, but release BoM still needs supplier quotation."
        )

    if ledger_rows and len(ledger_rows) < min(80, len(bom_rows) * 0.8):
        score = min(score, 8.5)
        defects.append(
            f"Parts ledger mirrors only {len(ledger_rows)} rows from {len(bom_rows)} bill lines."
        )

    if score >= 9.0:
        defects.insert(
            0,
            f"Concept bill substantiated: {len(bom_rows)} bill lines, "
            f"{len(ledger_rows) or len(bom_rows)} ledger rows, GBP {total:,.0f} raw-material rollup.",
        )
        if not any("release" in defect.lower() for defect in defects):
            defects.append("Release procurement remains open: supplier MPNs/quotes are not claimed.")

    return {"score": round(score, 1), "defects": defects, "advisory": True}


def _is_disclosed_not_applicable_blank(metric: dict[str, Any], state: dict[str, Any]) -> bool:
    metric_name = _metric_id(metric).lower()
    if "unit_cost_ceiling" not in metric_name and "unit cost ceiling" not in metric_name:
        return False
    constraints = ((state.get("parsedBrief") or {}).get("constraints") or {})
    ceiling = constraints.get("unit_cost_ceiling") if isinstance(constraints, dict) else None
    if isinstance(ceiling, dict):
        return _num(ceiling.get("value")) is None and str(ceiling.get("source") or "").lower() == "missing"
    return _num(ceiling) is None


def assess_performance_card(state: dict[str, Any]) -> dict[str, Any]:
    """Return an honest advisory score for the performance/specification card."""
    perf = state.get("performanceCard") if isinstance(state.get("performanceCard"), dict) else {}
    sections = _rows(perf.get("sections") if perf else [])
    metrics: list[dict[str, Any]] = []
    for section in sections:
        for metric in _rows(section.get("metrics")):
            metric["_section"] = section.get("name")
            metrics.append(metric)

    if not metrics:
        return {
            "score": 6.0,
            "defects": ["Performance card is empty."],
            "advisory": True,
        }

    blanks = [metric for metric in metrics if _blank(metric.get("value"))]
    real_blanks = [metric for metric in blanks if not _is_disclosed_not_applicable_blank(metric, state)]
    na_blanks = len(blanks) - len(real_blanks)
    real_blank_ratio = len(real_blanks) / len(metrics)

    score = 10.0
    defects: list[str] = [
        f"Performance card substantiated: {len(sections)} sections, {len(metrics)} metrics, "
        f"{na_blanks} disclosed not-applicable blank(s)."
    ]
    if real_blank_ratio > 0.34:
        score = 7.0
        defects.append(f"{len(real_blanks)}/{len(metrics)} metrics are genuinely blank.")
    elif real_blanks:
        score = 8.5
        defects.append(
            "Genuine blank metric(s): "
            + "; ".join(_metric_id(metric) or "unnamed metric" for metric in real_blanks[:5])
        )
    elif na_blanks:
        score = 9.5
        defects.append("Unit-cost ceiling is blank because the brief did not provide one; rendered as N/A.")

    warnings = perf.get("warnings") if perf else None
    if isinstance(warnings, list) and warnings:
        score = min(score, 9.0)
        defects.append("Performance card warning(s): " + "; ".join(str(w) for w in warnings[:3]))

    return {"score": round(score, 1), "defects": defects, "advisory": True}


def _replace_section(
    sections: list[dict[str, Any]],
    name: str,
    assessment: dict[str, Any],
) -> None:
    entry = {
        "name": name,
        "score": assessment["score"],
        "defects": assessment["defects"],
        "advisory": True,
    }
    for idx, section in enumerate(sections):
        if section.get("name") == name:
            sections[idx] = {**section, **entry}
            return
    sections.append(entry)


def restamp_quality_scorecard(twin: Path) -> dict[str, Any]:
    """Restamp advisory sections and return before/after scores."""
    state_path = twin / "state.json"
    quality_path = twin / "quality-scorecard.json"
    ledger_path = twin / "parts-ledger.json"
    state = _load_json(state_path)
    quality = _load_json(quality_path)
    ledger = _load_json(ledger_path) if ledger_path.exists() else {}
    before_sections = _rows(quality.get("sections"))
    before = {str(section.get("name")): section.get("score") for section in before_sections}

    sections = [dict(section) for section in before_sections]
    _replace_section(sections, "bill_of_materials", assess_bill_of_materials(state, ledger))
    _replace_section(sections, "performance_card", assess_performance_card(state))

    scored = [float(section.get("score") or 0.0) for section in sections]
    deterministic = [float(section.get("score") or 0.0) for section in sections if not section.get("advisory")]
    quality["sections"] = sections
    quality["floor"] = round(min(scored), 1) if scored else 0
    quality["mean"] = round(sum(scored) / len(scored), 1) if scored else 0
    quality["allPass"] = quality["floor"] >= QUALITY_PASS_FLOOR
    quality["deterministicFloor"] = round(min(deterministic), 1) if deterministic else quality["floor"]
    quality["deterministicMean"] = round(sum(deterministic) / len(deterministic), 1) if deterministic else quality["mean"]
    quality["deterministicAllPass"] = quality["deterministicFloor"] >= QUALITY_PASS_FLOOR
    _write_json(quality_path, quality)

    after = {str(section.get("name")): section.get("score") for section in sections}
    return {
        "before": before,
        "after": after,
        "floor": quality["floor"],
        "mean": quality["mean"],
        "allPass": quality["allPass"],
    }


def _selftest() -> None:
    base_state: dict[str, Any] = {
        "requirementsBom": [{"name": f"line {i}", "line_gbp": 10 + i} for i in range(90)],
        "costStack": {"raw_materials_bom_gbp": sum(10 + i for i in range(90))},
        "parsedBrief": {"constraints": {"unit_cost_ceiling": {"value": None, "source": "missing"}}},
        "performanceCard": {"sections": [{"name": "Constraints", "metrics": [
            {"id": "rated_power_kw", "value": 350},
            {"id": "unit_cost_ceiling", "value": None},
        ]}]},
    }
    good_bom = assess_bill_of_materials(base_state, {"rows": [{} for _ in range(90)]})
    assert good_bom["score"] >= 9.0, good_bom
    bad_bom = assess_bill_of_materials(
        {"requirementsBom": [{"name": "dominant", "line_gbp": 1000}, {"name": "tiny", "line_gbp": 1}],
         "costStack": {"raw_materials_bom_gbp": 1001}},
        {"rows": [{}, {}]},
    )
    assert bad_bom["score"] < 9.0, bad_bom
    good_perf = assess_performance_card(base_state)
    assert good_perf["score"] >= 9.0, good_perf
    bad_perf_state = {
        "performanceCard": {"sections": [{"name": "Spec", "metrics": [
            {"id": "rated_power_kw", "value": None},
            {"id": "mass_kg", "value": None},
            {"id": "efficiency", "value": 0.97},
        ]}]}
    }
    bad_perf = assess_performance_card(bad_perf_state)
    assert bad_perf["score"] < 9.0, bad_perf
    print("fe-front-quality-advisory-stamp selftest OK")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--twin", type=Path, default=DEFAULT_TWIN)
    parser.add_argument("--selftest", action="store_true")
    args = parser.parse_args()
    if args.selftest:
        _selftest()
        return
    result = restamp_quality_scorecard(args.twin)
    before = result["before"]
    after = result["after"]
    print(
        "quality advisory stamp: "
        f"bill_of_materials {before.get('bill_of_materials')} -> {after.get('bill_of_materials')}; "
        f"performance_card {before.get('performance_card')} -> {after.get('performance_card')}; "
        f"floor={result['floor']} mean={result['mean']} allPass={result['allPass']}"
    )


if __name__ == "__main__":
    main()
