/**
 * @file fai-state.ts — First Article Inspection checklist state + defaults.
 *
 * @description Defines the per-module FAI checklist. Five standard line items
 * per module: dimensional check, material cert, functional test, visual
 * inspection, traceability record retained.
 *
 * FAI is the single most important quality gate between "supplier said they'd
 * make it" and "supplier is making it right". Doing it in ForgeOS means the
 * founder has a structured record they can show investors + auditors.
 *
 * @related
 * - Consumer: src/components/cad/fai-checklist.tsx
 * - Launch readiness scorer: src/lib/cad-lab/launch-readiness.ts
 */

export type FAILineStatus = "pending" | "pass" | "fail"

export interface FAIEntry {
  dimensional_check: FAILineStatus
  material_cert: FAILineStatus
  functional_test: FAILineStatus
  visual_inspection: FAILineStatus
  traceability_record: FAILineStatus
  /** Inspector name or initials */
  inspector?: string
  /** Date inspected (ISO) */
  inspectedAt?: string
  /** Supplier-provided FAI PDF / link */
  faiDocumentUrl?: string
  /** Free-text findings */
  notes?: string
}

export type FAIChecklistState = Record<string /* moduleId */, FAIEntry>

export function emptyFAIEntry(): FAIEntry {
  return {
    dimensional_check: "pending",
    material_cert: "pending",
    functional_test: "pending",
    visual_inspection: "pending",
    traceability_record: "pending",
  }
}

export const FAI_LINE_LABELS: Record<keyof Pick<FAIEntry, "dimensional_check" | "material_cert" | "functional_test" | "visual_inspection" | "traceability_record">, { label: string; helper: string }> = {
  dimensional_check: {
    label: "Dimensional check",
    helper: "All specified dimensions measured and within tolerance on first article.",
  },
  material_cert: {
    label: "Material certificate",
    helper: "Supplier has provided a mill certificate or equivalent traceable to the raw material batch.",
  },
  functional_test: {
    label: "Functional test",
    helper: "Part demonstrably performs the function it was specified for.",
  },
  visual_inspection: {
    label: "Visual inspection",
    helper: "Surface finish, markings, colour, and edge treatment match the specification.",
  },
  traceability_record: {
    label: "Traceability record retained",
    helper: "Lot number, date code, and inspector signature captured for audit.",
  },
}
