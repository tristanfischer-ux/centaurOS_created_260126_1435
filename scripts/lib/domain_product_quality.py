#!/usr/bin/env python3
"""Domain product-quality grade (Anvil) — manufacturer-adversarial, universal.

INTENT: the tab floor measures *engine contracts*. This module measures *product
sanity a domain expert would stop work over*: wrong catalogue identities,
impossible kinetics, topology bans. Homologation / Gerbers / HIL stay on
release_readiness — they must NOT re-drag this axis alone.

Score: 10 minus severity penalties; HIGH product defects floor well below 8 so
Bar A cannot stay 9 over catalogue fraud.
"""
from __future__ import annotations

from typing import Any, Optional


def _qval(q: dict, key: str) -> Optional[float]:
    v = q.get(key)
    if isinstance(v, dict):
        try:
            return float(v.get("value"))
        except (TypeError, ValueError):
            return None
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def _culture_like(state: dict) -> bool:
    blob = " ".join(
        str(x)
        for x in (
            state.get("productClass"),
            state.get("product_class"),
            ((state.get("parsedBrief") or {}).get("title") if isinstance(state.get("parsedBrief"), dict) else ""),
            ((state.get("brief") or {}).get("title") if isinstance(state.get("brief"), dict) else ""),
            ((state.get("orchestratorContract") or {}).get("brief_summary") or ""),
        )
    ).lower()
    return any(
        t in blob
        for t in (
            "bioreactor",
            "culture",
            "organoid",
            "spheroid",
            "fermentor",
            "fermenter",
            "cell culture",
        )
    )


def evaluate_domain_product_quality(
    state: dict,
    *,
    run_dir: str = "",
) -> dict[str, Any]:
    """Return {score, defects, high_count, med_count, binding}.

    ``binding`` is True when any HIGH product defect is present — callers must
    not claim a clean 9/10 product grade.
    """
    defects: list[str] = []
    high = 0
    med = 0
    score = 10.0

    # ── 1. Catalogue function-class (universal) ─────────────────────────────
    try:
        from catalogue_function_class import audit_parts_iterable
    except ImportError:  # pragma: no cover
        audit_parts_iterable = None  # type: ignore
    if audit_parts_iterable is not None:
        parts: list[dict] = []
        for key in ("requirementsBom", "partVerifications"):
            arr = state.get(key) or []
            if isinstance(arr, list):
                parts.extend([p for p in arr if isinstance(p, dict)])
        pl = None
        if run_dir:
            import json
            import os
            pl_path = os.path.join(run_dir, "parts-ledger.json")
            if os.path.isfile(pl_path):
                try:
                    with open(pl_path, encoding="utf-8") as fh:
                        pl = json.load(fh)
                except (OSError, json.JSONDecodeError):
                    pl = None
        if isinstance(pl, dict):
            parts.extend([p for p in (pl.get("equipment") or []) if isinstance(p, dict)])
        # PCB pipeline components (role nameHuman + MPN) — often still wrong after
        # BoM-level withdrawals. Walk nested pipeline.generator.components etc.
        def _walk_pcb_comps(obj: Any, out: list) -> None:
            if isinstance(obj, dict):
                if obj.get("partNumber") or obj.get("nameHuman"):
                    if obj.get("nameHuman") or obj.get("characterId"):
                        out.append({
                            "tag": obj.get("instanceName") or obj.get("characterId"),
                            "name": obj.get("nameHuman") or obj.get("characterId") or "",
                            "manufacturer": obj.get("manufacturer") or "",
                            "part_number": obj.get("partNumber") or "",
                            "part": (
                                f"{obj.get('manufacturer') or ''} "
                                f"{obj.get('partNumber') or ''}"
                            ).strip(),
                        })
                for k, v in obj.items():
                    if k in ("gerbers", "files", "drill", "svg", "png"):
                        continue
                    _walk_pcb_comps(v, out)
            elif isinstance(obj, list):
                for v in obj:
                    _walk_pcb_comps(v, out)

        pcb = state.get("pcb") if isinstance(state.get("pcb"), dict) else {}
        _walk_pcb_comps(pcb, parts)
        findings = audit_parts_iterable(parts)
        for f in findings:
            high += 1
            score = min(score, 4.0)
            defects.append(f"CATALOGUE HIGH: {f.get('issue', f)}")

    # ── 2. Culture kinetics sanity (when culture-like + quantities present) ─
    q = ((state.get("orchestratorContract") or {}).get("quantities") or {})
    if isinstance(q, dict) and _culture_like(state):
        mu = _qval(q, "mu_max_per_hour")
        if mu is None:
            mu = _qval(q, "mu_max")
        if mu is not None and mu > 0.15:
            # mammalian / spheroid order is ~0.02–0.05; >0.15 is bacteria-shaped fraud
            high += 1
            score = min(score, 4.0)
            defects.append(
                f"KINETICS HIGH: μ_max={mu:g}/h is bacteria-order for a culture "
                "product (expect ~0.02–0.05/h mammalian unless explicitly microbial)"
            )
        kla = _qval(q, "kla_per_hour")
        if kla is None:
            kla = _qval(q, "kla")
        airflow = _qval(q, "bioreactor_airflow_lpm")
        if airflow is None:
            airflow = _qval(q, "airflow_lpm") or _qval(q, "sparge_airflow_lpm")
        if kla is not None and kla > 1.0 and (airflow is None or airflow <= 0):
            high += 1
            score = min(score, 4.0)
            defects.append(
                f"KINETICS HIGH: kla={kla:g}/h with no sparge/airflow "
                "(airflow={airflow}) — transfer coefficient without gas"
            )
        # dual agitation
        a1 = _qval(q, "agitation_speed_rpm")
        a2 = _qval(q, "do_agitation_speed_rpm")
        if a1 is not None and a2 is not None and abs(a1 - a2) > 5:
            med += 1
            score = min(score, 7.0)
            defects.append(
                f"KINETICS MED: dual agitation set-points {a1:g} vs {a2:g} rpm"
            )

    # ── 3. Topology ban residues (instrument connection kinds if present) ───
    try:
        from instrument_connection_kinds import edge_is_nonphysical
    except ImportError:
        edge_is_nonphysical = None  # type: ignore
    if edge_is_nonphysical is not None and run_dir:
        import json
        import os
        for name in ("connection-ledger.json", "connection-schedule.json"):
            path = os.path.join(run_dir, name)
            if not os.path.isfile(path):
                continue
            try:
                with open(path, encoding="utf-8") as fh:
                    doc = json.load(fh)
            except (OSError, json.JSONDecodeError):
                continue
            rows = doc.get("rows") or doc.get("connections") or []
            banned = 0
            for r in rows:
                if not isinstance(r, dict):
                    continue
                fr = str(r.get("from") or r.get("from_name") or "")
                to = str(r.get("to") or r.get("to_name") or "")
                svc = str(r.get("service") or r.get("kind") or r.get("medium") or "")
                if edge_is_nonphysical(fr, to, svc):
                    banned += 1
            if banned:
                high += 1
                score = min(score, 4.0)
                defects.append(
                    f"TOPOLOGY HIGH: {banned} non-physical instrument connection(s) in {name}"
                )
            break

    # ── 4. Soft product holds (do not floor below 8 alone) ───────────────────
    pcb = state.get("pcb") if isinstance(state.get("pcb"), dict) else {}
    if pcb.get("forgeDraftOnly") or pcb.get("NOT_FABRICATION_READY") or (
        str(pcb.get("homologationStatus") or "").upper() == "NOT_HOMOLOGATED"
    ):
        med += 1
        # Cap at 8 for concept PCB — not a 4 (release_readiness owns fab/HIL)
        score = min(score, 8.0)
        defects.append(
            "PCB MED: concept/draft electronics — not fabrication-ready "
            "(does not alone force a 4; release_readiness owns HIL/Gerbers)"
        )

    # ── 5. Geometry completeness (when CAD kernel has run) ─────────────────
    # Does not invent geometry; only binds when geometry/completeness.json exists.
    geo_score = None
    if run_dir:
        import json as _json
        import os as _os

        geo_path = _os.path.join(run_dir, "geometry", "completeness.json")
        if _os.path.isfile(geo_path):
            try:
                with open(geo_path, encoding="utf-8") as fh:
                    geo = _json.load(fh)
            except (OSError, _json.JSONDecodeError):
                geo = None
            if isinstance(geo, dict):
                try:
                    geo_score = float(geo.get("score")) if geo.get("score") is not None else None
                except (TypeError, ValueError):
                    geo_score = None
                if geo.get("binding_high") or int(geo.get("high_count") or 0) > 0:
                    high += 1
                    score = min(score, 4.0)
                    defects.append(
                        "GEOMETRY HIGH: "
                        + ("; ".join((geo.get("defects") or [])[:2])
                           or "principals missing solid/path/hold")
                    )
                elif geo_score is not None and geo_score < 8.0:
                    med += 1
                    score = min(score, float(geo_score))
                    defects.append(
                        f"GEOMETRY MED: completeness {geo_score}/10 "
                        f"({geo.get('detail') or 'see geometry/completeness.json'})"
                    )
                # Soft: STEP expected but missing when completeness file exists
                step_ok = geo.get("step_ok")
                if step_ok is False:
                    med += 1
                    score = min(score, 7.0)
                    defects.append(
                        "GEOMETRY MED: assembly.step missing or empty "
                        "(open FreeCAD path incomplete)"
                    )

    score = max(0.0, round(score, 1))
    out: dict[str, Any] = {
        "name": "domain_product_quality",
        "score": score,
        "defects": defects[:12],
        "high_count": high,
        "med_count": med,
        "binding": high > 0,
        "advisory": False,
        "qualityLoopActionable": True,
        "detail": (
            f"domain product grade {score}/10 "
            f"({high} HIGH, {med} MED product defects)"
        ),
    }
    if geo_score is not None:
        out["geometry_completeness_score"] = geo_score
    return out


def prove_catch_selftest() -> None:
    """Wrong identity must bind; clean TBD must not."""
    bad = {
        "productClass": "benchtop_bioreactor",
        "requirementsBom": [
            {
                "tag": "X-1",
                "name": "Magnetic Stirrer Drive",
                "part": "Nidec Copal F280A-24 fan",
                "part_number": "F280A-24",
                "manufacturer": "Nidec",
            }
        ],
        "orchestratorContract": {
            "quantities": {
                "mu_max_per_hour": {"value": 1.0, "unit": "1/h"},
                "kla_per_hour": {"value": 40.0, "unit": "1/h"},
                "bioreactor_airflow_lpm": {"value": 0.0, "unit": "L/min"},
            }
        },
    }
    r = evaluate_domain_product_quality(bad)
    assert r["binding"] is True, r
    assert r["score"] <= 4.0, r
    assert r["high_count"] >= 2, r

    good = {
        "productClass": "benchtop_bioreactor",
        "requirementsBom": [
            {
                "tag": "X-1",
                "name": "Magnetic Stirrer Drive",
                "part": "TBD — magnetic stir drive",
            }
        ],
        "orchestratorContract": {
            "quantities": {
                "mu_max_per_hour": {"value": 0.035, "unit": "1/h"},
                "kla_per_hour": {"value": 0.0, "unit": "1/h"},
                "bioreactor_airflow_lpm": {"value": 0.0, "unit": "L/min"},
                "agitation_speed_rpm": {"value": 60, "unit": "RPM"},
                "do_agitation_speed_rpm": {"value": 60, "unit": "RPM"},
            }
        },
    }
    g = evaluate_domain_product_quality(good)
    assert g["binding"] is False, g
    assert g["score"] >= 8.0, g
    print("domain_product_quality selftest OK", r["score"], g["score"])


if __name__ == "__main__":
    prove_catch_selftest()
