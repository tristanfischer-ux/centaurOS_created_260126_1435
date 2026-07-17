# Yuri verify-then-finish campaign (2026-07-16)

**Standing order:** Full re-runs of prior products to prove later coding did not break universality (floor ≥9). Every Yuri product must be gold-close in form (Blender drives drawings), and **materials BoM within ±15% of gold kit**. Then finish remaining Yuri products autonomously.

## Acceptance bar (all products)

1. **Scorecard** — Excel SHIPS, every tab ≥9, `score_source=workbook-recalc-readback`, form-factor honesty PASS  
2. **Form** — correct form family (not FALLBACK / wrong family); `form-meshes.json` present; glance PASS vs gold WHY  
3. **Drawings** — regenerated from Blender after form converge (§3.8)  
4. **Cost** — `gold_cost_band.py` PASS (materials in gold band)

## Gold materials anchors (GBP)

| Product | Mid | Band (±15% or researched) | Settled before campaign |
|---|---|---|---|
| Colorimeter | 125 | 95–160 | £105.5 — PASS |
| NinjaPCR | 480 | 408–552 | £1171 — FAIL |
| Poseidon (4ch) | 184 | 156–212 | £1827 — FAIL |
| OpenFlexure | 198 | 146–240 | £640 live — FAIL |
| Pioreactor | 259 | 220–298 | — |
| Rodeostat | 189 | 161–217 | — |
| OpenDrop | 236 | 201–271 | — |

Anchors: `out/_yuri-gold-cost-anchors.json` · checker: `scripts/lib/gold_cost_band.py --selftest`

## SOURCE landed this session (before re-runs)

| Gap | Fix |
|---|---|
| `lab_microscope` → sealed colorimeter / FALLBACK | `is_lab_microscope_form` + `_place_lab_microscope_layout` + glance |
| Materials 3–10× gold with SHIPS | `gold_cost_band` + brief cost bands + microscope floors/forbidden |
| Form converge syringe-only | form family dispatch in `form_converge_loop` |

## Run order (sequential — one Blender)

1. Form-converge OpenFlexure on frozen `1310` state → promote meshes  
2. Full cold re-run **OpenFlexure** (form + cost + score ≥9)  
3. Full cold re-run **Colorimeter** (regression)  
4. Full cold re-run **NinjaPCR** (cost band)  
5. Full cold re-run **Poseidon** (cost band + form twinship)  
6. **Pioreactor** → **Rodeostat** → **OpenDrop** (prep + run to bar)

Codema / Powerwall: keep as non-Yuri regression smoke if Blender free; not blockers for Yuri ladder.

## Commands

```bash
# Gates
python3 scripts/lib/gold_cost_band.py --selftest
python3 scripts/lib/form_render_glance.py --selftest
python3 scripts/lib/instrument_form_grammar.py

# Form-only (cheap)
python3 scripts/blender-universal/form_converge_loop.py \
  out/openflexure-20260716-1310/state.json out/openflexure-form-loop --max 6 --samples 32

# Full chain
PCB_STAGE=1 bash scripts/run-loop.sh briefs-loop/yuri_openflexure.md out/openflexure-board.json openflexure
python3 scripts/lib/gold_cost_band.py out/openflexure-*/state.json
```
