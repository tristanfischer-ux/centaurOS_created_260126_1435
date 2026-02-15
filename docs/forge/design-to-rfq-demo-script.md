# Forge Design → Drawings → RFQ Demo Script

Use this script for internal demos, stakeholder reviews, and release sign-off.

## Goal

Show an end-to-end run where a user:

1. Enters a structured design brief.
2. Generates module CAD artifacts.
3. Reviews quality/readiness.
4. Creates a Marketplace RFQ with attachments and design intent metadata.

## Demo Scenario

- Product: **Outdoor EV charger enclosure**
- Manufacturing intent: sheet metal shell + CNC mounting rail
- Quantity intent: `pilot 100-300, ramp 2k, annual 5,000 units`
- Target outcome:
  - quote-ready modules visible in Review/Procurement
  - RFQ created successfully with artifacts and scorecards

## Walkthrough Steps

### 1) Research Stage — Structured Intake

- Open Forge Cad Lab.
- Fill design brief fields:
  - use case
  - target process/material
  - tolerance target
  - quantity target
  - compliance notes
  - assumptions
- Confirm readiness indicator reflects completed intake.

**Expected result:** user has clear intake completeness before generation begins.

### 2) Build Stage — Generate Modules

- Run decomposition + module generation.
- Confirm each generated module exposes:
  - geometry previews
  - STEP/STL links (or generated binary output)
  - assumptions surfaced from generation

**Expected result:** at least one module has STEP + STL + manifest.

### 3) Review Stage — Package Quality

- Open drawing package panel.
- Verify:
  - quote-ready module count
  - artifact coverage checks by module
  - JSON manifest download
  - supplier markdown + BOM CSV exports
- Verify quality scorecard panel:
  - CAD validity
  - drawing completeness
  - RFQ readiness
  - overall score + blockers

**Expected result:** blockers are explicit and actionable.

### 4) Procurement Stage — RFQ Handoff

- Check RFQ readiness score and per-module blockers.
- Click **Create Marketplace RFQ**.
- Confirm:
  - RFQ ID returned
  - status tracker updates
  - View RFQ opens marketplace record
  - suggested suppliers section appears
- Optionally click **Re-broadcast** and verify supplier count feedback.

**Expected result:** a real RFQ exists with attached CAD/manifests and structured custom fields.

## Verification Checklist

- [ ] RFQ description includes design intent + assumptions.
- [ ] RFQ custom fields include readiness checks, module blockers, and quality scorecard.
- [ ] Attachment list excludes duplicate and invalid URLs.
- [ ] Quantity extraction reflects strongest batch hint (e.g. 5,000 in mixed string case).
- [ ] Procurement stage reflects RFQ lifecycle and supplier targeting.

## Recommended Demo Artifacts

- Screen capture from each stage (Research, Build, Review, Procurement).
- RFQ detail screenshot with attachments.
- Exported manifest JSON and supplier packet markdown.
