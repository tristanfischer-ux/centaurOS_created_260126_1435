/**
 * @file parallel-llm.ts — RETIREMENT STUB (2026-05-19).
 *
 * @description Original 400-line implementation archived to
 * _archive/2026-05-19-pre-chain-unification/lib/forge-v2/parallel-llm.ts
 * during chain unification. The canonical engine
 * (scripts/serial-design-chain-v2.tsx) runs its own multi-model consensus
 * via the chain's R1/R2/R3/R4 review passes, so this module is no longer
 * called from any live code path.
 *
 * Three things still dynamically import this module (all in
 * src/actions/cad-lab.ts + src/actions/bom.ts + src/actions/cad-lab-cost.ts),
 * which are consumed by the legacy /the-forge/cad-lab workbench. To keep
 * the build green without re-introducing the archived implementation, this
 * stub exports throwing versions of every name the legacy callers expected.
 *
 * If the legacy workbench is exercised at runtime, each call surfaces a
 * clear error explaining the retirement.
 */

function retired(name: string): never {
    throw new Error(
        `${name} was retired 2026-05-19 (chain unification). ` +
            `The canonical pipeline is scripts/serial-design-chain-v2.tsx. ` +
            `If you need this back, port the relevant logic into the chain.`,
    )
}

export async function runParallelAndCompare(..._args: unknown[]): Promise<never> {
    retired("runParallelAndCompare")
}

export async function callParallelAndCompare(..._args: unknown[]): Promise<never> {
    retired("callParallelAndCompare")
}

export async function runChaseMultiLineage(..._args: unknown[]): Promise<never> {
    retired("runChaseMultiLineage")
}

export async function loadGroundingData(..._args: unknown[]): Promise<null> {
    return null
}

export async function runTrainingDataDump(..._args: unknown[]): Promise<null> {
    return null
}

export function extractStageContext(..._args: unknown[]): unknown {
    return null
}
