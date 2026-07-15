# Cursor Takeover Plan — Powerwall Honest ≥9

**Status:** prepared from `HANDOVER-POWERWALL-2026-07-11.md`; no engine edits until Claude/run 79 stop.

## Inputs merged

- Claude handover and run-78 artefacts
- `docs/plans/2026-07-09-engine-accuracy-speed-detailed-code-draft.md`
- `docs/plans/2026-07-09-engine-accuracy-speed-execution-plan.md`
- `docs/plans/2026-07-10-pcb-kicad-capability-handover.md`
- `prototypes/pcb-capability/`
- Public Powerwall internal-layout references and render review

## Preserve — already built, do not duplicate

1. Device-scale energy drawing topology with `_drawing_only` edges.
2. Real-process edge filter plus sealed-device NA-BY-DESIGN P&ID.
3. Energy BFD for dry electrical products.
4. Drawing gates G10/G11 and sealed-product G7 applicability.
5. Three-surface scoring rule and workbook ONE-TRUTH readback.
6. Strict render architecture rubric, tiebreak and pixel-keyed cache.
7. Dense cutaway stack: pack array, power/control boards, fins, capacitors, PCB, fans, HV busbar and terminals.
8. Semantic electrical-consumer breakdown selection.
9. PV/AC protection/interface rows.
10. Canonical gated launcher, persistent defect board and outside reviewer.

## Takeover precondition

Do not edit until:

- `pgrep` shows no Powerwall design-chain/run-loop process;
- Claude's coding process has stopped;
- run 79 has final `tab-scorecard.json`, `dossier.xlsx`, drawing gates, vision verdict, outside red-team and board assembly;
- worktree/HEAD are captured after run 79.

## Phase 1 — Verify run 79

1. Read final `tab-scorecard.json`; every tab must be ≥9.
2. Open workbook with `openpyxl(data_only=True)`:
   - live floor equals JSON floor;
   - Exec/Audit mirror cells agree;
   - no ONE-TRUTH mismatch.
3. Inspect:
   - hero/cutaway;
   - GA;
   - P&ID NA-BY-DESIGN;
   - BFD energy topology;
   - SLD;
   - panel schedule;
   - process/instrument schedule.
4. Run/inspect:
   - `drawing-gates.json` — zero failing;
   - `render-vision-critique.json` — strict clean verdict;
   - `ship-red-team.json` — classify each claim against state;
   - `parts-ledger.json` — no genuine connectivity/orphan issue;
   - `powerwall-board.json` — zero undispositioned.
5. Confirm design quantities:
   - 13.5 kWh usable / ~14.08 kWh nameplate;
   - 11.04 kW, 230 V 1φ;
   - 3 MPPT / 20 kW PV;
   - enclosure near 1105×609×193 mm;
   - no MV/container/liquid-plant baseline.

## Phase 2 — Conditional fix batch

Only implement defects that survive Phase 1.

### A. Board-role inversion

If the auxiliary board is still named MAIN:

- implement choice-time magnitude ranking in
  `scripts/blender-universal/draw_panel_schedule.py`;
- calculate each hub's predicted load from the same device/contract evidence
  `_connected_kw_for()` later consumes;
- choose largest Σ kW, target-count as tiebreak;
- do not post-fill relabel;
- preserve semantic breakdown selection.

Required guards:

- 11 kW conversion board beats 0.2 kW auxiliary fanout;
- high-fanout low-power board stays sub;
- process-plant main board unchanged;
- full chain verification, not drawer-only.

### B. Process-schedule title

When `PID._process_topology(state)` is empty:

- title as `Instrument Index — Dry Electrical Product`;
- state `No process lines or valves — NA-BY-DESIGN`;
- retain the real instrument index;
- no score penalty.

### C. Outside-reviewer false positives

Do not alter engineering truth for recurring classified claims:

- 88×50 Ah×3.2 V = 14.08 kWh is correct;
- OEM fragment vs boxed-retail cost is a named design-to-budget hold;
- `not_found` MPN residuals are not connectivity faults;
- real Ewon catalogue price is not fictional.

Improve the evidence pack/prompt only if the same disproven claim recurs after run 79.

### D. Render fidelity

Only if human/strict vision still rejects:

- visible fan blades behind vent band;
- duct ribbon from fan zone to pack channel;
- AC/DC/PV bottom entry glands;
- horizontal module seams;
- all zone/vocabulary-keyed.

No generic decorative geometry.

## Phase 3 — Regression evidence

For every source change:

1. Add proveCatch and correct counter-case.
2. Run local module selftest.
3. Run drawing gate selftest.
4. Corpus-sweep classifier/filter changes:
   - Codema process edges retained;
   - RAS process edges retained;
   - SAF/CO₂ thermal/process edges retained;
   - Powerwall process edges zero.
5. Verify byte/slice identity on unaffected archetypes.
6. Commit explicit pathspecs only.

## Phase 4 — Powerwall loop

Use only:

```bash
bash scripts/run-loop.sh \
  briefs-loop/residential_powerwall_clone.md \
  out/powerwall-board.json \
  powerwall
```

Before each run:

- gate open;
- no other chain running;
- every active defect dispositioned with evidence.

After each run:

- inspect delivered artefacts;
- verify all three score surfaces;
- classify outside findings;
- batch genuine source fixes before next launch.

## Phase 5 — Honest ship condition

Done only when all are true:

- every delivered workbook tab ≥9;
- workbook live values equal JSON scorecard;
- `ships:true`;
- drawing gates all pass;
- strict render verdict clean;
- outside red-team has zero genuine findings;
- defect board has zero undispositioned genuine defects;
- fresh human SIGHT pass finds no rejection reason.

## Branch / one-engine rule

At handover HEAD was linearly ahead of `origin/main` (no divergent commits).
Do not merge stale `origin/oxccu-efuel`. After final validation, push the verified
linear HEAD to canonical `origin/main` using the repository's approved workflow.

## Deferred until Powerwall ships

Do not mix into the closing batch:

- broad cache/DAG/profile refactors;
- model-routing changes;
- forge-truth runtime migration;
- PCB/KiCad engine integration.

After Powerwall ship, next safe PCB wave is shadow-only:

1. promote disposition/capability contracts;
2. record PCB decisions in state;
3. no KiCad subprocess;
4. replay against BESS/CGM/drone/process-plant states;
5. then request closure, schematic/ERC and artifact runner in later waves.
