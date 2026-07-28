# MGU / MCU pack — staged Anvil tools

**Promoted 2026-07-28** into `scripts/lib/orchestrator/tools/` + `register-all.ts`.  
This folder remains the draft/physics crib; live copies are in the orchestrator tree.  
See `docs/plans/ANVIL-MGU-MCU-PACK-PREP-2026-07-28.md`.

```bash
# from repo root
.venv/bin/python3 prototypes/mgu-mcu-pack/selftest_all.py
```

| Module | Planned tool id |
|---|---|
| `python/inverter_sic_loss.py` | `inverter:sic-loss` |
| `python/inverter_current_voltage_envelope.py` | `inverter:current-voltage-envelope` |
| `python/field_weakening_mtpa.py` | `inverter:field-weakening-mtpa` |
| `python/ipmsm_analytical_sizing.py` | `motor:ipmsm-analytical-sizing` |
| `python/motor_loss_point.py` | `motor:loss-point` |
| `python/rotor_centrifugal_stress.py` | `motor:rotor-centrifugal-stress` |
| `python/mgu_thermal_lumped.py` | `motor:thermal-lumped` |
| `python/gear_ratio_traction.py` | `gear:traction-ratio` |
| `python/duty_cycle_energy.py` | `powertrain:duty-cycle-energy` |
