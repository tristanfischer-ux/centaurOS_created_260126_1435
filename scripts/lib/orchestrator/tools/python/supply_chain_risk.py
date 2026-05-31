#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/supply_chain_risk.py

Supply chain risk scoring: geographic concentration, single-source exposure,
and tariff costs.

Tariff schedules (2026):
- UK: 25% on Chinese EVs, 15% on Chinese solar PV (May 2025 review).
- US: Section 301 China tariffs - 25% baseline + 100% on EVs/lithium batteries
       (2024 USTR review).
- EU: 17.4-38.1% Chinese EV countervailing duties (Oct 2024).
- General: 0-5% MFN for most parts.

Country risk multipliers:
- Tier 1 (low): UK, EU, US, JP, KR, CA, AU, SG → 1.0x
- Tier 2 (med): MX, IN, TH, MY, BR, TR → 1.5x
- Tier 3 (high): CN, RU, IR → 2.5x
- Tier 4 (sanctioned/embargoed): variable

Risk formula:
   score = 100 × (geo_concentration_factor × 0.4
                  + single_source_factor × 0.3
                  + tariff_factor × 0.2
                  + tier_weighted_country_factor × 0.1)
   capped at 100.

Input:
    {
      "bom_parts": [
        {"part_id": "LFP_cell", "manufacturer": "CATL", "manufacturer_country": "CN",
         "unit_cost_gbp": 80, "quantity": 280},
        ...
      ],
      "destination_country": "UK",
      "dual_sourcing_required": true
    }

Output:
    {
      "risk_score": ...,
      "single_source_parts_count": ...,
      "china_concentration_pct": ...,
      "tariff_exposure_gbp": ...,
      "recommendations": [...]
    }
"""
from __future__ import annotations

import json
import sys
import time

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'supply_chain_risk (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": 'Critical Raw Materials Act (EU 2023/1542); US DOE Critical Materials List 2023; Resilinc public risk indices',
    "physics_basis": 'Risk score = (geographic concentration × tariff exposure × single-source flag) per BoM component. Country-of-origin lookup.',
    "confidence_class": 'industry_typical',
    "last_reviewed_date": "2026-05-22",
}


# Country tier: lower = lower geopolitical/manufacturing risk
COUNTRY_TIER: dict[str, int] = {
    "UK": 1, "GB": 1,
    "EU": 1, "DE": 1, "FR": 1, "IT": 1, "ES": 1, "NL": 1, "BE": 1, "AT": 1,
    "PL": 1, "CZ": 1, "SE": 1, "FI": 1, "DK": 1, "IE": 1,
    "US": 1, "CA": 1, "JP": 1, "KR": 1, "AU": 1, "NZ": 1, "SG": 1, "TW": 1,
    "MX": 2, "BR": 2, "AR": 2, "CL": 2,
    "IN": 2, "TH": 2, "MY": 2, "VN": 2, "ID": 2, "PH": 2,
    "TR": 2, "IL": 1, "AE": 2, "SA": 2,
    "ZA": 3, "EG": 3,
    "CN": 3, "HK": 3,
    "RU": 4, "BY": 4, "IR": 4, "KP": 4, "MM": 3,
}
TIER_MULTIPLIER = {1: 1.0, 2: 1.5, 3: 2.5, 4: 5.0}

# Tariff rate matrix: (destination, origin) -> rate (decimal)
TARIFF_RATES: dict[tuple[str, str], float] = {
    # UK 2026 tariff schedule
    ("UK", "CN"): 0.15,             # General Chinese imports
    ("UK", "RU"): 0.35,             # Sanctioned uplift
    ("UK", "IR"): 0.50,             # Sanctioned
    ("UK", "BY"): 0.35,
    ("UK", "EU"): 0.00,
    ("UK", "US"): 0.04,             # WTO MFN average
    # US 2026 tariff schedule
    ("US", "CN"): 0.25,             # Section 301 baseline
    ("US", "RU"): 1.00,
    ("US", "IR"): 1.00,
    ("US", "EU"): 0.04,
    ("US", "UK"): 0.04,
    ("US", "MX"): 0.00,             # USMCA
    ("US", "CA"): 0.00,
    # EU 2026 tariff schedule
    ("EU", "CN"): 0.17,             # Anti-dumping average across categories
    ("EU", "RU"): 0.35,
    ("EU", "IR"): 0.50,
    ("EU", "US"): 0.03,
    ("EU", "UK"): 0.00,             # TCA preferential
    # CN
    ("CN", "US"): 0.30,             # CN retaliatory
    ("CN", "EU"): 0.10,
    ("CN", "UK"): 0.10,
}

# EV/battery/solar special-tariff destinations (higher than baseline)
SPECIAL_HIGH_TARIFF_CATEGORIES: dict[tuple[str, str, str], float] = {
    # (destination, origin, category) -> rate
    ("UK", "CN", "ev"): 0.25,
    ("UK", "CN", "battery"): 0.20,
    ("UK", "CN", "solar"): 0.15,
    ("US", "CN", "ev"): 1.00,
    ("US", "CN", "battery"): 0.25,
    ("US", "CN", "solar"): 0.50,
    ("EU", "CN", "ev"): 0.275,         # Average of CVD findings
}


def get_tariff_rate(dest: str, origin: str, category: str | None = None) -> float:
    if category:
        rate = SPECIAL_HIGH_TARIFF_CATEGORIES.get((dest, origin, category.lower()))
        if rate is not None:
            return rate
    return TARIFF_RATES.get((dest, origin), 0.03)  # 3% MFN default


def compute(payload: dict) -> dict:
    parts = payload.get("bom_parts", [])
    dest = str(payload.get("destination_country", "UK")).upper()
    dual_required = bool(payload.get("dual_sourcing_required", False))

    if not parts:
        return {"error": "bom_parts list is empty"}

    # Count parts by origin country
    country_value: dict[str, float] = {}
    manufacturer_count: dict[str, list[str]] = {}  # mfr -> [part_id, ...]
    total_value = 0.0
    tariff_total = 0.0
    line_tariff: list[dict] = []

    for p in parts:
        pid = str(p.get("part_id", "?"))
        mfr = str(p.get("manufacturer", "?"))
        origin = str(p.get("manufacturer_country", "?")).upper()
        unit_cost = float(p.get("unit_cost_gbp", 0))
        qty = float(p.get("quantity", 1))
        category = p.get("category")  # optional: 'ev'|'battery'|'solar'|...

        line_value = unit_cost * qty
        country_value[origin] = country_value.get(origin, 0.0) + line_value
        manufacturer_count.setdefault(mfr, []).append(pid)
        total_value += line_value

        # Compute tariff
        rate = get_tariff_rate(dest, origin, category)
        tariff = line_value * rate
        tariff_total += tariff
        if rate > 0:
            line_tariff.append({"part_id": pid, "origin": origin, "rate": rate,
                                "tariff_gbp": round(tariff, 0)})

    # Single-source = any part where the manufacturer is unique AND no dual source listed
    # Manufacturer with only 1 distinct part: this manufacturer is "the one source for this part"
    # We approximate: count manufacturers whose part set is == 1 (could be single-sourced parts)
    single_source_parts = []
    seen_pids = set()
    pid_to_mfr_count: dict[str, set] = {}  # pid -> set of mfrs supplying it
    for p in parts:
        pid = str(p.get("part_id", "?"))
        mfr = str(p.get("manufacturer", "?"))
        pid_to_mfr_count.setdefault(pid, set()).add(mfr)
    for pid, mfrs in pid_to_mfr_count.items():
        if len(mfrs) == 1:
            single_source_parts.append(pid)

    # Country concentration
    china_value = country_value.get("CN", 0.0) + country_value.get("HK", 0.0)
    china_pct = (china_value / max(0.01, total_value)) * 100.0

    # Geo concentration: Herfindahl-Hirschman Index, higher = more concentrated
    hhi = sum((v / max(0.01, total_value)) ** 2 for v in country_value.values()) * 10000
    # HHI > 2500 = highly concentrated; HHI < 1500 = unconcentrated
    geo_concentration_factor = min(1.0, hhi / 5000.0)

    # Single-source factor
    single_source_factor = len(single_source_parts) / max(1, len(pid_to_mfr_count))

    # Tariff factor
    tariff_factor = min(1.0, tariff_total / max(0.01, total_value) * 5.0)  # 20% tariff -> 1.0

    # Tier-weighted country factor (high tier countries dominate)
    weighted_tier = 0.0
    for country, val in country_value.items():
        tier = COUNTRY_TIER.get(country, 3)
        mult = TIER_MULTIPLIER.get(tier, 2.5)
        weighted_tier += (val / max(0.01, total_value)) * mult
    tier_factor = min(1.0, (weighted_tier - 1.0) / 2.0)  # multiplier 1.0=safe, 3.0=high risk
    tier_factor = max(0.0, tier_factor)

    risk_score = (
        geo_concentration_factor * 0.40
        + single_source_factor * 0.30
        + tariff_factor * 0.20
        + tier_factor * 0.10
    ) * 100.0
    risk_score = min(100.0, max(0.0, risk_score))

    # Recommendations
    recommendations: list[str] = []
    if china_pct > 50:
        recommendations.append(
            f"China concentration is {china_pct:.0f}% of BoM value. "
            f"Diversify to non-China suppliers - target <30%."
        )
    if dual_required and single_source_parts:
        recommendations.append(
            f"{len(single_source_parts)} parts are single-sourced "
            f"(e.g. {', '.join(sorted(single_source_parts)[:3])}). "
            f"Qualify secondary supplier within 12 months."
        )
    if tariff_factor > 0.5:
        recommendations.append(
            f"Tariff exposure £{tariff_total:.0f} = "
            f"{(tariff_total / max(0.01, total_value)) * 100.0:.1f}% of BoM cost. "
            f"Consider FTZ, near-shoring, or product redesign."
        )
    if hhi > 5000:
        recommendations.append(
            f"Herfindahl-Hirschman Index = {hhi:.0f} (>5000 = HIGHLY concentrated). "
            f"Add a second sourcing region (US/EU/IN/MX)."
        )
    if not recommendations:
        recommendations.append("Supply chain risk within acceptable thresholds.")

    return {
        "risk_score": round(risk_score, 1),
        "single_source_parts_count": len(single_source_parts),
        "single_source_part_ids": single_source_parts,
        "china_concentration_pct": round(china_pct, 1),
        "tariff_exposure_gbp": round(tariff_total, 0),
        "tariff_exposure_pct_of_bom": round((tariff_total / max(0.01, total_value)) * 100.0, 2),
        "total_bom_value_gbp": round(total_value, 0),
        "country_breakdown": {k: round(v, 0) for k, v in sorted(
            country_value.items(), key=lambda x: -x[1])},
        "geo_concentration_hhi": round(hhi, 0),
        "tier_weighted_score": round(weighted_tier, 2),
        "destination_country": dest,
        "line_tariff_exposures": line_tariff[:20],   # top 20
        "recommendations": recommendations,
        "notes": (
            "Tariff rates per UK Global Tariff Schedule 2026, US HTS USTR 2024-25, "
            "EU TARIC 2024. Country tier multipliers reflect geopolitical risk + "
            "trade compliance burden. HHI > 2500 = highly concentrated per US DOJ guidance."
        ),
    }


def main() -> int:
    t_start = time.time()
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as exc:
        json.dump({"error": f"JSON parse failed: {exc}"}, sys.stdout)
        return 2
    try:
        result = compute(payload)
        if isinstance(result, dict):
            result["_provenance"] = PROVENANCE
        result.setdefault("_meta", {})["wall_time_s"] = round(time.time() - t_start, 3)
    except Exception as exc:
        json.dump({"error": f"compute failed: {type(exc).__name__}: {exc}"}, sys.stdout)
        return 3
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
