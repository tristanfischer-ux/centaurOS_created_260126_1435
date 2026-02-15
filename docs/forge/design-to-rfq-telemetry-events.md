# Forge Design → RFQ Telemetry Events

This document defines activity events emitted from Cad Lab Review and Procurement interactions.

## Event Catalog

### RFQ creation funnel

- `cad_lab_rfq_create_attempt`
  - `readinessScore`
  - `quoteReadyModules`
  - `moduleCount`
  - `hasProjectId`

- `cad_lab_rfq_create_blocked`
  - `reason`
  - `readinessScore`
  - `quoteReadyModules`

- `cad_lab_rfq_created`
  - `readinessScore`
  - `quoteReadyModules`
  - `moduleCount`

- `cad_lab_rfq_create_failed`
  - `reason`
  - `readinessScore`

### RFQ post-create operations

- `cad_lab_rfq_view_opened`
  - `responseCount`
  - `status`

- `cad_lab_rfq_rebroadcast_attempt`
  - `hasRfq`
  - `responseCount`

- `cad_lab_rfq_rebroadcasted`
  - `broadcastCount`

- `cad_lab_rfq_rebroadcast_failed`
  - `reason`

### Contract document interactions

- `cad_lab_contract_doc_generated`
  - `docType`
  - `moduleCount`
  - `hasLinkedRfq`

- `cad_lab_contract_doc_copied`
  - `docType`
  - `moduleCount`

### Drawing package interactions

- `cad_lab_package_manifest_downloaded`
  - `moduleCount`
  - `generatedModules`
  - `quoteReadyModules`
  - `readinessPct`

- `cad_lab_supplier_packet_downloaded`
  - `moduleCount`
  - `generatedModules`
  - `quoteReadyModules`
  - `readinessPct`

- `cad_lab_module_bom_downloaded`
  - `moduleCount`
  - `generatedModules`
  - `quoteReadyModules`
  - `readinessPct`

- `cad_lab_manifest_opened`
  - `moduleId`
  - `moduleName`
  - `readinessPct`

## Suggested Dashboard Cuts

- Conversion funnel:
  - create attempt → created
  - blocked vs failed vs created split
- Export engagement:
  - manifest vs packet vs BOM downloads
- Readiness quality:
  - average readiness score at create attempt
  - average quote-ready module count by project
- Supplier ops:
  - rebroadcast usage rate
  - post-broadcast response lift
