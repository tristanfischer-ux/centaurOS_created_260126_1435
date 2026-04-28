/**
 * @file brainstorming-council-types.ts — type-only sibling for the
 * brainstorming-council server action.
 *
 * "use server" files (like brainstorming-council.ts) can ONLY export
 * async functions. Re-exporting types from there breaks the entire
 * module — Next's compiler treats it as having NO exports, which made
 * `import { conveneCouncil } from "@/actions/brainstorming-council"` fail
 * in BrainstormingCouncilView.tsx and broke every Vercel build for ~50min
 * on 2026-04-26 afternoon.
 *
 * Pattern: keep types here, keep async server actions in the .ts file.
 */

export interface SpecialistResponse {
    id: string
    name: string
    title: string
    modelLabel: string
    response: string
    /** W50: Round 2 update response — present when tier supports 2 rounds.
     *  Each specialist sees all R1 responses from peers + own R1, then
     *  provides a 2–3 paragraph update. Absent for tier='quick' (1 round). */
    round2Response?: string
}

export interface CouncilResult {
    ok: true
    fionaOpening: string
    specialistResponses: SpecialistResponse[]
    fionaClosing: string
    /** W50: true when the council ran two rounds (tier != 'quick'). */
    hadRound2: boolean
}

export interface CouncilError {
    ok: false
    error: string
}

export type ConveneCouncilResult = CouncilResult | CouncilError

export interface ConveneCouncilInput {
    question: string
    tier: string
    specialists: Array<{ id: string; name: string; title: string; tagline: string }>
}
