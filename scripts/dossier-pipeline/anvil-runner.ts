/**
 * @file Anvil auto-runner — the local leg of the §6 concierge pipeline.
 *
 * Watches dossier_projects for new briefs, pulls each one down to this
 * machine, runs the one Anvil engine (`one_engine.py`) for the FIRST PASS, stages the
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
 *   ANVIL_CMD='python3 scripts/anvil_one_engine.py --brief {brief} --execute --work {out} --repo {repo}'
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
// The Anvil engine checkout to run the chain from. Defaults to this (site)
// repo; set ANVIL_REPO to run a different checkout's engine — e.g. the oxccu
// "formal book" engine (its own 41,871-line exporter + modules) — in place,
// without merging or copying anything. The site runner still owns the
// site's Supabase/Resend; only the chain exec runs from ANVIL_REPO.
const ANVIL_REPO = process.env.ANVIL_REPO || REPO
const QUEUE_ROOT = process.env.FF_QUEUE_DIR || path.join(os.homedir(), 'FF-dossier-queue')
const POLL_MS = Number(process.env.FF_POLL_MS || 5 * 60 * 1000)
const ACTOR = 'anvil-runner'
// hello@fractionalforge.app is suppressed by Resend (dead mailbox) — default to
// Tristan's monitored inbox; override with FF_NOTIFY_TO.
const NOTIFY_TO = process.env.FF_NOTIFY_TO || 'tristan.fischer@gmail.com'

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

async function sendEmail(subject: string, text: string, to: string = NOTIFY_TO): Promise<void> {
  if (!RESEND_KEY) return
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Fractional Forge <tristan@fractionalforge.app>',
        to,
        subject,
        text,
      }),
    })
    // council (Sol #B6): check the response, not just thrown errors
    if (!res.ok) console.error(`[runner] email non-2xx (${res.status}) to ${to}: ${await res.text()}`)
  } catch (err) {
    console.error('[runner] email failed:', err)
  }
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://fractionalforge.app'

/**
 * Customer-facing status emails on the AUTOMATED path (council Sol #B3 / Grok #B1):
 * the runner advances in_progress → in_review directly with the service role, so
 * setProjectStatus's CUSTOMER_EMAILS never fire for those transitions. Send them
 * here so the founder gets the same "in progress" / "in engineering review"
 * notices they would on the manual path. Copy mirrors src/actions/dossier-projects.ts.
 */
async function emailCustomerStatus(
  p: ProjectRow,
  to: 'in_progress' | 'in_review',
): Promise<void> {
  const first = p.customer_name.split(' ')[0] || 'there'
  const statusUrl = `${APP_URL}/project/${p.access_token}`
  const signoff = '\n— Tristan Fischer, Founder, Fractional Forge\n'
  const mails: Record<'in_progress' | 'in_review', { subject: string; text: string }> = {
    in_progress: {
      subject: 'Anvil is building your Design Dossier',
      text:
        `Hi ${first},\n\n` +
        `Anvil has started the first pass on your Design Dossier. Next it goes to senior ` +
        `engineers from our partner network for review before you see it.\n\n` +
        `Track progress: ${statusUrl}\n` +
        signoff,
    },
    in_review: {
      subject: 'Your Design Dossier is in engineering review',
      text:
        `Hi ${first},\n\n` +
        `Anvil has finished the first pass on your Design Dossier and it's now with senior ` +
        `engineers from our partner network for review. You'll get the download link as soon ` +
        `as it's signed off.\n\n` +
        `Track progress: ${statusUrl}\n` +
        signoff,
    },
  }
  const m = mails[to]
  await sendEmail(m.subject, m.text, p.customer_email)
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
  access_token: string
}

/**
 * Atomically claim ONE eligible project (council #2/#15/#18/#5).
 *
 * Claims from 'validated', NOT 'submitted' — Tristan's Validate click in
 * /studio is the execution gate. This stops the runner auto-processing raw
 * anonymous submissions (cost DoS), fixes the needs_info → validated recovery
 * path, and removes the claim-before-attachment-upload race (attachments are
 * present by the time Tristan validates). The NDA eligibility filter is pushed
 * into the query (before .limit) so the candidate window is never starved by
 * NDA-pending rows ahead of runnable ones.
 */
async function claimNext(): Promise<ProjectRow | null> {
  const { data: candidates } = await db
    .from('dossier_projects')
    .select('*')
    .eq('status', 'validated')
    .or('nda_requested.eq.false,nda_status.eq.signed')
    .order('created_at', { ascending: true })
    .limit(10)

  for (const p of (candidates ?? []) as ProjectRow[]) {
    // Belt-and-braces NDA guard (the .or above already excludes these).
    if (p.nda_requested && p.nda_status !== 'signed') continue
    // optimistic claim: only wins if still 'validated'
    const { data: claimed } = await db
      .from('dossier_projects')
      .update({ status: 'in_progress', status_updated_at: new Date().toISOString() })
      .eq('id', p.id)
      .eq('status', 'validated')
      .select('id')
    if (claimed && claimed.length > 0) {
      await recordEvent(p.id, 'validated', 'in_progress', 'Anvil first pass started (auto-runner)')
      await emailCustomerStatus(p, 'in_progress')
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
    process.env.ANVIL_CMD ||
    'python3 scripts/anvil_one_engine.py --brief {brief} --execute --work {out} --repo {repo}'
  const argv = cmdTemplate
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) =>
      tok === '{brief}' ? briefPath : tok === '{out}' ? outDir : tok === '{repo}' ? ANVIL_REPO : tok,
    )
  log(dir, `chain: ${argv.join(' ')}  (cwd: ${ANVIL_REPO})`)
  if (process.env.DRY_RUN) {
    log(dir, 'DRY_RUN set — skipping chain')
    return true
  }
  // The chain runs from ANVIL_REPO (its own exporter/modules). Merge that
  // checkout's .env.local into the chain's environment (its OPENROUTER key +
  // engine config) on top of the runner's env, so the engine sees its own
  // config regardless of which checkout the runner itself lives in.
  const chainEnv = { ...process.env }
  const engineEnvPath = path.join(ANVIL_REPO, '.env.local')
  if (fs.existsSync(engineEnvPath)) {
    for (const line of fs.readFileSync(engineEnvPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
      if (m) chainEnv[m[1]] = m[2]
    }
  }
  try {
    execFileSync(argv[0], argv.slice(1), {
      cwd: ANVIL_REPO,
      env: chainEnv,
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

    // No-workbook guard (council Sol #B2): the chain exited 0 but produced no
    // .xlsx. Do NOT advance to in_review / tell the customer their Dossier is in
    // engineering review when there's nothing to review. Keep it in_progress and
    // alert Tristan for a manual run. (DRY_RUN intentionally has no .xlsx and
    // still advances, for testing the state flow.)
    if (!staged && !process.env.DRY_RUN) {
      await recordEvent(p.id, 'in_progress', 'in_progress', 'Anvil exited 0 but produced no .xlsx — needs a manual run')
      await sendEmail(
        `[Anvil] No workbook produced — ${p.customer_name}${p.company ? ' · ' + p.company : ''}`,
        `Anvil exited cleanly but staged NO .xlsx for project ${p.id}.\nOut dir: ${outDir}\nLogs: ${dir}\nStudio: https://fractionalforge.app/studio/${p.id}\n\nRun manually, then upload in /studio.`
      )
      return true
    }

    // Guarded transition (council #16): only advance if the project is still
    // ours (in_progress). If Tristan moved it meanwhile, record that instead of
    // a misleading in_review event.
    const { data: advanced } = await db
      .from('dossier_projects')
      .update({ status: 'in_review', status_updated_at: new Date().toISOString() })
      .eq('id', p.id)
      .eq('status', 'in_progress')
      .select('id')
    if (!advanced || advanced.length === 0) {
      log(dir, 'chain finished but project had moved off in_progress — output staged, no transition')
      await recordEvent(
        p.id,
        'in_progress',
        'in_progress',
        staged
          ? `Chain finished but project had moved — output staged (${path.basename(staged)}), no transition`
          : 'Chain finished but project had moved — no .xlsx found, no transition'
      )
      await sendEmail(
        `[Anvil] First pass done, project already moved — ${p.customer_name}`,
        `Anvil finished project ${p.id} but its status had already changed, so no transition was applied.\n` +
          (staged ? `Staged output: ${staged}\n` : '') +
          `Studio: https://fractionalforge.app/studio/${p.id}\n`
      )
      return true
    }
    await recordEvent(
      p.id,
      'in_progress',
      'in_review',
      staged ? `Anvil first pass complete — staged ${path.basename(staged)} for review` : 'Anvil first pass complete (no .xlsx found — check out dir)'
    )
    await emailCustomerStatus(p, 'in_review')
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

// Daily run cap (council #2): a backstop on runaway spend/compute even though
// the runner now only claims human-validated briefs. Counts chain runs in a
// rolling 24h window from a small on-disk ledger.
const MAX_RUNS_PER_DAY = Number(process.env.FF_MAX_RUNS_PER_DAY || 20)
const RUN_LEDGER = () => path.join(QUEUE_ROOT, '.run-ledger.json')

function runsInLastDay(now: number): number[] {
  try {
    const raw = JSON.parse(fs.readFileSync(RUN_LEDGER(), 'utf8')) as number[]
    return raw.filter((t) => now - t < 24 * 60 * 60 * 1000)
  } catch {
    return []
  }
}
function recordRun(now: number): void {
  const kept = runsInLastDay(now)
  kept.push(now)
  fs.writeFileSync(RUN_LEDGER(), JSON.stringify(kept))
}

async function main(): Promise<void> {
  const mode = process.argv.includes('--watch') ? 'watch' : 'once'
  fs.mkdirSync(QUEUE_ROOT, { recursive: true })

  const drain = async (): Promise<number> => {
    let n = 0
    for (;;) {
      // Wall clock only for the rolling window; the runner is a long-lived local
      // process, not a resumable workflow, so Date.now is fine.
      const now = Date.now()
      if (runsInLastDay(now).length >= MAX_RUNS_PER_DAY) {
        console.error(`[runner] daily cap reached (${MAX_RUNS_PER_DAY}/24h) — pausing until the window clears`)
        break
      }
      // Record only AFTER a run actually happened (council Grok #B3): no
      // speculative-then-rollback, so a crash mid-poll can't leave a phantom
      // count and an empty poll never consumes budget.
      const didWork = await processOne()
      if (!didWork) break
      recordRun(now)
      n++
    }
    return n
  }

  if (mode === 'once') {
    const n = await drain()
    console.error(`[runner] once: processed ${n} project(s)`)
    return
  }

  console.error(`[runner] watch: polling every ${POLL_MS / 1000}s (queue: ${QUEUE_ROOT})`)
  for (;;) {
    try {
      await drain()
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
