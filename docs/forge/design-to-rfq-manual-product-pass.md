# Forge Design → RFQ Manual Product Pass

Use this checklist to run a final operator-led QA pass across the five benchmark scenarios before rollout sign-off.

## Scope

Validate full journey quality for each scenario:

1. Research intake quality
2. Build output usability
3. Review package completeness
4. Procurement RFQ handoff confidence

## Test Environment

- Use staging environment with canonical Forge entrypoint (`/the-forge`).
- Ensure benchmark-like scenario inputs are available from:
  - `docs/forge/design-to-rfq-scenario-matrix.md`
- Confirm auth roles available:
  - founder or executive for full Design→RFQ flow

## Stage-by-stage Pass Criteria (per scenario)

### A) Research stage
- [ ] Structured intake fields can be completed without raw markdown editing.
- [ ] Readiness/risk feedback appears before generation.
- [ ] Assumptions are visible and editable.

### B) Build stage
- [ ] Module generation succeeds for required modules.
- [ ] Generated module artifacts include STEP/STL where expected.
- [ ] Failures (if any) are clearly surfaced with actionable recovery.

### C) Review stage
- [ ] Drawing package panel shows module artifact coverage and readiness details.
- [ ] Export actions work:
  - project manifest JSON
  - supplier packet markdown
  - module BOM CSV
- [ ] Quality scorecard appears with CAD/drawing/RFQ metrics and blockers.

### D) Procurement stage
- [ ] RFQ readiness panel shows quote-ready counts and module blockers.
- [ ] RFQ create action is gated until quote-ready prerequisites are met.
- [ ] Created RFQ links correctly and shows lifecycle status tracking.
- [ ] Supplier targeting panel populates (or clear empty state shown).
- [ ] Re-broadcast action works and reports supplier reach.

## Scenario Execution Grid

| Scenario | Research | Build | Review | Procurement | Notes |
| --- | --- | --- | --- | --- | --- |
| Precision Gearbox Housing | ☐ | ☐ | ☐ | ☐ |  |
| Sterile Medical Pump Cartridge | ☐ | ☐ | ☐ | ☐ |  |
| EV Charger Field Enclosure | ☐ | ☐ | ☐ | ☐ |  |
| Industrial Filter Cartridge Housing | ☐ | ☐ | ☐ | ☐ |  |
| Battery Cooling Manifold Assembly | ☐ | ☐ | ☐ | ☐ |  |

## Sign-off Rules

- Mark a scenario **pass** only if all four stages pass.
- Any procurement-stage blocker on quote-ready modules is a release blocker unless documented with mitigation.
- Attach command output/screenshots in QA artifacts for failed or borderline cases.

## Output Artifact Expectations

Upon completion, update:

- `docs/forge/design-to-rfq-qa-report.md` with execution date and pass/fail summary
- `docs/forge/design-to-rfq-release-packet.md` sign-off checklist status
