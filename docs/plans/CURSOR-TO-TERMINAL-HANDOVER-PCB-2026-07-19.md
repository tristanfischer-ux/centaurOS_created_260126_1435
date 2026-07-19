# Cursor → Terminal handover (PCB close-out + merge)

**Date:** 2026-07-19 ~09:32 BST  
**From:** Cursor (PCB / wiring / firmware-proof on `cursor-pcb`)  
**To:** Claude Code terminal (mechanical form / Blender / chain on `oxccu-efuel`)  
**Status:** PCB offline close-out **DONE** on `origin/cursor-pcb` @ `96818151e`. Merge into `oxccu-efuel` **requested by Tristan, not yet executed.**

---

## 1. Ownership (unchanged)

| Lane | Owner | Tree / branch |
|---|---|---|
| Mechanical form, Blender, connection/composer, Yuri briefs | **Terminal** | `~/Developer/CentaurOS-oxccu-efuel` · `oxccu-efuel` |
| PCB architecture, identities, punchlist, firmware-proof prototypes | **Cursor** | `~/Developer/CentaurOS-oxccu-efuel-cursor-pcb` · `cursor-pcb` |

Cursor must **not** edit Blender form SOURCE (`functional_form`, `build_universal_scene`, instrument form grammar, etc.) while you own form.  
Terminal should **not** invent PCB MPNs / HAT topologies without gold evidence — pick up via merge instead.

---

## 2. What Cursor finished (read this before merging)

Tip: **`origin/cursor-pcb` = `96818151e`**

### Closed honestly (offline)

| Item | Where | Meaning |
|---|---|---|
| Fitted-MPN residuals | punchlist / verified candidates | **0** remaining fitted gaps (NinjaPCR/OpenDrop) |
| OpenDrop electrode mating | `pcb-opendrop-electrode-route-proof.ts` | 64 ch + Mini-DIMM 244; rejects JST collapse |
| OpenDrop HV pin-map | `pcb-opendrop-hv-domain-pinmap-proof.ts` | `V_HV`/`V_HV_C`/`GND_C`/`FLUXL_*` vs `V_USB`; rejects LV-only |
| OpenDrop HV↔LV copper floor | `pcb-opendrop-hv-lv-creepage-proof.ts` | Gold pad-center min ≈ **2.69 mm**, floor **2.5 mm**; fires on 0.5 mm + LV-only “OpenDrop” boards |
| OpenDrop firmware Tier-0 | `prototypes/opendrop-pcb-software-benchmark/` | Native proof + HV safe-off; **FAB-READY SOFTWARE PROOF — UNPROVEN IN HARDWARE** |
| Pioreactor heater_20ml | `pcb-pioreactor-wet-actuation-topology.ts` | Resistive FFC daughterboard; switch `off_board_host_hat` |
| Pioreactor stir/pump | punchlist | **Hard-blocked** until HAT KiCad/BOM published (`blocked_until_hat_electricals_published`); inventing DRV8876 = FAIL |

Electrode punchlist status: `route_mating_hv_pinmap_and_creepage_proof_recorded` (`missingEvidence.kind=none`).

### Explicit non-claims (do not regress these)

- No full serial-design-chain / Gerber / HIL claimed for this work  
- No Gate 40 / Excel “FUNCTIONALLY VERIFIED” from firmware prototypes  
- No IEC 61010 certification (pad-center floor ≠ certified creepage)  
- No invented Pioreactor HAT MOSFET/stir/pump topology  
- Current OpenDrop **regen** copper is still LV-only wrong-class — creepage checker correctly fails it with `missing_hv_domain_copper` until generator emits real HV nets

---

## 3. Will merge impact your form work?

**Form/Blender SOURCE: no.** Diff `oxccu-efuel...cursor-pcb` has **zero** hits on `functional_form`, `build_universal_scene`, instrument-form grammar, human-factors, etc.

**What can interact:**

| Risk | Action |
|---|---|
| Dirty `scripts/blender-universal/out-universal/*` + harness stubs in your tree | Stash or leave unstaged — **do not** commit them in the merge |
| `docs/plans/CURSOR-HARNESS-INBOX.md` | Likely conflict — keep **both** sides’ production notes |
| Next chain with `PCB_STAGE=1` | Will see new architecture / atopile / proofs — **intentional** PCB improvement, not form breakage |
| Your local `oxccu-efuel` **ahead 7** (Yuri briefs + composer/composite-host) | Merge **PCB into that history** (`git merge origin/cursor-pcb`), do not reset |

---

## 4. Recommended merge procedure (you execute)

Work from the main checkout. Pause mid-chain / mid-Blender write for a few minutes.

```bash
cd ~/Developer/CentaurOS-oxccu-efuel
git fetch origin cursor-pcb oxccu-efuel

# Optional: park runtime dirt (do NOT lose form SOURCE edits)
git stash push -u -m "pre-pcb-merge blender out + harness stubs" -- \
  scripts/blender-universal/out-universal \
  tasks/harness-stubs \
  .cursor/hooks/state/continual-learning.json || true

# Keep your Yuri/composer tip; bring PCB in
git checkout oxccu-efuel
git merge origin/cursor-pcb -m "merge(cursor-pcb): PCB offline close-out into oxccu-efuel"

# Resolve CURSOR-HARNESS-INBOX.md by concatenation if conflicted
# Then:
npm run typecheck:baseline   # or rely on pre-push
npx jest src/lib/pdf-engine-v2/lib/pcb/pcb-opendrop-hv-lv-creepage-proof.test.ts \
  src/lib/pdf-engine-v2/lib/pcb/pcb-opendrop-hv-domain-pinmap-proof.test.ts \
  src/lib/pdf-engine-v2/lib/pcb/pcb-opendrop-electrode-route-proof.test.ts \
  src/lib/pdf-engine-v2/lib/pcb/pcb-pioreactor-wet-actuation-topology.test.ts \
  src/lib/pdf-engine-v2/lib/pcb/pcb-unresolved-component-punchlist.test.ts --no-coverage

python3 -m unittest discover -s prototypes/opendrop-pcb-software-benchmark/tests

git push origin oxccu-efuel
git stash pop   # if you stashed
```

After merge, set harness inbox Status to something like:  
`PCB merged into oxccu-efuel — terminal owns form; Cursor advisory unless new PCB residuals appear.`

---

## 5. What you should pick up next (priority)

### P0 — Merge (Tristan asked)

Execute §4. Confirm tip includes `96818151e` ancestry and your composer/Yuri commits.

### P1 — Form / Yuri (your lane — continue)

You already have local unpushed work (ahead 7), including:

- `feat(composer): composite-host (Option A)…`
- `feat(chain): opt-in CHAIN_COMPOSER…`
- Yuri organoid / RPM appliance briefs + wattage strip

Continue form/composer from that tip **after** merge. Do not let PCB merge rewrite those commits.

### P2 — Only if you run PCB-bearing chains

- Prefer gold-backed boards; OpenDrop regen that is LV-only must stay failing creepage until generator SOURCE fix  
- Do **not** “close” Pioreactor stir/pump with DRV8876 without HAT KiCad/BOM  
- Firmware prototypes stay isolated until you consciously wire Gate 40 (not done)

### P3 — Optional later (not blocking form)

- Fix OpenDrop/atopile generator so regen emits `V_HV` / `V_USB` / isolators, then re-run creepage checker on real `board-routed.kicad_pcb`  
- Gate 40 / chain firmware-proof integration (separate campaign)

---

## 6. Key paths for you

| Purpose | Path |
|---|---|
| This handover | `docs/plans/CURSOR-TO-TERMINAL-HANDOVER-PCB-2026-07-19.md` |
| Live inbox | `docs/plans/CURSOR-HARNESS-INBOX.md` (Cursor tip is fresher on `cursor-pcb`) |
| Punchlist | `src/lib/pdf-engine-v2/lib/pcb/pcb-unresolved-component-punchlist.json` |
| OpenDrop creepage | `src/lib/pdf-engine-v2/lib/pcb/pcb-opendrop-hv-lv-creepage-proof.ts` |
| OpenDrop firmware Tier-0 | `prototypes/opendrop-pcb-software-benchmark/` |
| NinjaPCR firmware (already closed offline) | `prototypes/ninjapcr-pcb-software-benchmark/` |
| Pioreactor topology | `src/lib/pdf-engine-v2/lib/pcb/pcb-pioreactor-wet-actuation-topology.ts` |
| Gold OpenDrop (SIGHT, not committed) | `out/_gold-opendrop-repo` @ `934a44db…` |
| Gold Pioreactor (SIGHT, not committed) | `out/_gold-pioreactor-repo` @ `ca40a91e…` |

---

## 7. Quick start checklist for terminal

1. Read this file end-to-end.  
2. Glance Cursor tip: `git log -5 --oneline origin/cursor-pcb`.  
3. Stash Blender runtime dirt if present.  
4. `git merge origin/cursor-pcb` into `oxccu-efuel`.  
5. Resolve inbox by keeping both narratives.  
6. Run the focused PCB tests in §4.  
7. Resume form/composer/Yuri work on your tip.  
8. Reply in harness inbox under **Terminal reply** when merge is done.

---

## 8. Message to paste into harness inbox (optional)

```text
## Terminal receipt — 2026-07-19

Read CURSOR-TO-TERMINAL-HANDOVER-PCB-2026-07-19.md.
Merging origin/cursor-pcb @ 96818151e into oxccu-efuel.
Form/Blender SOURCE untouched by PCB diff; stashing out-universal dirt first.
Will not invent Pioreactor HAT stir/pump or claim HIL/Gate 40.
```
