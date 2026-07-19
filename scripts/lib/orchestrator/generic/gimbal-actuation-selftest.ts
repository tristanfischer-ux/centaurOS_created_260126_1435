/**
 * gimbal-actuation --selftest — the RPM-gimbal drivetrain archetype guard (2026-07-19).
 *
 * Yuri organoid RPM-appliance / clinostat / random-positioning machine: a benchtop device
 * that REORIENTS a payload on a dual-axis gimbal at a slow rpm. Its actuation module is a
 * motor + encoder + slip-ring drivetrain per axis, NOT a pump/valve/blower. Before this,
 * `synthesizeActuation` left that module a 1-word placeholder (physics_fidelity "core RPM/
 * kinematics empty" — the RPM-appliance dossier floor). This guard proves:
 *   (a) a benchtop gimbal signal synthesises the full drivetrain (motor/encoder/slip-ring/
 *       driver/bearing/frame), physics-sized (torque → NEMA frame);
 *   (b) BYTE-STABILITY — a process plant (no rpm) and a real centrifuge (rpm ≫ 60) get NO
 *       gimbal (the guard is keyed on the slow-rotation signal, not a class table).
 */

import { gimbalDrivetrainWords, synthesizeActuation } from './universal-contract-sizing'

function run(): void {
  // (a) drivetrain anatomy from a benchtop gimbal signal
  const gw = gimbalDrivetrainWords({ max_rotation_speed_rpm: 20, working_volume_ml: 20 }, 20) as { id: string; name_human: string }[]
  const kinds = ['motor', 'encoder', 'slipring', 'driver', 'bearing', 'frame']
  for (const k of kinds) {
    if (!gw.some((w) => w.id.includes(k))) throw new Error(`gimbal-actuation: drivetrain missing a ${k} part (got ${gw.map((w) => w.id).join(', ')})`)
  }
  if (gw.length !== 6) throw new Error(`gimbal-actuation: expected 6 drivetrain parts, got ${gw.length}`)
  // physics: a light benchtop payload sizes to the smallest frame (NEMA 17), NOT an industrial motor
  const motor = gw.find((w) => w.id.includes('motor'))!
  if (!/NEMA 17/.test(motor.name_human)) throw new Error(`gimbal-actuation: 0.5 kg benchtop payload must size a NEMA 17, got "${motor.name_human}"`)

  // (b) synthesizeActuation populates the actuation module for a gimbal appliance (rpm-quantity path)
  const gimbalModules = [{ sub_modules: [{ id: 'actuation_kinematics__primary_assembly', name_human: 'Gimbal', words: [] }] }] as never
  const nAdded = synthesizeActuation(gimbalModules, { max_rotation_speed_rpm: 20, working_volume_ml: 20 })
  if (nAdded < 6) throw new Error(`gimbal-actuation: appliance must add ≥6 gimbal actuators, added ${nAdded}`)

  // (b2) TEXT path — the engine mis-mapped the class to a stirred bioreactor (no rpm quantity, the
  // actuation module NAMED "…Stirrer Motor") but the brief's gimbal intent survives in the module
  // text. The drivetrain must still synthesise AND the mis-name must be corrected.
  const misMapped = [{
    module_brief: 'The instrument reorients the cassette on a dual-axis gimbal to time-average gravity.',
    sub_modules: [{ id: 'actuation_kinematics__primary_assembly', name_human: 'Peristaltic Pump Drives & Magnetic Stirrer Motor', words: [] }],
  }] as never
  const nText = synthesizeActuation(misMapped, { do_agitation_speed_rpm: 100, working_volume_ml: 20 })
  if (nText < 6) throw new Error(`gimbal-actuation: TEXT path must add ≥6 gimbal actuators, added ${nText}`)
  const smName = String((misMapped as { sub_modules: { name_human: string }[] }[])[0].sub_modules[0].name_human)
  if (!/gimbal/i.test(smName)) throw new Error(`gimbal-actuation: mis-named stirrer actuation module must be corrected to a gimbal, got "${smName}"`)

  // BYTE-STABILITY — a process plant (no rpm quantity) must NOT get a gimbal
  const plant = [{ sub_modules: [{ id: 'power_distribution__x', words: [] }] }] as never
  synthesizeActuation(plant, { connected_electrical_load_kw: 1719, recirculation_flow_m3_h: 1670 })
  if (JSON.stringify(plant).includes('gimbal')) throw new Error('gimbal-actuation: a process plant (no rpm) must NOT synthesise a gimbal')

  // BYTE-STABILITY — a real centrifuge (rpm ≫ 60) must NOT get a gimbal (it is not a reorienting gimbal)
  const centrifuge = [{ sub_modules: [{ id: 'actuation_kinematics__x', words: [] }] }] as never
  synthesizeActuation(centrifuge, { rotor_speed_rpm: 15000, working_volume_ml: 5 })
  if (JSON.stringify(centrifuge).includes('gimbal')) throw new Error('gimbal-actuation: a 15000-rpm centrifuge must NOT synthesise a gimbal (guard is ≤60 rpm)')

  // eslint-disable-next-line no-console
  console.log(`gimbal-actuation --selftest OK (benchtop gimbal → 6-part drivetrain motor/encoder/slip-ring/driver/bearing/frame, NEMA-17 torque-sized; process plant + 15000-rpm centrifuge byte-stable, no gimbal)`)
}

run()
