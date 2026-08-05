# Capability index

_Generated 2026-08-05T09:06:28Z · ship_ok=false_

FEMM heat-flow is LIVE (R1 pass, R2 field). CalculiX thermal-gradient stress RAN. ROSS shows first critical ~22.9k under operating 24k (margin×0.96) with assumed bearings. ship_ok false. Bar B OPEN.

| Status | Analysis | Tool | Limit |
|---|---|---|---|
| RAN | EM Path B kit-case FE (122.1 N·m) | FEMM femmcli | 2-D planar; torque_reliable=false |
| RAN | EM Sprint 2 grade card | em_grade_sprint2.py | mesh stamp still spatial-proxy open |
| RAN_PASS | R1 known-answer heat | FEMM heat + FD crosscheck | max |err|≈0.004 K; 6-arg setsegmentprop required |
| RAN | R2 stator temperature field | FEMM heat-flow | radial strip; copper/rotor GAP; screening HTC |
| RAN | R3 thermal visualisation | PyVista | not CHT; not axial |
| RAN | R4 centrif + thermal gradient stress | CalculiX Docker | coarse ring; Δ≈25 MPa from T gradient; not release FoS |
| RAN | R5 material swap M400→M270 | machine_lamination.py | fixed B probes; ~0.52× iron loss at 24k f |
| RAN | R6 capability index | this pack | living document |
| PARTIAL | ROSS critical speeds | ross 2.3.0 | first crit 22922 vs 24k; margin×0.96; assumed bearings |
| RAN | LPTN / coolant network | CoolProp + analytical screens | few-node; not field |
| RAN | Centrifugal rotor FoS @19.5k | CalculiX prior | FoS≈2.635 screening |
| AVAILABLE_SCRIPT | OpenFOAM jacket/cold-plate | openfoam_fia_*.py | not full helical CHT |
| AVAILABLE | ParaView GUI | /opt/homebrew/bin/paraview | interactive; packs use PyVista |
| AVAILABLE | gmsh | /opt/homebrew/bin/gmsh | mesh gen for deeper CCX |
| WILL_NOT | Elmer multiphysics | — | duplicates stack — do not install |
