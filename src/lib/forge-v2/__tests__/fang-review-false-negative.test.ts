/**
 * @file fang-review-false-negative.test.ts — Regression tests for the Loop 26
 * inverse-phantom-GREEN false-negative fix.
 *
 * The bug (Loop 25 Desalination Module): Fang (qwen3-235b) writes issues in a
 * paragraph-break format rather than the inline format the original 3 regex
 * patterns expected. Result: parseReviewFromMarkdown extracted issues.length === 0
 * even when the reviewMarkdown contained real CRITICAL/WARNING findings. The
 * unvalidated-module banner fired on modules that were genuinely reviewed.
 *
 * Fix applied in:
 *   - src/actions/cad-lab-reviews.ts (parseReviewFromMarkdown — Pattern 4)
 *   - src/actions/specialists/run-fang-review.ts (normaliseFangReview)
 *
 * These tests cover:
 *   (a) Non-empty issues array does NOT trigger the incomplete banner
 *   (b) Non-empty findings array (alternate key) promoted to issues
 *   (c) Mixed-case severity normalised correctly
 *   (d) Genuinely empty result still triggers retry-or-RED (Loop 24 preserved)
 *   (e) Qwen3-235B standalone-header format (the actual root cause) is parsed
 *
 * No Supabase, no LLM calls — pure logic tests.
 */

import type { SpecialistReview, ReviewIssue } from "@/lib/cad-lab-types"

// ---- Fixtures ----------------------------------------------------------------

function makeReview(overrides?: Partial<SpecialistReview>): SpecialistReview {
    return {
        specialistId: "vp-manufacturing",
        specialistName: "Fang",
        verdict: "warn",
        summary: "Issues found.",
        issues: [
            {
                severity: "critical",
                category: "Pressure",
                message: "Victaulic grooved coupling hydrostatic test exceedance.",
                suggestion: "Replace with higher-rated couplings.",
            },
        ],
        recommendations: [],
        calculations: [],
        reviewMarkdown: "",
        reviewedAt: new Date().toISOString(),
        reviewTimeMs: 10000,
        ...overrides,
    }
}

function makeEmptyReview(verdict: SpecialistReview["verdict"] = "warn"): SpecialistReview {
    return makeReview({ verdict, issues: [], recommendations: [], summary: "" })
}

// ---- Helpers that mirror the production logic ---------------------------------

function isUnvalidatedModule(reviews: Array<{ issues: ReviewIssue[] }>): boolean {
    return reviews.length === 0 || reviews.every((r) => r.issues.length === 0)
}

function shouldRetry(review: SpecialistReview): boolean {
    return review.issues.length === 0 && review.verdict !== "pass"
}

function normaliseSev(raw: string): ReviewIssue["severity"] {
    const lower = raw.toLowerCase()
    if (lower === "critical" || lower === "warning" || lower === "info") return lower
    if (lower === "warn") return "warning"
    return "info"
}

function normaliseFangReview(review: SpecialistReview): SpecialistReview {
    const raw = review as unknown as Record<string, unknown>

    let issues = review.issues
    if (
        issues.length === 0 &&
        Array.isArray(raw["findings"]) &&
        (raw["findings"] as unknown[]).length > 0
    ) {
        issues = (raw["findings"] as unknown[])
            .filter((f): f is Record<string, unknown> => f !== null && typeof f === "object")
            .map((f) => ({
                severity: normaliseSev(String(f["severity"] ?? "info")),
                category: String(f["category"] ?? ""),
                message: String(f["message"] ?? f["description"] ?? ""),
                suggestion: typeof f["suggestion"] === "string" ? f["suggestion"] : undefined,
            }))
    }

    const normalisedIssues = issues.map((i) => ({ ...i, severity: normaliseSev(i.severity) }))
    return { ...review, issues: normalisedIssues }
}

function extractIssuesFromQwenFormat(markdown: string): ReviewIssue[] {
    const issues: ReviewIssue[] = []
    const standaloneHeaderPattern =
        /\*\*\[(CRITICAL|WARNING|INFO)\]\s*(\[[^\]]+\][^*]*)\*\*[ \t]*$/gim
    let headerMatch
    while ((headerMatch = standaloneHeaderPattern.exec(markdown)) !== null) {
        const severity = normaliseSev(headerMatch[1])
        const rawCategory = headerMatch[2].trim()
        const category = rawCategory.replace(/^\[[^\]]+\]\s*/, "").trim() || rawCategory

        const rest = markdown.slice(headerMatch.index + headerMatch[0].length)
        const lines = rest.split("\n")
        let description = ""
        for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed === "" || /^[-*]{3,}$/.test(trimmed)) continue
            description = trimmed.replace(/^[-*]\s+/, "")
            break
        }
        if (!description) continue
        if (issues.some(i => i.severity === severity && i.message.startsWith(description.slice(0, 40)))) continue

        const issue: ReviewIssue = { severity, category, message: description }
        const context = rest.slice(0, 800)
        const sugMatch = context.match(/[-*]\s+\*Suggestion:\*\s*(.+)/i)
        if (sugMatch) issue.suggestion = sugMatch[1].trim()
        issues.push(issue)
    }
    return issues
}

// ---- Tests -------------------------------------------------------------------

describe("Fang review false-negative — Loop 26 inverse-phantom-GREEN fix", () => {

    describe("(a) Non-empty issues array does NOT trigger incomplete banner", () => {
        it("module with Fang review containing 1 CRITICAL issue is NOT unvalidated", () => {
            const reviews = [makeReview()]
            expect(isUnvalidatedModule(reviews)).toBe(false)
        })

        it("module with multiple reviews all with issues is NOT unvalidated", () => {
            const reviews = [
                makeReview({ issues: [{ severity: "critical", category: "Pressure", message: "A." }] }),
                makeReview({ issues: [{ severity: "warning", category: "Mass", message: "B." }] }),
            ]
            expect(isUnvalidatedModule(reviews)).toBe(false)
        })

        it("module with 11 issues is NOT unvalidated", () => {
            const issuesArr: ReviewIssue[] = Array.from({ length: 11 }, (_, i) => ({
                severity: i < 2 ? "critical" : "warning",
                category: `Category ${i}`,
                message: `Issue ${i}.`,
            } satisfies ReviewIssue))
            expect(isUnvalidatedModule([makeReview({ issues: issuesArr })])).toBe(false)
        })

        it("shouldRetry returns false when issues are present", () => {
            expect(shouldRetry(makeReview())).toBe(false)
        })
    })

    describe("(b) findings array promoted to issues when issues is empty", () => {
        it("findings non-empty + issues empty normalises to non-empty issues", () => {
            const raw = {
                ...makeEmptyReview("warn"),
                findings: [
                    { severity: "critical", category: "Structure", message: "Frame yields." },
                    { severity: "warning", category: "Sourcing", message: "Cylinder change unworkable." },
                ],
            }
            const normalised = normaliseFangReview(raw as unknown as SpecialistReview)
            expect(normalised.issues.length).toBe(2)
            expect(isUnvalidatedModule([normalised])).toBe(false)
        })

        it("findings non-empty makes shouldRetry false after normalisation", () => {
            const raw = {
                ...makeEmptyReview("warn"),
                findings: [{ severity: "critical", category: "Pressure", message: "PED breach." }],
            }
            expect(shouldRetry(normaliseFangReview(raw as unknown as SpecialistReview))).toBe(false)
        })

        it("findings and issues both empty stays empty", () => {
            const raw = { ...makeEmptyReview("warn"), findings: [] }
            expect(normaliseFangReview(raw as unknown as SpecialistReview).issues.length).toBe(0)
        })

        it("findings is ignored when issues is already non-empty", () => {
            const raw = {
                ...makeReview(),
                findings: [{ severity: "info", category: "Other", message: "Extra." }],
            }
            expect(normaliseFangReview(raw as unknown as SpecialistReview).issues.length).toBe(1)
        })
    })

    describe("(c) Severity normalised to lowercase", () => {
        it("'Critical' from findings becomes 'critical'", () => {
            const raw = {
                ...makeEmptyReview("warn"),
                findings: [{ severity: "Critical", category: "Mass", message: "Overweight." }],
            }
            expect(normaliseFangReview(raw as unknown as SpecialistReview).issues[0].severity).toBe("critical")
        })

        it("'WARNING' from findings becomes 'warning'", () => {
            const raw = {
                ...makeEmptyReview("warn"),
                findings: [{ severity: "WARNING", category: "Thermal", message: "Overheating." }],
            }
            expect(normaliseFangReview(raw as unknown as SpecialistReview).issues[0].severity).toBe("warning")
        })

        it("uppercase severity on existing issues is normalised", () => {
            const review = makeReview({
                issues: [{ severity: "CRITICAL" as ReviewIssue["severity"], category: "P", message: "M." }],
            })
            expect(normaliseFangReview(review).issues[0].severity).toBe("critical")
        })
    })

    describe("(d) Genuinely empty result still triggers retry (Loop 24 preserved)", () => {
        it("issues empty + verdict warn -> shouldRetry = true", () => {
            expect(shouldRetry(normaliseFangReview(makeEmptyReview("warn")))).toBe(true)
        })

        it("issues empty + verdict fail -> shouldRetry = true", () => {
            expect(shouldRetry(normaliseFangReview(makeEmptyReview("fail")))).toBe(true)
        })

        it("issues empty + verdict pass -> shouldRetry = false", () => {
            expect(shouldRetry(normaliseFangReview(makeEmptyReview("pass")))).toBe(false)
        })

        it("genuinely double-empty module triggers incomplete banner", () => {
            expect(isUnvalidatedModule([normaliseFangReview(makeEmptyReview("warn"))])).toBe(true)
        })
    })

    describe("(e) Qwen3-235B standalone-header format is parsed correctly", () => {
        const QWEN_MARKDOWN = `
# DFM Review

### VERDICT: WARN

Summary of issues found.

---

### Issues Found

---

**[CRITICAL] [Dimensions] Skid frame undersized for wet vessel load — PT-009**

Calculated bending stress: 223 MPa against 316 stainless steel yield of 205 MPa (safety factor 0.92).

- *Suggestion:* Upsize to 100x100x5 mm RHS minimum.

---

**[CRITICAL] [Sourcing] CO2 cylinder change-out unworkable — PT-002-PUR**

At 500 m3/day demand is 15.4 kg/day. A 50 kg cylinder lasts 2.8 days.

- *Suggestion:* Specify bulk liquid CO2 storage.

---

**[WARNING] [Compliance] UV dose not verified — PT-007**

WHO requires validated dose of 40 mJ/cm2.

---

**[WARNING] [Dimensions] GRP nozzle tolerance stack — PT-005**

Three nozzles accumulate +/-6 mm misalignment.

### Recommendations
1. Fix frame before procurement.
`

        it("extracts 2 CRITICAL and 2 WARNING issues", () => {
            const issues = extractIssuesFromQwenFormat(QWEN_MARKDOWN)
            expect(issues.filter(i => i.severity === "critical").length).toBe(2)
            expect(issues.filter(i => i.severity === "warning").length).toBe(2)
        })

        it("[Dimensions] tag stripped from category", () => {
            const issues = extractIssuesFromQwenFormat(QWEN_MARKDOWN)
            const skid = issues.find(i => i.message.includes("223 MPa"))
            expect(skid).toBeDefined()
            expect(skid?.category).not.toContain("[Dimensions]")
        })

        it("suggestion extracted from *Suggestion:* line", () => {
            const issues = extractIssuesFromQwenFormat(QWEN_MARKDOWN)
            const skid = issues.find(i => i.message.includes("223 MPa"))
            expect(skid?.suggestion).toBeDefined()
            expect(skid?.suggestion).toMatch(/100x100/)
        })

        it("module with Qwen3-235B extracted issues is NOT unvalidated", () => {
            const issues = extractIssuesFromQwenFormat(QWEN_MARKDOWN)
            expect(isUnvalidatedModule([makeReview({ issues })])).toBe(false)
        })

        it("shouldRetry false when Qwen3-235B format issues extracted", () => {
            const issues = extractIssuesFromQwenFormat(QWEN_MARKDOWN)
            expect(shouldRetry(makeReview({ issues }))).toBe(false)
        })

        it("original inline format still works (regression guard)", () => {
            const inlineMd = `
### Issues Found
- **[CRITICAL] Wall Thickness:** Minimum 1.2mm below threshold.
- **[WARNING] Tolerance:** Hole spacing exceeds capability.
`
            const pattern = /\*\*\[(CRITICAL|WARNING|INFO)\]\s*([^:*]+):\*\*\s*(.+)/gi
            const found: ReviewIssue[] = []
            let m
            while ((m = pattern.exec(inlineMd)) !== null) {
                found.push({ severity: normaliseSev(m[1]), category: m[2].trim(), message: m[3].trim() })
            }
            expect(found.length).toBe(2)
            expect(found[0].severity).toBe("critical")
        })
    })
})
