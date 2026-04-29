/**
 * Explicit null/missing-data semantics for the ForgeOS pipeline.
 *
 * Council finding X4 (GPT-5.5 + DeepSeek + Grok-3, critical): absent
 * values are treated as zero/empty/not-applicable/success throughout
 * the pipeline. This silently produces polished but wrong reports.
 *
 * This module provides utilities for making missing data VISIBLE
 * rather than silently defaulting to zero or empty string.
 */

export type Nullable<T> = T | null

export function hasValue<T>(value: T | null | undefined): value is T {
    return value !== null && value !== undefined
}

export class MissingDataError extends Error {
    constructor(
        public readonly fieldName: string,
        public readonly stage: string,
    ) {
        super(
            `Missing required data: "${fieldName}" is null/undefined at stage "${stage}".`,
        )
        this.name = "MissingDataError"
    }
}

export function assertNotNullish<T>(
    value: T | null | undefined,
    fieldName: string,
    stage: string,
): T {
    if (value === null || value === undefined) {
        throw new MissingDataError(fieldName, stage)
    }
    return value
}

export function nullToExplicit(
    value: unknown,
    displayText = "Data not available",
): string {
    if (value === null || value === undefined || value === "") {
        return displayText
    }
    return String(value)
}

export interface DataPresenceResult {
    present: boolean
    missing: string[]
}

export function isDataPresent(
    obj: Record<string, unknown>,
    requiredFields: string[],
): DataPresenceResult {
    const missing: string[] = []
    for (const field of requiredFields) {
        const val = obj[field]
        if (val === null || val === undefined) {
            missing.push(field)
        }
    }
    return { present: missing.length === 0, missing }
}

/**
 * Severity level for a missing-data finding in the feasibility verdict.
 * DATA_MISSING is treated as WARNING — the axis cannot be evaluated,
 * which is different from both "pass" and "fail".
 */
export type DataMissingSeverity = "DATA_MISSING"
