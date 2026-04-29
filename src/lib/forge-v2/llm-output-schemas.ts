import { z } from "zod"

// ── Truncation markers that indicate an LLM hit its token limit ──
const TRUNCATION_MARKERS = [
    "[response truncated]",
    "[continued]",
    "[output truncated]",
    "... (truncated)",
    "[truncated due to length]",
]

// ── Schemas for each LLM-driven pipeline stage ──

export const DecompositionModuleSchema = z
    .object({
        id: z.string().min(1),
        name: z.string().min(1),
        description: z.string().min(1),
    })
    .passthrough()

export const DecompositionOutputSchema = z.array(DecompositionModuleSchema).min(1)

export const FangIssueSchema = z
    .object({
        severity: z.string().min(1),
        module_id: z.string().optional(),
        description: z.string().min(1),
    })
    .passthrough()

export const FangReviewOutputSchema = z
    .object({
        issues: z.array(FangIssueSchema),
        verdict: z.string().optional(),
    })
    .passthrough()

export const BomPartSchema = z
    .object({
        module_id: z.string().min(1),
        name: z.string().min(1),
        quantity: z.number().positive(),
        unit_cost: z.number().nonnegative().optional(),
    })
    .passthrough()

export const BomOutputSchema = z.array(BomPartSchema).min(1)

export const ChaseResearchOutputSchema = z
    .object({
        regulatory_items: z.array(z.object({}).passthrough()),
        research_findings: z.array(z.object({}).passthrough()),
    })
    .passthrough()

const STAGE_SCHEMAS: Record<string, z.ZodType> = {
    decomposition: DecompositionOutputSchema,
    fang_review: FangReviewOutputSchema,
    bom: BomOutputSchema,
    chase_research: ChaseResearchOutputSchema,
}

function checkForTruncation(data: unknown): string[] {
    const warnings: string[] = []
    const json = JSON.stringify(data)
    for (const marker of TRUNCATION_MARKERS) {
        if (json.includes(marker)) {
            warnings.push(`Truncation marker detected: "${marker}"`)
        }
    }
    return warnings
}

export interface LlmValidationResult {
    valid: boolean
    errors: string[]
}

export function validateLlmOutput(
    stageName: string,
    data: unknown,
): LlmValidationResult {
    const errors: string[] = []

    // Check for truncation markers in any string fields
    const truncationWarnings = checkForTruncation(data)
    errors.push(...truncationWarnings)

    // Find matching schema
    const schema = STAGE_SCHEMAS[stageName]
    if (!schema) {
        return { valid: errors.length === 0, errors }
    }

    const result = schema.safeParse(data)
    if (!result.success) {
        for (const issue of result.error.issues) {
            const path = issue.path.length > 0 ? ` at ${issue.path.join(".")}` : ""
            errors.push(`${issue.message}${path}`)
        }
    }

    return {
        valid: errors.length === 0,
        errors,
    }
}
