/**
 * Pitch prep section keys + derived types.
 * Runtime constants separated from the 'use server' action file because
 * Next.js 16 rejects non-async exports from "use server" modules.
 */

export const PITCH_SECTION_KEYS = [
  'company',
  'market',
  'problem',
  'traction',
  'team',
  'ask',
  'financial_model',
  'cap_table',
] as const

export type PitchSectionKey = (typeof PITCH_SECTION_KEYS)[number]

export type PitchSectionStatus = 'not_started' | 'in_progress' | 'done'
