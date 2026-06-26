# RECOVERED TRACKER ITEMS — still-applicable items mined from old trackers (2026-06-26)

> 4 sub-agents read all ~117 old tracker/plan/audit files. This is the full per-file detail.
> The live items are folded into LOOP-TRACKER.md's master checklist (RECOVERED block). Sources cited.


═══════════════════════════════════════════════════════
## FROM BATCH 00

# Tracker-mining findings — batch 00 (30 files)

Master-checklist stages: 0 (honest+total scorer), 0.5 (SIGHT — audit DELIVERED artefact), 1 (provenance spine), 2 (risk-loop closure), 3 (drawing-content generators), 4 (class-appropriate economics), 5 (tags + verification coverage + benchmark-net).

---

## RELEVANT FILES

### ANVIL-UNIVERSAL-TRACKER.md  (RELEVANT — the single richest source)
The 2026-06-14 / 2026-06-17 Tristan-live-concerns + the v10 council re-score are the direct ancestors of the current LOOP-TRACKER stages. Still-open items:

- **C5 — narrative uses the OLD word-engine, not the new physics/Blender/BoM.** `buildNaturalLanguageLayer` (radical sentence-generator) is a separate word-tree that splices a few numbers but is NOT driven by the physics contract / Blender / new BoM. CONFIRMED, task #156. → Stage 1 (provenance spine — every number must trace to source) + Stage 0.5 (SIGHT — the prose is part of the DELIVERED artefact). STILL-OPEN.
- **THE RENDER-FROM-LEDGER DIVERGENCE (v10 council, #1 blocker across 4/6 seats):** the ledger/contract holds the right value but the drawing/cover renders a STALE one — line-list stamps CS while BoM is HDPE; valve schedule prints FC while physics says fail-open; COVER renders OLD word-engine BoM £1,940 while requirements BoM is £8.44M; instrument index shows 1 while ×10 synthesised. Every drawing must be a deterministic PROJECTION of ONE ledger. → Stage 0.5 (SIGHT) + Stage 1 + Stage 3. STILL-OPEN, this is the strongest single lever named.
- **Part-centric PORT-MODEL ledger (2026-06-17b):** ledger is EDGE-centric not PART-centric — can't read a part's full port set off its row; a vessel's instruments are SEPARATE parts so the tank row hides its DO/level/temp tie-ins; NO comms/network drawing (signal sized but never drawn). TARGET: part-centric ledger, each row a typed PORT LIST {medium, direction, connected_part, via, size, tool}; each drawing = deterministic projection filtered by medium (P&ID=fluid+gas+instr, single-line=power, network=signal[NEW], HVAC=thermal/air). → Stage 3 (drawing-content generators, one layout source) + Stage 5 (tags). STILL-OPEN, task #157.
- **LEDGER-WIDE UNIVERSAL AUDIT (task #154) — derived-vs-defaulted.** The council kept surfacing properties the engine DEFAULTED (material→carbon-steel, instrument→NDIR, fail-state→fail-closed, price→LLM-trusted) instead of DERIVING. Consolidate the scattered service→property selectors into ONE deterministic ledger-characterisation tool: service {fluid,phase,conditions,measured-property,rating,criticality} → material/instrument/fail-state/price/regulatory. → Stage 1 (provenance/derivation) + Stage 4 (economics derived not defaulted). STILL-OPEN.
- **C2/C3/C4 ⟳ Blender (raised repeatedly, may be partly fixed):** C2 equipment OVERLAP (tank on top of tank — place_all footprint), C3 pipe-run correctness, C4 P&ID not showing all 10 tanks (shows 1 rearing tank not the 10-tank array). Tristan flagged "raised before, not fixed". → Stage 3 (per-part geometry dims, real layout, distinct drawings). NEEDS RE-VERIFICATION on a current run — tasks #108/#112/#149 may have touched these.
- **SCOREBOARD: 5/8 archetypes still FAILING** (compute_heat exit 11, BESS/vertical_farm/satellite exit 10, edge_ai exit 18) as of 2026-06-17; universal fixes verified no-op for BESS but NOT verified to HELP the failing ones. Their exit-10 BoM failures likely the SAME blind-default classes. → Stage 0 (honest scoring across archetypes) + universality. STILL-OPEN, task #155.
- **O2 mass balance unclosed (LOX 384 vs demand ~766 kg/day), ventilation heating ~490 kW missing, duplicate recirc pump £526k, 5 gate-21 mis-pins (476× sensor), tank 334 m³ vs 12.4×3.2 label, feed/grading/quarantine absent from drawings** (v10 genuine non-render gaps). → Stage 2 (physics/risk) + Stage 3 (drawings). STILL-OPEN but RAS-specific; confirm against current run.

### CO2-COST-AUDIT-TRAIL-PLAN.md  (RELEVANT — Stage 1 + Stage 4)
- **Per-line `cost_basis` provenance record** {method, inputs[], unit_rate{value,unit,source,cepci_year}, correlation_ref, factors[], result_gbp, estimate_class (AACE 5..1), confidence, rfq_recommended}. Today only ~6% of lines carry a sourced price; the engine captures part-IDENTITY provenance but ZERO cost-basis provenance. → Stage 1 (provenance spine — where-from) is EXACTLY this for the cost column. STILL-OPEN (status was PROPOSED/mockup-first).
- **Process-equipment cost correlations** (Towler & Sinnott / Turton `C_e = a + b·S^n`, CEPCI-indexed) + Lang/bare-module factors for fabricated process equipment, replacing the class-anchor reference curve. Universal across process classes. → Stage 4 (class-appropriate economics). STILL-OPEN.
- **Honest confidence ceiling: a correlation estimate for bespoke fab equipment is AACE Class 4 (±30%), NOT Class 1 (±10%); never present ±30% as ±10%.** + RFQ-pack generator for the big lines. → Stage 0 (honest scoring) + Stage 4. STILL-OPEN design principle worth keeping.

### DESIGN-LOOP-AND-BOM-HARVEST-PLAN.md  (RELEVANT — Stage 1/2/3, but check what's built)
Verified-by-code 2026-06-12, with a 2026-06-12 CORRECTION noting ~80% already built. Genuinely-remaining (R1–R5):
- **R1 — close the loop to the ENGINE.** convergence_loop.py converges demand (6000→6013.9 kW) + sizes a 5895 mm² feeder @9137 A, but those numbers appear 0× in state.json — the dossier still uses 6000 (brief value). The loop moves the drawings, not the headline numbers. Ordering wrinkle: convergence runs AFTER BoM/cost/render. → Stage 1 (provenance — converged value must flow to where-used) + Stage 2 (loop closure). STILL-OPEN (small).
- **R2 — TOPOLOGY DENSIFICATION (the real long-pole).** 8 routed runs → £41,854 (one £31,201 bus dominates), 2–3 orders below a real plant's field piping/cabling/instrument-wiring/tray-fill. Densify toward a P&ID census so the harvested interconnect BoM is COMPLETE. This is the direct ancestor of C4 ("show all 10 tanks") + drawing density. → Stage 3 (P&ID/BFD emit real topology). STILL-OPEN, multi-day, coverage-not-code.
- **R3 — fold interconnect £ into the HEADLINE cost** (gate-2 B-3 + gate-32 reconcile) ONLY AFTER R2; additive+labelled is the honest interim. → Stage 4. STILL-OPEN.
- **design-loop-ledger.json** — one record per pass {pass, electrical_kw, feeder_mm2, bom_total_gbp, output, changed_fields[]} so "it looped N times" is READ not claimed; reconciliation gate (every placed object in parts-manifest maps to a BoM line and vice-versa, target zero divergence). → Stage 0.5 (artefact-vs-state reconciliation) + Stage 2. STILL-OPEN.

### DESIGN-TO-BUDGET-PLAN.md  (RELEVANT — Stage 4, partly NEW)
- **Design-to-budget inverse loop:** fix a £ ceiling → engine returns a conforming design; the budget SETS THE SCALE and OUTPUT is the dependent variable ("£B → X units", not "infeasible"). Ranked cost-lever operators (down-scale capacity ×(new/old)^0.6, material downgrade, redundancy trim, spec trim, make-vs-buy, feature cut), each a deterministic transform with predictedSaving() + a guard gate. Reuses auto-adjust.ts decide→apply→retry, cap 3 passes. → Stage 4 (class-appropriate economics: capex/payback variant). STILL-OPEN. NOTE: this is the #97 design-to-budget variant Tristan keeps flagging as "his call" — likely still a NAMED DECISION not yet greenlit, not auto-do.

### DESIGN-TO-ENVELOPE-PLAN.md  (RELEVANT — Stage 3, doubles as a sizing-bug net)
- **Design-to-envelope fit-audit:** force a design into a fixed building envelope (40 ft hi-cube = 12.03×2.35×2.70 m internal). Deterministic envelope-fit-audit {fits, containers_needed, tallest_item, over_items[], over_mass_kg} cross-checking CAD bbox vs engineering contract vs mass — "the most powerful sizing-bug detector available" (frozen-column bugs become a visible geometric contradiction). Fit is PARTIAL: modular core IN, tall columns/interconnect field-erected OUT. → Stage 3 (one layout source for GA+render; real geometry dims) + Stage 0.5 (cross-check delivered geometry). STILL-OPEN, also a strong regression net even before the loop.

### DISCOVER-ON-MISS-DESIGN.md  (RELEVANT — Stage 5 BoM coverage)
- **Part B — the live DISCOVER/grower leg** (DB-first → on-miss web-search+own-training → VERIFY via distributor cascade → writeback to distributor_cascade_cache AND pretraining_extracted_parts class-tagged → next run hits). Part A (in-chain, DB-read-only, cache-real-only) is BUILT + tested; Part B was DEFERRED by council with guards (exact proposed==returned MPN before miss=0; no near-match poisoning of gate-20 cache; extend the chain-as-DB-consumer regression test). KEY FINDING: DB-first alone cannot lift exotic classes (HAPS library genuinely lacks real parts, RAG sim 0.48–0.62) — the lift REQUIRES growing the DB. → Stage 5 (verification coverage / branded-part coverage = the BoM long-pole). STILL-OPEN (Part B unbuilt), supervised.

### AUDIT_TRACE.md  (RELEVANT — reference map + a few live bugs)
A code-verified 50-stage map of the chain (2026-05-23). Mostly a navigation aid, but it names concrete still-live data-flow defects:
- **Stage 12→32 keyMetrics=null gap (CROSS-CUT 10):** keyMetrics is null when passed to Stages 15/18/19/20/22/24/25 (skeleton critic, R1, physics critic, R4, specialist, physics-repair) — only populated at Stage 32. Every reviewer/critic between runs blind to the headline metrics. → Stage 2 (risk-loop sees wrong inputs) / Stage 1. STILL-OPEN unless since fixed.
- **Stage 18 `skeletonFailFast` set but never branched on** (dead gate — letter not intent). → maps to the GATE INTENT RULE. STILL-OPEN.
- **Stage 39a `stripWordSuffixFromDesign((state as any).design)` is a NO-OP** (state has no `.design`, only `.moduleDecomposition`). Dead code. Low value.
- **Stage 8 contract throw → silent skip to LLM-only Generator** (engineeringContract stays null, Stage 13 silently skipped). → fail-closed concern, Stage 0. STILL-OPEN.
- **Grok's missing Stage 48.5 post-render integrity check** (size/header/page-count) — NOTE this has SINCE been implemented as exit code 6 per CLAUDE.md, so likely DONE.
Use this file as the stage-to-file:line map when routing a SIGHT finding to its source stage.

---

## DEAD FILES

- DEAD: ANVIL-UNIVERSAL-LOOP-PLAN.md — superseded planning doc; its content is fully carried (and updated) by ANVIL-UNIVERSAL-TRACKER.md above. (Not dead-workstream, just redundant with the tracker — mined via the tracker.)
- DEAD: AUDIT-TRACKER.md — fractionalforge.app web/security/billing red-team (RLS, Stripe, OG tags, TS errors). Marketing-website + platform-security workstream.
- DEAD: AUTOPILOT-CRON-REWRITE-PLAN.md — autopilot state-machine / Vercel-cron orchestrator rewrite; the autopilot engine was RETIRED 2026-05-19 (chain unification). Abandoned workstream.
- DEAD: BUSINESS-PLAN-IMPORT-RED-TEAM.md — business-plan-import feature for the platform Strategy page (Opus objectives extraction). Marketing/platform app.
- DEAD: CASPER-PLAN-AND-REDTEAM.md — business-model / go-to-market / funnel / FCA strategy (the "AWS for hardware founders" plan). Commercial strategy, not engine. (One transferable line: "no error an expert would laugh at" correctness bar — already absorbed into the OPERATING-FRAME adversarial-engineer directive.)
- DEAD: CHAIN-ENGINE-AUDIT-2026-05-19.md — chain-unification lockdown audit + orphan-UI cleanup (32 dead sub-routes, legacy cad-lab redirect). One-engine consolidation done; UI-cleanup is platform-app surface.
- DEAD: CHAIN-FIRESTORM-ITER8-SUMMARY.md — historical iteration log; every fix listed was landed + later superseded by the 36-gate stack. No open items.
- DEAD: CHAIN-FIRESTORM-SUMMARY.md — historical iteration log (heat-pump 4-iter); carry-over fix paths (Engine B classifier, cost-down round, material-rule pass) all superseded by current gate stack. No still-open item not better captured elsewhere.
- DEAD: CHAIN-FIRESTORM-TRACKER.md — operational state-machine for the firestorm loop; historical.
- DEAD: CI-FIX-NEEDED.md — one-off GitHub Actions workflow-token-scope fix (tsc baseline). Infra, needs Tristan's hand; not engine quality.
- DEAD: COMMERCIAL-AUDIT-ACTION-PLAN-V2.md — go-to-market / outreach / community / pricing tasks. Marketing.
- DEAD: COMMERCIAL-AUDIT-AND-ACTION-PLAN.md — full commercial audit + 5-persona website red-team + revenue targets. Marketing.
- DEAD: COMPLETENESS-AUDIT-money.md — Money-redesign feature completeness audit (Supabase tables, Xero, RLS). Platform-app feature.
- DEAD: CONTRAST-FIX-HANDOVER.md — WCAG-AA international-orange token contrast fix (604 use-sites). Marketing-website CSS/visual.
- DEAD: COORDINATION-STATUS.md — multi-terminal redesign phase coordination (Forge/Money/Plan/Products). Platform-app redesign.
- DEAD: DEAD_STATE_AUDIT.md — list of 7 deletable dead state.json fields (physicsRepair, cost_reality_band/_verdict duplicates, etc.). Housekeeping/cleanup, no quality lever; not worth a checklist item.
- DEAD: DOGFOOD-TRACKER.md — dogfooding session UI fixes (test accounts, OG tags, onboarding wizard). Marketing/platform app.

═══════════════════════════════════════════════════════
## FROM BATCH 01

# Tracker Mining — Batch 01 Findings

Scope: still-applicable items for the dossier-≥8 deterministic-engine work (Stages 0, 0.5, 1, 2, 3, 4, 5; NEW = not on checklist).

---

## RELEVANT FILES

### ENGINE-FIX-PLAN-2026-06-14.md
The single most relevant file in the batch — it IS an engine loop plan, grounded in a real RAS run (`out/ras-briefexp`). Most maps onto the current checklist; several items still open.

- **Brief-expansion caching per brief-hash** — make a given brief deterministic (the 13,360 vs 3,340 m³/h turnover variance between runs). [Stage 1] [STILL-OPEN]
- **Tool selection = FULL COVERAGE, no number cap** — enumerate every duty + principal equipment item + electrical feeder + control loop; count falls out of the plant, not a hardcoded 6–14 cap. [Stage 2] [STILL-OPEN — current focus is risk-loop, coverage cap may persist]
- **Tool-creation-on-the-fly** — when no catalogue tool fits a duty, generate a validated sizing tool (Python), self-test (assume broken until it PASSES its own generated self-test), register as `candidate`. [Stage 2/NEW] [STILL-OPEN]
- **Every brief duty wired as a contract key → consumed by a sizing tool** — verify every duty drives the equipment that meets it. [Stage 2] [STILL-OPEN — provenance-adjacent]
- **Blender single-source: `topology-reconciliation.json`** — Blender writes node→N-real-placed-units; every drawing reads it so P&ID/GA/single-line cannot disagree (the "two divergent sources: qty-expanded manifest vs collapsed topology" bug). [Stage 3] [PARTLY-DONE — drawing-gates G5 qty-coverage exists; confirm single-source is wired]
- **Everything explicit, not "×N bank" labels** — draw each of the N tanks/connections. [Stage 3] [PARTLY-DONE — RAS v20 did 8-recirc-pump replication; verify universal]
- **Real per-feeder electrical loads** — panel schedule must not fake a uniform kW (total÷7); single-line must not read 0.0 A. [Stage 3] [STILL-OPEN — maps to drawing-gate G2 load_reconcile, but the real per-feeder derivation may be incomplete]
- **GA overlap / block-flow occlusion fix** — spacing/no-overlap rule + ordered non-occluding block-flow. [Stage 3] [STILL-OPEN]
- **Cost stack base = Σ priced BoM rows** — headline must trace to the visible rows (was fixed ratios off a `raw_materials` number from a different path → rows and headline don't connect). [Stage 4] [STILL-OPEN — two-cost-surface problem is a known recurring gotcha]
- **Grow the allowlist (verify→add), don't DROP unverified parts** — the 110-entry allowlist dropping real parts (NSX1600N, Siemens PLC, REF615) → thin BoM. [Stage 5] [STILL-OPEN]
- **Price every BoM row with shown basis** (DB-first→online→educated guess). [Stage 4/5] [PARTLY-DONE — corpus-median lift landed; per-row basis + live lookups remain]
- **The LOOP is the spine** — tools→Blender→drawings round-and-round ≥3×, read each engineering doc critically ("does this make sense?"), each "doesn't make sense" discovers the next tool → back to step 1; only THEN the BoM. [Stage 2/3 + NEW] [STILL-OPEN — the deterministic multi-pass loop is exactly the current LOOP-TRACKER theme]

### GENERIC-EMITTER-PLAN.md (Wall-3)
Universal unseen-class path. Several items are the durable design spine for "universal across archetypes + self-correcting".

- **Architecture schema slot + exit-32-style brief-architecture fidelity gate** — structured `architecture` block (consumable_strategy, stated_mechanisms[]{function,mechanism,forbids[]}, wetted_path_material, topology_assertions[]); a deterministic gate that HARD-fails when a brief-required mechanism is absent or a forbidden one present. Generalises to "every brief-required subsystem is present". [Stage 2 / NEW] [STILL-OPEN — recurs as HAPS B-6]
- **PLAUSIBILITY_BANDS table (data, not per-class code)** keyed by (quantity|ratio, regime)→{plausible, hard_fail}; hard-gate the physically-impossible (source-vs-sink power balance >5×), soft-clamp the merely-suboptimal. [Stage 2/4] [STILL-OPEN]
- **Auto-promotion flywheel** — first unseen instance scores ≥6 + blessed → promote validated structure to a `class_reference` DB row; second instance reads the template. Growing-DB applied to the DESIGN layer. [Stage 5 / NEW] [STILL-OPEN — `writebackDiscoveredNode/Edge` now has callers per DB-AUDIT, but promotion of converged sizing is unsolved]
- **Semantic self-audit (gate 31) as the universal physics oracle / convergence signal** — an LLM-judge asking "does this design's physics close?" for any class, used as the loop's reward signal (not just a backstop). [Stage 0.5 / 5] [PARTLY-DONE — gate 31 exists as shadow advisory; using it as convergence signal is open]
- **LLM authors per-class SIZING CODE, iterated against the oracle** (deterministic + testable + cacheable), not a one-shot design — the route to ≥8 on unseen classes. [NEW] [STILL-OPEN — strategic, the genuine long pole for "universal ≥8"]
- **gate-20 ⊥ gate-23 deadlock mitigation** — widen part search sub-module→module→functional-radical before dropping a slot. [Stage 5] [STILL-OPEN]

### HAPS-PHYSICS-AUTOPLANNER-SCOPE.md
HAPS-specific bugs but TWO are explicitly flagged UNIVERSAL grep-able patterns — exactly the self-correcting-engine work.

- **B-1: "every verifier rule references an emitted quantity" invariant** — dead consistency rules from key-name mismatch (rule references `solar_peak_kw`, plan emits `solar_harvest_peak_kw`) silently no-op at `warning`. Add a harness invariant; flagged as likely recurring across registered classes. [Stage 2 / 5 / NEW] [STILL-OPEN]
- **B-6: brief→design requirement-coverage gate (UNIVERSAL)** — assert every brief-required subsystem is present, fail closed when (e.g.) "hydrogen fuel cell" is required but absent. Same as the Generic-Emitter Quality layer; generalises to all classes. [Stage 2 / NEW] [STILL-OPEN]
- **B-7: flip physics-critic enforcement ON for coherence/impossibility faults, not just named-part-vs-rating** — extend `issueIsBlocking` + corrector to quantitative-impossibility/coherence (701 W/m², 320 W). [Stage 2 / 5] [STILL-OPEN]
- **B-5: reconcile-to-contract pass that rewrites LLM prose scalars to the canonical contract value** — gate-18 only detects+aborts, never reconciles (cruise 2.27 vs 33.3 kW). [Stage 1 (provenance) / 3] [STILL-OPEN — provenance-spine adjacent]
- **B-3: pick one canonical nameplate field; the tool writes back into it** — two un-reconciled energy fields → gate-18 contradiction. [Stage 1] [STILL-OPEN]

### IMPROVEMENT_PLAN.md
Older (2026-05-23) but several concrete source-rule bugs that may still be live (be conservative — verify before assuming fixed).

- **Heat-pump wrong-key bug** — `engineering-contract.ts:1138-1139` reads `brief.constraints.min_ambient_c.value` / `max_ambient_c.value` which don't exist in the schema (`operating_environment.temp_min_c/temp_max_c`); brief operating envelope ALWAYS discarded for heat pumps. [Stage 2] [STILL-OPEN — verify]
- **7 archetypes with fallthrough-to-assume-unit** (solar_inverter, wind_turbine, ups_inverter, cnc_machine, e_bike, pemfc, smr) — `Number(tp.value ?? FALLBACK)` silently treats unknown units as class default → the 5 MW→0.09 MW class of disaster. Use `targetPerformanceValueAs` + family check. [Stage 2] [STILL-OPEN — unit-family is a known recurring family]
- **Missing price-band entries** for wind/solar/h2/ups/pemfc/smr/dac/ssb — cost-stack defaults to wrong archetype install ratio. [Stage 4] [STILL-OPEN — verify against current class-price-bands]
- **Promote convergence-not-reached to a visible failure** — `executor.ts:88-98` pushes a WARNING and ships iter-N state as if converged; orchestrator returns ok=true. [Stage 2 / 5] [STILL-OPEN]
- **h2-electrolyser.ts:143 `q({quantities:{}} as any, ...)` anti-pattern** — empty quantities object defeats the `q()` pattern (paste error). [Stage 2] [STILL-OPEN — minor]
- **23 minimal-archetype stubs use `buildMinimalContract`** returning empty macro_assembly_prices/topology/closures → Generator hallucinates rather than computes. [Stage 2/4] [STILL-OPEN — large, partly superseded by universal-contract-sizing]
- **Centralise LLM temperature/seed config** — 13+ call sites with different temperatures → same brief produces different output across runs (reproducibility for honest scoring). [Stage 0 / NEW] [STILL-OPEN]
- **Surface silent BoM exclusions** — rows flagged `cost_repair_excluded_from_subtotal` show a line total but don't sum ("96 + 8 = 0"); label "Sub-total (excl. N items pending review)". [Stage 1 / 4] [STILL-OPEN — provenance/honesty]

### FORGE-ENGINE-DB-AUDIT.md (2026-06-04)
The growing-DB loop audit — directly relevant to Stage 5 (verification coverage + the DB-first/write-back principle).

- **products store: no embedding column + lookup result discarded** — `pretraining_products` can't be hybrid; lock gate captures the lookup but does NOT mutate the contract ("best-effort, non-fatal"). Grows a DB nobody downstream consumes. Fix: add embedding column + wire `lookupProduct` into `contract.quantities`. [Stage 5] [STILL-OPEN]
- **methods store: no web-on-miss topology discovery** — on a genuinely-new class, on-miss = baked-TS fallback only; cannot self-generate topology for an unseen class. Add an LLM/web node/edge-skeleton step → `writebackDiscoveredNode/Edge`. [Stage 5 / NEW] [STILL-OPEN — the universal-archetype long pole]
- **standards step-6 is advisory, not contract-mutating** — `filled_standards` recorded but doesn't drive a quantity / feed gate 19/10 as authoritative citation source. [Stage 5] [STILL-OPEN — low]
- **backfill-embeddings is manual, not scheduled** — the safety net for web-discovered un-embedded rows is dormant; chain-end fire-and-forget or cron it. [Stage 5] [STILL-OPEN — low; mostly closed by P1 embed-on-write]
- (P1/P2 specs/standards embed-on-write + hybrid retrieval were CLOSED 2026-06-04 — DONE.)

### DOSSIER-PURPOSE-PLAN.md + DOSSIER-ADVISOR-ENGAGEMENT-PLAN.md
Founder-facing dossier framing. Mostly product/positioning (dead-adjacent), but the GROUNDING mechanism is engine work.

- **Deterministic "Taking this forward / open-items" gather** — the engine already computes per module: RFQ-flagged lines, physics-critic findings, ±30%/estimate-class-4-5 cost lines, contract closures that warn, key assumptions, unverified "—" compliance rows. Surfacing these as a routed action list is a deterministic artefact-read of what the engine already knows. [Stage 0.5 / 1] [STILL-OPEN — the per-module open-items aggregation is genuine SIGHT/provenance feed]
- **Advisor-engagement generator (deterministic gather → LLM voice)** — every advisor question traceable to a real open item the engine found, not invented. The grounding contract (not the LLM voice) is engine-relevant. [NEW] [STILL-OPEN — `out/*/advisor-engagement.json` exists per RELAUNCH doc]

### FRACTIONAL-FORGE-RELAUNCH-PLAN.md (2026-06-23) + FRACTIONAL-FORGE-PLAN.md (v4)
Mostly business/monetisation (DEAD for engine), but two engine-adjacent items:

- **Dossier mask policy = show commodity parts free, hide the bespoke maker + named experts** (D3). This is an engine RENDER-policy flag (free/paid), already DEFAULT OFF in the renderer per memory. [Stage 3/4 render] [DECISION-RECORDED, not engine-build]
- **"would a chartered/credible reviewer accept this?" bar = "no error an expert would laugh at"; fix the wind/CO₂ cost misses first** — the credibility-killer-first ordering matches the current adversarial-engineer frame. [Stage 0.5] [ALREADY the standing directive — confirms, no new item]

---

## DEAD LIST (one-liners)

- DEAD: DOSSIER-ADVISOR-ENGAGEMENT-PLAN.md — mostly Fractional-Forge monetisation/routing (one engine-grounding item extracted above).
- DEAD: DRIP-BUILD-TRACKER.md — welcome-email drip / unsubscribe / Resend cron (marketing).
- DEAD: EMBEDDING-DIM-FIX.md — investor-app pgvector 1536-vs-768 RPC guard (Forge Capital investor app).
- DEAD: FALLBACK-CHAIN-PLAN.md — agents team-meeting LLM cascade (web app specialists chat).
- DEAD: FANG-CASCADE-AUDIT.md — CAD-lab V2 review→module cascade (web app).
- DEAD: FINAL-FIX-TRACKER.md — investor portfolio dedup / push / Key People (investor app).
- DEAD: fix-summary.md — pipeline_runs TOCTOU / heartbeat (autopilot web infra).
- DEAD: FORGE-LEGACY-ROUTES-AUDIT.md — /the-forge V1→V2 route migration (web app).
- DEAD: FORGE-REVIEW-REPORT.md — CAD-lab Design/Specify/Source/Assemble security+a11y red-team (web app).
- DEAD: FORGE-REVIEW-TRACKER.md — same workstream, tracker.
- DEAD: FORGE-SOURCE-OVERHAUL-TRACKER.md — Source/Specify supplier-UI + DfM technique library (web app).
- DEAD: FORGE-V2-PARITY-AUDIT.md — V2 mockup parity screenshots (web app CSS/IA).
- DEAD: FORGE-V2-SCOPED-CSS-AUDIT.md — forge-mockup.css dedupe (web app CSS).
- DEAD: FORGEOS-FULL-BACKLOG-TRACKER.md — founder-facing page red-team sweep (web app).
- DEAD: FOUNDER-WALKTHROUGH-TRACKER.md — cubesat V2 UI walkthrough + fire-and-forget bugs (web app).
- DEAD: FREEMIUM-PLAN.md — anonymous/freemium sandbox + Stripe (monetisation).
- DEAD: HANDOVER-2026-04-18-phase-vii.md — design-iteration UI + supplier-enrichment scripts (web app).
- DEAD: HANDOVER-DRIP.md — welcome-drip morning handover (marketing).
- DEAD: HANDOVER-plan.md — /plan section redesign Phase 3 (web app).
- DEAD: IMAGES-ROOT-CAUSE-TRACKER.md — CAD-lab image-pipeline save race (web app).
- DEAD: IMAGE-GEN-AUDIT.md — CAD-lab V2 image-gen (web app; 5b no-text + 5c mirror are web-image, not dossier-render).
- DEAD: INVESTOR-FIX-TRACKER.md — investor page stats/portfolio (investor app).
- DEAD (mostly): FRACTIONAL-FORGE-PLAN.md / FRACTIONAL-FORGE-RELAUNCH-PLAN.md — business/monetisation strategy (two engine-adjacent items extracted above).

═══════════════════════════════════════════════════════
## FROM BATCH 02

# Tracker-mining findings — batch 02

Master-checklist stages: 0 (honest scorer) · 0.5 (SIGHT — audit DELIVERED artefact) · 1 (provenance spine) · 2 (risk-loop closure) · 3 (drawing-content generators) · 4 (class-appropriate economics) · 5 (tags + verification coverage + benchmark-net).

---

## LEDGER-FIX-PLAN.md  (RELEVANT — the single richest file in the batch)

This is the active RAS/ledger workstream and aligns directly with Stage 1 (provenance spine) and Stage 0.5 (SIGHT). Most items are STILL-OPEN.

1. **One canonical `state.ledger`, assembled once, consumed read-only by every surface** (BoM, P&ID, single-line, narrative, cost). Today the same fact is computed at 2-4 drifting sites: 4 pricing engines (`requirements_bom._materials_takeoff`; `build-cost-basis.ts`; `class-cost-structure.computeCostStack`; word-engine BoM), 3 material resolvers, fail-state invented in `draw_pid.py`. — Stage 1 — STILL-OPEN (Phase 0 done; Phases 1-3 open).
2. **Typed `service{fluid,phase,pressure_bar,fabrication_family,criticality}` emitted AT SYNTHESIS from the driver-quantity physics, never re-parsed from the part NAME.** Phase 0 DONE (commit 67dfd9e8d) — frame £42.36M→£275k. The remaining Phases 1-3 depend on it. — Stage 1 — Phase 0 DONE, rest STILL-OPEN.
3. **Council KILLER FINDING: a single ledger DESTROYS the cross-surface error detector** (gates 5/11/12/18/B-3 work by comparing two INDEPENDENT values). One wrong `characterise()` flows identically into every surface → they all agree WRONGLY → contradiction gates go green on a uniformly-wrong dossier. **Mitigation is mandatory BEFORE unifying: replace consistency gates with ABSOLUTE-PLAUSIBILITY gates** (a structural frame can't be a 57,000 m³ pressure shell — wrong on its own terms) + gate-32 must re-derive £/output from a path the ledger does NOT feed. — Stage 0.5 / Stage 1 — STILL-OPEN (this is a real design hazard for any provenance-spine unification).
4. **In-ledger plausibility invariants:** mass↔vol↔density consistency; material ∈ family-set; £/kg in band; frame≠pressure-shell. — Stage 0.5 — partly done (no_pressure_vessel_without_fluid_service + no_57000m3_shell shipped), rest STILL-OPEN.
5. **Characterisation is a per-FAMILY dispatcher** (fluid-vessel / rotating-electrical / structural / aero / electronic-commodity), NOT "one universal pass" — only `sensing_principle` genuinely generalises. — Stage 1 — STILL-OPEN.
6. **Chain-ordering bug: drawings (`draw_pid`, `parts_ledger`) run at chain ~7036 and read `state.requirementsBom`, but it isn't assembled until ~7101 → they read a STALE PRIOR-RUN BoM.** Must re-seam: Blender-manifest → assemble ledger → annotated draws → BoM. (Same stale-read family as the gate-31 self-audit running before the reconcile.) — Stage 0.5 / Stage 3 — STILL-OPEN.
7. **The £51M-vs-£5M "921% over ceiling" banner lives in keyMetrics + brief-compliance, which the BoM-reconcile never routes through.** Even a fully-built ledger would not fix its own anchor unless keyMetrics + compliance READ the authoritative requirements_bom total. — Stage 1 / Stage 4 — STILL-OPEN.
8. **ONE authoritative per-equipment ELECTRICAL-LOAD LIST {name, motor_kw, count}** emitted by the contract; `connected_electrical_load_kw = Σ` it; `draw_panel_schedule` draws its circuits FROM that list instead of re-resolving kW → panel total == contract BY CONSTRUCTION (kills the load_reconcile near-miss being green-by-luck not by-construction). Task #122. — Stage 3 — STILL-OPEN (deferred for credit reset, not done).
9. **ONE canonical part IDENTITY (tag+name) shared by parts-manifest + requirementsBom + drawings** → collapses parts_ledger coverage identity-mismatches (P&ID 31/54 = ~16 equipment drawn under a different name than the ledger, NOT real absence). parts_ledger verdict-enforcement stays PREMATURE until identity unified. Replace every fuzzy name-resolve with id-lookup (#136-by-id). — Stage 5 — STILL-OPEN.
10. **New signal/network drawing from `signal`-medium ports (task #157)** — no existing surface, additive. — Stage 3 — STILL-OPEN.
11. **Per-archetype rate reconciliation, never one global unify:** 316L is £14 (requirements_bom) vs £6 (build-cost-basis); CO2/SAF numbers come from the £6 path, so a global unify REGRESSES them. Reconcile per-archetype, pin frozen BESS+SAF+CO2 scorecard baselines before any unification. — Stage 4 — STILL-OPEN.
12. **`corrosive_service_material` false-positive classifier bug:** its `oxidis`/`ozone`/`o2` substring regex matches the unit NAME "thermal_oxidiser" (SAF purge line wrongly HDPE→316L) and tags a water loop merely passing an O₂/ozone unit as 316L (RAS lines 204/205). Must key oxidiser-316L on TYPED signal (phase=gas / genuine LOX/ozone SOURCE endpoint), not a bare substring. Already a LIVE drawing defect (SAF/RAS isometrics + line-list show false-316L lines). — Stage 3 — STILL-OPEN.
13. **`place_process_plant` band-spread inflates cost:** one mis-placed environmental_interface/HVAC band at Y≈0 while the process cluster sits at Y≈394-471 m drags footprint to 485 m → £380k of long-run feeders + £1M pipe. Fix: place the periphery band ADJACENT to the main cluster. (Session-3 notes this partly resolved 496m→93.6m, but the band-placement rule is the universal fix.) — Stage 3 — likely PARTLY-DONE, VERIFY.
14. **Fail-state shared resolver:** promote `draw_process_schedules`' ledger-driven `fail_action_from_text`/`collect_fail_state_quantities` into a shared stdlib; `draw_pid` imports it (replace the narrow `_o2_dosing_fail_open`). Additive, byte-safe. — Stage 3 — STILL-OPEN (queued as the clean next piece).

---

## OXCCU-SAF-ENGINEERING-COSTING-REVIEW.md  (RELEVANT — chem-E + economics gaps, matches MEMORY "v14 engine gaps")

All STILL-OPEN unless noted; these are universal physics/economics improvements.

1. **Anderson–Schulz–Flory (ASF) chain-growth model is MISSING ENTIRELY — the single biggest lever.** jet_selectivity (0.60), carbon-to-liquids (0.65), per-pass conversion (0.40) are hard-coded assumptions dressed as results → the entire carbon balance is an LLM guess in numeric disguise. Build `asf_chain_growth.py` (pure numpy). — Stage 4 (economics) / NEW — STILL-OPEN.
2. **Gibbs feasibility check silently FAILED:** the FT class plan passed species `CH₂` (no Gibbs-of-formation in `chemicals` lib) → Python exit 3, nothing written. Fix: use hexadecane C₁₆H₃₄ surrogate (`16 CO₂ + 49 H₂ → C₁₆H₃₄ + 32 H₂O`). A tool that silently fails and ships anyway is a gate-intent violation. — Stage 2 (risk-loop) / Stage 5 — STILL-OPEN.
3. **Levelised cost understates — no explicit H₂/CO₂/electricity opex term** (`opex = capex×8%`), and H₂ is 60-80% of PtL opex; headline £5.85/kg sits AT/BELOW its own H₂ floor (£4.5-6.7/kg). Honest FOAK ≈ £8-11/kg. Also no discount rate / capital-recovery factor in the £/kg. — Stage 4 — STILL-OPEN.
4. **Missing commodity instrument-and-control (I&C) loop:** a 1,000 t/yr SAF plant needs 150-250 field instrument lines (≥25 pressure, ≥20 temperature, flow, level transmitters, control valves, VFDs, MCC, UPS, HMI, gas analyser); dossier has essentially none. Root: e_fuel emitter has no `emitSensingInstrumentation()` (co2 does); no e_fuel class reference graph for Stage 17.6 RAG. RIGHT fix = self-generating I&C suite inference + self-growing branded-parts DB, not per-class hand-coding. — Stage 3 / Stage 5 / NEW — STILL-OPEN.
5. **`plant_payback_years = 0` glitch** (should derive or "never within horizon"); **NPV −£58.6M unframed** (FOAK is expected NPV-negative — frame it). — Stage 4 — STILL-OPEN.
6. **£28M (design spec) vs £45M (gate-32 ceiling) capex inconsistency** must be reconciled; £15.65M ex-works is low-edge for FOAK micro-PtL (real £25-50M). — Stage 4 — STILL-OPEN.
7. **Avoided-GHG vs fossil Jet-A (2.54 kg CO₂e/kg) absent from the LCA** — the central OXCCU value proposition isn't in any tool output. Universal: any emissions-reducing product. — Stage 4 / NEW — STILL-OPEN.
8. **Meta-insight (load-bearing for Stage 0):** internal coherence fooled the physics critic — self-consistent hard-coded numbers reconcile with each other and LOOK rigorous but aren't first-principles. The honest scorer must distinguish "derived" from "assumed-but-coherent". — Stage 0 — STILL-OPEN.

---

## PLAN-deterministic-generation.md  (RELEVANT — BESS deterministic-correctness spec; mostly built but a few universal anchors still open)

Most concrete fixes are codified (gates 22-30, payload gate 30 = option-A bespoke enclosure, thermal split, mass reconciliation). Still-relevant universal items:

1. **"Deterministic ≠ correct" / "a reproducible lie":** byte-identical run-to-run stabilises the score but if the pinned numbers are wrong you get a stable score on a wrong document. The goal is deterministic AND engineering-correct, verified by reconciliation gates not determinism alone. — Stage 0 — STILL-OPEN (standing principle, reinforces honest scorer).
2. **A6 — every LLM-touched prose number must trace to a canonical contract field** (the numeric equivalent of the MPN allowlist); numeric-claim guard extracts every literal from LLM prose and rejects unsourced numbers. — Stage 1 — partly done (gate 12/18 exist), STILL-OPEN as a universal provenance rule.
3. **A8 — emitter fails closed on unidentifiable parts:** every BoM word carries a DB-resolving (mfr, MPN); generic words only where the class whitelists. — Stage 5 — STILL-OPEN.
4. **Mass-reconciliation hard gate: |Σ BoM part masses − canonical system mass| ≤ ε.** — Stage 0.5 / Stage 1 — VERIFY (may be the B3 gate; conservative STILL-OPEN).
5. **Deterministic repair path (D1):** when a sizing gate fails, the emitter RE-DERIVES the part from the failed constraint via its selection functions (bounded ≤2), else hard error — never an LLM part-swap. This is the anti-band-aid version of physics-critic-autocorrect. — Stage 2 — STILL-OPEN (note: current gate-33 autocorrect IS an LLM swap; this argues for the deterministic re-derive instead, matching the CORE FIX PRINCIPLE).

---

## PLAN-2026-05-17.md  (PARTLY RELEVANT — mostly DEAD corpus/supplier/UI, two live ideas)

1. **S-style over-decomposition: heatpump emitted 265 sub-module words / 539 parts vs ~40 in real reference manuals (6× over).** Prompt asks for "every part" with no calibration target; reference decomposition density (~40 heat-pump, ~100 BESS, ~200 VFD). Over-decomposition both inflates and hides per-line absurdity. (Also in cost-engine plan as S1.) — Stage 3 / Stage 4 — STILL-OPEN, VERIFY (MEMORY notes a derive-skeleton MIN_WORDS effort).
2. **Design Decisions section should present decisions as ALREADY MADE ("Decision: X. Why: Y. Consequences: Z."), not open recommendations** ("you recommend then we should just do"). — NEW (presentation) — STILL-OPEN, low priority for ≥8 engine.

(DEAD parts: 60-class corpus expansion, 34-MINOR typography sweep, supplier-card city/CTA upgrade, Parts-Pending-Verification appendix move.)

---

## ITER9-RED-TEAM-AND-REVISED-PRIORITIES.md  (PARTLY RELEVANT — the bottleneck diagnosis + 3 missing gates)

1. **The bottleneck is Generator EMISSION of structured fields, not gate coverage:** field-presence-guarded gates silently skip when the Generator doesn't surface `derived_parameters`. A gate that skips because its input field is absent is a gate-intent failure (walk-through-by-config). Mandatory `derived_parameters` schema per module class activates dead gates. — Stage 5 (verification coverage) / Stage 0.5 — STILL-OPEN (recurs as the gate-22/SHADOW coverage gap in CLAUDE.md).
2. **`briefConstraintPropagationGate`** — every derived_parameter with a matching brief constraint must equal the brief (LED density 694 vs brief 200 W/m²). — Stage 1 / Stage 2 — VERIFY (gate 9 compliance-completeness may cover; conservative STILL-OPEN).
3. **`closedFluidLoopHasHeatRejectionGate`** — a fluid loop + cooling coil + pump but no heat-rejection device fails (chilled loop with no chiller). — Stage 2 / Stage 3 — STILL-OPEN.
4. **`partNumberCapacityVsModelGate`** — parse model strings for capacity-implying suffixes (Copeland ZR18K = 18,000 BTU/hr = 5.27 kW, not 18 kW). — Stage 5 — STILL-OPEN.

(The ITER9 v1/v2/v3 strategic plans themselves are largely SUPERSEDED — most of W0/W1/W3/W5/W6 infrastructure was explicitly deferred by this red-team in favour of incremental fixes, and the engine has since moved to the contract-sizing + drawing-gates architecture. Captured the few durable gate ideas above.)

---

## ITER9 strategic plans (v1/v2/v3) — durable residue only

- **Tool provenance: every deterministic tool returns `{value, source, uncertainty}` — no "fake determinism".** — Stage 1 — STILL-OPEN as a universal rule (ties to the SAF "coherence fooled the critic" finding).
- **Reference-image library + multimodal class/category mismatch check (cabinet-vs-container) POST-render** — this is essentially the Stage 0.5 SIGHT vision-critic idea, scoped to category mismatch only. — Stage 0.5 — partly anticipated by current SIGHT plan; STILL-OPEN.
- Everything else (canonical object model W0, MoE specialists W3, pattern distillation W5, continuous-learning W6, adversarial-dev W4) was deferred by the red-team and/or superseded. Not folding in.

---

## DEAD files

- DEAD: ITER9-INTEGRATION-PLAN-V3.md — superseded iter-9 infra plan (only the gate ideas in the red-team file survive); residue captured above.
- DEAD: ITER9-STRATEGIC-PLAN-DRAFT.md — superseded iter-9 strategic draft; residue captured above.
- DEAD: ITER9-STRATEGIC-PLAN-V2.md — superseded iter-9 strategic v2; residue captured above.
- DEAD: JARVIS-ONSHAPE-INTEGRATION-PLAN.md — Onshape CAD MCP integration (out of scope; named exclusion).
- DEAD: MARKETPLACE-OVERHAUL.md — supplier-marketplace UI workstream.
- DEAD: MOCKUP-PARITY-PLAN.md — Forge-v2 mockup-faithful page port.
- DEAD: MONETISATION-ROADMAP.md — pricing/advisory monetisation strategy.
- DEAD: MONEY-RED-TEAM-FINDINGS.md — /money app surface red-team.
- DEAD: MULTI-PAGE-RED-TEAM-TRACKER.md — founder-facing app page red-team.
- DEAD: OVERNIGHT-TRACKER.md — BESS L47→L50 quality-loop LOG; every architectural win already codified into gates 22-29 + CLAUDE.md (historical record only).
- DEAD: OXCCU-EFUEL-DESIGN.md — the e_fuel_synthesis class design SPEC; the class is built. (The still-open chem-E gaps are captured from the costing-review file, not this spec.)
- DEAD: PAGE-ROLLOUT-TRACKER.md — mockup-faithful page rollout log.
- DEAD: PHASE-4-BUILD-STATUS.md — Products-redesign app build status.
- DEAD: PHASE-E-IMPLEMENTATION.md — AdvisorPanel sidebar removal (app UI).
- DEAD: PHASE-G-IMPLEMENTATION.md — /investors post-pivot rebuild (app).
- DEAD: PIVOT-EXECUTION-AUDIT.md — app pivot spec-vs-shipped audit.
- DEAD: PLAN-2026-05-18-cost-correctness-engine-v2.md — cost-stack engine (Engine B/D + cost-stack now BUILT; only S1 over-decomposition survives, captured under PLAN-2026-05-17).
- DEAD: PLAN-2026-05-18-cost-correctness-engine.md — v1 of the above, fully superseded.
- DEAD: PLAN-2026-05-18-spec-reproduction.md — RAG + corpus spec-reproduction (RAG layer + corpus built).
- DEAD: PLAN-SCHEMA.md — app "Plan" section database schema.

═══════════════════════════════════════════════════════
## FROM BATCH 03

# Tracker Mining — Batch 03 Findings

Scope: dossier-≥8 engine work (Stages 0, 0.5, 1, 2, 3, 4, 5, or NEW). Conservative STILL-OPEN flagging.

---

## RELEVANT: RECURSIVE-IMPROVEMENT-LOOP-PLAN.md
The deterministic A→H core loop, harsh floor-scoring, the original RAS £34k bug.

- **Score the FLOOR (minimum across dimensions), not the average — the worst dimension is what an experienced engineer notices first.** [Stage 0] — already the canonical "honest scorer" intent; STILL-OPEN as an explicit invariant the Stage-0 scorer must enforce (min not mean per tab).
- **6 harsh scorecard dimensions: sizing correctness, cost realism, BoM completeness+plausibility, geometry, interconnect completeness, internal coherence — each 0–10, rebase current state to ≤5.** [Stage 0] — STILL-OPEN as the per-tab rubric; maps directly onto the "genuine ≥8 on EVERY tab" target.
- **Stage G — harvest the BoM from the SETTLED model (every placed part at final size), not from the LLM word-tree.** [Stage 1 / Stage 3] — STILL-OPEN (this is the provenance spine + "one layout source" idea; the BoM must derive from the settled geometry, so each line traces where-from).
- **Internal-coherence check: numbers reconcile across sizing ↔ geometry ↔ BoM ↔ cost.** [Stage 1] — STILL-OPEN cross-tab reconciliation check.

## RELEVANT: UNIVERSAL-ENGINE-PLAN.md
Audit-corrected lever map; the "four walls" enumeration; built-but-inert machinery.

- **DB-grounded class reference: retire 21 frozen `class-reference-graphs/*.ts` baked TS snapshots; read live from forge-truth.db with web-on-miss writeback.** [NEW / Stage 1] — STILL-OPEN (per CLAUDE.md the chain still reads BAKED 2026-05-18 snapshots; specs/standards/suppliers/products have NO writeback path). This is the "class grounding is FROZEN" gap; directly limits BoM/decomposition coverage.
- **`writebackDiscoveredNode/Edge` have ZERO callers — the "growing" half of the class-reference graph is dead code.** [NEW] — STILL-OPEN known-bug; the self-learning DB never actually grows for new classes.
- **`composeToolGraph` (auto-planner) built with real Tarjan/Kahn but no tool declares I/O (`output_keys` only appears in auto-planner.ts) → dormant + starved.** [Stage 3 / NEW] — likely partially addressed (MEMORY says UNIVERSAL_AUTO_PLAN wired default-ON 2026-06-03) but the tool-I/O manifest prerequisite was still unbuilt; STILL-OPEN to verify.
- **Four walls a new class hits, in failure order: detectEnvelope → selectPlan → assembler → contract archetype.** [NEW] — reference for universality; assembler (wall 3, generic emitter) flagged as the only lever with zero fallback. STILL-OPEN.

## RELEVANT: UNIVERSAL-ENGINE-PLAN-wall2-council.md
Design-council verdict on the auto-planner. Mostly plumbing, but carries concrete still-applicable traps.

- **`keysMatch` ≥8-char substring FUSES sibling quantities (`dc_output_voltage_v`/`ac_output_voltage_v` → `output_voltage_v`); match on (base_key, basis) tuples or exact.** [Stage 1] — STILL-OPEN known-bug class; a provenance spine that conflates dc/ac siblings will mis-attribute numbers.
- **27/35 plans emit BoM macro cost INSIDE `contract_update` closures (rename + compute + write `macro_assembly_prices`); a naive 1:1 quantity copy drops every macro price → no cost stack.** [Stage 4] — STILL-OPEN gotcha for any economics/cost-stack refactor.
- **Regression invariants must be OUTPUT-GOLDEN (deep-equality of contract.quantities + design.modules vs a committed snapshot), NOT source-hash-pins (which self-rebaseline on refactor).** [Stage 5] — STILL-OPEN design rule for the verification-coverage tab.
- **`requireSharedQuantity` THROWS when `shared_quantities` absent on the orchestrator contract type → emitter crash.** [NEW] — known-bug to guard.

## RELEVANT: UNIVERSAL-ENGINE-SUPERBRIEF-PLAN.md
Super-brief = the one archetype-aware step; sizing is the lone wall. Highest-leverage doc in the batch.

- **The lone wall is engineering-plausibility SIZING; structure is ~80% universal already (Exp A 8/10 fidelity). RAS came out £34k for an ~£8M plant (200× under) with a 6-line BoM.** [Stage 0 / Stage 1] — STILL-OPEN as the core "is the sizing right" check that gates a ≥8 sizing tab.
- **`applyFamilySizing` in `scripts/lib/orchestrator/generic/sizing.ts` is a NO-OP — wire it to execute the super-brief's governing equations BEFORE parts are grounded.** [Stage 1 / NEW] — STILL-OPEN concrete code target; makes grounding scale-aware (pick a 1 MW stack for a 1 MW slot).
- **Sizing VERIFICATION, not just elicitation: an LLM emits confidently-wrong equations; the super-brief must SHOW ITS WORKING so gates can check it.** [Stage 0.5 / Stage 5] — STILL-OPEN; ties to SIGHT (audit the delivered worked-calc) and verification coverage.
- **Hold-out validation harness (`EXP_A_HOLDOUT_CLASS`): force a brief down the generic path with the hand emitter held out, council vs the golden, delete the curated class when the universal path wins.** [Stage 5 / NEW] — STILL-OPEN universal-coverage proof method.
- **~30 gates carry BESS-shaped assumptions (cost floors, per-rack denominators, known-part tables) — they must read the super-brief's standards/scale or false-fire on every non-BESS archetype.** [Stage 4 / Stage 5] — STILL-OPEN; gate calibration for class-appropriate economics.

## RELEVANT: UNIVERSAL-DESIGN-LOOP-DESIGN.md
The A→H loop with the geometry-feeds-back-into-sizing closure. Strong Stage-1/3 source.

- **STRUCTURAL FAULT: the chain runs BoM+cost (lines 5877–6421) → Blender layout+routing+convergence (6682) → render (6719), so geometry runs AFTER the numbers lock — the loop is OPEN.** [Stage 3] — STILL-OPEN; converged loads (CO2 87.25→87.39 kW, e-fuel 6000→6013.9 kW) never reach the dossier. The stage order is wrong to feed each other.
- **Blender measures real connection lengths/footprint; feed back into engine quantities (Stage D) then re-size (Stage E).** [Stage 3 / Stage 1] — STILL-OPEN; one layout source feeding both GA/render and the sizing.
- **Layout-revealed-needs detector: after each Blender pass, inspect the routed model for features demanding a tool not yet planned (long run → booster pump; wide span → support steel; hot+long line → trace heating).** [NEW / Stage 3] — STILL-OPEN genuinely-novel idea; the tool set converges, not just the numbers.
- **Settle criterion read from a `design-loop-ledger.json` (per-pass numbers that changed + the settle test) — "settled in 3 passes" is READ, never asserted; honest "did not settle" at the cap.** [Stage 0.5 / Stage 1] — STILL-OPEN provenance/honesty mechanism.
- **Every BoM line stamped with provenance: real price vs deterministic estimate + the tool that set its material spec.** [Stage 1] — STILL-OPEN; this IS the provenance spine (where-from per line).
- **Topology densification to FULL piping-and-instrumentation census; completeness is FINITE not asymptotic — screws/bolts collapse to ONE "fixings & sundries" allowance line, everything else itemised.** [Stage 3 / Stage 5] — STILL-OPEN; the verification-coverage target (every connection routed; interconnect honesty label until dense).
- **Material-spec derivation (pressure → steel grade + wall) driven uniformly from the SETTLED model across classes.** [Stage 1 / Stage 3] — STILL-OPEN; partial in sizing tools, needs settled-model uniformity.

## RELEVANT: SCENARIO-PLANNING-PLAN.md
Economics/scenarios section. Maps to the Stage-4 economics tab.

- **`payback=0` is a BUG (should read "beyond plant life"); NPV presentation + economics must re-base on ACHIEVED installed capex, not the stale pre-BoM estimate.** [Stage 4] — STILL-OPEN concrete bug + the "re-base after cost stack" rule.
- **Physical levers (yield/selectivity/throughput) must NEVER be modelled by a financial scalar — they change the BoM and require a design re-run; only exogenous levers (feedstock price, output price, utilisation, WACC, FOAK→NOAK learning curve) vary in scenarios.** [Stage 4] — STILL-OPEN honesty invariant (`scenario_levers_are_exogenous_only`).
- **Capex in any scenario floored by the bottom-up BoM raw-materials total; a NOAK capex below the parts cost is flagged INFEASIBLE, not a win.** [Stage 4] — STILL-OPEN cost-floor check.
- **Goal-seek/breakeven (binary-search the binding lever to NPV≥0) instead of an auto-assembled "fantasy best" bundle.** [Stage 4 / NEW] — STILL-OPEN; investor-honest economics presentation.
- **SAF stoichiometric insight: ~1.12 kg H₂/kg SAF → H₂ alone is £4,480/t at £4/kg, half the levelised cost; £2,200/t target infeasible unless green H₂ < ~£1.5/kg.** [Stage 4] — domain anchor still applicable to the SAF/e-fuel economics tab (sanity reference).

## RELEVANT: SPACE-SECTOR-ARCHETYPE-TOOL-ROADMAP.md
Mostly a space-tool wishlist (out of immediate water-treatment scope), but two still-applicable rules.

- **SCOPE BOUNDARY (Tristan 2026-06-10): pure software/data products (EO analytics, mission-ops) are OUT — this is a physics-first hardware engine; decline honestly, do not pretend the physics gates apply.** [NEW] — STILL-OPEN standing classifier/scope rule (a brief with no physical BoM should be refused, not faked).
- **Every new physics tool must declare its `output_keys` (so DB-grounding works) + a physical-feature `applicable` predicate (so the composer selects it for any matching archetype) — never class-gated.** [Stage 3] — STILL-OPEN universal tool-authoring contract; relevant whenever a new tool is added for the water-treatment archetype.
- (The ~75 space tool families themselves are not in-scope for the current water-treatment dossier push — noted but not folded in.)

## PARTIALLY-RELEVANT: TRACKER.md (PDF-quality workstream, 2026-05/06)
Largely superseded by current CLAUDE.md gate table, but a few items still read as open.

- **B4 cost single-source-of-truth: cover ex-works is computed at RENDER time and never stored, so feasibility + cost-sanity read a different (lower) state field → cover ≠ feasibility contradiction. Store the ex-works roll-up once in state.** [Stage 1 / Stage 4] — appears LARGELY-DONE (later rows show `costStack.oem_transfer_price_gbp` persisted) but the "two cost surfaces" gotcha persists in MEMORY; STILL-OPEN to verify single-source on the Excel surface.
- **Suppliers never DB-first (`pretraining_extracted_suppliers` has no reader; Nightshift 28k reverse-index unwired); 3 validated tools stranded (protection_coordination/arc_flash/g99 — no wrapper).** [NEW] — STILL-OPEN coverage gaps.
- **Wall-3 generic emitter is the one existential unknown: can a GENERIC dossier score ≥8 on an unseen class? (Exp A → HYBRID verdict: graph-only too thin, fails grammar/density/links.)** [Stage 5 / NEW] — STILL-OPEN strategic question for universality.

## PARTIALLY-RELEVANT: TRACKER-PDF-ENGINE.md (v1-era, 2026-05-16)
Mostly superseded PDF-engine-v1 fan-out logging. Two durable known-bugs only.

- **No spatial coordinates anywhere in the design data; `spatial_position_complete` forces qualitative (above/below) not coordinate-level layout.** [Stage 3] — STILL-OPEN; relevant to "real per-part geometry dims" + one layout source.
- **Recommendation/uncertainty honesty: never trade one fabrication for another — an uncertain "manual sourcing required" beats a guessed SKU; confidence tags not optional.** [Stage 0 / Stage 1] — STILL-OPEN honesty rule consistent with current honest-scoring directive.
- (The Phase-2 iter-cap, transient-LLM-JSON, multi-emitter items are all dead v1-pipeline concerns.)

---

## DEAD (one-liners)

- DEAD: REQUESTS-TRACKER.md — Forge Capital investor-app port + marketing sidebar/CSS fixes.
- DEAD: RED-TEAM-AUDIT-V2.md — pre-launch web-app red-team (Apr 2026).
- DEAD: RED-TEAM-FOUNDER-EXPERIENCE.md — web-app founder-persona walkthrough.
- DEAD: RED-TEAM-PIVOT-PLAN.md — monetisation/freemium/viral-credits/pricing-tier strategy.
- DEAD: RED-TEAM-WALK-iter1-fixes.md — web-app red-team walk (hydration/RLS/copy bugs).
- DEAD: RED-TEAM-WALK-iter2-fixes.md — web-app red-team walk (jsonb citations bug).
- DEAD: RED-TEAM-WALK-iter3-fixes.md — web-app red-team walk (firm-type label leak).
- DEAD: SEARCH-QUALITY-TRACKER-20260428.md — investor search quality + DB universe parity.
- DEAD: SUPPLIER-DISCOVERY-PLAN.md — demand-driven supplier directory enrichment (marketplace).
- DEAD: SUPPLIER-UPGRADE-TRACKER.md — marketplace/supplier page UI upgrade.
- DEAD: TRACKER-forge-redesign-phase1.md — Forge web-app visual redesign (shared primitives).
- DEAD: TRACKER-forge-visual-rebuild-pr1-5.md — Forge web-app visual rebuild PRs.
- DEAD: TRACKER-founder-first-architecture.md — account-type routing / supplier-portal collapse.
- DEAD: TRACKER-INVESTOR-PERF.md — investor filtering performance + enrichment.
- DEAD: TRACKER-money-redesign.md — /money web-app redesign build.
- DEAD: TRACKER-red-team-forge-v2.md — Forge v2 web-app red-team simulation (TempGuard).
- DEAD: VIRAL-UPGRADE-TRACKER.md — viral freemium conversion / Stripe seed tier.
- DEAD: WALKTHROUGH-money.md — /money web-app agent-browser walkthrough script.
