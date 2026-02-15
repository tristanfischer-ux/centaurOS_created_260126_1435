# Forge Design → Drawings → RFQ Product Polish Plan

## Objective

Elevate Forge into a high-confidence **Design-to-Quote** experience where users can:

1. input a design intent quickly,
2. get procurement-grade drawing outputs,
3. send a complete RFQ packet to suppliers with minimal rework.

This plan focuses on UX delight, output trust, and prompt/pipeline quality.

---

## Experience Principles

1. **Guide, don’t overwhelm**  
   Show only the next decision the user needs to make.

2. **Always explain confidence**  
   Every generated output should include assumptions, confidence level, and risk impact.

3. **RFQ readiness over visual novelty**  
   Prioritize quote-ready artifacts and supplier clarity over flashy previews.

4. **One canonical journey**  
   Reduce route ambiguity and keep users in a single staged flow from intake to handoff.

---

## Current User-Facing Friction to Resolve

### A) Intake quality is uneven
- Free-text prompt quality varies user-to-user.
- Missing quote-critical fields (tolerance, compliance, quantity intent) can appear late.

### B) Drawings need stronger procurement semantics
- Users can see geometry previews, but suppliers need explicit dimensions/callouts and revision metadata.

### C) RFQ confidence is not front-and-center enough
- Users need a clearer “ready/not-ready” summary with concrete blockers before RFQ creation.

### D) Prompt behavior can still feel opaque
- Users do not always understand what was inferred vs explicitly provided.

---

## Priority Improvements

## Priority 1 — Intake Delight + Clarity

### 1.1 Progressive intake wizard
- Use a short, step-based intake:
  - Product intent
  - Critical dimensions/tolerances
  - Material/process preferences
  - Quantity ramp profile (prototype → pilot → production)
  - Compliance/certification requirements
- Include examples and defaults per industry (medical, industrial, EV, consumer).

### 1.2 “Quote-risk preview” before generation
- Show a compact pre-build card:
  - readiness %
  - missing critical fields
  - estimated supplier clarification risk (Low/Med/High)
- Allow “Generate anyway” with explicit warning and tracked assumption capture.

### 1.3 Assumption editor UX
- Separate assumptions into:
  - auto-inferred
  - user-confirmed
  - unresolved blockers
- Require explicit user confirmation for assumptions that affect tolerance/process/compliance.

---

## Priority 2 — Drawing Package Quality

### 2.1 Procurement drawing sheet baseline
- Ensure each module drawing includes:
  - title block (project/module/rev/date/units)
  - dimension callouts for critical interfaces
  - tolerance note block
  - material/process notes

### 2.2 Consolidated supplier packet quality page
- Add a summary page in the export:
  - module list + quantities
  - envelope/mass/process class
  - assumptions + supplier risk notes
  - revision/control metadata

### 2.3 Completeness rubric visible to user
- Keep visible rubric in Review:
  - CAD validity score
  - Drawing completeness score
  - RFQ readiness score
- Show exact missing elements per module.

---

## Priority 3 — Prompt and Generation Reliability

### 3.1 Prompt architecture hardening
- Keep universal CAD constraints separate from domain appendices.
- Use schema-constrained intermediate outputs for:
  - research facts
  - module interfaces
  - assumptions/risk metadata

### 3.2 Explicit uncertainty protocol
- Require model output to tag each key dimension as:
  - provided,
  - inferred with confidence,
  - unresolved.
- Unresolved critical dimensions should trigger RFQ-readiness blockers automatically.

### 3.3 Batch/single consistency guardrails
- Ensure all generation paths use same quality policy (grammar-first + fallback).
- Keep deterministic validation checks across both paths.

---

## Priority 4 — RFQ Handoff Confidence

### 4.1 RFQ “packet preview” before submit
- Show exactly what suppliers will receive:
  - attachment list
  - quality/readiness summary
  - module blockers and assumptions

### 4.2 Supplier-facing clarity section
- Include normalized “How to quote this design” note:
  - manufacturing process assumptions
  - tolerance criticality
  - quantity phasing expectations

### 4.3 Post-submit guidance
- After RFQ creation, show:
  - suggested supplier list
  - rebroadcast control
  - response tracking and recommended next action.

---

## Prompt Quality Backlog (Concrete)

1. Add a strict **Assumption JSON contract** emitted by every model run:
   - `assumption_id`, `field`, `value`, `confidence`, `supplier_risk`, `needs_user_confirmation`.
2. Add **dimension provenance tags**:
   - `source_type` (`user`, `research`, `inferred`)
   - `source_confidence`.
3. Add **compliance extraction pass**:
   - auto-flag standards/certs from intake and propagate to RFQ custom fields.
4. Add **manufacturing contradiction detector**:
   - catch impossible process/material/tolerance combinations and block RFQ until resolved.

---

## UX Delight Backlog (Concrete)

1. “What changed” timeline across stages (Research/Build/Review/Procurement).
2. One-click “Fix blockers” actions that jump directly to the missing input field.
3. Supplier-readability preview mode to inspect packet from an external recipient lens.
4. Auto-generated executive summary suitable for sharing internally before RFQ broadcast.

---

## Rollout Validation Focus

1. **Functional:** user completes intake → build → review → RFQ without route confusion.
2. **Quality:** drawing package includes all required procurement fields.
3. **Trust:** assumptions and blockers are explicit, editable, and persisted.
4. **Supplier readiness:** RFQ payload has complete, deduped, and valid artifact set.

Success metric target:
- Increase quote-ready first-pass RFQ submissions.
- Reduce supplier clarification loops.
- Improve conversion from “RFQ create attempt” to “RFQ created + supplier response.”
