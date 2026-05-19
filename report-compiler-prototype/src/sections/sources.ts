import type { SectionContract } from './contracts'
import type { SourceLedger } from '../schema/types'
import { issue } from '../schema/issues'

export const sourcesContract: SectionContract<SourceLedger> = {
  id: 'sources_references',
  title: 'Sources & References',
  select: dossier => dossier.sources,
  minScoreInputs: {
    requiredFields: ['refs'],
    requiredEvidenceCount: 5,
    fatalIfMissing: ['refs'],
  },
  validate(sources) {
    if (sources.refs.length < 5) {
      return [issue(
        'major',
        'too_few_sources',
        `Only ${sources.refs.length} source/provenance refs are present.`,
        'sources_references',
        'Attach at least five source, formula, brief, or class-pack references.',
      )]
    }
    return []
  },
}

