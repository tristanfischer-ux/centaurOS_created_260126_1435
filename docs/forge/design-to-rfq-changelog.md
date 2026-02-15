# Forge Design → Drawings → RFQ Changelog

This changelog summarizes the shipped improvements for the Design-to-Quote initiative.

## v1.0 — End-to-End Design-to-RFQ Flow

### UX and Intake

- Added structured design intake in Cad Lab research stage:
  - use case
  - target process/material
  - tolerance and quantity targets
  - compliance notes
  - assumption notes
- Added intake readiness feedback before generation.

### CAD and Drawing Package

- Persisted STEP/STL artifact URLs and module drawing package metadata.
- Added supplier-facing drawing package review with:
  - quote-ready module counts
  - artifact completeness checks
  - per-module manifest links
- Added export options:
  - project manifest JSON
  - supplier packet Markdown
  - module BOM CSV

### Prompt and Generation Reliability

- Unified generation path on smart module generation strategy.
- Removed contradictory library usage guidance in generation prompts.
- Added assumption extraction and surfacing in build/review flow.

### Procurement and RFQ Handoff

- Added one-click Marketplace RFQ creation from Cad Lab.
- Implemented strict RFQ quality gates:
  - requires at least one quote-ready module (STEP + STL + manifest)
  - rejects artifactless generation outputs
- Added payload hygiene:
  - deduplicated attachments
  - filtered invalid/non-http URLs
- Added robust quantity parsing for:
  - comma ranges (`1,000-5,000`)
  - suffix ranges (`2k-4k`, `0.5m-1m`)
  - mixed quantity hints in free text
- Added RFQ lifecycle support:
  - project-level RFQ linkage
  - status/response polling
  - suggested suppliers panel
  - rebroadcast action with feedback

### Quality, Scorecards, and Blockers

- Added shared readiness utility layer for diagnostics + artifacts.
- Added review-stage quality scorecard:
  - CAD validity
  - drawing completeness
  - RFQ readiness
  - overall blended score
- Embedded scorecards and module blockers directly in RFQ description and custom fields.

### Regression and Release Readiness

- Added dedicated Forge RFQ regression command:
  - `npm run test:forge-rfq`
- Added golden benchmark suite with 5 cross-industry scenarios.
- Added release assets:
  - rollout checklist
  - demo walkthrough script
  - benchmark-backed quality gates

## Validation Snapshot

At latest publish, the targeted regression suite passes:

- `npm run test:forge-rfq`
