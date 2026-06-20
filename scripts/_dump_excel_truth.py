"""Extract the SOURCE-OF-TRUTH anchor values from state.json that the Excel cells must
agree with — the cross-check sheet for the cell-by-cell audit swarm. An Excel cell is
only WRONG if it contradicts one of these engine values (or another cell for the same
quantity), or is a formula error. Everything here is the engine's own number, verbatim.
Usage: python3 _dump_excel_truth.py <run_dir>"""
import json
import os
import sys


def main(run_dir):
    s = json.load(open(os.path.join(run_dir, "state.json")))
    out = {}

    cs = s.get("costStack", {})
    out["costStack (the cost cascade — Excel cost/waterfall tabs MUST match)"] = {
        k: cs.get(k) for k in (
            "raw_materials_bom_gbp", "assembly_labour_gbp", "factory_overhead_gbp",
            "factory_cogs_gbp", "manufacturer_margin_gbp", "oem_transfer_price_gbp",
            "channel_markup_gbp", "channel_list_price_gbp", "installation_cost_gbp",
            "installed_asp_gbp") if k in cs}

    cz = s.get("costSanity", {})
    out["costSanity"] = {k: cz.get(k) for k in (
        "verdict", "headline_cost_gbp", "output_value", "output_unit_label",
        "cost_per_output_unit", "band") if k in cz}

    sc = s.get("qualityScorecard") or s.get("quality_scorecard") or {}
    if not sc:
        scf = os.path.join(run_dir, "quality-scorecard.json")
        if os.path.exists(scf):
            sc = json.load(open(scf))
    if isinstance(sc, dict):
        raw_secs = sc.get("sections") or {}
        if isinstance(raw_secs, dict):
            secs = {k: (v.get("score") if isinstance(v, dict) else v) for k, v in raw_secs.items()}
        elif isinstance(raw_secs, list):
            secs = {(r.get("section") or r.get("name") or i): r.get("score")
                    for i, r in enumerate(raw_secs) if isinstance(r, dict)}
        else:
            secs = {}
        out["qualityScorecard (floor = DETERMINISTIC sections only; advisory sections MAY be below floor — NOT an error)"] = {
            "floor": sc.get("floor"), "mean": sc.get("mean"), "allPass": sc.get("allPass"),
            "sections": secs}

    rb = s.get("requirementsBom", [])
    priced = [r for r in rb if float(r.get("line_gbp") or 0) > 0]
    out["requirementsBom (THE authoritative BoM — line_gbp; sub-components are status=SUB-COMPONENT line_gbp=0 BY DESIGN, not missing)"] = {
        "total_rows": len(rb), "priced_lines": len(priced),
        "sum_line_gbp": round(sum(float(r.get("line_gbp") or 0) for r in priced)),
        "top_15": [{"requirement": str(r.get("requirement", ""))[:54], "qty": r.get("qty"),
                    "unit_gbp": r.get("unit_gbp"), "line_gbp": r.get("line_gbp"),
                    "status": r.get("status")}
                   for r in sorted(priced, key=lambda r: -float(r.get("line_gbp") or 0))[:15]]}

    km = s.get("keyMetrics") or {}
    pb = s.get("parsedBrief") or {}
    out["brief / key metrics"] = {
        "product_class": pb.get("product_class") or km.get("product_class"),
        "production_capacity": km.get("production_capacity_t_yr") or km.get("annual_production_t"),
        "title": str(pb.get("title") or "")[:80]}

    out["partVerificationSummary (verified=real-identifiable; uncertain=parametric — uncertain is NOT a defect)"] = s.get("partVerificationSummary", {})

    # contract quantities the Quantities/Calculations tabs derive from
    oc = (s.get("orchestratorContract") or {}).get("quantities") or {}
    ec = (s.get("engineeringContract") or {}).get("quantities") or {}
    q = {**ec, **oc}
    out["contract_quantities_sample (Quantities/Calculations tabs derive from these)"] = {
        k: (v.get("value") if isinstance(v, dict) else v) for k, v in list(q.items())[:40]}

    print(json.dumps(out, indent=2, default=str))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "out/ras-5m")
