/**
 * @file part-name.ts — Helpers for rendering CadLabModule.keyParts as part names.
 *
 * @description keyParts strings often contain full engineering spec paragraphs
 * (material, dimensions, tolerances, standards). Long strings break the h1 +
 * breadcrumb of /the-forge-v2/**. `shortenPartName` picks the first clause
 * before an em-dash / en-dash / bracket / colon / semicolon, then caps at
 * ~60 chars. `partDescription` returns the remainder for a body / subtitle
 * slot. Keep both side-effect-free so server components can import them.
 */

const CLAUSE_SEP = /\s+[—–]\s+|[:(;]/

export function shortenPartName(full: string | null | undefined, max = 60): string {
    if (!full) return 'Part'
    const trimmed = full.trim()
    if (trimmed.length <= max) return trimmed
    const firstClause = trimmed.split(CLAUSE_SEP)[0]?.trim() ?? trimmed
    if (firstClause.length > 3 && firstClause.length <= max) return firstClause
    // If the first clause is also too long, fall back to a hard truncate
    return trimmed.slice(0, max).trim() + '…'
}

export function partDescription(full: string | null | undefined): string | null {
    if (!full) return null
    const trimmed = full.trim()
    const short = shortenPartName(trimmed)
    if (trimmed === short || trimmed.length <= short.length + 1) return null
    // Strip the shortened prefix + any leading separator for a clean body
    const remainder = trimmed.slice(short.length).replace(/^[\s—–:;()]+/, '').trim()
    return remainder.length > 0 ? remainder : null
}
