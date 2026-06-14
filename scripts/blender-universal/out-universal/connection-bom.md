# Distribution & cabling — costed BoM

**Cost source:** `model:uk-2026-supply+install` — a DOCUMENTED UK-2026 supply+install unit-cost model (cable £/m by CSA, pipe £/m by DN, duct £/m by side, + per-termination hardware). These are NOT engine/distributor data: the engine has no per-metre cable/pipe/duct cost source, so this is a transparent quoting model (treat as ±30%). See connection_sizing.py COST MODEL header.

- Runs sized: **4**  ·  out of spec: 2  ·  auto-upsized: 2
- Cable £19,494  ·  Pipe £41,718  ·  Duct £0
- Terminations & connection hardware: £2,960  (metre/install £58,252)

## Grand total: £61,212

### fluid_loop  —  subtotal £28,472

| from → to | size | length (m) | qty | unit £/m | line £ |
|---|---|---:|---:|---:|---:|
| rearing_tanks → rotary_drum_filter | DN300 | 44.9 | DN300 pipe, 44.9 m, ΔP≈2945.4 kPa | £340.0 | £16,099 |
| rotary_drum_filter → mbbr_biofilter | DN300 | 33.9 | DN300 pipe, 33.9 m, ΔP≈2226.2 kPa | £340.0 | £12,373 |

### thermal  —  subtotal £13,246

| from → to | size | length (m) | qty | unit £/m | line £ |
|---|---|---:|---:|---:|---:|
| heat_pumps → rearing_tanks | DN250 | 45.8 | DN250 coolant pipe, 45.8 m (1716.95 kW … | £275.0 | £13,246 |

### electrical_bus  —  subtotal £19,494

| from → to | size | length (m) | qty | unit £/m | line £ |
|---|---|---:|---:|---:|---:|
| electrical_supply → recirc_pumps_and_heat_pumps | 2×300 mm² | 94.3 | 2 × 300 mm² Cu (parallel), 94.3 m each | £200.0 | £19,494 |

