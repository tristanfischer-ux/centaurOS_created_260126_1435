#!/usr/bin/env npx tsx
/**
 * @file compile-project-knowledge.ts — CLI to extract and apply knowledge from CAD Lab projects.
 *
 * @description Runs the knowledge compiler against one or all projects, optionally in dry-run mode.
 *
 * Usage:
 *   npx tsx scripts/compile-project-knowledge.ts <project-id>
 *   npx tsx scripts/compile-project-knowledge.ts --all
 *   npx tsx scripts/compile-project-knowledge.ts --dry-run <project-id>
 *   npx tsx scripts/compile-project-knowledge.ts --dry-run --all
 */

import "dotenv/config"

import { createAdminClient } from "@/lib/supabase/admin"
import { compileProjectKnowledge, applyCompiledKnowledge } from "@/lib/agents/knowledge-compiler"
import type { CompiledKnowledge } from "@/lib/agents/knowledge-compiler"

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const allMode = args.includes("--all")
const projectId = args.find((a) => !a.startsWith("--"))

if (!allMode && !projectId) {
    console.error("Usage:")
    console.error("  npx tsx scripts/compile-project-knowledge.ts <project-id>")
    console.error("  npx tsx scripts/compile-project-knowledge.ts --all")
    console.error("  npx tsx scripts/compile-project-knowledge.ts --dry-run <project-id>")
    console.error("  npx tsx scripts/compile-project-knowledge.ts --dry-run --all")
    process.exit(1)
}

async function processProject(id: string): Promise<{ applied: number; skipped: number }> {
    console.log(`\n--- Compiling: ${id} ---`)

    const compiled: CompiledKnowledge = await compileProjectKnowledge(id)
    console.log(`  Found ${compiled.candidates.length} candidates`)

    if (compiled.candidates.length === 0) {
        return { applied: 0, skipped: 0 }
    }

    if (dryRun) {
        console.log("\n  [DRY RUN] Candidates:")
        for (const c of compiled.candidates) {
            console.log(`    ${c.knowledgeType} | ${c.key}`)
            console.log(`      value: ${c.value}`)
            console.log(`      confidence: ${c.confidence}, targets: ${c.targetSpecialists.join(", ")}`)
        }
        return { applied: 0, skipped: 0 }
    }

    const result = await applyCompiledKnowledge(compiled)
    console.log(`  Applied: ${result.applied}, Skipped: ${result.skipped}`)
    return result
}

async function main(): Promise<void> {
    if (dryRun) console.log("[DRY RUN MODE — no writes]")

    if (allMode) {
        const supabase = createAdminClient()
        const { data: projects, error } = await supabase
            .from("cad_lab_projects")
            .select("id")
            .order("created_at", { ascending: false })

        if (error) {
            console.error("Failed to fetch projects:", error.message)
            process.exit(1)
        }

        if (!projects || projects.length === 0) {
            console.log("No projects found.")
            return
        }

        console.log(`Processing ${projects.length} projects...`)

        let totalApplied = 0
        let totalSkipped = 0
        let failures = 0

        for (const p of projects) {
            try {
                const result = await processProject(p.id)
                totalApplied += result.applied
                totalSkipped += result.skipped
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err)
                console.error(`  ERROR on ${p.id}: ${message}`)
                failures++
            }
        }

        console.log(`\n=== TOTALS ===`)
        console.log(`  Projects: ${projects.length} (${failures} failed)`)
        console.log(`  Applied: ${totalApplied}, Skipped: ${totalSkipped}`)
    } else {
        try {
            await processProject(projectId!)
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            console.error(`ERROR: ${message}`)
            process.exit(1)
        }
    }
}

main()
