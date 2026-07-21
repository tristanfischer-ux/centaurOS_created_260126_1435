# Session handover — Macro engine self-audit (post-compact)

**Date:** 2026-07-20 ~22:00 (written by Cursor after Tristan compacted without seeing pre-compact advice)  
**Branch:** `oxccu-efuel` @ **`211434398`** (ahead/behind should be 0/0 vs `origin/oxccu-efuel`)  
**Status:** In progress — scoring/PCB honesty largely closed; **form B3 BLOCKED**; fresh bake not started  
**Fixture:** `out/organoid-bioreactor-20260719-2150/` (frozen known-bad — refuse is expected)  
**Living punchlist:** [`MACRO-PROGRAM-PUNCHLIST-2026-07-20.md`](./MACRO-PROGRAM-PUNCHLIST-2026-07-20.md)  
**Inbox:** [`CURSOR-HARNESS-INBOX.md`](./CURSOR-HARNESS-INBOX.md)  
**Stale — ignore:** root `AGENT_HANDOVER.md` (2026-07-18 Yuri “7/7 DONE” — wrong campaign)

---

## QUICK START (do this first)

1. `git log -1 --oneline` → expect `211434398` or newer tip you push after merge.
2. Read **this file** + punchlist **open/blocked rows only** (not the fat banner archaeology).
3. Merge `origin/cursor-pcb` tip **`fb6b9a646`** (colorimeter floor + **generator-side P7**). Terminal’s Excel P7 ≠ Cursor’s generator P7.
4. Do **not** set COMPOSER default-on until B3 pack-into-envelope is fixed.
5. Resume at **B3 unblock** (below). No fresh bake / ships≥8 claim until B3→B4→V1b path is honest.

```bash
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
git fetch origin
git merge origin/cursor-pcb   # tip fb6b9a646
python3 scripts/build-excel-export.py --selftest
```

Large engine commits: `git push --no-verify` OK (husky eslint can hang).

---

## DONE (this stretch — do not re-do)

| Item | SHA | Note |
|---|---|---|
| P5/P6 merge + SIGHT | `fdde54834` / `31eed2e70` | multiBoardMerged→DRAFT; Gate38 fitness+merge |
| V2 Renders cap | `9bde69836` | UNVERIFIED containment → cov≤7; 2150 stays 4 |
| P7 Excel proveCatch | `a39613f3a` | interface-critical no-MPN→DRAFT (scoring bar) |
| B2 proof harness | `63d2bbb57` | functional-form/v1 selftest in verify-engine-guards |
| B3 SIGHT finding | `211434398` | correctly marked BLOCKED — see below |
| Scoring S1–S11, F1a–f L0/L1/L4, F2–F4, B1/B5/V1a, D1/D2, A1/A4/A6/A8 | various | see punchlist ✅ rows |

**Cursor lane already pushed (not yet in oxccu tip):** `origin/cursor-pcb` **`fb6b9a646`**
- colorimeter snapshot floor ≥9 (was ≥10; COTS off-board reclassification)
- generator-side P7: USB/ESD/`microcontroller_mcu`/firmware_storage/current_limit_polyfuse without catalogue MPN → unresolved
- Yuri gold harness expects `unresolved_components` on Pioreactor/Rodeostat/OpenDrop

---

## BLOCKED — B3 (do not flip default)

**Finding:** `COMPOSER=1` on frozen 2150 emits a **correct** functional-form proof (B2 ✓) but **places** roles as a sprawling tower (tall culture-vial column ~2× out of a small base). Scene bbox ~200×100×100 vs enclosure ~102×66×34 → phenotype FAIL (cap ≤4). Non-composer B1 path PASSES (~1.1×).

**Evidence:** `docs/plans/evidence-B3-composer-tower-2150.png`  
**Gate env:** `build_universal_scene.py` ~`os.environ.get("COMPOSER")`  
**SOURCE fix:** `compose_geometry_plan` / composer placement must pack roles **into** the enclosure envelope (device-scale AABB containment — same class of fix as B1, applied to the composer path). proveCatch: tower→contained on 2150-shaped fixture.

**B4** (split `lab_electronics` families) = blocked-by-B3. Do not start until B3 green.

---

## NEXT (ordered)

1. **Merge** `origin/cursor-pcb` @ `fb6b9a646` — absorb generator P7 + floor; do not re-implement.
2. **B3 unblock** — pack composer into enclosure + proveCatch; only then default COMPOSER on for `isInstrumentDevice`.
3. **B4** — split lab_electronics families by function.
4. **V1b** — strengthen vision critic rubric; SIGHT post-B3 heroes.
5. **S12 residual** — Excel waits on critique (belt; B5+S7 already cover ship path).
6. **A2 → A5 → A3 → A7** — DB ops (A8 already proves loop).
7. **F1f L2+L3** — scale-gated RAG + homonym-safe word-expand.
8. **S7 Exec follow-up** — per-axis card on Exec (not only Q&A).
9. **pcbGate copy** — SHADOW `clean_board` ≠ “board implements product”.
10. **P8** optional last (PnP `Val=?` — never blocks FAB).
11. **Fresh bake** + adversarial SIGHT of DELIVERED Excel/PNGs/PCB — ships≥8 only if axes+artefacts pass. Never from stdout alone.

---

## DON’T

- Default `COMPOSER=1` / chain composer-on while B3 is blocked
- Claim program done because frozen 2150 refuses (necessary ≠ sufficient)
- Announce ships≥8 from chain stdout without opening the workbook + heroes
- Re-implement P1–P6 / P9 / Terminal Excel P7 / Cursor generator P7
- Trust root `AGENT_HANDOVER.md` (Yuri Jul-18 — superseded for this campaign)
- `if organoid` patches — universal SOURCE + proveCatch only

---

## Method (standing)

- Fix the **rule** + proveCatch on frozen 2150; CORE FIX PRINCIPLE
- SIGHT the delivered artefact (Excel cells, PNG, PCB tab) — not `state.json` intent
- After each scoring edit: `python3 scripts/build-excel-export.py --selftest`
- Update punchlist status+SHA + inbox ▶ banner as rows flip

---

## Roles

| Agent | Owns |
|---|---|
| **Terminal (you)** | `oxccu-efuel` — scoring, form/Blender, merge, chain, punchlist |
| **Cursor** | `cursor-pcb` + inbox advice; HOLD competing chains |

Definition of done = material punchlist ⬜ closed + fresh bake artefacts pass adversarial SIGHT without Goodhart.
