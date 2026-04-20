/**
 * Browse-investor subcategories — filter chips surfaced on the
 * /money/raise/browse page. Runtime constant separated from the
 * 'use server' action file because Next.js 16 rejects non-async exports
 * from "use server" modules (per MEMORY.md gotcha).
 */

export const BROWSE_SUBCATEGORIES = [
  'VC Fund',
  'PE Firm',
  'Accelerator',
  'Family Office',
  'Corporate Venture',
  'Advisory Services',
  'Other',
] as const

export type BrowseSubcategory = (typeof BROWSE_SUBCATEGORIES)[number]
