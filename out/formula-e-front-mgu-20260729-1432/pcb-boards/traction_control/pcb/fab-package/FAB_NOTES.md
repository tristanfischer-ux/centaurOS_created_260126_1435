# Fabrication notes — prototype quote

## Classification
- **PROTOTYPE FAB PACKAGE COMPLETE** (internal engineering)
- **NOT supplier-released**
- **NOT HIL-proven**
- **NOT homologation hardware**
- ship_ok remains false at kit level

## Finish
- HASL lead-free or ENIG (prefer ENIG for fine-pitch QFP) — fabricator option
- Soldermask: green, both sides
- Silkscreen: white, both sides
- IPC class: Class 2 target (screening)

## Deliverables included
- Gerbers (KiCad export) + .gbrjob
- NC drill
- PnP / positions.csv (board-level if present)
- This stackup + notes

## Do not
- Fabricate as production without DFM review with fabricator
- Treat forge draft Gerbers as OEM supplier package
