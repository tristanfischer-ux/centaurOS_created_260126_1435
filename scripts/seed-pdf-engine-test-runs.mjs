#!/usr/bin/env node
/**
 * scripts/seed-pdf-engine-test-runs.mjs — one-off smoke seeder for the A1-minimal worker.
 *
 * Inserts three pending pdf_engine_runs rows directly via the service-role
 * client, simulating what /api/pdf-engine-v2/submit does. The Mac Studio
 * worker (com.fractionalforge.pdf-engine-worker) will then process them
 * sequentially.
 *
 * Used once for the 2026-05-18 end-to-end smoke test. Not part of the
 * production code path.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

const REPO_ROOT = resolve(homedir(), 'Developer/CentaurOS created 260126 1435')

function loadEnv(p) {
    try {
        const text = readFileSync(p, 'utf-8')
        for (const line of text.split('\n')) {
            const t = line.trim()
            if (!t || t.startsWith('#') || !t.includes('=')) continue
            const [k, ...rest] = t.split('=')
            const v = rest.join('=').replace(/^["']|["']$/g, '')
            if (!process.env[k]) process.env[k] = v
        }
    } catch {}
}
loadEnv(resolve(REPO_ROOT, '.env.local'))

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
    console.error('missing supabase env')
    process.exit(2)
}
if (!url.includes('jyarhvinengfyrwgtskq')) {
    console.error('wrong project — refusing')
    process.exit(2)
}

const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
})

// Tristan's auth.users id (smoke test only).
const USER_ID = 'a929f669-6638-4118-9854-2a573faec9e1'

// Find Tristan's foundry.
const { data: mem, error: memErr } = await supabase
    .from('foundry_memberships')
    .select('foundry_id, role, is_primary')
    .eq('user_id', USER_ID)
    .eq('active', true)
    .order('is_primary', { ascending: false })
    .limit(1)
    .maybeSingle()
if (memErr || !mem) {
    console.error('no foundry membership found for test user', memErr?.message)
    process.exit(2)
}
const FOUNDRY_ID = mem.foundry_id
console.log(`using foundry ${FOUNDRY_ID} (role ${mem.role})`)

const BRIEFS = [
    {
        name: 'A1-smoke BESS 3.5 MWh',
        brief: 'We are designing a containerised 3.5 MWh battery energy storage system for UK grid services. Target market: secondary frequency response and capacity market. Cost ceiling £450,000 ex-VAT per unit. Quantity: 25 units in the first 18 months. Battery chemistry preference: LFP. Required ambient operating range: -20 to +45 degrees Celsius. Must comply with IEC 62933 and BS EN 62619. UK manufacture preferred.',
    },
    {
        name: 'A1-smoke heat pump 30 kW R290',
        brief: 'We are designing a 30 kW R290 monobloc air-to-water heat pump for the UK residential and light-commercial market. Target unit cost £4,200 ex-VAT for the OEM. First-year volume 5,000 units. Required SCOP ≥ 4.0 at 35 °C flow. R290 refrigerant charge below 700 g (UK PD compliance). Must meet PAS 2030 / MCS 020. Quiet running below 45 dB(A) at 1 m.',
    },
    {
        name: 'A1-smoke cinema drone 4K 35 min',
        brief: 'We are designing a 4K 60fps consumer cinematography drone with 35 minutes claimed flight time on a single battery. Take-off mass below 900 g for UK A1/A3 open-category compliance. Folding airframe, 3-axis gimbal, 1-inch CMOS sensor. Target retail £1,499 inc-VAT, 50% gross margin, 30,000 units in year one. Wind tolerance Level-5 (≈ 10 m/s). Operating temperature -10 to +40 °C.',
    },
]

for (const item of BRIEFS) {
    const { data: proj, error: projErr } = await supabase
        .from('cad_lab_projects')
        .insert({
            foundry_id: FOUNDRY_ID,
            created_by: USER_ID,
            name: item.name,
            subject: item.brief.slice(0, 120),
            model_id: 'pdf-engine-v2',
            stage: 'design',
            status: 'draft',
            batch_status: 'idle',
            founder_raw_brief: item.brief,
        })
        .select('id')
        .single()
    if (projErr || !proj) {
        console.error('project insert failed:', projErr?.message)
        continue
    }
    const { data: run, error: runErr } = await supabase
        .from('pdf_engine_runs')
        .insert({
            project_id: proj.id,
            user_id: USER_ID,
            brief_text: item.brief,
            status: 'pending',
        })
        .select('id, created_at')
        .single()
    if (runErr || !run) {
        console.error('run insert failed:', runErr?.message)
        continue
    }
    console.log(`queued ${item.name} → job ${run.id}`)
}

console.log('done')
