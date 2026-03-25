/**
 * @file stage-specialist-map.ts — Maps CAD Lab stages to their owning specialist.
 *
 * INTENT: Each CAD Lab stage has a dedicated specialist who briefs the user on
 * entry, guides them through, summarises on exit, and hands off to the next
 * specialist. This file is the single source of truth for that mapping.
 *
 * @related
 * - Route map: src/lib/route-specialist-map.ts (FAB routing)
 * - Specialists data: src/app/(platform)/agents/specialists-data.ts
 * - Stage pages: src/app/(platform)/the-forge/cad-lab/
 */

import type { SpecialistId } from "@/app/(platform)/agents/specialists-data"

export type CadLabStage = "design" | "specify" | "source" | "assemble"

export interface StageSpecialistMapping {
    stage: CadLabStage
    /** Display name for the stage */
    label: string
    specialistId: SpecialistId
    nextStage: CadLabStage | null
    prevStage: CadLabStage | null
}

/**
 * Stage ownership map. Order matches the CAD Lab workflow:
 * Design (Max) → Specify (Fang) → Source (Chase) → Assemble (Jian)
 */
export const STAGE_SPECIALISTS: Record<CadLabStage, StageSpecialistMapping> = {
    design: {
        stage: "design",
        label: "Design",
        specialistId: "cto",
        nextStage: "specify",
        prevStage: null,
    },
    specify: {
        stage: "specify",
        label: "Specify",
        specialistId: "vp-manufacturing",
        nextStage: "source",
        prevStage: "design",
    },
    source: {
        stage: "source",
        label: "Source",
        specialistId: "vp-supply-chain",
        nextStage: "assemble",
        prevStage: "specify",
    },
    assemble: {
        stage: "assemble",
        label: "Assemble",
        specialistId: "vp-engineering",
        nextStage: null,
        prevStage: "source",
    },
}

/**
 * Get the specialist for the next stage (for exit handoff cards).
 * Returns null if this is the last stage.
 */
export function getNextStageSpecialist(
    stage: CadLabStage,
): { specialistId: SpecialistId; stageLabel: string } | null {
    const next = STAGE_SPECIALISTS[stage].nextStage
    if (!next) return null
    return {
        specialistId: STAGE_SPECIALISTS[next].specialistId,
        stageLabel: STAGE_SPECIALISTS[next].label,
    }
}
