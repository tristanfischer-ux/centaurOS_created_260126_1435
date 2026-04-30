/**
 * Seeds Stage 0 reference dossiers from local markdown files into
 * the cad_lab_projects.reference_dossier column in Supabase.
 *
 * Usage: npx tsx scripts/seed-reference-dossiers.ts
 *
 * Reads dossier files from ~/Downloads/forge-demos/stage-0-reference/
 * and matches them to demo projects by name.
 */

import { createClient } from "@supabase/supabase-js"
import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { homedir } from "os"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error(
        "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment",
    )
    process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const DOSSIER_DIR = join(
    homedir(),
    "Downloads",
    "forge-demos",
    "stage-0-reference",
)

const DEMO_PROJECTS = [
    { namePattern: "hedgerow", file: "hedgerow-reference-dossier-v2.md" },
    { namePattern: "haps", file: "haps-reference-dossier-v2.md" },
    { namePattern: "desalination", file: "desalination-reference-dossier-v2.md" },
    { namePattern: "bess", file: "bess-reference-dossier-v2.md" },
    { namePattern: "vertical farm", file: "vertical-farm-reference-dossier-v2.md" },
]

async function main() {
    for (const demo of DEMO_PROJECTS) {
        const filePath = join(DOSSIER_DIR, demo.file)

        if (!existsSync(filePath)) {
            console.warn(`⏭ ${demo.namePattern}: dossier file not found at ${filePath}`)
            continue
        }

        const dossierContent = readFileSync(filePath, "utf-8")
        console.log(
            `📄 ${demo.namePattern}: loaded ${dossierContent.length} chars from ${demo.file}`,
        )

        const { data: projects, error: findErr } = await supabase
            .from("cad_lab_projects")
            .select("id, subject")
            .ilike("subject", `%${demo.namePattern}%`)

        if (findErr) {
            console.error(`❌ ${demo.namePattern}: query error:`, findErr.message)
            continue
        }

        if (!projects || projects.length === 0) {
            console.warn(`⏭ ${demo.namePattern}: no matching project found`)
            continue
        }

        for (const project of projects) {
            const { error: updateErr } = await supabase
                .from("cad_lab_projects")
                .update({ reference_dossier: dossierContent })
                .eq("id", project.id)

            if (updateErr) {
                console.error(
                    `❌ ${demo.namePattern} (${project.id}): update error:`,
                    updateErr.message,
                )
            } else {
                console.log(
                    `✅ ${demo.namePattern} (${project.id}): seeded ${dossierContent.length} chars`,
                )
            }
        }
    }

    console.log("\nDone.")
}

main().catch(console.error)
