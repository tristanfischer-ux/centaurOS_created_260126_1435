#!/usr/bin/env python3
"""
scripts/lib/orchestrator/tools/python/regulatory_fda_cgmp.py

FDA cGMP (21 CFR 211) + EMA + PMDA bioproduct regulatory lookup.

US FDA process:
1. IND filing (Investigational New Drug) - Phase 1/2/3 trials, ~$250-500k
2. cGMP compliance: 21 CFR 210/211 (drugs) + 21 CFR 1271 (HCT/Ps)
3. BLA filing (Biologics License Application) - $4M+ filing fee
4. Pre-Approval Inspection (PAI) by FDA
5. Post-market surveillance

Process Validation:
- Stage 1: Process design (3 conformance lots)
- Stage 2: Process performance qualification (15+ lots typical)
- Stage 3: Continued process verification

EU EMA / Notified Body:
- EU GMP Vol 4 Annex 1 (sterile products) - revised 2022
- Major release: 100+ pages of documentation
- Audit cycles: every 2-3 years

Japan PMDA:
- J-GMP equivalent to ICH Q7-Q11
- Audit fee ~£35k

Batch size impact:
- Pilot scale (5-50 L): IND-supporting only
- Phase 3 scale (50-500 L): registration batches
- Commercial (500-5000 L): full PAI

References:
- 21 CFR 211 (Current Good Manufacturing Practice for Finished Pharmaceuticals)
- 21 CFR 600-680 (Biological Products)
- FDA Guidance for Industry: Process Validation (2011, revised 2024)
- EU GMP Vol 4 Annex 1 (2022 revision)
- ICH Q7-Q12 quality guidelines
"""
from __future__ import annotations

import json
import sys
import time

# Build #19d (2026-05-22): provenance metadata — every wrapper MUST emit this
# block in its output so the report's Tools-Used page can audit each claim.
PROVENANCE = {
    "tool_name": 'regulatory_fda_cgmp (custom)',
    "tool_version": '1.0.0',
    "tool_license": 'proprietary',
    "tool_source_url": '(in-tree)',
    "tool_paper": 'FDA 21 CFR Part 211 (cGMP Finished Pharmaceuticals); FDA PDUFA-VII fee schedule (FY2023-2027); EMA Guideline for GMP Inspectors EMA/INS/GMP/79766/2011',
    "physics_basis": 'Lookup by (modality, region) → FDA/EMA filing fees + cGMP audit costs + IND/BLA preparation costs.',
    "confidence_class": 'industry_typical',
    "last_reviewed_date": "2026-05-22",
}


PRODUCT_TYPE_REQS: dict[str, dict] = {
    "vaccine": {
        "fda_class": "Biologic",
        "fda_pathway": "BLA",
        "ind_filing_cost_gbp": 350_000,
        "bla_filing_cost_gbp": 4_000_000,
        "audit_cost_gbp": 200_000,
        "documentation": [
            "Chemistry Manufacturing & Controls (CMC)",
            "Preclinical toxicology/safety",
            "Phase 1/2/3 clinical data",
            "Process validation (3+ conformance lots)",
            "Stability data (real-time at 2-3 yr)",
            "Lot release testing per USP",
            "Containment/biosafety per BMBL 6th ed",
        ],
        "validation_runs": 3,
        "stability_studies_years": 2,
    },
    "monoclonal_antibody": {
        "fda_class": "Biologic",
        "fda_pathway": "BLA",
        "ind_filing_cost_gbp": 300_000,
        "bla_filing_cost_gbp": 4_000_000,
        "audit_cost_gbp": 180_000,
        "documentation": [
            "CMC including expression system",
            "Process validation (15+ batches)",
            "Comparability bridge studies",
            "Host cell protein assays",
            "Endotoxin LAL",
            "Glycan profiling",
            "Aggregate quantitation (SEC)",
        ],
        "validation_runs": 3,
        "stability_studies_years": 3,
    },
    "small_molecule": {
        "fda_class": "Drug",
        "fda_pathway": "NDA",
        "ind_filing_cost_gbp": 250_000,
        "bla_filing_cost_gbp": 3_500_000,
        "audit_cost_gbp": 120_000,
        "documentation": [
            "Synthesis route",
            "Polymorph studies",
            "Dissolution/permeability",
            "Genotoxic impurities (ICH M7)",
            "Stability per ICH Q1A",
            "Microbiological",
        ],
        "validation_runs": 3,
        "stability_studies_years": 2,
    },
    "cell_therapy": {
        "fda_class": "Biologic / ATMP",
        "fda_pathway": "BLA / RMAT",
        "ind_filing_cost_gbp": 450_000,
        "bla_filing_cost_gbp": 5_000_000,
        "audit_cost_gbp": 300_000,
        "documentation": [
            "Cell source / starting material",
            "Vector characterization (if engineered)",
            "Potency assay",
            "Identity, purity, viability per FDA Cell Therapy Guidance",
            "Phase 1/2/3 dose-response",
            "Long-term follow-up safety (FDA Aug 2024 LTFU guidance)",
        ],
        "validation_runs": 5,
        "stability_studies_years": 1,
    },
    "gene_therapy": {
        "fda_class": "Biologic / ATMP",
        "fda_pathway": "BLA / RMAT",
        "ind_filing_cost_gbp": 500_000,
        "bla_filing_cost_gbp": 6_000_000,
        "audit_cost_gbp": 350_000,
        "documentation": [
            "Vector design/characterization",
            "Genomic integration assay",
            "Replication-competent virus testing",
            "Bridging study to GLP toxicology",
            "Phase 1/2/3 plus 15-yr safety follow-up",
        ],
        "validation_runs": 5,
        "stability_studies_years": 1,
    },
    "biosimilar": {
        "fda_class": "Biosimilar",
        "fda_pathway": "351(k)",
        "ind_filing_cost_gbp": 200_000,
        "bla_filing_cost_gbp": 3_000_000,
        "audit_cost_gbp": 150_000,
        "documentation": [
            "Analytical comparability (extensive)",
            "Pharmacokinetic equivalence",
            "Clinical pharmacology bridging",
            "Limited Phase 3 if needed",
        ],
        "validation_runs": 3,
        "stability_studies_years": 2,
    },
}

MARKET_OVERLAYS: dict[str, dict] = {
    "EU": {
        "regulator": "EMA",
        "pathway": "Centralised Procedure",
        "uplift_factor": 0.85,        # cheaper than FDA but more documentation
    },
    "JP": {
        "regulator": "PMDA",
        "pathway": "J-GMP MAA",
        "uplift_factor": 1.00,
    },
    "US": {
        "regulator": "FDA",
        "pathway": "Per product class",
        "uplift_factor": 1.00,
    },
    "UK": {
        "regulator": "MHRA",
        "pathway": "UK MA / EU divergence",
        "uplift_factor": 0.75,
    },
    "CN": {
        "regulator": "NMPA",
        "pathway": "Class 1 IND/NDA",
        "uplift_factor": 0.65,
    },
}


def compute(payload: dict) -> dict:
    product_type = str(payload.get("product_type", "monoclonal_antibody")).lower()
    market = str(payload.get("market", "US")).upper()
    batch_size_l = float(payload.get("batch_size_l", 500))

    if product_type not in PRODUCT_TYPE_REQS:
        return {"error": f"Unknown product_type. Available: {list(PRODUCT_TYPE_REQS.keys())}"}
    if market not in MARKET_OVERLAYS:
        return {"error": f"Unknown market. Available: {list(MARKET_OVERLAYS.keys())}"}

    reqs = PRODUCT_TYPE_REQS[product_type]
    market_info = MARKET_OVERLAYS[market]

    # Apply market uplift
    uplift = market_info["uplift_factor"]
    ind_cost = reqs["ind_filing_cost_gbp"] * uplift
    bla_cost = reqs["bla_filing_cost_gbp"] * uplift
    audit_cost = reqs["audit_cost_gbp"] * uplift

    # Scale-dependent factors
    if batch_size_l < 50:
        scale_phase = "Pilot / IND-supporting"
        validation_runs_extra = 0
    elif batch_size_l < 500:
        scale_phase = "Phase 3 registration scale"
        validation_runs_extra = 0
    else:
        scale_phase = "Commercial scale (full PAI required)"
        validation_runs_extra = 2

    total_validation_runs = reqs["validation_runs"] + validation_runs_extra

    # Total cost estimate
    total_cost = ind_cost + bla_cost + audit_cost

    return {
        "product_type": product_type,
        "market": market,
        "regulator": market_info["regulator"],
        "fda_class": reqs["fda_class"],
        "fda_pathway": reqs["fda_pathway"],
        "regulatory_pathway": market_info["pathway"],
        "batch_size_l": batch_size_l,
        "scale_phase": scale_phase,
        "required_documentation": reqs["documentation"],
        "validation_runs_required": total_validation_runs,
        "stability_studies_years": reqs["stability_studies_years"],
        "audit_cost_gbp": round(audit_cost),
        "ind_bla_filing_cost_gbp": round(ind_cost + bla_cost),
        "ind_filing_cost_gbp": round(ind_cost),
        "bla_filing_cost_gbp": round(bla_cost),
        "total_regulatory_cost_gbp": round(total_cost),
        "uplift_factor_market": uplift,
        "notes": (
            "Per 21 CFR 211 (US), EU GMP Vol 4 (EU). Costs are filing fees + "
            "documentation prep + audit. Excludes clinical trial costs "
            "(phase 1/2/3 separately £20-200M). PAI = Pre-Approval Inspection "
            "by FDA inspectorate; failure = months-year delay."
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
