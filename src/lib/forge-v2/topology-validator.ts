/**
 * Structural validator for module decomposition graphs.
 *
 * Complements topology-detection.ts (which detects topology-CHANGE
 * recommendations in sizing text). This module validates the topology
 * ITSELF — no duplicate IDs, exactly one root, no orphans, no cycles,
 * no dangling connection references.
 *
 * Council finding M1 (GPT-5.5 + DeepSeek V4-Pro, critical): module
 * topology can be structurally valid JSON but semantically invalid,
 * causing downstream rollups to silently omit or double-count modules.
 */

export type TopologyErrorType =
    | "duplicate-id"
    | "no-root"
    | "multiple-roots"
    | "orphan"
    | "cycle"
    | "dangling-ref"

export interface TopologyError {
    type: TopologyErrorType
    details: string
}

export interface TopologyValidationResult {
    valid: boolean
    errors: TopologyError[]
}

export interface TopologyModule {
    id: string
    parentId?: string | null
    connections?: string[]
}

export function validateTopology(
    modules: TopologyModule[],
): TopologyValidationResult {
    const errors: TopologyError[] = []

    if (modules.length === 0) {
        errors.push({ type: "no-root", details: "Module list is empty." })
        return { valid: false, errors }
    }

    // 1. Duplicate ID check
    const idSet = new Set<string>()
    for (const m of modules) {
        if (idSet.has(m.id)) {
            errors.push({
                type: "duplicate-id",
                details: `Duplicate module ID: "${m.id}".`,
            })
        }
        idSet.add(m.id)
    }

    // 2. Root detection (parentId is null/undefined)
    const roots = modules.filter(
        (m) => m.parentId === null || m.parentId === undefined,
    )
    if (roots.length === 0) {
        errors.push({
            type: "no-root",
            details:
                "No root module found — every module has a parentId. At least one must have parentId=null.",
        })
    } else if (roots.length > 1) {
        const rootIds = roots.map((r) => r.id).join(", ")
        errors.push({
            type: "multiple-roots",
            details: `${roots.length} root modules found (parentId=null): ${rootIds}. Expected exactly one.`,
        })
    }

    // 3. Orphan check — every non-root module's parentId must exist in the set
    for (const m of modules) {
        if (m.parentId !== null && m.parentId !== undefined) {
            if (!idSet.has(m.parentId)) {
                errors.push({
                    type: "orphan",
                    details: `Module "${m.id}" references parentId="${m.parentId}" which does not exist.`,
                })
            }
        }
    }

    // 4. Cycle detection via DFS
    const parentMap = new Map<string, string>()
    for (const m of modules) {
        if (m.parentId !== null && m.parentId !== undefined) {
            parentMap.set(m.id, m.parentId)
        }
    }

    const visited = new Set<string>()
    for (const m of modules) {
        if (visited.has(m.id)) continue
        const path = new Set<string>()
        let current: string | undefined = m.id
        while (current && !visited.has(current)) {
            if (path.has(current)) {
                errors.push({
                    type: "cycle",
                    details: `Cycle detected involving module "${current}".`,
                })
                break
            }
            path.add(current)
            current = parentMap.get(current)
        }
        for (const id of path) {
            visited.add(id)
        }
    }

    // 5. Dangling connection references
    for (const m of modules) {
        if (Array.isArray(m.connections)) {
            for (const ref of m.connections) {
                if (!idSet.has(ref)) {
                    errors.push({
                        type: "dangling-ref",
                        details: `Module "${m.id}" has connection to "${ref}" which does not exist.`,
                    })
                }
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors,
    }
}
