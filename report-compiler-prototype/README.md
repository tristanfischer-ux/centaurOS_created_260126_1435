# Report Compiler Prototype

Isolated prototype for a "validated engineering dossier -> scored PDF" pipeline.

This folder deliberately does not import from the existing ForgeOS PDF engine. It
is a scratch architecture for the clean-room version of a universal report
compiler:

1. Classify an arbitrary project brief into a product class.
2. Parse explicit requirements and constraints out of the brief.
3. Load product-class ballast: required parts, module templates, standards, risks
   and headline metric.
4. Build a typed `ProductDossier` with design modules, BoM, sourcing, costings,
   regulatory notes, risks and feasibility.
5. Validate every PDF section against explicit contracts.
6. Use LLMs only as patch authors, never as unchecked owners of final state.
7. Render from validated state.
8. Score and repair section-by-section until every section is above the gate.

## Commands

```bash
npx tsc --noEmit -p report-compiler-prototype/tsconfig.json
npx tsx report-compiler-prototype/src/demo.ts
npx tsx report-compiler-prototype/src/compile-brief.ts --id custom-cgm --brief "Design a 14 day wear continuous glucose monitor wearable patch with 5 minute readings and MARD 9%."
npx tsx report-compiler-prototype/src/audit-architecture-admission-gate.ts
npx tsx report-compiler-prototype/src/audit-score.ts
npx tsx report-compiler-prototype/src/audit-architecture.ts
npx tsx report-compiler-prototype/src/audit-brief-clarification-plan.ts
npx tsx report-compiler-prototype/src/audit-brief-intake-gate.ts
npx tsx report-compiler-prototype/src/audit-bom-admission-gate.ts
npx tsx report-compiler-prototype/src/audit-bom-costing-gate.ts
npx tsx report-compiler-prototype/src/audit-bom-evidence-closure-plan.ts
npx tsx report-compiler-prototype/src/audit-bom-evidence-trace.ts
npx tsx report-compiler-prototype/src/audit-bom-provenance.ts
npx tsx report-compiler-prototype/src/audit-claim-evidence-gate.ts
npx tsx report-compiler-prototype/src/audit-claim-ledger.ts
npx tsx report-compiler-prototype/src/audit-closure-plan.ts
npx tsx report-compiler-prototype/src/audit-compile-brief.ts
npx tsx report-compiler-prototype/src/audit-component-allocation-gate.ts
npx tsx report-compiler-prototype/src/audit-component-candidate-gate.ts
npx tsx report-compiler-prototype/src/audit-evidence-gap-register.ts
npx tsx report-compiler-prototype/src/audit-intake-csv-roundtrip.ts
npx tsx report-compiler-prototype/src/audit-interface-verification-gate.ts
npx tsx report-compiler-prototype/src/audit-submodule-engineering-gate.ts
npx tsx report-compiler-prototype/src/audit-module-engineering-gate.ts
npx tsx report-compiler-prototype/src/audit-document-trust-gate.ts
npx tsx report-compiler-prototype/src/audit-evidence-acquisition-plan.ts
npx tsx report-compiler-prototype/src/audit-evidence-authenticity.ts
npx tsx report-compiler-prototype/src/audit-evidence-replacement-plan.ts
npx tsx report-compiler-prototype/src/audit-sourcing-admission.ts
npx tsx report-compiler-prototype/src/audit-sourcing-authorization-gate.ts
npx tsx report-compiler-prototype/src/audit-source-reference-quality-gate.ts
npx tsx report-compiler-prototype/src/audit-sourcing-batch-plan.ts
npx tsx report-compiler-prototype/src/audit-procurement-readiness-gate.ts
npx tsx report-compiler-prototype/src/audit-sourcing-ledger.ts
npx tsx report-compiler-prototype/src/audit-score-ledger.ts
npx tsx report-compiler-prototype/src/audit-stage-integrity-gate.ts
npx tsx report-compiler-prototype/src/audit-trust-repair-plan.ts
npx tsx report-compiler-prototype/src/audit-product-class-coverage.ts
npx tsx report-compiler-prototype/src/audit-pre-bom-engineering-gate.ts
npx tsx report-compiler-prototype/src/audit-depth-benchmark.ts
npx tsx report-compiler-prototype/src/audit-engineering-assurance-matrix.ts
npx tsx report-compiler-prototype/src/audit-engineering-calculations.ts
npx tsx report-compiler-prototype/src/audit-engineering-assumptions.ts
npx tsx report-compiler-prototype/src/audit-engineering-review-pack.ts
npx tsx report-compiler-prototype/src/audit-review-evidence-closure.ts
npx tsx report-compiler-prototype/src/audit-report-readiness.ts
npx tsx report-compiler-prototype/src/audit-requirement-coverage-gate.ts
npx tsx report-compiler-prototype/src/audit-verification-ledger.ts
npx tsx report-compiler-prototype/src/generate-documents.ts
npx tsx report-compiler-prototype/src/generate-chain-v2-report.ts
```

## Shape

- `src/schema` — canonical data model and issues.
- `src/sections` — section contracts for the PDF.
- `src/validators` — deterministic gates.
- `src/class-packs` — product-class ballast.
- `src/pipeline` — compiler orchestration.
- `src/llm` — patch protocol boundary.
- `src/render` — renderer-facing outline.
- `src/scoring` — promotion-gate scaffold.

The first complete vertical slice is BESS. Other product classes should be added
as class packs, not as bespoke report templates.

## Current Coverage

The demo currently exercises ten different briefs:

- `energy_storage` — containerised BESS with headline throughput, full module
  decomposition, unsourced candidate BoM, source-evidence worklists and
  readiness gates.
- `vertical_farm` — indoor farm with lighting, fertigation, airflow, controls,
  safety protection, BoM and CAPEX/OPEX estimate.
- `heat_pump` — air-source heat pump with refrigerant loop, hydronic heat
  delivery, controls, safety protection, unsourced candidate BoM and readiness
  gates.
- `ev_charger` — DC fast EV charger with power conversion, CCS2 interface,
  OCPP/ISO 15118 communication, metering, safety protection, unsourced candidate
  BoM and readiness gates.
- `bioreactor` — single-use mammalian-cell bioreactor with sterile containment,
  media/feed transport, gas transfer, agitation, DO/pH sensing, pressure safety,
  unsourced candidate BoM and readiness gates.
- `auv` — inspection autonomous underwater vehicle with pressure hull, subsea
  battery, thruster actuation, DVL/INS navigation, acoustic communications,
  leak detection, recovery safety, unsourced candidate BoM and readiness gates.
- `edge_ai` — rack-mount edge AI inference appliance with accelerator compute,
  host control, networking, NVMe model cache, power distribution, thermal
  airflow, secure management, unsourced candidate BoM and readiness gates.
- `haps` — solar-electric high-altitude pseudo-satellite with high-aspect-ratio
  wing structure, solar harvesting, stratospheric battery storage, electric
  propulsion, autonomy, payload communications, recovery safety, unsourced
  candidate BoM and readiness gates.
- `cgm` — continuous glucose monitor wearable patch with patient-contact
  adhesive, glucose sensing filament, applicator, low-power telemetry,
  temperature compensation, sterile packaging, unsourced candidate BoM and
  readiness gates.
- `drone` — cinematography drone with airframe, battery, propulsion, flight
  control, camera payload, unsourced candidate BoM and readiness gates.

The `compile-brief.ts` entrypoint accepts a new project brief and writes a
single-report artifact folder without using chain-v2 state as design content.
It can optionally ingest sourcing and verification evidence JSON arrays, but
without those files it leaves supplier, manufacturer, MPN, cost and reviewer
acceptance fields empty.
It also accepts filled intake CSVs exported by a prior run via
`--sourcing-evidence-csv` and `--verification-evidence-csv`; blank template rows
are ignored, while partially-filled evidence rows are passed to the same
admission gates and can still be rejected.
Brief intake gates now sit at the front of every report. They decide whether a
brief is ready for scratch architecture, review-required because it is sparse or
low-confidence, or blocked because it is unknown and unquantified.
Brief clarification plans sit immediately behind that gate. If a brief is
sparse, low-confidence or unknown, the prototype now emits specific questions,
expected answer formats, example answers and architecture-blocking status before
pretending a universal scratch design is trustworthy.
Architecture admission gates now follow the clarification plan. They explicitly
separate admitted scratch architectures from review-only drafts and blocked
unknown/generic outputs, and they keep BoM sourcing behind the provenance
boundary even when module generation succeeds.
Component candidate gates now check the handoff from architecture to sourcing:
candidate lines must exist, carry concrete identities and positive quantities,
cover class-critical parts, align with the sourcing worklist and remain free of
unprovenanced supplier, manufacturer, MPN, lead-time or cost claims.
Sourcing authorization gates now join architecture admission, component
candidate quality, critical/full intake scope, rejected evidence rows and BoM
provenance into one decision before evidence collection or BoM admission is
treated as cleanly authorized.
BoM admission gates now decide the document's allowed BoM display mode:
candidate-only, partial priced review, protocol-priced fixture,
critical-source-backed or blocked. This keeps unsourced candidate lists visibly
separate from priced or production-backed BoM claims.
Scratch lineage gates now prove the scratch boundary explicitly: module,
submodule and component content must trace to the brief, class packs, formulas,
scratch model assumptions or admitted evidence only. Chain-v2 may appear only in
the isolated numeric depth benchmark, never as hidden design-content provenance.
Architecture freeze gates now aggregate admission, stage integrity, scratch
lineage, module structure, interface contracts, requirement coverage,
engineering review state and sourcing-boundary checks. They distinguish
structurally ready-for-sourcing architectures from independently accepted
architectures, so deterministic generation cannot masquerade as reviewer
sign-off.
Architecture freeze closure plans now convert every non-passing freeze area into
an explicit queue item: architecture revision, sourcing intake, engineering
review or verification intake. Each row names required evidence, acceptance
criteria and the generated artifact files to use next.

Each demo run currently passes the deterministic architecture gates, but the
full report is not marked publishable while critical BoM lines remain unsourced.
The readiness gate labels the current samples `architecture_review_ready`, with
BoM blocked until source-backed supplier, manufacturer, MPN and cost evidence is
admitted.

Architecture validation now includes an engineering sanity layer: required
product-class modules must exist, critical parts must be allocated to submodules,
and required module-to-module interface links must be declared before BoM review.
Engineering calculations now export a formula ledger per report. It makes
derived numeric claims explicit, including arithmetic results, deterministic
envelope status and the evidence required before treating the result as proof.
Engineering verification evidence is tracked separately from sourcing evidence:
design reviews, calculations, interface reviews and compliance reviews can be
accepted/rejected/deferred in the verification ledger, while supplier costs and
part numbers remain blocked behind sourcing intake.
Interface verification gates now join required interface contracts to the
verification ledger: each required interface must be present, carried by
submodules on both endpoints and tied to an interface-review activity before it
is considered structurally ready; accepted reviewer evidence can then close it.
Component allocation gates now make the physical candidate layer explicit:
submodules must carry component words, interface carriers must not be empty,
class-critical parts must be allocated and duplicate component identities must
be reviewed before sourcing or BoM trust.
Module engineering gates now roll the module-level view into one per-module
acceptance table: submodules, component words, linked requirements, interface
carriers, review questions, calculation links, assumption rows and critical
sourcing blockers are visible before treating a module as engineering-ready.
Pre-BoM engineering gates now synthesize architecture readiness, component
allocation, interface verification, requirement coverage, calculation envelopes
and engineering assumptions into one review verdict before any sourcing or BoM
claim is trusted.
Engineering review packs now convert the module review, submodule allocation,
interface contracts, calculation ledger and assumption ledger into concrete
reviewer questions with acceptance criteria and required evidence, so the
architecture can be challenged before BoM sourcing starts.
Engineering assurance matrices now trace each parsed requirement to architecture
links, calculations, review-pack questions and verification evidence status, so
requirement-level readiness is visible without trusting a single aggregate
score. Accepted reviewer evidence can now close review-required calculations at
the requirement-assurance layer, while outside-envelope or blocked calculations
remain hard blockers.
Requirement coverage gates now sit above the assurance matrix as a blunt
pre-BoM check: every parsed brief requirement must have architecture-module,
submodule/component, review-question and verification-activity coverage before
the design is considered structurally ready for engineering review.
BoM sourcing now has a line-by-line ledger that carries supplier, manufacturer,
MPN, unit cost, lead time and evidence refs only after an admissible source
record has been accepted.
The BoM provenance manifest makes those claims explicit per field: supplier,
manufacturer, MPN, unit cost and lead time are either source-backed, missing,
not claimed or flagged as a provenance violation.
BoM costing gates now sit above the sourcing ledger, provenance manifest,
component-identity worklist and sourcing-evidence authenticity classifier. They
separate not-started costing, blocked critical pricing, protocol-only source
fixtures and production-ready external source-backed costing.
Source reference quality gates now add a stricter non-network check before BoM
costing can pass: HTTPS external URLs must not use reserved placeholder domains,
must carry complete supplier/manufacturer/MPN/cost metadata, must include a
fresh `retrievedAt`, and the quoted source note must mention the manufacturer
or MPN. The gate is now exported as standalone JSON/CSV and surfaced in the
artifact dashboard, so source-reference quality can be inspected without
opening the broader BoM costing gate.
BoM evidence trace matrices now join the sourcing ledger, BoM provenance
manifest and source-reference quality gate into one per-line status:
candidate-only, critical-unsourced, protocol-only, source-reference-blocked or
production-eligible. This is the explicit boundary between showing an
architecture candidate BoM, showing priced rows for review, and allowing
procurement use.
BoM evidence closure plans now turn those trace statuses into an ordered action
queue: collect critical source evidence, repair rejected evidence, resolve
duplicate component identities, replace protocol sources, repair weak source
references or defer candidate-only sourcing. This makes the next sourcing task
visible without treating candidate-only rows as procurement blockers.
Sourcing batch plans now group those closure rows into operational work packages
with search starting points, required fields, acceptance criteria, rejection
criteria and target outcomes. Critical source collection stays active first;
candidate-only sourcing is explicitly deferred unless promoted into procurement
scope.
Procurement readiness gates now aggregate architecture acceptance, BoM evidence
trace, source reference quality, evidence authenticity, costing, active sourcing
batches and prototype policy. They deliberately keep prototype outputs out of
procurement use until source-backed critical lines, accepted engineering review
and explicit procurement approval are present.
Submodule engineering gates now sit between component allocation and module
engineering. They emit one row per submodule with purpose, component count,
interface carrier coverage, linked requirements, review questions, verification
evidence, critical unpriced lines and the exact action needed before that
submodule can be treated as accepted engineering content.
The ledger also surfaces duplicate canonical component IDs, so repeated module
allocations such as a metering or communication component must be resolved as
shared physical items or separate install locations before source evidence can
price them. Each generated report also exports a component identity JSON/CSV
worklist for that review.
Section scores now export a score ledger: base score, deterministic deductions,
flooring and limitations are visible so a `9` reads as "no current gate issue",
not as an external engineering-review score.
Evidence gaps now export a closure register that combines readiness blockers,
calculation reviews, assumptions, sourcing rows and verification rows into one
queue, with each row pointing to architecture revision, engineering review,
sourcing intake, verification intake or score repair.
Evidence acquisition plans now turn missing sourcing and reviewer evidence into
specific intake tasks before any trust or BoM claim can advance. These rows
name the required fields, disallowed evidence types and target intake artifacts
for supplier/catalogue evidence or named engineering-review evidence.
Closure plans now group those gaps into ordered phases with entry criteria, exit
criteria and top gap IDs, so the next work package is explicit rather than
hidden in several separate ledgers.
Artifact indexes now include a dashboard table before the link list, so the
first page shows verdict, deterministic score, architecture depth, unpriced
critical lines, source-backed BoM claims, provenance violations, verification
coverage and evidence-gap queues for every generated report.
Claim ledgers now classify report statements as brief-supplied,
model-generated, calculated, source-backed or reviewer-accepted, with source and
reviewer evidence refs carried per row. This keeps the generated document from
blending assumptions, candidates and admitted evidence into one undifferentiated
voice.
Claim evidence gates now aggregate those claim rows by area: brief requirements,
architecture design, engineering math, BoM sourcing and compliance/risk. The
gate gives a separate pass/review/block verdict, so a document can show exactly
why it remains evidence-blocked even when deterministic section scores are high.
Accepted reviewer evidence now closes the relevant generated claims instead of
only being counted in a side ledger: design reviews accept module, submodule and
component-candidate allocations; calculation reviews accept linked metric and
calculation claims; compliance/risk reviews accept standards and risk rows; and
sourced BoM evidence remains the only route for supplier, manufacturer, MPN,
unit-cost and lead-time claims.
Document trust gates now synthesize section scores, architecture readiness,
claim evidence, requirement assurance, reviewer evidence, BoM provenance and
evidence authenticity into one explicit verdict: publishable trusted,
architecture-review only, evidence-blocked or not reviewable.
Evidence authenticity gates separately classify sourcing and reviewer evidence
refs as production-ready, protocol fixture, local/internal review, missing
metadata or unknown. `test-fixture://` records can prove the mechanics close,
but they keep the Document Trust Gate out of `publishable_trusted` until replaced
with production evidence.
Evidence replacement plans turn every non-production-ready evidence row into a
specific sourcing or reviewer work item, with the accepted reference classes,
required intake fields, source artifacts and exit criteria needed to move that
row from protocol/review state into production-ready evidence.
Stage integrity gates now make the scratch compiler path auditable: every
report exports a JSON/CSV check that the canonical stages ran in order, carried
metrics/evidence/limitations, used the scratch architecture grammar where
supported, kept sourcing downstream of architecture readiness and prevented
supplier/cost fields from crossing the provenance boundary.
Trust repair plans now turn that verdict into ordered work packages with source
artifacts and exit criteria, so the next action points to concrete intake CSVs,
review packs or score ledgers rather than another abstract score. Once the
Document Trust Gate reaches `publishable_trusted`, the repair plan is empty
instead of carrying stale closure rows.
Engineering assumptions now export a ledger per report. It separates
brief-supported inputs, model-present interfaces, review-required engineering
claims, source-required BoM/cost claims and true architecture blockers, so the
document shows what still needs proof before sourcing or publication.
Product-class coverage is now explicit: BESS, heat pump, EV charger, bioreactor,
AUV, edge AI, HAPS, CGM, vertical farm and drone have deep scratch grammars; no
classified project class currently uses the generic fallback, while unknown
briefs remain intentionally blocked.
Architecture proof scripts now exercise all ten deep scratch grammars for
interface graphs, interface contracts, module review, verification planning,
sourcing evidence packets and report readiness, rather than treating the newer
heat-pump, EV-charger, bioreactor, AUV, edge-AI, HAPS and CGM grammars as
untested demos.

## Next Engineering Step

Keep closing the scratch-depth gap while preserving provenance boundaries:
catalogue parts, standards, lead times and benchmark costs should be admitted
through provenance-aware sourcing records, then the reviewer loop can patch gaps
without being allowed to invent final state unchecked.
