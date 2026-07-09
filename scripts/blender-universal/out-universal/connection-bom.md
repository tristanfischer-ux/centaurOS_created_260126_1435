# Distribution & cabling — costed BoM

**Cost source:** `model:uk-2026-supply+install` — a DOCUMENTED UK-2026 supply+install unit-cost model (cable £/m by CSA, pipe £/m by DN, duct £/m by side, + per-termination hardware). These are NOT engine/distributor data: the engine has no per-metre cable/pipe/duct cost source, so this is a transparent quoting model (treat as ±30%). See connection_sizing.py COST MODEL header.

- Runs sized: **71**  ·  out of spec: 0  ·  auto-upsized: 0
- Cable £2,449  ·  Pipe £83,518  ·  Duct £0
- Terminations & connection hardware: £6,936  (metre/install £79,030)

## Grand total: £85,967

### fluid_loop  —  subtotal £83,518

| from → to | size | length (m) | qty | unit £/m | line £ |
|---|---|---:|---:|---:|---:|
| Gac Softener → Softener Vessel | DN65 | 28.1 | DN65 pipe, 28.1 m, ΔP≈7.6 kPa | £60.0 | £1,795 |
| Uf Module Bank → Ro High Pressure Pump | DN50 | 5.9 | DN50 pipe, 5.9 m, ΔP≈2.3 kPa | £48.0 | £366 |
| Ro High Pressure Pump → Reverse Osmosis Skid | DN50 | 9.4 | DN50 pipe, 9.4 m, ΔP≈3.6 kPa | £48.0 | £535 |
| Drain Collection Sump → Uv Disinfection | DN250 | 23.2 | DN250 pipe, 23.2 m, ΔP≈1.0 kPa | £275.0 | £7,031 |
| Uv Disinfection → Nursery Cloth Filter | DN125 | 34.6 | DN125 pipe, 34.6 m, ΔP≈2.3 kPa | £130.0 | £4,763 |
| Nursery Cloth Filter → Gac Filter | DN125 | 3.3 | DN125 pipe, 3.3 m, ΔP≈0.2 kPa | £130.0 | £690 |
| Gac Filter → Cloth Filter | DN150 | 26.7 | DN150 pipe, 26.7 m, ΔP≈2.5 kPa | £165.0 | £4,744 |
| Cloth Filter → Drain Water Tank | DN150 | 30.5 | DN150 pipe, 30.5 m, ΔP≈2.9 kPa | £165.0 | £5,366 |
| Drain Water Tank → Nursery Drain Collection Sump | DN25 (nominal — flow unknown) | 11.0 | DN25 nominal pipe, 11.0 m (flow unknown) | £28.0 | £347 |
| Nursery Drain Collection Sump → Drain Transfer Pump | DN125 | 38.0 | DN125 pipe, 38.0 m, ΔP≈2.5 kPa | £130.0 | £5,195 |
| Nursery Drain Collection Sump → Gac Softener | DN20 | 9.1 | DN20 pipe, 9.1 m, ΔP≈14.1 kPa | £13.2 | £140 |
| Drain Transfer Pump → Nursery Drain Transfer Pump | DN125 | 11.8 | DN125 pipe, 16.4 m, ΔP≈1.1 kPa | £130.0 | £1,791 |
| Nursery Drain Transfer Pump → Cip Tank | DN32 | 24.3 | DN32 pipe, 24.3 m, ΔP≈10.6 kPa | £34.0 | £878 |
| Cip Tank → Cleanwater Reservoir Reserve Tank | DN32 | 26.7 | DN32 pipe, 26.7 m, ΔP≈11.7 kPa | £34.0 | £959 |
| Cleanwater Reservoir Reserve Tank → Fresh Water Tank | DN25 (nominal — flow unknown) | 21.9 | DN25 nominal pipe, 21.9 m (flow unknown) | £28.0 | £654 |
| Fresh Water Tank → Nutrient Tank | DN25 (nominal — flow unknown) | 36.4 | DN25 nominal pipe, 36.4 m (flow unknown) | £28.0 | £1,058 |
| Fresh Water Tank → Permeate Outlet | DN250 | 44.0 | DN250 pipe, 44.0 m, ΔP≈1.9 kPa | £165.0 | £7,641 |
| Fresh Water Tank → Softener Vessel | DN65 | 43.2 | DN65 pipe, 43.2 m, ΔP≈11.6 kPa | £60.0 | £2,701 |
| Fresh Water Tank → Drain Collection Sump | DN25 (nominal — flow unknown) | 23.5 | DN25 nominal pipe, 23.5 m (flow unknown) | £28.0 | £697 |
| Fresh Water Tank → Drain Transfer Pump | DN125 | 48.8 | DN125 pipe, 48.8 m, ΔP≈3.2 kPa | £130.0 | £6,600 |
| Fresh Water Tank → Nursery Drain Collection Sump | DN25 (nominal — flow unknown) | 19.2 | DN25 nominal pipe, 19.2 m (flow unknown) | £28.0 | £578 |
| Fresh Water Tank → Nursery Drain Transfer Pump | DN125 | 44.7 | DN125 pipe, 44.7 m, ΔP≈2.9 kPa | £130.0 | £6,066 |
| Fresh Water Tank → Drain Water Tank | DN25 (nominal — flow unknown) | 22.2 | DN25 nominal pipe, 22.2 m (flow unknown) | £28.0 | £661 |
| Nutrient Tank → Acid Dosing Pump | DN15 | 30.5 | DN15 pipe, 30.5 m, ΔP≈0.2 kPa | £18.0 | £578 |
| Acid Dosing Pump → Chemical Dosing Pump | DN15 | 1.2 | DN15 pipe, 1.2 m, ΔP≈0.0 kPa | £18.0 | £50 |
| Acid Dosing Pump → Drain Collection Sump | DN15 | 31.3 | DN15 pipe, 31.3 m, ΔP≈0.2 kPa | £18.0 | £591 |
| Fertigation Dosing Pump → Fertigation Dosing Pump Backup | DN150 | 1.8 | DN150 pipe, 1.8 m, ΔP≈0.2 kPa | £165.0 | £634 |
| Fertigation Dosing Pump → Drain Collection Sump | DN150 | 7.7 | DN150 pipe, 7.7 m, ΔP≈0.7 kPa | £165.0 | £1,612 |
| Fertigation Dosing Pump Backup → Hand Watering Pump | DN80 | 22.4 | DN80 pipe, 22.7 m, ΔP≈5.7 kPa | £74.0 | £1,801 |
| Fertigation Dosing Pump Backup → Drain Collection Sump | DN150 | 10.2 | DN150 pipe, 10.1 m, ΔP≈1.0 kPa | £165.0 | £2,015 |
| Hand Watering Pump → Irrigation Pump | DN250 | 34.7 | DN250 pipe, 34.7 m, ΔP≈1.5 kPa | £275.0 | £10,174 |
| Irrigation Pump → Nursery Acid Dosing Pump | DN15 | 31.5 | DN15 pipe, 31.5 m, ΔP≈0.2 kPa | £18.0 | £594 |
| Nursery Acid Dosing Pump → Nursery Chemical Dosing Pump | DN15 | 1.8 | DN15 pipe, 1.8 m, ΔP≈0.0 kPa | £18.0 | £60 |
| Nursery Chemical Dosing Pump → Nursery Fertigation Dosing Pump | DN125 | 2.0 | DN125 pipe, 2.0 m, ΔP≈0.1 kPa | £130.0 | £523 |
| Nursery Fertigation Dosing Pump → Distribution Manifold | DN80 | 3.4 | DN80 pipe, 3.4 m, ΔP≈0.9 kPa | £74.0 | £391 |
| Ultrafiltration Module → Fresh Water Tank | DN32 | 38.4 | DN32 pipe, 38.4 m, ΔP≈12.3 kPa | £20.4 | £814 |
| Permeate Outlet → Acid Dosing Pump | DN15 | 27.4 | DN15 pipe, 27.4 m, ΔP≈0.2 kPa | £18.0 | £522 |
| Softener Vessel → Ultrafiltration Module | DN65 | 20.6 | DN65 pipe, 20.6 m, ΔP≈5.5 kPa | £60.0 | £1,344 |
| Chemical Dosing Pump → Drain Collection Sump | DN15 | 29.6 | DN15 pipe, 29.6 m, ΔP≈0.2 kPa | £18.0 | £561 |

### electrical_bus  —  subtotal £2,049

| from → to | size | length (m) | qty | unit £/m | line £ |
|---|---|---:|---:|---:|---:|
| Mains Incomer → Standby Diesel Generator | 1.5 mm² | 29.6 | 1 × 1.5 mm² Cu, 29.6 m | £3.0 | £101 |
| Standby Diesel Generator → Transformer | 1.5 mm² | 33.8 | 1 × 1.5 mm² Cu, 33.7 m | £3.0 | £113 |
| Transformer → Main Switchboard | 1.5 mm² | 4.3 | 1 × 1.5 mm² Cu, 4.3 m | £3.0 | £25 |
| Main Switchboard → Motor Control Center | 1.5 mm² | 32.5 | 1 × 1.5 mm² Cu, 32.5 m | £3.0 | £110 |
| Motor Control Center → Electrical Control Panel | 1.5 mm² | 7.3 | 1 × 1.5 mm² Cu, 7.3 m | £3.0 | £34 |
| Motor Control Center → 3 Phase Power Input | 1.5 mm² | 7.0 | 1 × 1.5 mm² Cu, 7.0 m | £3.0 | £33 |
| Motor Control Center → Control + Instrument UPS | 1.5 mm² | 6.0 | 1 × 1.5 mm² Cu, 6.0 m | £3.0 | £30 |
| Motor Control Center → SCADA / Plant Control System | 1.5 mm² | 4.8 | 1 × 1.5 mm² Cu, 4.8 m | £3.0 | £26 |
| Motor Control Center → Uv Disinfection | 2.5 mm² | 6.1 | 1 × 2.5 mm² Cu, 6.1 m | £4.0 | £36 |
| Motor Control Center → Fertigation Dosing Pump | 1.5 mm² | 22.3 | 1 × 1.5 mm² Cu, 22.3 m | £3.0 | £79 |
| Motor Control Center → Acid Dosing Pump | 1.5 mm² | 36.0 | 1 × 1.5 mm² Cu, 36.0 m | £3.0 | £120 |
| Motor Control Center → Chemical Dosing Pump | 1.5 mm² | 34.1 | 1 × 1.5 mm² Cu, 34.1 m | £3.0 | £114 |
| Motor Control Center → Hand Watering Pump | 1.5 mm² | 11.3 | 1 × 1.5 mm² Cu, 11.3 m | £3.0 | £46 |
| Motor Control Center → Drain Transfer Pump | 1.5 mm² | 32.2 | 1 × 1.5 mm² Cu, 32.2 m | £3.0 | £109 |
| Motor Control Center → Cloth Filter | 1.5 mm² | 4.6 | 1 × 1.5 mm² Cu, 4.6 m | £3.0 | £26 |
| Motor Control Center → Nursery Fertigation Dosing Pump | 1.5 mm² | 10.2 | 1 × 1.5 mm² Cu, 10.2 m | £3.0 | £43 |
| Motor Control Center → Nursery Acid Dosing Pump | 1.5 mm² | 10.2 | 1 × 1.5 mm² Cu, 10.2 m | £3.0 | £42 |
| Motor Control Center → Nursery Chemical Dosing Pump | 1.5 mm² | 9.1 | 1 × 1.5 mm² Cu, 9.1 m | £3.0 | £39 |
| Motor Control Center → Nursery Cloth Filter | 1.5 mm² | 35.1 | 1 × 1.5 mm² Cu, 35.1 m | £3.0 | £117 |
| Motor Control Center → Nursery Drain Transfer Pump | 1.5 mm² | 28.1 | 1 × 1.5 mm² Cu, 28.0 m | £3.0 | £96 |
| Motor Control Center → Irrigation Pump | 1.5 mm² | 29.9 | 1 × 1.5 mm² Cu, 29.9 m | £3.0 | £102 |
| Motor Control Center → Fertigation Dosing Pump Backup | 1.5 mm² | 9.7 | 1 × 1.5 mm² Cu, 9.7 m | £3.0 | £41 |
| Motor Control Center → Ro High Pressure Pump | 1.5 mm² | 11.3 | 1 × 1.5 mm² Cu, 11.3 m | £3.0 | £46 |
| Motor Control Center → Gac Filter | 1.5 mm² | 33.6 | 1 × 1.5 mm² Cu, 33.6 m | £3.0 | £113 |
| Motor Control Center → Permeate Outlet | 1.5 mm² | 26.1 | 1 × 1.5 mm² Cu, 26.1 m | £3.0 | £90 |
| Motor Control Center → Concentrate Outlet | 1.5 mm² | 27.5 | 1 × 1.5 mm² Cu, 27.5 m | £3.0 | £95 |
| Motor Control Center → Electrical Control Cabinet | 1.5 mm² | 36.8 | 1 × 1.5 mm² Cu, 36.8 m | £3.0 | £122 |
| Motor Control Center → Digital Control Panel | (unsized — no design current) | 29.4 | power feeder, 29.4 m (design current un… | £3.0 | £100 |

### signal  —  subtotal £399

| from → to | size | length (m) | qty | unit £/m | line £ |
|---|---|---:|---:|---:|---:|
| Electrical Control Panel → Digital Control Panel | 1.5 mm² | 34.8 | 1 × 1.5 mm² Cu, 34.8 m | £3.0 | £116 |
| Control + Instrument UPS → Digital Control Panel | 1.5 mm² | 27.1 | 1 × 1.5 mm² Cu, 27.1 m | £3.0 | £93 |
| Motor Control Center → Digital Control Panel | 1.5 mm² | 30.0 | 1 × 1.5 mm² Cu, 30.0 m | £3.0 | £102 |
| Electrical Control Cabinet → Digital Control Panel | 1.5 mm² | 25.2 | 1 × 1.5 mm² Cu, 25.2 m | £3.0 | £88 |

