#!/usr/bin/env python3
"""ship_red_team.py — the STANDING OUTSIDE REVIEWER (2026-07-10, Tristan: "why is it that
you missed all the points that grok saw?").

The false-ship post-mortem: every defect the outside review found was RECORDED by the
engine's own artefacts (vision broken:true, ledger connectivity concerns, the 195.5 kW
panel total) — the in-loop agent never saw them because it consumed the SCORER's view,
and the scorer's blind spots were inside the loop. The reviewer's power was the OUTSIDE
POSITION (fresh eyes on the delivered artefacts, asking "does this content belong in this
product?"), not superior reasoning. This stage codes that position so it never again
depends on a human pasting a rival model's review.

MECHANISM — one independent-model call per shipped run, pointed at the ARTEFACTS
(never state.json — the SIGHT rule):
  • excerpts: panel-schedule totals, line list + instrument index, the vision critique,
    every cost surface side by side, the tab scorecard's own numbers, connectivity
    concerns, contract headline quantities;
  • prompt: an outside chartered engineer hired to REJECT the dossier — name every reason
    the recorded scores are wrong for THIS product class;
  • output: red-team-punchlist.md in the run dir — loop_board HARVESTS it, so every
    finding needs a disposition (fixed <sha> / classified-with-evidence) before the next
    launch. Findings are HYPOTHESES: verify each against the deterministic state before
    acting (the seat can hallucinate — runs 50-53 proved it), but a hypothesis on the
    board can never be silently ignored.

Model: REDTEAM_MODEL (default x-ai/grok-4.3 — deliberately a DIFFERENT model family from
the build/benchmark seats; frame diversity is the point). Non-fatal on any failure.

  python3 scripts/lib/ship_red_team.py <run_dir> [state.json]
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request

DEFAULT_MODEL = os.environ.get("REDTEAM_MODEL", "x-ai/grok-4.3")


def _key(name: str) -> str:
    k = (os.environ.get(name) or "").strip()
    if k:
        return k
    here = os.path.dirname(os.path.abspath(__file__))
    for rel in ("../../.env.local", "../../.env"):
        try:
            for line in open(os.path.join(here, rel), encoding="utf-8"):
                m = re.match(rf"\s*(?:export\s+)?{name}\s*=\s*[\"']?([^\"'\n]+)", line)
                if m:
                    return m.group(1).strip()
        except OSError:
            pass
    return ""


def _read(path: str, cap: int = 4000) -> str:
    try:
        return open(path, encoding="utf-8", errors="replace").read()[:cap]
    except OSError:
        return ""


def _jload(path: str):
    try:
        return json.load(open(path))
    except (OSError, ValueError):
        return None


def _evidence_semantics(process_schedule: str, parts_ledger: dict) -> str:
    """Deterministic applicability/status facts the outside seat must not reinterpret."""
    notes = []
    if "NA-BY-DESIGN" in process_schedule and (
            "no process lines" in process_schedule.lower()
            or "*0 process lines.*" in process_schedule.lower()):
        notes.append(
            "DRAWING APPLICABILITY: process piping and valve schedules are explicitly "
            "NA-BY-DESIGN for this dry electrical product. Zero process lines/valves is "
            "CORRECT; the real instrument index remains applicable.")
    notes.append(
        "LEDGER STATUS SEMANTICS: `not_found` means catalogue/MPN identity is unresolved; "
        "it is NOT an electrical/process connectivity defect. Connectivity is judged only "
        "by connectivity.concerns, orphan_equipment and stale_ties. These identity gaps ARE "
        "penalised in the BoM/Part-names scores (the honest sub-10 score is the evidence); "
        "they are not an unscored omission merely because the tab still exceeds 9.")
    notes.append(
        "INSTRUMENT COUNT SEMANTICS: connectivity.n_instrument_total counts BoM instrument "
        "LINE TYPES; the instrument index enumerates physical qty-N instances. The two numbers "
        "are not expected to be equal; association coverage is the relevant comparison.")
    notes.append(
        "POWER SEMANTICS: connected_electrical_load_kw is the unit's internal auxiliary/parasitic "
        "consumer load. The principal battery↔PCS transfer board is governed by continuous_power_kw; "
        "showing that transfer duty on the MAIN DC board is correct, not a contradiction.")
    return "\n".join(notes)


def collect_evidence(run_dir: str, state: dict) -> str:
    """Excerpts of the DELIVERED artefacts — never a state.json narrative."""
    parts: list[str] = []
    q = ((state.get("orchestratorContract") or {}).get("quantities") or {})

    def qv(k):
        v = q.get(k)
        return v.get("value") if isinstance(v, dict) else v

    parts.append("CONTRACT HEADLINE (the authority every artefact must agree with):\n" + json.dumps({
        k: qv(k) for k in ("continuous_power_kw", "nameplate_capacity_kwh", "dc_bus_voltage_v",
                           "ac_output_voltage_v", "connected_electrical_load_kw",
                           "enclosure_volume_m3", "system_thermal_dissipation_kw",
                           # run-71 false HIGH: the seat flagged the PV/MPPT input stage as
                           # out-of-scope because the headline hid these contract quantities
                           "pv_stc_input_kw", "mppt_count") if qv(k) is not None}))
    pb = state.get("parsedBrief") or {}
    parts.append(f"PRODUCT CLASS: {pb.get('product_class') or state.get('productClass') or '?'} — "
                 f"summary: {str(pb.get('summary') or '')[:400]}")

    # The full panel is needed: truncating at 2.5k cut rows mid-line and made the
    # outside seat report missing columns that existed later in the delivered file.
    ps = _read(os.path.join(run_dir, "drawings", "panel-schedule.md"), 6000)
    if ps:
        parts.append("PANEL SCHEDULE (delivered):\n" + ps)
    # Include the complete instrument index. A 3.5k cap cut the final row mid-line
    # and the outside seat correctly rejected the *evidence excerpt* as truncated
    # even though the delivered schedule itself was complete.
    sch = _read(os.path.join(run_dir, "drawings", "process-schedules.md"), 12000)
    if sch:
        parts.append("LINE LIST + VALVE LIST + INSTRUMENT INDEX (delivered):\n" + sch)
    vv = _jload(os.path.join(run_dir, "render-vision-critique.json"))
    if vv:
        parts.append("RENDER VISION CRITIQUE (delivered verdict): " + json.dumps(vv)[:400])
    pl = _jload(os.path.join(run_dir, "parts-ledger.json")) or {}
    parts.append("LEDGER CONNECTIVITY: " + json.dumps(pl.get("connectivity") or {})[:600]
                 + f" | stale_ties={pl.get('n_stale_ties')} | not_found={len(pl.get('not_found') or [])}")
    parts.append(_evidence_semantics(sch, pl))
    rb = state.get("requirementsBom") or []
    rb_total = round(sum(r.get("line_gbp") or 0 for r in rb))
    cs = state.get("costStack") or {}
    # run-71 recurring false HIGH ("three mutually inconsistent totals"): these are
    # LAYERS of one margin stack, not rival claims of the same number. Run-72 refinement:
    # use the stack's REAL keys (there is no ex_works key — factory COGS is that layer)
    # and state that raw_materials_bom IS the requirementsBom Σ (±rounding), one surface.
    parts.append("COST STACK LAYERS (one margin stack, ascending — raw parts BoM < factory "
                 "COGS < OEM transfer < channel list < installed ASP; layers legitimately "
                 "differ, only a layer SMALLER than the one below it is a contradiction; "
                 "raw_materials_bom and the requirementsBom Σ are the SAME layer, expect "
                 "±rounding): "
                 + json.dumps({"raw_parts_bom (requirementsBom Σ)": rb_total,
                               "raw_materials_bom_layer (same layer)": cs.get("raw_materials_bom_gbp"),
                               "factory_cogs_layer": cs.get("factory_cogs_gbp"),
                               "oem_transfer_layer": cs.get("oem_transfer_price_gbp"),
                               "channel_list_layer": cs.get("channel_list_price_gbp"),
                               "installed_asp_layer": cs.get("installed_asp_gbp")}))
    sc = _jload(os.path.join(run_dir, "tab-scorecard.json")) or {}
    tabs = sc.get("tabs") or sc
    parts.append("RECORDED TAB SCORES (attack these): " + json.dumps(
        {k: v.get("score") for k, v in tabs.items() if isinstance(v, dict)})[:1200])
    # top BoM lines so pricing sanity is judgeable
    top = sorted((r for r in rb if r.get("line_gbp")), key=lambda r: -(r.get("line_gbp") or 0))[:15]
    parts.append("TOP BoM LINES:\n" + "\n".join(
        f"  {r.get('tag')} | £{r.get('unit_gbp')} ×{r.get('qty')} | {str(r.get('requirement'))[:60]}" for r in top))
    return "\n\n".join(parts)


def run_red_team(run_dir: str, state_path: str | None = None, timeout: int = 300) -> int:
    state = _jload(state_path or os.path.join(run_dir, "state.json")) or {}
    key = _key("OPENROUTER_API_KEY")
    if not key:
        print("[red-team] no OPENROUTER_API_KEY — skipped (non-fatal)")
        return 0
    evidence = collect_evidence(run_dir, state)
    prompt = (
        "You are an OUTSIDE chartered engineer hired to REJECT this engineering dossier. It is for the "
        "product class stated below. You are looking at the DELIVERED artefacts, not the engine's "
        "intentions. The engine's own recorded tab scores are included — your job is to name every way "
        "those scores are WRONG for this product: content that does not belong in this product class "
        "(wrong-domain drawings), totals that contradict the contract authority, evidence the engine "
        "recorded but did not score (a broken render verdict, connectivity defects), cost surfaces that "
        "disagree, and anything a 5-second human glance would reject. Do NOT re-derive the engineering; "
        "judge the artefacts. Obey the explicit DRAWING APPLICABILITY and LEDGER STATUS SEMANTICS "
        "in the evidence: do not flag a declared NA-BY-DESIGN absence, and do not relabel an MPN "
        "identity gap as a connectivity fault. Be concrete and cite the artefact line you are judging.\n\n"
        + evidence +
        "\n\nReturn ONLY JSON: {\"findings\": [{\"artefact\": \"<which artefact>\", \"claim\": "
        "\"<what is wrong>\", \"evidence\": \"<the artefact line/number you judged>\", \"severity\": "
        "\"high|med|low\"}]}. List every genuine finding, worst first; an empty list means you would "
        "genuinely sign this dossier."
    )
    body = json.dumps({"model": DEFAULT_MODEL, "max_tokens": 6000, "temperature": 0,
                       "messages": [{"role": "user", "content": prompt}]}).encode()
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions", data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode())
        txt = data["choices"][0]["message"]["content"]
    except Exception as exc:  # noqa: BLE001 — the reviewer is best-effort, never fatal
        print(f"[red-team] call failed (non-fatal): {str(exc)[:140]}")
        return 0
    m = re.search(r"\{.*\}", re.sub(r"```(?:json)?", "", txt), re.S)
    try:
        findings = (json.loads(m.group(0)) if m else {}).get("findings") or []
    except ValueError:
        findings = []
    out = {"model": DEFAULT_MODEL, "findings": findings}
    json.dump(out, open(os.path.join(run_dir, "ship-red-team.json"), "w"), indent=1)
    md = ["# Ship red-team punch-list — OUTSIDE reviewer on the delivered artefacts", ""]
    for f in findings:
        md.append(f"- `{str(f.get('artefact'))[:40]}` [{f.get('severity')}] — {str(f.get('claim'))[:160]}"
                  f"  ·  evidence: `{str(f.get('evidence'))[:80]}`")
    open(os.path.join(run_dir, "red-team-punchlist.md"), "w").write("\n".join(md))
    print(f"[red-team] {len(findings)} finding(s) from {DEFAULT_MODEL} → red-team-punchlist.md "
          f"(harvested by loop_board; verify each vs state before acting)")
    return 0


def _selftest() -> int:
    dry = "# Instrument Index — Dry Electrical Product (NA-BY-DESIGN)\n*0 process lines.*"
    notes = _evidence_semantics(dry, {"not_found": ["X-1"]})
    checks = [
        "Zero process lines/valves is CORRECT" in notes,
        "NOT an electrical/process connectivity defect" in notes,
        "ARE penalised" in notes,
        "counts BoM instrument LINE TYPES" in notes,
        "principal battery↔PCS transfer board" in notes,
    ]
    if not all(checks):
        print("[red-team] SELFTEST FAIL: evidence semantics missing")
        return 1
    wet = _evidence_semantics("# Process schedules\n*4 process lines.*", {})
    if "Zero process lines/valves is CORRECT" in wet:
        print("[red-team] SELFTEST FAIL: wet process schedule marked N/A")
        return 1
    print("[red-team] selftest OK (dry N/A + not_found/connectivity semantics)")
    return 0


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] in ("--selftest", "--self-test", "selftest"):
        raise SystemExit(_selftest())
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(2)
    raise SystemExit(run_red_team(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None))
