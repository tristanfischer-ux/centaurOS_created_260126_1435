/**
 * @file scripts/ingest/replay-ingest.ts — Consume the ingest-replay.jsonl log.
 *
 * STUB — currently logs the replay file entries and exits without re-writing.
 * Implement the body of replayEntry() when operationally needed.
 *
 * The replay log (~/.forge-truth/ingest-replay.jsonl) is populated by
 * scripts/lib/ingest-replay.ts when an ingest API call succeeds but the
 * DB write-back fails. Each line is a JSON object:
 *   { source, mpn, response, ts, error }
 *
 * Usage:
 *   npx tsx scripts/ingest/replay-ingest.ts [--dry-run]
 *
 * British spelling throughout.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'
import type { ReplayLogEntry } from '../lib/ingest-replay'

const REPLAY_LOG_PATH = resolve(homedir(), '.forge-truth', 'ingest-replay.jsonl')

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')

  if (!existsSync(REPLAY_LOG_PATH)) {
    console.log(`[replay-ingest] No replay log found at ${REPLAY_LOG_PATH}. Nothing to replay.`)
    return
  }

  const raw = readFileSync(REPLAY_LOG_PATH, 'utf-8')
  const lines = raw.split('\n').filter((l) => l.trim().length > 0)

  if (lines.length === 0) {
    console.log('[replay-ingest] Replay log is empty. Nothing to do.')
    return
  }

  console.log(`[replay-ingest] Found ${lines.length} entries to replay.`)
  if (dryRun) console.log('[replay-ingest] DRY_RUN mode — will not write to DB.')

  let success = 0
  let failed = 0
  const remaining: string[] = []

  for (const line of lines) {
    let entry: ReplayLogEntry
    try {
      entry = JSON.parse(line) as ReplayLogEntry
    } catch {
      console.warn(`[replay-ingest] Skipping malformed line: ${line.slice(0, 80)}`)
      remaining.push(line)
      continue
    }

    console.log(`[replay-ingest] Entry: source=${entry.source} mpn=${entry.mpn} ts=${entry.ts}`)

    if (dryRun) {
      success += 1
      continue
    }

    // TODO: Implement actual DB write-back here.
    // Example pattern when implemented:
    //   import { recordDistributorHit } from '../../src/lib/pdf-engine-v2/lib/distributors/library-writeback'
    //   import { setCached } from '../../src/lib/pdf-engine-v2/lib/distributors/cascade-cache'
    //   try {
    //     recordDistributorHit(entry.response as DistributorResult)
    //     setCached(entry.response.manufacturer, entry.mpn, entry.source, entry.response)
    //     success += 1
    //   } catch (err) {
    //     console.warn(`[replay-ingest] Re-write failed for ${entry.mpn}: ${(err as Error).message}`)
    //     remaining.push(line)
    //     failed += 1
    //   }
    console.warn(`[replay-ingest] STUB: write-back not yet implemented for ${entry.mpn}. Retaining in replay log.`)
    remaining.push(line)
    failed += 1
  }

  // Rewrite the replay log with only entries that still need replay
  if (!dryRun && remaining.length < lines.length) {
    writeFileSync(REPLAY_LOG_PATH, remaining.join('\n') + (remaining.length > 0 ? '\n' : ''), 'utf-8')
    console.log(`[replay-ingest] Rewrote replay log: ${lines.length - remaining.length} entries cleared, ${remaining.length} remaining.`)
  }

  console.log(`[replay-ingest] Done. success=${success}, failed/retained=${failed}.`)
}

main().catch((err) => {
  console.error(`[replay-ingest] fatal error: ${(err as Error).message}`)
  process.exit(1)
})
