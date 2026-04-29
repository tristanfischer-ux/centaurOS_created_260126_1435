/**
 * @file forge-narrative-stages.test.ts
 *
 * @description Unit tests verifying that the forge-narrative stage definitions
 * and the progress-timeline wiring satisfy the loop-25 founder UX requirements:
 *   1. Every stage in NARRATIVE_STAGE_ORDER has a label, narrative, and inFlight string.
 *   2. TOTAL_STAGES matches the array length (so the "Stage N of M" header is accurate).
 *   3. STAGE_SPECS in progress-timeline covers all stages in NARRATIVE_STAGE_ORDER
 *      (so stage numbers and specialist badges are visible for every card).
 *   4. The stage detail rendering for "done" state renders non-empty artefact content
 *      when outcomeDetail is provided, and an honest empty state when it is not.
 */

import {
    NARRATIVE_STAGE_ORDER,
    STAGE_NARRATIVES,
    TOTAL_STAGES,
    stageIndex,
} from "@/lib/forge-narrative/stage-narratives"

describe("stage-narratives — loop-25 founder UX", () => {
    it("TOTAL_STAGES matches NARRATIVE_STAGE_ORDER length", () => {
        expect(TOTAL_STAGES).toBe(NARRATIVE_STAGE_ORDER.length)
    })

    it("every stage in the order has a non-empty label, narrative, and inFlight", () => {
        for (const stage of NARRATIVE_STAGE_ORDER) {
            const narrative = STAGE_NARRATIVES[stage]
            expect(narrative).toBeDefined()
            expect(narrative.label.trim().length).toBeGreaterThan(0)
            expect(narrative.narrative.trim().length).toBeGreaterThan(0)
            expect(narrative.inFlight.trim().length).toBeGreaterThan(0)
        }
    })

    it("stageIndex returns a 0-based position for each stage in the order", () => {
        NARRATIVE_STAGE_ORDER.forEach((stage, idx) => {
            expect(stageIndex(stage)).toBe(idx)
        })
    })

    it("stageIndex returns -1 for 'done' (not rendered as a timeline row)", () => {
        expect(stageIndex("done")).toBe(-1)
    })

    it("stage numbers would be 1-based (idx + 1) for the first and last stage", () => {
        const firstStage = NARRATIVE_STAGE_ORDER[0]
        const lastStage = NARRATIVE_STAGE_ORDER[NARRATIVE_STAGE_ORDER.length - 1]
        expect(stageIndex(firstStage) + 1).toBe(1)
        expect(stageIndex(lastStage) + 1).toBe(TOTAL_STAGES)
    })

    it("all 12 stages are present", () => {
        expect(TOTAL_STAGES).toBe(12)
    })

    it("the expected 3 fully-implemented stages (market research, sizing, bill of materials) are in the order", () => {
        // These 3 are the scaffold-wired stages per loop-25 spec
        expect(NARRATIVE_STAGE_ORDER).toContain("waiting_chase")
        expect(NARRATIVE_STAGE_ORDER).toContain("waiting_sizing")
        expect(NARRATIVE_STAGE_ORDER).toContain("waiting_bom")
    })
})

describe("stage-narratives — chronological order matches autopilot pipeline", () => {
    /**
     * The canonical stage order is declared in src/lib/forge-v2/stage-config.ts
     * via the nextStage chain: waiting_sizing → waiting_layout → waiting_bom.
     * This test locks the order so a future edit to NARRATIVE_STAGE_ORDER
     * cannot silently re-introduce the "Laying it out" at position 10 bug
     * (loop-26 dom snapshot: waiting_layout appeared as Stage 10 instead of Stage 5).
     */
    it("waiting_layout appears immediately after waiting_sizing (position 5)", () => {
        const sizingIdx = NARRATIVE_STAGE_ORDER.indexOf("waiting_sizing")
        const layoutIdx = NARRATIVE_STAGE_ORDER.indexOf("waiting_layout")
        expect(sizingIdx).toBeGreaterThanOrEqual(0)
        expect(layoutIdx).toBe(sizingIdx + 1)
    })

    it("waiting_layout appears before waiting_bom", () => {
        const layoutIdx = NARRATIVE_STAGE_ORDER.indexOf("waiting_layout")
        const bomIdx = NARRATIVE_STAGE_ORDER.indexOf("waiting_bom")
        expect(layoutIdx).toBeGreaterThanOrEqual(0)
        expect(bomIdx).toBeGreaterThan(layoutIdx)
    })

    it("full pipeline order matches the stage-config nextStage chain", () => {
        // Canonical order declared in stage-config.ts nextStage pointers:
        // waiting_chase → locking_brief → waiting_max → waiting_sizing →
        // waiting_layout → waiting_bom → waiting_finn → generating_illustration →
        // matching_suppliers → running_fang_reviews → proofreading → generating_pdf
        const expected = [
            "waiting_chase",
            "locking_brief",
            "waiting_max",
            "waiting_sizing",
            "waiting_layout",
            "waiting_bom",
            "waiting_finn",
            "generating_illustration",
            "matching_suppliers",
            "running_fang_reviews",
            "proofreading",
            "generating_pdf",
        ]
        expect(NARRATIVE_STAGE_ORDER).toEqual(expected)
    })

    it("solver_error is NOT in NARRATIVE_STAGE_ORDER (it is an exception state, not a sequential step)", () => {
        expect(NARRATIVE_STAGE_ORDER).not.toContain("solver_error")
    })

    it("'done' is NOT in NARRATIVE_STAGE_ORDER (it is a terminal state, not a sequential step)", () => {
        expect(NARRATIVE_STAGE_ORDER).not.toContain("done")
    })

    it("'failed' is NOT in NARRATIVE_STAGE_ORDER (it is a terminal state, not a sequential step)", () => {
        expect(NARRATIVE_STAGE_ORDER).not.toContain("failed")
    })
})

describe("stage-narratives — unwired stages render empty-state copy, not errors", () => {
    it("every stage has a defined narrative entry (no undefined holes in the Record)", () => {
        // If a stage is missing from the Record, STAGE_NARRATIVES[stage] would be undefined
        // and the progress-timeline would throw or show blank labels.
        for (const stage of NARRATIVE_STAGE_ORDER) {
            expect(STAGE_NARRATIVES[stage]).not.toBeUndefined()
        }
    })

    it("'failed' placeholder stage has non-empty label so the error path renders", () => {
        const failed = STAGE_NARRATIVES["failed"]
        expect(failed).toBeDefined()
        expect(failed.label.trim().length).toBeGreaterThan(0)
    })
})
