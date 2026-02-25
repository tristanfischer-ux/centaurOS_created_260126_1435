/**
 * @file specialist-state.test.ts — Tests for specialist metadata parsing and prompt compilation.
 *
 * @description Tests the pure functions from specialist-state.ts:
 *   - parseSpecialistMetadata: Zod-based safe parser for JSONB thread metadata
 *   - compileSpecialistStatePrompt: emotional state + relationship → prompt block
 *
 * These tests validate that:
 *   1. Corrupt/missing metadata produces sensible defaults (no crashes)
 *   2. Valid metadata is parsed correctly
 *   3. Prompt compilation produces expected output for all relationship levels and moods
 *
 * @audit Created 2026-02-19 as part of specialist system maintainability refactor (Step 4 of 8).
 */

import {
    parseSpecialistMetadata,
    compileSpecialistStatePrompt,
} from "../specialist-state"
import type {
    SpecialistEmotionalState,
    RelationshipDepth,
} from "../specialist-state"

// ─── parseSpecialistMetadata ─────────────────────────────────────────

describe("parseSpecialistMetadata", () => {
    it("returns defaults for null input", () => {
        const result = parseSpecialistMetadata(null)
        expect(result.specialist_mood).toBe("neutral")
        expect(result.mood_trigger).toBe("")
        expect(result.shared_history).toEqual([])
        expect(result.decisions_made).toEqual([])
        expect(result.last_conversation_summary).toBeNull()
    })

    it("returns defaults for undefined input", () => {
        const result = parseSpecialistMetadata(undefined)
        expect(result.specialist_mood).toBe("neutral")
    })

    it("returns defaults for empty object", () => {
        const result = parseSpecialistMetadata({})
        expect(result.specialist_mood).toBe("neutral")
        expect(result.mood_trigger).toBe("")
        expect(result.shared_history).toEqual([])
    })

    it("returns defaults for non-object input", () => {
        expect(parseSpecialistMetadata("string")).toHaveProperty("specialist_mood", "neutral")
        expect(parseSpecialistMetadata(42)).toHaveProperty("specialist_mood", "neutral")
        expect(parseSpecialistMetadata(true)).toHaveProperty("specialist_mood", "neutral")
    })

    it("parses valid metadata correctly", () => {
        const raw = {
            specialist_mood: "energized",
            mood_trigger: "great quarterly results",
            mood_updated_at: "2026-02-19T10:00:00Z",
            shared_history: ["Discussed growth plan", "Reviewed Q3 metrics"],
            decisions_made: ["Hired CMO"],
            last_conversation_summary: "Talked about team scaling",
        }
        const result = parseSpecialistMetadata(raw)
        expect(result.specialist_mood).toBe("energized")
        expect(result.mood_trigger).toBe("great quarterly results")
        expect(result.shared_history).toHaveLength(2)
        expect(result.decisions_made).toEqual(["Hired CMO"])
        expect(result.last_conversation_summary).toBe("Talked about team scaling")
    })

    it("falls back to defaults for invalid mood values", () => {
        const result = parseSpecialistMetadata({ specialist_mood: "angry" })
        expect(result.specialist_mood).toBe("neutral")
    })

    it("falls back to defaults for wrong types", () => {
        const result = parseSpecialistMetadata({
            specialist_mood: 42,
            mood_trigger: null,
            shared_history: "not-an-array",
            decisions_made: { bad: true },
        })
        expect(result.specialist_mood).toBe("neutral")
        expect(result.mood_trigger).toBe("")
        expect(result.shared_history).toEqual([])
        expect(result.decisions_made).toEqual([])
    })

    it("preserves extra fields without error", () => {
        const result = parseSpecialistMetadata({
            specialist_mood: "proud",
            extra_field: "should not crash",
        })
        expect(result.specialist_mood).toBe("proud")
    })
})

// ─── compileSpecialistStatePrompt ────────────────────────────────────

describe("compileSpecialistStatePrompt", () => {
    const DEFAULT_EMOTIONAL: SpecialistEmotionalState = {
        mood: "neutral",
        intensity: "medium",
        trigger: "",
        updatedAt: "2026-02-19T10:00:00Z",
    }

    const DEFAULT_RELATIONSHIP: RelationshipDepth = {
        level: "new",
        conversationCount: 1,
        sharedHistory: [],
        decisionsMade: [],
        lastConversationSummary: null,
    }

    it("includes the relationship header", () => {
        const prompt = compileSpecialistStatePrompt(DEFAULT_EMOTIONAL, DEFAULT_RELATIONSHIP, "Sage")
        expect(prompt).toContain("## Your Relationship With This Founder")
    })

    it("generates correct guidance for new relationships", () => {
        const prompt = compileSpecialistStatePrompt(DEFAULT_EMOTIONAL, {
            ...DEFAULT_RELATIONSHIP,
            level: "new",
            conversationCount: 1,
        }, "Sage")
        expect(prompt).toContain("new relationship")
        expect(prompt).toContain("Build trust")
    })

    it("generates correct guidance for deep relationships", () => {
        const prompt = compileSpecialistStatePrompt(DEFAULT_EMOTIONAL, {
            ...DEFAULT_RELATIONSHIP,
            level: "deep",
            conversationCount: 25,
        }, "Sage")
        expect(prompt).toContain("deep relationship")
        expect(prompt).toContain("fully candid")
    })

    it("includes shared history when present", () => {
        const prompt = compileSpecialistStatePrompt(DEFAULT_EMOTIONAL, {
            ...DEFAULT_RELATIONSHIP,
            sharedHistory: ["Discussed pricing strategy", "Reviewed team growth"],
        }, "Sage")
        expect(prompt).toContain("Discussed pricing strategy")
        expect(prompt).toContain("Reviewed team growth")
    })

    it("includes decisions when present", () => {
        const prompt = compileSpecialistStatePrompt(DEFAULT_EMOTIONAL, {
            ...DEFAULT_RELATIONSHIP,
            decisionsMade: ["Hired CMO", "Pivoted to B2B"],
        }, "Sage")
        expect(prompt).toContain("Hired CMO")
        expect(prompt).toContain("Pivoted to B2B")
    })

    it("includes last conversation summary when present", () => {
        const prompt = compileSpecialistStatePrompt(DEFAULT_EMOTIONAL, {
            ...DEFAULT_RELATIONSHIP,
            lastConversationSummary: "Talked about Q3 goals",
        }, "Sage")
        expect(prompt).toContain("Talked about Q3 goals")
        expect(prompt).toContain("Last time you spoke")
    })

    it("includes mood guidance for non-neutral moods", () => {
        const prompt = compileSpecialistStatePrompt({
            mood: "energized",
            intensity: "medium",
            trigger: "great results",
            updatedAt: "2026-02-19T10:00:00Z",
        }, DEFAULT_RELATIONSHIP, "Sage")
        expect(prompt).toContain("energized")
    })

    it("excludes mood section for neutral mood", () => {
        const prompt = compileSpecialistStatePrompt(DEFAULT_EMOTIONAL, DEFAULT_RELATIONSHIP, "Sage")
        expect(prompt).not.toContain("energized")
        expect(prompt).not.toContain("concerned")
        expect(prompt).not.toContain("proud")
    })

    it("includes the concerned trigger in mood guidance", () => {
        const prompt = compileSpecialistStatePrompt({
            mood: "concerned",
            intensity: "medium",
            trigger: "declining revenue",
            updatedAt: "2026-02-19T10:00:00Z",
        }, DEFAULT_RELATIONSHIP, "Sage")
        expect(prompt).toContain("declining revenue")
    })

    it("limits shared history to the last 5 items", () => {
        const history = Array.from({ length: 10 }, (_, i) => `Event ${i}`)
        const prompt = compileSpecialistStatePrompt(DEFAULT_EMOTIONAL, {
            ...DEFAULT_RELATIONSHIP,
            sharedHistory: history,
        }, "Sage")
        expect(prompt).not.toContain("Event 0")
        expect(prompt).toContain("Event 9")
    })
})
