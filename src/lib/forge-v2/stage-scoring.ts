/**
 * @file stage-scoring.ts — RETIREMENT STUB (2026-05-19).
 *
 * @description Original 800-line implementation archived to
 * _archive/2026-05-19-pre-chain-unification/lib/forge-v2/stage-scoring.ts
 * during chain unification. The canonical engine
 * (scripts/serial-design-chain-v2.tsx) runs its own quality gates (G0/K10/
 * physics-critic/R1-R4 review) inline, so external stage scoring is no
 * longer used.
 *
 * `getCouncilFeedbackForStage` is still dynamically imported by
 * src/actions/bom.ts (legacy /the-forge/cad-lab/parts-bom workbench).
 * Returns null so the legacy path keeps generating BOMs without council
 * feedback rather than throwing.
 */

export async function getCouncilFeedbackForStage(
    _projectId: string,
    _stage: string,
): Promise<string | null> {
    return null
}
