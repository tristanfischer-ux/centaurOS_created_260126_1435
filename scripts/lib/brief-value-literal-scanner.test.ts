import { scanEmitterForBriefLiterals } from './brief-value-literal-scanner'

describe('Gate 25 brief-value literal scanner', () => {
  // proveCatch (benchtop-bioreactor exit-25, 2026-07-19): a round-hundred cost ceiling
  // (£400) must NOT be flagged against a hardcoded MAINS literal (400 V in a 3-phase
  // formula or an `AC 400 3~/50 Hz` string) — that number is a voltage/frequency constant,
  // never a stale money literal.
  it('does NOT flag a mains-voltage 400 against a £400 cost ceiling (false positive)', () => {
    const src = [
      'const a = `${Math.ceil((p.continuousPowerKw * 1000 / (400 * Math.sqrt(3)) * 1.25) / 100) * 100} A 3-phase`',
      'const b = `${p.coolantChemistryDesc}, IP54 outdoor mount, AC 400 3~/50 Hz`',
    ].join('\n')
    const res = scanEmitterForBriefLiterals(src, { unit_cost_ceiling_gbp: 400 } as never)
    expect(res.hits).toHaveLength(0)
  })

  // the gate's REAL purpose must still fire: a genuine stale brief-value mirror.
  it('STILL flags a genuine stale mass literal (true positive preserved)', () => {
    const res = scanEmitterForBriefLiterals(
      'const m = `structural floor rated 35000 kg`',
      { max_mass_kg: 35000 } as never,
    )
    expect(res.hits.length).toBeGreaterThanOrEqual(1)
  })
})
