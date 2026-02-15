# Forge Design → RFQ Scenario Matrix (3–5 Product QA Set)

This matrix defines representative product scenarios for final product QA.

## Scenario Coverage

| Scenario | Industry | Quantity Pattern | Expected Quote-Ready Modules | Key Validation Focus |
| --- | --- | --- | --- | --- |
| Precision Gearbox Housing | Industrial Motion | `500-1500` | 2/2 | High readiness, complete artifact package |
| Sterile Medical Pump Cartridge | Medical Devices | `1k-3k` | ≥2/3 | Mixed readiness + diagnostics gaps surfaced |
| EV Charger Field Enclosure | Energy / EV | `pilot 100-300, ramp 2k, annual 5,000` | 2/2 | Strongest quantity hint parsing (5,000) |
| Industrial Filter Cartridge Housing | Process Equipment | `300-900` | ≥2/3 | Pending module + blocker visibility |
| Battery Cooling Manifold Assembly | Automotive | `0.5m-1m` | 3/3 | `m` suffix parsing (750,000 midpoint) |

## Expected Outputs per Scenario

- Structured design brief captured and included in RFQ metadata.
- At least one quote-ready module (STEP + STL + manifest) before RFQ creation.
- RFQ description includes:
  - module summary
  - readiness checks
  - blockers (if any)
  - quality scorecard
  - design intent + assumptions
- Attachments deduplicated and filtered to valid HTTP(S) URLs.

## Automated Evidence Mapping

- Server-side scenario coverage:
  - `src/actions/__tests__/cad-lab-rfq-golden-benchmarks.test.ts`
- RFQ payload and gating regression:
  - `src/actions/__tests__/cad-lab-rfq.test.ts`
- Scorecard/readiness consistency:
  - `src/lib/__tests__/cad-lab-quality-scorecard.test.ts`
  - `src/lib/__tests__/cad-lab-readiness.test.ts`
  - `src/components/cad/__tests__/cad-lab-procurement-utils.test.ts`

## Manual QA Companion (UI Path)

Use this matrix alongside:

- `docs/forge/design-to-rfq-demo-script.md`
- `docs/forge/design-to-rfq-qa-report.md`

to execute staged UI checks and compare observed behavior against scenario expectations.
