/**
 * The sectors Fractional Forge currently focuses on.
 * One list for the homepage, the brief form, /quote, and the engine lock.
 * Generic is a first-class fifth option — not a leftover.
 */

export type FocusSectorId = 'bess' | 'water' | 'motors' | 'assay' | 'generic'

/** Engine class-lock family the runner / one_engine should honour. */
export type FocusLockFamily = 'wall-store' | 'plant' | 'edu' | 'instrument' | 'generic'

export interface FocusSector {
  id: FocusSectorId
  /** Value stored on dossier_projects.sector */
  briefValue: string
  /** Short card title */
  title: string
  /** One line under the title */
  blurb: string
  lock: FocusLockFamily
  /** Extra nouns the class lock should recognise in a brief. */
  hints: string[]
}

export const FOCUS_SECTORS: FocusSector[] = [
  {
    id: 'bess',
    briefValue: 'Battery energy storage',
    title: 'Battery energy storage',
    blurb:
      'Wall-store and container packs: cells, cabinet, power conversion and thermal. The same door as Anvil Home Storage.',
    lock: 'wall-store',
    hints: ['bess', 'battery energy storage', 'wall store', 'home storage', 'lfp pack'],
  },
  {
    id: 'water',
    briefValue: 'Water treatment systems',
    title: 'Water treatment systems',
    blurb:
      'Process plant: tanks, pumps, membranes, dosing and distribution. Fertigation and irrigation sit here.',
    lock: 'plant',
    hints: ['water treatment', 'fertigation', 'irrigation plant', 'reverse osmosis'],
  },
  {
    id: 'motors',
    briefValue: 'Electric motor sets',
    title: 'Electric motor sets',
    blurb:
      'Drive units and motor–inverter sets: stator, rotor, cooling and power electronics. The same door as the Lucid Air drive unit.',
    lock: 'edu',
    hints: ['electric motor', 'motor set', 'drive unit', 'edu', 'stator', 'traction motor'],
  },
  {
    id: 'assay',
    briefValue: 'Medical assay machines',
    title: 'Medical assay machines',
    blurb:
      'Benchtop and sample-to-answer instruments: photometers, readers, fluidics and the board that runs them. An instrument, not a plant.',
    lock: 'instrument',
    hints: ['assay', 'photometer', 'elisa', 'diagnostic reader', 'sample-to-answer'],
  },
  {
    id: 'generic',
    briefValue: 'Other hardware',
    title: 'Other hardware',
    blurb:
      'Anything else still comes in as a short brief and goes out as a Design Dossier and a quotation. We do not pretend it is one of the four specialist lines.',
    lock: 'generic',
    hints: ['other hardware', 'generic'],
  },
]

export function sectorFromBriefValue(value: string | null | undefined): FocusSector | undefined {
  const v = (value || '').trim().toLowerCase()
  if (!v) return undefined
  return FOCUS_SECTORS.find(
    (s) => s.briefValue.toLowerCase() === v || s.id === v || s.title.toLowerCase() === v,
  )
}
