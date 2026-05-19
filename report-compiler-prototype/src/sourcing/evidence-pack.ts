import type { ProductClass, ProductDossier, SourceGrade } from '../schema/types'
import { buildSourcingWorklist, type SourcingWorklistItem } from './worklist'

export interface SourcingEvidencePacket {
  componentWordId: string
  description: string
  quantity: number
  unit: string
  priority: 'critical' | 'candidate'
  productClass: ProductClass
  whyNeeded: string
  searchTerms: string[]
  requiredEvidenceFields: string[]
  acceptedSourceGrades: Array<Extract<SourceGrade, 'verified' | 'priced' | 'catalogue'>>
  acceptanceCriteria: string[]
  rejectionCriteria: string[]
  admissionRecordSkeleton: {
    componentWordId: string
    evidenceKind: 'source'
    sourceGrade: 'catalogue'
  }
}

export interface SourcingEvidencePack {
  productClass: ProductClass
  status: 'not_started' | 'partial' | 'complete'
  criticalPackets: SourcingEvidencePacket[]
  candidatePackets: SourcingEvidencePacket[]
  limitations: string[]
}

export function buildSourcingEvidencePack(dossier: ProductDossier): SourcingEvidencePack {
  const worklist = buildSourcingWorklist(dossier)
  return {
    productClass: dossier.productClass,
    status: worklist.status,
    criticalPackets: worklist.criticalUnpriced.map(item => packetFor(dossier.productClass, item)),
    candidatePackets: worklist.candidateUnpriced.map(item => packetFor(dossier.productClass, item)),
    limitations: [
      'This pack requests sourcing evidence only; it does not contain admitted supplier, manufacturer, part number, lead-time or price claims.',
      'A BoM line becomes priced only after a SourcingEvidenceRecord passes admission validation.',
      'Search terms are deterministic starting points and must be verified against live supplier or manufacturer evidence.',
    ],
  }
}

export function renderSourcingEvidencePackCsv(pack: SourcingEvidencePack): string {
  const header = [
    'priority',
    'componentWordId',
    'description',
    'quantity',
    'unit',
    'searchTerms',
    'requiredEvidenceFields',
    'acceptanceCriteria',
    'rejectionCriteria',
  ]
  const rows = [...pack.criticalPackets, ...pack.candidatePackets].map(packet => [
    packet.priority,
    packet.componentWordId,
    packet.description,
    String(packet.quantity),
    packet.unit,
    packet.searchTerms.join(' | '),
    packet.requiredEvidenceFields.join(' | '),
    packet.acceptanceCriteria.join(' | '),
    packet.rejectionCriteria.join(' | '),
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function packetFor(productClass: ProductClass, item: SourcingWorklistItem): SourcingEvidencePacket {
  return {
    componentWordId: item.componentWordId,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    priority: item.priority,
    productClass,
    whyNeeded: item.reason,
    searchTerms: searchTerms(productClass, item),
    requiredEvidenceFields: [
      'componentWordId',
      'supplierName',
      'manufacturer',
      'mpn',
      'unitCostGbp',
      'leadTimeWeeks',
      'sourceGrade',
      'evidence.ref',
      'evidence.quote',
      'retrievedAt',
    ],
    acceptedSourceGrades: ['verified', 'priced', 'catalogue'],
    acceptanceCriteria: [
      'componentWordId exactly matches a candidate BoM line.',
      'unitCostGbp is a positive GBP number with quantity basis clear enough to reproduce total cost.',
      'evidence.kind is source, with a retrievable URL, quote reference, catalogue page, distributor listing, or quote file reference.',
      'manufacturer and MPN are present unless the item is an engineered assembly; assemblies require a supplier quote or datasheet reference.',
      'lead time is recorded when available; if unavailable, evidence quote must say it was unavailable.',
    ],
    rejectionCriteria: [
      'No source reference, missing supplier name, missing quote/evidence note, or non-positive unit cost.',
      'LLM-estimated prices, generic web snippets, benchmark averages, or class-pack defaults.',
      'Manufacturer/MPN copied from an unsourced model output rather than the source evidence.',
    ],
    admissionRecordSkeleton: {
      componentWordId: item.componentWordId,
      evidenceKind: 'source',
      sourceGrade: 'catalogue',
    },
  }
}

function searchTerms(productClass: ProductClass, item: SourcingWorklistItem): string[] {
  const base = [
    item.description,
    `${item.description} manufacturer part number`,
    `${item.description} catalogue price GBP`,
    `${item.description} datasheet`,
  ]
  if (productClass === 'energy_storage') return [...base, `${item.description} BESS`, `${item.description} IEC UL battery storage`]
  if (productClass === 'vertical_farm') return [...base, `${item.description} horticulture hydroponic`, `${item.description} food safe`]
  if (productClass === 'bioreactor') return [...base, `${item.description} single-use bioreactor`, `${item.description} GMP sterile bioprocess`]
  if (productClass === 'auv') return [...base, `${item.description} AUV underwater`, `${item.description} subsea pressure rated`]
  if (productClass === 'edge_ai') return [...base, `${item.description} edge AI appliance`, `${item.description} rack server`]
  if (productClass === 'haps') return [...base, `${item.description} HAPS`, `${item.description} solar electric aircraft`]
  if (productClass === 'cgm') return [...base, `${item.description} continuous glucose monitor`, `${item.description} wearable medical device`]
  if (productClass === 'drone') return [...base, `${item.description} UAV`, `${item.description} lightweight drone`]
  return base
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
