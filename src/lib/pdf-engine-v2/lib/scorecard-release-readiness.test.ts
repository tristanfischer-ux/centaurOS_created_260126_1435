import { buildReleaseReadinessSection } from './scorecard-floor'

describe('buildReleaseReadinessSection', () => {
  it('proveCatch: open homologation holds and a draft bespoke PCB cannot present as all-pass quality', () => {
    const section = buildReleaseReadinessSection({
      homologationHonesty: {
        verdict: 'NOT_HOMOLOGATED',
        open_by_design_ids: ['DEC-001', 'DEC-008'],
        fia_race_ready: false,
      },
      pcb: {
        isPcbBearing: true,
        disposition: 'bespoke',
        NOT_FABRICATION_READY: true,
        forgeDraftOnly: true,
        supplierGerbers: false,
        hilPresent: false,
        ship_ok: false,
      },
    })

    expect(section.name).toBe('release_readiness')
    expect(section.score).toBeLessThan(9)
    expect(section.advisory).toBe(false)
    expect(section.qualityLoopActionable).toBe(false)
    expect(section.defects?.join(' ')).toContain('NOT_HOMOLOGATED')
    expect(section.defects?.join(' ')).toContain('NOT_FABRICATION_READY')
  })

  it('proveCatch: explicit concept-only render evidence caps release readiness', () => {
    const section = buildReleaseReadinessSection({
      renderQuality: {
        ok: true,
        readiness: 'CONCEPT',
        release_ready: false,
      },
    })

    expect(section.score).toBeLessThan(9)
    expect(section.defects?.join(' ')).toContain('concept-only')
  })

  it('proveCatch: a clean Blender render without release-CAD attestation remains concept-only', () => {
    const section = buildReleaseReadinessSection({
      renderQuality: {
        ok: true,
        form: 'traction_drive_bay_fill',
        form_meshes_count: 42,
      },
    })

    expect(section.score).toBe(7)
    expect(section.defects?.join(' ')).toContain('concept-only')
  })

  it('proveCatch: verification rows still bind when cached hard_open is null', () => {
    const section = buildReleaseReadinessSection({
      _verificationSpine: {
        hard_open: null,
        rows: [{
          hardness: 'HARD',
          status: 'OPEN',
          claim: 'Rotor overspeed proof',
        }],
      },
    })

    expect(section.score).toBe(4)
    expect(section.defects?.join(' ')).toContain('1 HARD verification claim')
  })

  it('keeps release readiness at 10 only when applicable evidence is closed', () => {
    const section = buildReleaseReadinessSection({
      homologationHonesty: {
        verdict: 'HOMOLOGATED',
        open_by_design_ids: [],
        fia_race_ready: true,
      },
      pcb: {
        isPcbBearing: true,
        disposition: 'bespoke',
        NOT_FABRICATION_READY: false,
        forgeDraftOnly: false,
        supplierGerbers: true,
        hilPresent: true,
        ship_ok: true,
      },
      renderQuality: {
        ok: true,
        readiness: 'RELEASE',
        release_ready: true,
      },
    })

    expect(section).toMatchObject({
      name: 'release_readiness',
      score: 10,
      defects: [],
      advisory: false,
      qualityLoopActionable: false,
    })
  })
})
