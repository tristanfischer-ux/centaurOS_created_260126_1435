# The Well (Polymathic AI) → Forge Anvil — Integration Plan

**Date:** 2026-07-11 · **Status:** PLAN (agreed direction; increments not yet built)
**Resource:** https://polymathic-ai.org/the_well/ · `pip install the_well` · data CC-BY-4.0 (commercial use OK with attribution) · code BSD-3
**Investigated by:** three-agent sweep (Well dossier · surrogate-engineering practice · Anvil integration map), 2026-07-11. Full agent reports summarised here; key sources linked inline.

---

## 1. WHAT IT IS (facts)

15 TB, 16 datasets (~20 HuggingFace repos under `polymathic-ai`) of numerical physics simulations in ONE uniform HDF5 schema (fields by tensor rank, boundary-condition groups, 80/10/10 splits). NeurIPS 2024 datasets paper (arXiv:2412.00568). Per-dataset sizes 7 GB → 5.17 TB; **streamable without download** via `WellDataset(well_base_path="hf://datasets/polymathic-ai/", ...)`. Ships small pretrained baseline surrogates (FNO/TFNO/U-Net/CNextU-Net, ~76 MB safetensors, `FNO.from_pretrained(...)`) that predict the NEXT TIMESTEP of a field given a 4-step history. Sibling artefact: **Walrus** (Nov 2025), Polymathic's 1.3 B-param continuum-dynamics foundation model trained largely on The Well.

Datasets closest to Anvil domains: `rayleigh_benard` (2D convection, Ra 10⁶–10¹⁰, Pr 0.1–10, 1,750 trajectories, ~370 GB), `shear_flow`, `turbulent_radiative_layer_2D` (~7 GB, smallest), `acoustic_scattering`, `helmholtz_staircase`. **No dataset covers**: duct/pipe turbulence, fluid-structure interaction, combustion, electronics enclosures, or any real device geometry.

## 2. THE VERDICT (hold this line)

**The Well is a calibration/validation corpus for Anvil, not a sizing engine.** Three findings force this:

1. **Its own models are research baselines**: ~30 % in-distribution VRMSE typical, long rollouts blow up, `rayleigh_taylor` intractable for all four baselines — per the project's own benchmark page and model cards.
2. **Out-of-distribution geometry is the killer** (SIMSHIFT benchmark, arXiv:2506.12007): a universal engine sizing one-off archetypes is OOD *by definition*. The checkpoints only accept inputs shaped like their training dataset — you cannot feed them "an enclosure".
3. **The literature is systemically overoptimistic**: 79 % of ML-beats-PDE-solver claims used weak baselines (McGreivy & Hakim, Nat. Mach. Intell. 2024). Industry's actual deployed fast-thermal tech is physics-derived ROMs (Siemens BCI-ROM), not neural surrogates. Even NVIDIA's guidance is "don't yet trust the model, test the physics".

**HARD RULE:** no ML surrogate on Anvil's **authoritative sizing path**. It would inject a non-deterministic, non-provenance-traceable, OOD-fragile number into a chain whose core value is deterministic `basis` provenance — the determinism-treadmill problem (#86) relocated onto the load-bearing path. This mirrors the existing chain-as-DB-consumer principle: **the chain consumes calibrated correlations; ML/simulation lives offline in the ingest loop.**

## 3. THE THREE SANCTIONED USES

### USE 1 — Correlation calibration corpus (the payoff; do first)
Anvil's entire thermal stack is lumped correlations (`thermal_envelope.py` fixed enclosure-rise lookup, `hvac_load_sizing.py` fixed U-values, `fan_coil_sizing.py`, etc. — see the integration map, §2 of the agent report). The Well's `rayleigh_benard` sweep (1,750 trajectories across four decades of Ra, two of Pr) is a free, citable ground-truth set for **validating and calibrating the natural-convection correlations** those tools embed:
- Extract Nu(Ra, Pr) statistics from the dataset trajectories (offline, streamed — no 370 GB download; per-trajectory reductions only).
- Diff against the closed forms the tools use (Churchill-Chu / Catton-style enclosure correlations).
- Where a tool's constant sits outside the data's band, fix the SOURCE RULE: bake the fitted coefficient into the tool with provenance (`physics_basis: "Nu-Ra fit, The Well rayleigh_benard (CC-BY-4.0, arXiv:2412.00568), RMSE ±X%"`) + a selftest pinning the fit.
- Same pattern later for `shear_flow` (mixing) and the acoustic sets (if an acoustics duty ever ships).

### USE 2 — Tool-generation validation fixtures
The tool-creation-on-the-fly machinery (`generic/tool-generator.ts`, "assume broken until its own self-test proves otherwise") currently self-tests generated tools against LLM-proposed expected ranges. For thermal/fluid duties, Well-derived reference statistics are **independent, non-LLM ground truth** for those `expect:{field:[lo,hi]}` bounds — a generated convection tool must land inside the band the real simulations show. This hardens the weakest link in tool generation (the LLM grading its own homework).

### USE 3 — Independent-method cross-check (gate-36 pattern; DEFERRED)
The benchmark net (gate 36) works because an independent top-down method diffs against the bottom-up engine. A Well-calibrated scaling law (NOT a neural net) can serve as the independent seat for thermal quantities: `system_thermal_dissipation_kw`-derived enclosure ΔT vs the Nu-Ra band → divergence >2.5× flags a HIGH. Deterministic, citable, no ML at runtime. If a field-level check is ever truly needed, a **templated OpenFOAM shadow gate is strictly better than any ML checker** (deterministic, citable, Mac-runnable).

### EXPLICITLY NOT DOING
- No FNO/U-Net/Walrus inference in the chain (see HARD RULE). Re-evaluate Walrus in 12–18 months **only if** a geometry-general enclosure-thermal model with published OOD benchmarks emerges; none exists mid-2026.
- No PINNs (retrained per problem instance — worse than running a solver).
- No ML deps (`torch`, `the_well`) in the chain `.venv` — gate-37 treats a broken/mismatched `.venv` as the #1 tool-bridge failure. The Well tooling lives in a **separate ingest venv** (`.venv-well/`), same quarantine as live distributor APIs (`scripts/ingest/*` only).

## 4. INCREMENT PLAN (for the next builder — Cursor or a future session)

**INC 0 — environment (30 min).** `python3.12 -m venv .venv-well && .venv-well/bin/pip install the_well torch --index-url per-platform`. Never touch the chain `.venv`. Smoke test: stream one `turbulent_radiative_layer_2D` trajectory via `WellDataset` on `hf://`, print field names + shapes.

**INC 1 — Nu-Ra harvest (the first real increment).** New `scripts/ingest/harvest-well-nusselt.py` (ingest side; live network legal there): stream `rayleigh_benard` metadata + per-trajectory reductions (time-averaged Nusselt per Ra/Pr from the temperature-gradient fields — the standard reduction), write `~/.forge-truth/well-nusselt-calibration.json` with {Ra, Pr, Nu_mean, Nu_std, n_traj, dataset_version, licence, url}. Cheap first pass: metadata + a sampled subset of trajectories, NOT the full 370 GB.

**INC 2 — calibration diff report (no engine edits yet).** Offline script diffs the harvested Nu(Ra, Pr) against every enclosure/natural-convection constant in the thermal tools (grep targets from the integration map: `thermal_envelope.py` enclosure-rise lookup, `hvac_load_sizing.py`, `fan_coil_sizing.py`). Output: a markdown report per tool — in-band / out-of-band / not-applicable (forced convection etc. is NOT covered by Rayleigh-Bénard; do not stretch the data past its regime: 2D, horizontally periodic, no internal obstructions).

**INC 3 — bake out-of-band fixes (source-rule fixes, one commit per tool).** For each out-of-band constant: fitted coefficient + provenance line + `--selftest` case pinning the fit ±tolerance. Regression-harness line per commit (house rule).

**INC 4 — tool-generator fixtures (USE 2).** Extend `tool-generator.ts`'s self-test assembly: when the duty matches a Well-covered regime, inject reference bounds from `well-nusselt-calibration.json` (read from disk, no network in the generator).

**INC 5 (DEFERRED) — thermal benchmark seat (USE 3)** as a shadow gate first, on the gate-32/36 template (compute → record → print; enforcing opt-in via env flag).

**Verification protocol per increment:** the corpus-sweep rule applies to any classifier/filter touched; every constant change is a source-rule fix with a proveCatch; the Calculations tab must render any new figure honestly (worked_calc formula naming the fit + its RMSE — never implying a closed-form derivation it doesn't have).

## 5. HONESTY RULES IF A SURROGATE EVER RUNS (future-proofing)

Should USE 3 ever escalate to an actual model forward pass (it should not, near-term): `confidence_class: 'ml_surrogate'` in PROVENANCE (new tier, flagged "needs verification" on the Tools-Used page); worked_calc formula = `"T_field = <model>(geometry, q_flux, ...)"` with the validation RMSE in assumptions; output labels must avoid gate-34 domain-marker vocabulary (marine/hydroponic/refrigeration tokens) or carry a suppress-class predicate; CPU inference only for decision-bearing numbers (PyTorch MPS has documented silent-wrong-result incidents).

## 6. KEY SOURCES
The Well: site + github.com/PolymathicAI/the_well + arXiv:2412.00568 · Walrus: arXiv:2511.15684 · SIMSHIFT OOD benchmark: arXiv:2506.12007 · McGreivy & Hakim weak-baselines: Nature Machine Intelligence 2024 · NVIDIA "test the physics": nvidia.github.io/physicsnemo/blog/2026/05/29/physicsnemo-cfd · BCI-ROM (industry's deployed fast-thermal tech): Siemens Simcenter blog.
