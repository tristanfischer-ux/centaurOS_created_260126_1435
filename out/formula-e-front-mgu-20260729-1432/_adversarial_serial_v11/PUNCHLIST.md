# FE Front adversarial serial v11 — full + universal

**Verdict: REJECT** · counts `{'FATAL': 1, 'MED': 2, 'HIGH': 1, 'PASS': 19, 'GAP': 2}`

### [FATAL] V11-001 — FIX · UNIVERSAL
- **Detailed GA generator is FE-front-only script**
- Where: `scripts/fe-front-draw-detailed-ga.py`
- Why: Universal rule: GA must come from draw_ga.py / form-meshes for all product classes, not a one-off FE script
- Evidence: `"file exists as fe-front-* only"`
- Fix: Port morphology-aware views into draw_ga.py (sealed traction path) or general detailed-ga module
- **UNIVERSAL ISSUE**

### [MED] V11-002 — REVIEW · UNIVERSAL
- **PE filmcap densify is traction-path morphology**
- Where: `build_universal_scene.py PE film bank`
- Why: Acceptable if only under sealed traction pack path; verify not breaking other sealed instruments
- Evidence: `"u_se_td_pe_filmcap densify under FPK PE drawer"`
- Fix: Confirm call site is traction-only (u_se_td_*)

### [HIGH] V11-003 — GAP · UNIVERSAL
- **Gate-drive MPN DB seed is local forge-truth only**
- Where: `~/.forge-truth/forge-truth.db inserts`
- Why: Other machines / CI cannot resolve ACPL-336J without seed; repair is not portable
- Evidence: `"v10 inserted rows via local sqlite"`
- Fix: Add migration/seed script in-repo OR curated-pinout path that does not require ad-hoc DB rows
- **UNIVERSAL ISSUE**

### [MED] V11-004 — REVIEW · UNIVERSAL
- **BoM identity repair was twin state stamp**
- Where: `state.json requirementsBom`
- Why: Source fix should live in requirements_bom densify/reconcile so next chain does not recreate CoolIT/MKP lies
- Evidence: `"v9 repaired twin only"`
- Fix: Add post-requirementsBoM sanitiser in chain or densify script
- **UNIVERSAL ISSUE**

### [GAP] V11-006 — GAP · EXCEL
- **Executive Summary floors at 4 (release_readiness)**
- Where: `Executive Summary`
- Why: Honest floor while not homologated — not a greenwash fix target
- Evidence: `["capped at the dossier FLOOR (4/10): the cover cannot claim a higher score than its weakest sheet \u2014 fix that sheet to raise this one"]`

### [GAP] V11-007 — GAP · EXCEL
- **Quality & Audit floors at 4 (release_readiness)**
- Where: `Quality & Audit`
- Why: Honest floor while not homologated — not a greenwash fix target
- Evidence: `["the dossier does NOT ship \u2014 dossier floor 4/10 (min of every deterministic section & non-mirror tab, the SAME number the verdict quotes); Verification/race evidence still must close before homologation"]`
