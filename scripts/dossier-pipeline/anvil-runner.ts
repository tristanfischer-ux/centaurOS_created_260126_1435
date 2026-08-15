/**
 * @file Anvil auto-runner — the local leg of the §6 concierge pipeline.
 *
 * Watches dossier_projects for new briefs, pulls each one down to this
 * machine, runs Anvil (serial-design-chain-v2) for the FIRST PASS, stages the
 * output for Tristan's review, and advances the project to in_review.
 * Delivery back to the customer stays MANUAL: Tristan reviews the workbook,
 * then uploads it in /studio (→ ready + customer email). Anvil never touches
 * the web app; the web app never touches Anvil (§6.6).
 *
 * Flow per project:
 *   submitted ──(claim)──▶ in_progress ──(chain ok)──▶ in_review + email Tristan
 *                                └──(chain fails)──▶ stays in_progress + email Tristan
 *
 * NDA rule: a project with nda_requested=true is NOT auto-run until
 * nda_status='signed' — "nothing moves beyond intake until it's in place".
 *
 * Usage:
 *   npx tsx scripts/dossier-pipeline/anvil-runner.ts --once     # one poll (launchd)
 *   npx tsx scripts/dossier-pipeline/anvil-runner.ts --watch    # poll loop (dev)
 *   ANVIL_CMD='npx tsx scripts/serial-design-chain-v2.tsx {brief} {out}'  # override
 *   DRY_RUN=1  # claim + download + stage dirs, but skip the chain
 *
 * Queue layout: ~/FF-dossier-queue/<project-id>/
 *   brief/brief.md + attachments/          inbound
 *   out/                                    chain output dir
 *   review/                                 the .xlsx staged for Tristan
 *   runner.log
 */

import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const REPO = path.resolve(__dirname, '..', '..')
const QUEUE_ROOT = process.env.FF_QUEUE_DIR || path.join(os.homedir(), 'FF-dossier-queue')
const POLL_MS = Number(process.env.FF_POLL_MS || 5 * 60 * 1000)
const ACTOR = 'anvil-runner'
const NOTIFY_TO = process.env.FF_NOTIFY_TO || 'hello@fractionalforge.app'

// --- env: load .env.local the same way the app sees it -----------------------
function loadEnvLocal(): void {
  const envPath = path.join(REPO, '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}
loadEnvLocal()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESEND_KEY = process.env.RESEND_API_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[runner] Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function log(dir: string | null, msg: string): void {
  const line = `${new Date().toISOString()} ${msg}`
  console.error(`[runner] ${line}`)
  if (dir) fs.appendFileSync(path.join(dir, 'runner.log'), line + '\n')
}

async function sendEmail(subject: string, text: string): Promise<void> {
  if (!RESEND_KEY) return
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Anvil Runner <tristan@fractionalforge.app>',
        to: NOTIFY_TO,
        subject,
        text,
      }),
    })
  } catch (err) {
    console.error('[runner] email failed:', err)
  }
}

async function recordEvent(projectId: string, from: string, to: string, note: string): Promise<void> {
  await db.from('dossier_project_events').insert({
    project_id: projectId,
    from_status: from,
    to_status: to,
    actor: ACTOR,
    note,
  })
}

interface ProjectRow {
  id: string
  customer_name: string
  customer_email: string
  company: string | null
  sector: string | null
  brief_text: string
  status: string
  nda_requested: boolean
  nda_status: string | null
}

/** Atomically claim ONE eligible project (submitted, NDA clear). */
async function claimNext(): Promise<ProjectRow | null> {
  const { data: candidates } = await db
    .from('dossier_projects')
    .select('*')
    .eq('status', 'submitted')
    .order('created_at', { ascending: true })
    .limit(10)

  for (const p of (candidates ?? []) as ProjectRow[]) {
    if (p.nda_requested && p.nda_status !== 'signed') continue // intake only until NDA signed
    // optimistic claim: only wins if still 'submitted'
    const { data: claimed } = await db
      .from('dossier_projects')
      .update({ status: 'in_progress', status_updated_at: new Date().toISOString() })
      .eq('id', p.id)
      .eq('status', 'submitted')
      .select('id')
    if (claimed && claimed.length > 0) {
      await recordEvent(p.id, 'submitted', 'in_progress', 'Anvil first pass started (auto-runner)')
      return p
    }
  }
  return null
}

async function downloadBrief(p: ProjectRow, dir: string): Promise<string> {
  const briefDir = path.join(dir, 'brief')
  fs.mkdirSync(briefDir, { recursive: true })

  const briefMd = [
    `# Design Dossier brief — ${p.company || p.customer_name}`,
    '',
    `- Customer: ${p.customer_name} <${p.customer_email}>`,
    `- Company: ${p.company || '—'}`,
    `- Sector: ${p.sector || '—'}`,
    `- Project id: ${p.id}`,
    '',
    '## Brief',
    '',
    p.brief_text,
    '',
  ].join('\n')
  const briefPath = path.join(briefDir, 'brief.md')
  fs.writeFileSync(briefPath, briefMd)

  const { data: files } = await db
    .from('dossier_project_files')
    .select('*')
    .eq('project_id', p.id)
    .eq('kind', 'brief_attachment')
  for (const f of files ?? []) {
    const { data: blob } = await db.storage.from('briefs').download(f.storage_path)
    if (blob) {
      const attDir = path.join(briefDir, 'attachments')
      fs.mkdirSync(attDir, { recursive: true })
      const name = (f.original_name || path.basename(f.storage_path)).replace(/[^a-zA-Z0-9._-]+/g, '_')
      fs.writeFileSync(path.join(attDir, name), Buffer.from(await blob.arrayBuffer()))
    }
  }
  return briefPath
}

function runAnvil(briefPath: string, outDir: string, dir: string): boolean {
  fs.mkdirSync(outDir, { recursive: true })
  // No shell: the template is whitespace-split into argv, then {brief}/{out}
  // are substituted per-token, so paths (and any future user-adjacent values)
  // are never interpreted by a shell.
  const cmdTemplate =
    process.env.ANVIL_CMD || 'npx tsx scripts/serial-design-chain-v2.tsx {brief} {out}'
  const argv = cmdTemplate
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => (tok === '{brief}' ? briefPath : tok === '{out}' ? outDir : tok))
  log(dir, `chain: ${argv.join(' ')}`)
  if (process.env.DRY_RUN) {
    log(dir, 'DRY_RUN set — skipping chain')
    return true
  }
  try {
    execFileSync(argv[0], argv.slice(1), {
      cwd: REPO,
      stdio: ['ignore', fs.openSync(path.join(dir, 'chain-stdout.log'), 'a'), fs.openSync(path.join(dir, 'chain-stderr.log'), 'a')],
      timeout: Number(process.env.FF_CHAIN_TIMEOUT_MS || 6 * 60 * 60 * 1000), // 6h
    })
    return true
  } catch (err) {
    log(dir, `chain FAILED: ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
}

/** Stage the newest .xlsx from the out dir into review/ for Tristan. */
function stageForReview(outDir: string, dir: string): string | null {
  const xlsx: { p: string; m: number }[] = []
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.name.endsWith('.xlsx')) xlsx.push({ p: full, m: fs.statSync(full).mtimeMs })
    }
  }
  if (fs.existsSync(outDir)) walk(outDir)
  if (xlsx.length === 0) return null
  xlsx.sort((a, b) => b.m - a.m)
  const reviewDir = path.join(dir, 'review')
  fs.mkdirSync(reviewDir, { recursive: true })
  const dest = path.join(reviewDir, path.basename(xlsx[0].p))
  fs.copyFileSync(xlsx[0].p, dest)
  return dest
}

async function processOne(): Promise<boolean> {
  const p = await claimNext()
  if (!p) return false

  const dir = path.join(QUEUE_ROOT, p.id)
  fs.mkdirSync(dir, { recursive: true })
  log(dir, `claimed ${p.id} — ${p.customer_name} (${p.company || 'no company'})`)

  try {
    const briefPath = await downloadBrief(p, dir)
    const outDir = path.join(dir, 'out')
    const ok = runAnvil(briefPath, outDir, dir)

    if (!ok) {
      await recordEvent(p.id, 'in_progress', 'in_progress', 'Anvil chain failed — see runner logs; needs a manual run')
      await sendEmail(
        `[Anvil] FAILED first pass — ${p.customer_name}${p.company ? ' · ' + p.company : ''}`,
        `The auto first pass failed for project ${p.id}.\n\nLogs: ${dir}\nStudio: https://fractionalforge.app/studio/${p.id}\n\nRun manually, then upload the workbook in /studio.`
      )
      return true
    }

    const staged = process.env.DRY_RUN ? null : stageForReview(outDir, dir)
    await db
      .from('dossier_projects')
      .update({ status: 'in_review', status_updated_at: new Date().toISOString() })
      .eq('id', p.id)
      .eq('status', 'in_progress')
    await recordEvent(
      p.id,
      'in_progress',
      'in_review',
      staged ? `Anvil first pass complete — staged ${path.basename(staged)} for review` : 'Anvil first pass complete (no .xlsx found — check out dir)'
    )
    await sendEmail(
      `[Anvil] First pass ready for review — ${p.customer_name}${p.company ? ' · ' + p.company : ''}`,
      `Anvil finished the first pass for project ${p.id}.\n\n` +
        (staged ? `Workbook staged for your review:\n${staged}\n\n` : `No .xlsx found — check ${path.join(dir, 'out')}\n\n`) +
        `Brief + logs: ${dir}\n` +
        `When you're happy, upload the workbook in /studio (that flips it to Ready and emails the customer):\nhttps://fractionalforge.app/studio/${p.id}\n`
    )
    log(dir, `done — in_review${staged ? `, staged ${staged}` : ''}`)
    return true
  } catch (err) {
    log(dir, `runner error: ${err instanceof Error ? err.stack : String(err)}`)
    await recordEvent(p.id, 'in_progress', 'in_progress', 'Auto-runner error — see runner.log; needs a manual run')
    await sendEmail(
      `[Anvil] Runner ERROR — ${p.customer_name}`,
      `The auto-runner hit an error on project ${p.id}.\n\nLogs: ${dir}\nStudio: https://fractionalforge.app/studio/${p.id}`
    )
    return true
  }
}

async function main(): Promise<void> {
  const mode = process.argv.includes('--watch') ? 'watch' : 'once'
  fs.mkdirSync(QUEUE_ROOT, { recursive: true })

  if (mode === 'once') {
    // Drain everything eligible right now, one at a time (chains are serial —
    // two concurrent chains on one machine fight over CPU + caches).
    let n = 0
    while (await processOne()) n++
    console.error(`[runner] once: processed ${n} project(s)`)
    return
  }

  console.error(`[runner] watch: polling every ${POLL_MS / 1000}s (queue: ${QUEUE_ROOT})`)
  for (;;) {
    try {
      while (await processOne()) {
        /* drain */
      }
    } catch (err) {
      console.error('[runner] poll error:', err)
    }
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
}

main().catch((err) => {
  console.error('[runner] fatal:', err)
  process.exit(1)
})
