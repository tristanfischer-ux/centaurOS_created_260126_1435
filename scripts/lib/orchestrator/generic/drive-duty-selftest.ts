// proveCatch for deriveDutylessDriveWords (Tristan 2026-07-04 — round-3 residual
// dissection, engine-rule fix #3: "duty-less drive words"). 'Motor Starter' / 'VFD Drive'
// / 'VFD Controller' filler words the skeleton emits with a FLAT character_id carry no
// rating_primary at all, so the fill-blank duty-aware pin (emitter-completion.
// wordMotorDriveDutyKw) is permanently blind. This guard proves both directions: (a) a
// real duty IS derived — via the lineage join, the module-level largest-unpaired-motor
// fallback, and the MCC-level group-sum fallback — and stamped with provenance; (b) with
// NO motor evidence anywhere in the module the word is honestly flagged a mis-emission,
// never guessed.
//
// Standalone (not a --selftest CLI block inside the big module), matching the codebase's
// established one-selftest-file-per-fix convention (pump-motor-selftest.ts,
// instrument-sizing-selftest.ts, …). Wired into verify-engine-guards.sh.

import { deriveDutylessDriveWords } from './universal-contract-sizing'

let failures = 0
const expect = (cond: boolean, msg: string) => { if (!cond) { failures++; console.error('  ✗ ' + msg) } }

function driveWord(name: string, cid: string, id = cid) {
  return {
    id,
    name_human: name,
    content_character: { character_id: cid, name_human: name },
    modifier_characters: [] as { kind: string; value: string; unit?: string }[],
  }
}

function ratedWord(name: string, cid: string, kw: number) {
  return {
    id: `${cid}_word`,
    name_human: name,
    content_character: { character_id: cid, name_human: name },
    modifier_characters: [{ kind: 'rating_primary', value: String(kw), unit: 'kW' }],
  }
}

function ratingOf(w: any): number | null {
  const mc = (w.modifier_characters || []).find((m: any) => m.kind === 'rating_primary')
  return mc ? parseFloat(String(mc.value)) : null
}
function basisOf(w: any): string {
  const mc = (w.modifier_characters || []).find((m: any) => m.kind === 'sizing_basis')
  return mc ? String(mc.value) : ''
}

// ── (1) LINEAGE JOIN — the same parent_word__child join reconcileDriveTrainRatings uses,
//    bound to a contract-quantity motor requirement.
{
  const parent = ratedWord('Irrigation Pump', 'irrigation_pump', 0) // no own rating; duty comes from contract
  parent.modifier_characters = []
  const child = driveWord('Vfd Drive', 'irrigation_pump_word__vsd')
  const modules: any = [{ module: 'mass_fluid_transport_process', sub_modules: [{ id: 'sm', words: [parent, child] }] }]
  const r = deriveDutylessDriveWords(modules, { irrigation_pump_motor_kw: 9.653 })
  expect(r.derived === 1 && r.flagged === 0, `lineage join: expected 1 derived / 0 flagged, got ${JSON.stringify(r)}`)
  expect(ratingOf(child) === 11, `lineage join: 9.653 kW contract requirement → next IEC frame 11 kW, got ${ratingOf(child)}`)
  expect(/duty derived from driven motor/.test(basisOf(child)) && /lineage: irrigation_pump/.test(basisOf(child)),
    `lineage join: sizing_basis must record the lineage + 'duty derived from driven motor', got "${basisOf(child)}"`)
}

// ── (2) MODULE-LEVEL FALLBACK — a flat 'Motor Starter'... no, a single-channel 'Vfd
//    Controller' with NO lineage, sized to the largest UNPAIRED motor in the same module.
{
  const pump = ratedWord('Drain Transfer Pump', 'drain_pump', 7.5)
  const drive = driveWord('Vfd Controller', 'vfd_controller_flat')
  const modules: any = [{ module: 'power_distribution', sub_modules: [{ id: 'sm', words: [pump, drive] }] }]
  const r = deriveDutylessDriveWords(modules, {})
  expect(r.derived === 1 && r.flagged === 0, `module fallback (single): expected 1 derived / 0 flagged, got ${JSON.stringify(r)}`)
  expect(ratingOf(drive) === 7.5, `module fallback (single): largest unpaired motor 7.5 kW is already an IEC frame, got ${ratingOf(drive)}`)
  expect(/largest unpaired motor/.test(basisOf(drive)), `module fallback (single): basis must cite 'largest unpaired motor', got "${basisOf(drive)}"`)
}

// ── (3) MCC-LEVEL GROUP SUM — a bare 'Motor Starter' (the panel abstraction for the WHOLE
//    starter group) sums every unpaired motor in the module, not just the largest.
{
  const blower = ratedWord('Aeration Blower', 'aeration_blower', 5.5)
  const pump = ratedWord('Backwash Pump', 'backwash_pump', 11)
  const starter = driveWord('Motor Starter', 'motor_starter_flat')
  const modules: any = [{ module: 'power_distribution', sub_modules: [{ id: 'sm', words: [blower, pump, starter] }] }]
  const r = deriveDutylessDriveWords(modules, {})
  expect(r.derived === 1 && r.flagged === 0, `MCC group sum: expected 1 derived / 0 flagged, got ${JSON.stringify(r)}`)
  expect(ratingOf(starter) === 18.5, `MCC group sum: 5.5+11=16.5 kW → next IEC frame 18.5 kW, got ${ratingOf(starter)}`)
  expect(/MCC-level group sum of 2 unpaired motor/.test(basisOf(starter)),
    `MCC group sum: basis must cite the group sum of 2 motors, got "${basisOf(starter)}"`)
}

// ── (4) MIS-EMISSION — proveCatch the OTHER direction: NO driven-motor evidence anywhere
//    in the module → flagged, no rating_primary guessed.
{
  const drive = driveWord('Vfd Drive', 'vfd_drive_flat')
  const otherWord = driveWord('Circuit Breaker', 'circuit_breaker_flat') // present, but not a driven machine
  const modules: any = [{ module: 'power_distribution', sub_modules: [{ id: 'sm', words: [drive, otherWord] }] }]
  const r = deriveDutylessDriveWords(modules, {})
  expect(r.derived === 0 && r.flagged === 1, `mis-emission: expected 0 derived / 1 flagged, got ${JSON.stringify(r)}`)
  expect(ratingOf(drive) === null, `mis-emission: no rating_primary must be guessed, got ${ratingOf(drive)}`)
  const note = (drive as any).mis_emission_note as string | undefined
  expect(!!note && /no driven-motor evidence/.test(note) && /mis-emission/.test(note),
    `mis-emission: must stamp mis_emission_note naming 'no driven-motor evidence', got "${note}"`)
}

// ── (5) IDEMPOTENT — a second pass changes nothing (derived words already have a rating;
//    flagged words already carry the note).
{
  const parent = ratedWord('Irrigation Pump', 'irrigation_pump', 0)
  parent.modifier_characters = []
  const child = driveWord('Vfd Drive', 'irrigation_pump_word__vsd')
  const flatDrive = driveWord('Vfd Controller', 'vfd_controller_lonely')
  const modules: any = [{ module: 'm', sub_modules: [{ id: 'sm', words: [parent, child, flatDrive] }] }]
  deriveDutylessDriveWords(modules, { irrigation_pump_motor_kw: 9.653 })
  const r2 = deriveDutylessDriveWords(modules, { irrigation_pump_motor_kw: 9.653 })
  expect(r2.derived === 0 && r2.flagged === 0, `idempotent: second pass must derive/flag nothing new, got ${JSON.stringify(r2)}`)
}

if (failures) { console.error(`drive-duty selftest: ${failures} FAILED`); process.exit(1) }
console.log('drive-duty selftest OK (lineage join / module-level largest-unpaired / MCC-level group-sum / mis-emission flag / idempotent proven)')
