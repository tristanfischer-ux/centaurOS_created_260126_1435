#!/usr/bin/env node
/**
 * scripts/pdf-engine-worker.mjs — A1-minimal Mac Studio worker.
 *
 * Polls the pdf_engine_runs table for status='pending' rows, claims one at a
 * time (atomic UPDATE with optimistic concurrency on (id, status='pending')),
 * runs the engine, uploads the PDF, and stamps status='ready' (or 'failed').
 *
 * Designed to run as a LaunchAgent on Tristan's Mac Studio:
 *   ~/Library/LaunchAgents/com.fractionalforge.pdf-engine-worker.plist
 *
 * Dependencies: only stdlib + @supabase/supabase-js (already in the repo).
 *
 * Environment:
 *   - NEXT_PUBLIC_SUPABASE_URL          (from .env.local)
 *   - SUPABASE_SERVICE_ROLE_KEY         (from .env.local)
 *   - OPENROUTER_API_KEY                (the engine needs it)
 *   - and whatever ~/.claude/secrets/*.env files the engine pulls in.
 *
 * Log file: /Users/tristanfischer/.pdf-engine-worker/worker.log
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, statSync, renameSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { homedir, hostname } from 'node:os'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// ─── Env bootstrap ──────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const REPO_ROOT = resolve(__dirname, '..')

function loadEnvFile(p, isOptional = false) {
    try {
        const text = readFileSync(p, 'utf-8')
        for (const line of text.split('\n')) {
            const t = line.trim()
            if (!t || t.startsWith('#') || !t.includes('=')) continue
            const [k, ...rest] = t.split('=')
            const v = rest.join('=').replace(/^["']|["']$/g, '')
            if (!process.env[k]) process.env[k] = v
        }
    } catch (err) {
        // 2026-05-19 audit gap #13: distinguish missing-file from parse-error,
        // and warn (not silent-swallow) when the file was expected.
        if (err && err.code === 'ENOENT') {
            if (!isOptional) {
                console.error(`[pdf-engine-worker] env file not found: ${p} (silent degradation risk — some chain stages may run without their API key)`)
            }
        } else {
            console.error(`[pdf-engine-worker] env file parse error: ${p}: ${err?.message ?? err}`)
        }
    }
}

for (const p of [
    resolve(REPO_ROOT, '.env.local'),
    resolve(homedir(), '.claude/secrets/distributor-apis.env'),
    resolve(homedir(), '.claude/secrets/tavily.env'),
    resolve(homedir(), '.claude/secrets/openrouter.env'),
    // 2026-05-19 fix C5: also load OpenAI env file if present. Engine C needs
    // OPENAI_API_KEY for text-embedding-3-small. Falls back to env if file
    // doesn't exist (e.g. key is in .env.local).
    resolve(homedir(), '.claude/secrets/openai.env'),
    resolve(homedir(), '.claude/secrets/brave.env'),
]) {
    loadEnvFile(p)
}

// 2026-05-19 audit gap #13: surface which API keys are actually present after
// env-file load. Missing keys silently degrade output (Tavily missing →
// research synthesis empty; distributor keys missing → part-verification skip
// distributor cascade). Worker fatal-exits on missing OPENROUTER (handled
// below) — for the others, just warn.
const KEY_CHECKS = [
    { name: 'TAVILY_API_KEY', impact: 'research synthesis + part-verification web search' },
    { name: 'MOUSER_API_KEY', impact: 'part-verification distributor cascade (Mouser)' },
    { name: 'DIGIKEY_CLIENT_ID', impact: 'part-verification distributor cascade (DigiKey)' },
    { name: 'FARNELL_API_KEY', impact: 'part-verification distributor cascade (Farnell)' },
    { name: 'BRAVE_API_KEY', impact: 'supplier enrichment web fallback' },
    // 2026-05-19 fix C5: Engine C (enrich-state-with-reference-anchor.tsx ->
    // python3 scripts/rag/reference_lookup.py) calls OpenAI text-embedding-3-small
    // to embed each BoM query before cosine similarity against forge-truth.db.
    // Missing OPENAI_API_KEY → Engine C subprocess fails → chain catches and
    // continues without reference anchors → cover-page REF panel empty + every
    // engine_c_* field on partVerifications stays null. Surface this prominently.
    { name: 'OPENAI_API_KEY', impact: 'Engine C reference-anchor embeddings (cover page REF panel + every BoM line\'s engine_c_* fields)' },
    // 2026-05-19 v5.1 audit fix #13 (GPT-5.5): every LLM call in the chain
    // routes via OpenRouter. Missing key was NOT surfaced — chain would run
    // until the first LLM call and crash with an opaque error. Now warned.
    { name: 'OPENROUTER_API_KEY', impact: 'every LLM call in chain (brief parse, generator, R1-R4 reviewers, physics critic, repair, Engine B classifier, Engine D supplier scoring, design decisions explainer)' },
]
// Worker tells the chain it is running in production context. Used by the
// chain to set RENDER_NO_OPEN=1 on the renderer subprocess (LaunchAgent has
// no GUI session) and to skip the chain's own local `open` call.
process.env.PDF_ENGINE_WORKER = '1'
for (const { name, impact } of KEY_CHECKS) {
    if (!process.env[name]) {
        console.error(`[pdf-engine-worker] WARNING: ${name} not set — ${impact} will silently fail`)
    }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('[pdf-engine-worker] FATAL: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env / .env.local')
    process.exit(2)
}
if (!SUPABASE_URL.includes('jyarhvinengfyrwgtskq')) {
    console.error(`[pdf-engine-worker] FATAL: SUPABASE_URL points at the wrong project (${SUPABASE_URL}). Expected centaurOS project jyarhvinengfyrwgtskq.`)
    process.exit(2)
}

const WORKER_ID = `mac-studio-${hostname()}-${process.pid}`
const LOG_DIR = resolve(homedir(), '.pdf-engine-worker')
const LOG_PATH = resolve(LOG_DIR, 'worker.log')
const WORK_DIR = resolve(LOG_DIR, 'runs')
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true })
if (!existsSync(WORK_DIR)) mkdirSync(WORK_DIR, { recursive: true })

function log(msg) {
    const line = `[${new Date().toISOString()}] [${WORKER_ID}] ${msg}\n`
    process.stdout.write(line)
    try {
        // Rotate at 5 MB. P3-6 fix (2026-05-23): renameSync is now imported
        // at top of file, not require()'d inside the function (require fails
        // in ESM contexts; before this fix rotation silently never ran).
        if (existsSync(LOG_PATH)) {
            const sz = statSync(LOG_PATH).size
            if (sz > 5 * 1024 * 1024) {
                rmSync(LOG_PATH + '.1', { force: true })
                try { renameSync(LOG_PATH, LOG_PATH + '.1') } catch { /* best-effort */ }
            }
        }
        writeFileSync(LOG_PATH, line, { flag: 'a' })
    } catch {
        // best-effort
    }
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
})

// ─── Claim one pending run (atomic) ─────────────────────────────────────────
async function claimOnePendingRun() {
    // Step 1 — find the oldest pending row. We also pull variation_of /
    // variation_label so the worker can decide if this is a child row and
    // compose the effective brief from the parent's brief_text. (The API
    // already pre-composes the child brief at submit time, so reading
    // variation_label is only used for logging clarity here.)
    const { data: candidate, error: pickErr } = await supabase
        .from('pdf_engine_runs')
        .select('id, brief_text, project_id, user_id, created_at, variation_of, variation_label')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

    if (pickErr) {
        log(`pick error: ${pickErr.message}`)
        return null
    }
    if (!candidate) return null

    // Step 1.5 — defense-in-depth: reject rows missing user_id BEFORE we
    // claim them and burn 60-90 min of LLM compute. The downstream upload
    // path needs `<user_id>/<job_id>.pdf` for storage RLS, so a row without
    // user_id can never produce a downloadable PDF anyway. Fail the row
    // fast so it doesn't sit at status='pending' forever and so the
    // requester sees a clear error within seconds, not hours.
    if (!candidate.user_id || typeof candidate.user_id !== 'string') {
        log(`rejecting row ${candidate.id} at claim time — user_id is null/non-string`)
        await supabase
            .from('pdf_engine_runs')
            .update({
                status: 'failed',
                error_log:
                    'pdf_engine_runs.user_id missing on this row. The row must be inserted with user_id = auth user UUID so the storage bucket\'s RLS lets the founder download their PDF. If you\'re SQL-inserting a synthetic test row, set user_id explicitly. Failed at claim time to avoid wasting chain compute.',
                ready_at: new Date().toISOString(),
            })
            .eq('id', candidate.id)
            .eq('status', 'pending')
        return null
    }

    // Step 2 — atomically flip status='pending' → 'running'. The
    // .eq('status', 'pending') guard means a competing worker that already
    // claimed this row will produce an empty update — we just skip.
    const { data: claimed, error: claimErr } = await supabase
        .from('pdf_engine_runs')
        .update({
            status: 'running',
            worker_id: WORKER_ID,
            started_at: new Date().toISOString(),
        })
        .eq('id', candidate.id)
        .eq('status', 'pending')
        .select('id, brief_text, project_id, user_id, variation_of, variation_label')
        .maybeSingle()

    if (claimErr) {
        log(`claim error: ${claimErr.message}`)
        return null
    }
    if (!claimed) {
        // Another worker beat us. That's fine.
        return null
    }
    return claimed
}

// ─── Run the engine for a claimed row ───────────────────────────────────────
// 2026-05-19 fix M7 (audit-found): worker had no child-process timeout. A
// single hung subprocess (network deadlock during an LLM call, frozen Python
// process in Engine C, infinite loop in renderer) would block the worker
// forever, stopping ALL future job processing. Add a hard timeout that
// escalates SIGTERM → SIGKILL. Per chain telemetry, heatpump-class runs
// take 60-90 min worst-case; bioreactor + BESS can reach 110 min. Cap at
// 180 min to leave headroom for slower classes + retries inside the chain.
const CHILD_TIMEOUT_MS = 180 * 60 * 1000  // 180 min hard cap

function runChild(cmd, args, cwd, jobLogPath) {
    return new Promise((resolveP) => {
        const child = spawn(cmd, args, {
            cwd,
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe'],
        })
        let timedOut = false
        let sigkillTimer = null
        const timeoutTimer = setTimeout(() => {
            timedOut = true
            log(`child process exceeded ${CHILD_TIMEOUT_MS / 60_000} min cap — sending SIGTERM`)
            try { child.kill('SIGTERM') } catch (err) {
                log(`SIGTERM threw: ${err?.message ?? err}`)
            }
            // Escalate to SIGKILL if the child doesn't exit cleanly within 30s.
            sigkillTimer = setTimeout(() => {
                log(`child still alive 30s after SIGTERM — escalating to SIGKILL`)
                try { child.kill('SIGKILL') } catch (err) {
                    log(`SIGKILL threw: ${err?.message ?? err}`)
                }
            }, 30_000)
        }, CHILD_TIMEOUT_MS)

        const onData = (buf) => {
            const s = buf.toString()
            process.stdout.write(s)
            try {
                writeFileSync(jobLogPath, s, { flag: 'a' })
            } catch {
                // ignore
            }
        }
        const cleanup = () => {
            clearTimeout(timeoutTimer)
            if (sigkillTimer) clearTimeout(sigkillTimer)
        }
        child.stdout.on('data', onData)
        child.stderr.on('data', onData)
        child.on('exit', (code) => {
            cleanup()
            if (timedOut) {
                // Synthetic exit code: -2 = killed by worker timeout (distinguishes
                // from -1 spawn error). processJob() will treat any non-zero exit
                // as a fail, but the log line above tells the operator why.
                resolveP(-2)
            } else {
                resolveP(code ?? -1)
            }
        })
        child.on('error', (err) => {
            cleanup()
            log(`spawn error: ${err.message}`)
            resolveP(-1)
        })
    })
}

async function processJob(job) {
    const jobDir = resolve(WORK_DIR, job.id)
    if (!existsSync(jobDir)) mkdirSync(jobDir, { recursive: true })
    const briefPath = resolve(jobDir, 'brief.md')
    const jobLogPath = resolve(jobDir, 'worker-stdio.log')
    writeFileSync(briefPath, job.brief_text)
    writeFileSync(jobLogPath, '')  // truncate

    if (job.variation_of) {
        log(`processing job ${job.id} — VARIATION "${job.variation_label ?? '?'}" of parent ${job.variation_of} — brief ${job.brief_text.length} chars`)
    } else {
        log(`processing job ${job.id} — brief ${job.brief_text.length} chars`)
    }

    // Run the universal engineering-report chain. Produces:
    //   <jobDir>/state.json
    //   <jobDir>/chain-v2.pdf
    //   <jobDir>/actions.jsonl
    const code = await runChild(
        'npx',
        ['tsx', 'scripts/serial-design-chain-v2.tsx', briefPath, jobDir],
        REPO_ROOT,
        jobLogPath,
    )

    if (code !== 0) {
        const tail = readTail(jobLogPath, 4_000)
        // P3-5 (2026-05-23): classify exit code for retry decision-making.
        // Codes per CLAUDE.md canonical table. Schema doesn't yet track
        // retry_count; this annotation lets a human/admin decide whether
        // re-submitting the brief would help.
        const EXIT_CODE_CLASSIFICATION = {
            1: { class: 'unknown', retry: 'maybe', desc: 'Unexpected error or bad CLI args — investigate logs before re-submitting' },
            2: { class: 'permanent', retry: 'no', desc: 'Brief refinement loop exhausted — original brief unfixable, founder must revise' },
            3: { class: 'permanent', retry: 'no', desc: 'G0.5 reconciliation halt — design scale conflicts with brief, founder must clarify' },
            5: { class: 'transient', retry: 'yes', desc: 'Render subprocess failed — likely OOM or react-pdf timeout, retry should help' },
            6: { class: 'permanent', retry: 'no', desc: 'PDF integrity check failed — renderer produced garbage; bug needs code fix' },
            7: { class: 'mixed', retry: 'maybe', desc: 'Orchestrator hard fail — could be transient tool timeout or permanent emitter bug; check tail' },
        }
        const cls = EXIT_CODE_CLASSIFICATION[code] || { class: 'unknown', retry: 'maybe', desc: 'Undocumented exit code' }
        await failJob(
            job.id,
            `engine exited with code ${code} [${cls.class.toUpperCase()}, retry=${cls.retry}]\n` +
            `${cls.desc}\n\n` +
            `--- log tail ---\n${tail}`,
        )
        return
    }

    const pdfPath = resolve(jobDir, 'chain-v2.pdf')
    const statePath = resolve(jobDir, 'state.json')
    if (!existsSync(pdfPath)) {
        const tail = readTail(jobLogPath, 4_000)
        await failJob(job.id, `engine completed but produced no PDF\n\n--- log tail ---\n${tail}`)
        return
    }

    // Upload PDF — path layout: <user_id>/<job_id>.pdf
    // Storage RLS uses (storage.foldername(name))[1] = auth.uid()::text,
    // so the requesting user can only download their own object. If
    // job.user_id is null (e.g. a SQL-inserted test row, or any future
    // insert that forgets to set user_id) the previous code silently
    // produced the literal path `null/<id>.pdf` and broke RLS forever.
    // Fail loudly instead — the row is the bug, not the upload.
    if (!job.user_id || typeof job.user_id !== 'string') {
        await failJob(
            job.id,
            `cannot build storage path: pdf_engine_runs.user_id is missing on this row. ` +
            `The row must be inserted with user_id = auth user UUID so the storage bucket's ` +
            `RLS ((storage.foldername(name))[1] = auth.uid()::text) lets the founder download ` +
            `their own PDF. If you're SQL-inserting a synthetic test row, set user_id explicitly.`,
        )
        return
    }
    const storagePath = `${job.user_id}/${job.id}.pdf`
    const pdfBuf = readFileSync(pdfPath)

    const { error: uploadErr } = await supabase.storage
        .from('pdf-engine-pdfs')
        .upload(storagePath, pdfBuf, {
            contentType: 'application/pdf',
            upsert: true,
        })

    if (uploadErr) {
        await failJob(job.id, `pdf upload failed: ${uploadErr.message}`)
        return
    }

    // 2026-05-19 fix M8 (audit-found): also upload the full state.json +
    // actions.jsonl as Storage objects alongside the PDF. Previously these
    // were local-only on Mac Studio — if the machine was wiped or replaced,
    // all diagnostic data was lost. Now they live in Supabase under the same
    // user_id-scoped path with the same RLS as the PDF.
    //
    // Cost: typical state.json ~100-500 KB, actions.jsonl ~50-200 KB per run.
    // Across 1000 jobs that's <1 GB — negligible vs the PDFs themselves (6 MB each).
    const stateStoragePath = `${job.user_id}/${job.id}.state.json`
    const actionsStoragePath = `${job.user_id}/${job.id}.actions.jsonl`
    const actionsPath = resolve(jobDir, 'actions.jsonl')
    // 2026-05-19 v5.1 audit fix #6 (GPT-5.5): previously the await pattern
    // here did NOT inspect the returned {error} field — Supabase Storage can
    // reject the upload (RLS, quota, network) but the worker would still log
    // "uploaded" and stamp state_storage_path on the DB row, advertising a
    // path to a non-existent object. Now we check and log honestly.
    let stateUploaded = false
    let actionsUploaded = false
    try {
        if (existsSync(statePath)) {
            const stateBuf = readFileSync(statePath)
            // 2026-05-19 firestorm iter-1 fix: pdf-engine-pdfs bucket policy
            // rejects application/json + application/x-ndjson mime types
            // (Supabase Storage bucket allowed_mime_types restricts to a few
            // formats including application/pdf + application/octet-stream).
            // Upload as octet-stream — recipient code reads as JSON regardless.
            const { error: stateUploadErr } = await supabase.storage.from('pdf-engine-pdfs').upload(stateStoragePath, stateBuf, {
                contentType: 'application/octet-stream',
                upsert: true,
            })
            if (stateUploadErr) {
                log(`state.json upload REJECTED by Supabase: ${stateUploadErr.message}`)
            } else {
                log(`uploaded state.json (${(stateBuf.length / 1024).toFixed(1)} KB) → ${stateStoragePath}`)
                stateUploaded = true
            }
        }
    } catch (err) {
        log(`state.json upload threw (non-fatal): ${err instanceof Error ? err.message : err}`)
    }
    try {
        if (existsSync(actionsPath)) {
            const actionsBuf = readFileSync(actionsPath)
            // Same fix as state.json upload — bucket rejects application/x-ndjson.
            const { error: actionsUploadErr } = await supabase.storage.from('pdf-engine-pdfs').upload(actionsStoragePath, actionsBuf, {
                contentType: 'application/octet-stream',
                upsert: true,
            })
            if (actionsUploadErr) {
                log(`actions.jsonl upload REJECTED by Supabase: ${actionsUploadErr.message}`)
            } else {
                log(`uploaded actions.jsonl (${(actionsBuf.length / 1024).toFixed(1)} KB) → ${actionsStoragePath}`)
                actionsUploaded = true
            }
        }
    } catch (err) {
        log(`actions.jsonl upload threw (non-fatal): ${err instanceof Error ? err.message : err}`)
    }

    // Compact state snapshot for the DB column (full state lives in Storage above).
    let stateSnap = null
    try {
        if (existsSync(statePath)) {
            const raw = readFileSync(statePath, 'utf-8')
            const parsed = JSON.parse(raw)
            stateSnap = {
                acceptanceStatus: parsed.acceptanceStatus ?? null,
                gatesPassed: parsed.gatesPassed ?? null,
                moduleCount: Array.isArray(parsed.moduleDecomposition?.modules)
                    ? parsed.moduleDecomposition.modules.length
                    : null,
                // 2026-05-19 expanded snapshot — quick-look diagnostics without
                // needing to fetch the full state.json from storage.
                bom_total_gbp: parsed.cost_reality?.bom_total_gbp ?? null,
                cost_reality_verdict: parsed.cost_reality?.verdict ?? null,
                g1b_verdict: parsed.complianceGate?.verdict ?? null,
                g3_manual_review: parsed.g3ManualReview ?? null,
                g3_gap_count: Array.isArray(parsed.g3_review_gaps) ? parsed.g3_review_gaps.length : 0,
                g5_unverified_count: Array.isArray(parsed.g5UnverifiedParts) ? parsed.g5UnverifiedParts.length : 0,
                supplier_archetype_count: Array.isArray(parsed.suppliers) ? parsed.suppliers.length : 0,
                // 2026-05-19 v5.1 fix #6: only record the path if upload actually succeeded.
                state_storage_path: stateUploaded ? stateStoragePath : null,
                actions_storage_path: actionsUploaded ? actionsStoragePath : null,
                savedAt: parsed.savedAt ?? null,
            }
        }
    } catch (err) {
        log(`state snapshot parse failed (non-fatal): ${err instanceof Error ? err.message : err}`)
    }

    const { error: doneErr } = await supabase
        .from('pdf_engine_runs')
        .update({
            status: 'ready',
            ready_at: new Date().toISOString(),
            pdf_storage_path: storagePath,
            state_snapshot_json: stateSnap,
            error_log: null,
        })
        .eq('id', job.id)

    if (doneErr) {
        log(`failed to mark ready: ${doneErr.message}`)
        return
    }

    log(`job ${job.id} ready — uploaded to ${storagePath}`)
}

function readTail(path, n) {
    try {
        const text = readFileSync(path, 'utf-8')
        return text.length > n ? text.slice(text.length - n) : text
    } catch {
        return ''
    }
}

async function failJob(jobId, message) {
    log(`job ${jobId} failed: ${message.split('\n')[0]}`)
    const truncated = message.length > 8000 ? message.slice(0, 8000) + '\n[truncated]' : message
    const { error } = await supabase
        .from('pdf_engine_runs')
        .update({
            status: 'failed',
            ready_at: new Date().toISOString(),
            error_log: truncated,
        })
        .eq('id', jobId)
    if (error) log(`failed to mark failed: ${error.message}`)
}

// ─── Main loop ──────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 30_000
const STALE_RUNNING_THRESHOLD_MS = 200 * 60 * 1000  // 200 min — anything older is a crashed run
let running = false

// 2026-05-19 fix M6 (audit-found stale-running recovery): two-part.
//
// PART A — at worker startup, mark any rows status='running' AND worker_id
// matching THIS host as 'failed'. Rationale: if this worker process is alive
// now (startup), any pre-existing 'running' row attributed to this host means
// we crashed mid-job (Mac sleep, kernel panic, OOM, KeepAlive restart). The
// underlying chain subprocess is gone; the row would sit at 'running' forever.
// PART B — every poll, sweep for any 'running' row older than 200 min
// (regardless of worker_id). Mac Studio runs ≤180 min thanks to M7's runChild
// cap; anything past 200 min is a foreign crash or a SIGKILL-resistant hang.
async function recoverStaleRunningRows() {
    const hostPrefix = `mac-studio-${hostname()}-`
    try {
        // Part A: our-host pre-existing running rows (we crashed)
        const { data: ourCrashed, error: e1 } = await supabase
            .from('pdf_engine_runs')
            .select('id, started_at, worker_id')
            .eq('status', 'running')
            .like('worker_id', `${hostPrefix}%`)
            .neq('worker_id', WORKER_ID)  // exclude THIS worker process — we're alive
        if (e1) {
            log(`stale-running scan (host) failed: ${e1.message}`)
        } else if (ourCrashed && ourCrashed.length > 0) {
            for (const row of ourCrashed) {
                log(`recovering crashed job ${row.id} (was ${row.worker_id}, claimed at ${row.started_at}) — marking failed`)
                await supabase
                    .from('pdf_engine_runs')
                    .update({
                        status: 'failed',
                        ready_at: new Date().toISOString(),
                        error_log: `Worker crashed mid-job (Mac sleep / kernel panic / OOM / KeepAlive restart). Original worker_id: ${row.worker_id}; current worker: ${WORKER_ID}. Re-submit the brief to retry.`,
                    })
                    .eq('id', row.id)
                    .eq('status', 'running')  // CAS guard
            }
        }
        // Part B: any-host long-running rows (foreign crash or hang)
        const stalenessCutoff = new Date(Date.now() - STALE_RUNNING_THRESHOLD_MS).toISOString()
        const { data: stale, error: e2 } = await supabase
            .from('pdf_engine_runs')
            .select('id, started_at, worker_id')
            .eq('status', 'running')
            .lt('started_at', stalenessCutoff)
        if (e2) {
            log(`stale-running scan (time) failed: ${e2.message}`)
        } else if (stale && stale.length > 0) {
            for (const row of stale) {
                const ageMin = Math.floor((Date.now() - new Date(row.started_at).getTime()) / 60_000)
                log(`recovering stale job ${row.id} (worker ${row.worker_id}, ${ageMin} min old) — marking failed`)
                await supabase
                    .from('pdf_engine_runs')
                    .update({
                        status: 'failed',
                        ready_at: new Date().toISOString(),
                        error_log: `Run wedged at status='running' for ${ageMin} minutes (>${STALE_RUNNING_THRESHOLD_MS / 60_000} min threshold). Worker hung or host died without recovery. Original worker_id: ${row.worker_id}. Re-submit the brief to retry.`,
                    })
                    .eq('id', row.id)
                    .eq('status', 'running')  // CAS guard
            }
        }
    } catch (err) {
        log(`stale-running recovery threw: ${err instanceof Error ? err.message : err}`)
    }
}

async function tick() {
    if (running) return
    running = true
    try {
        // M6 Part B: scan for stale rows every poll. Cheap (1 query).
        await recoverStaleRunningRows()
        const job = await claimOnePendingRun()
        if (job) {
            await processJob(job)
        }
    } catch (err) {
        log(`tick error: ${err instanceof Error ? err.message : err}`)
    } finally {
        running = false
    }
}

log(`starting worker (poll ${POLL_INTERVAL_MS / 1000}s, repo ${REPO_ROOT})`)
// M6 Part A: at startup, recover any rows that were running when we died.
void recoverStaleRunningRows().then(() => {
    // fire-and-forget immediately, then on interval
    void tick()
    setInterval(tick, POLL_INTERVAL_MS)
})

// Graceful shutdown — let any in-flight job finish via the running guard.
function shutdown(signal) {
    log(`received ${signal}, exiting`)
    process.exit(0)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
