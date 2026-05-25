/**
 * @file scripts/lib/ingest-replay.ts — Write-back failure recovery log.
 *
 * ARCHITECTURE: This module is for use in scripts/ingest/* jobs ONLY.
 * Chain-side code must never import from ingest-replay.ts.
 *
 * When a live distributor API call succeeds but the subsequent DB write-back
 * fails (e.g. SQLite locked by another ingest job, disk full, concurrent WAL
 * writer), the API response would normally be lost — the quota was spent but
 * the data never reached forge-truth.db. This module closes that gap.
 *
 * Behaviour:
 *   - On API success + writeBack failure → appends a JSONL record to
 *     ~/.forge-truth/ingest-replay.jsonl for later retry.
 *   - On API failure → logs to stderr, returns null. No replay (nothing to save).
 *   - Replay JSONL entries are idempotent: writeBack uses INSERT OR IGNORE /
 *     ON CONFLICT DO NOTHING so re-running the file is safe.
 *
 * The replay log is append-only. A separate CLI (scripts/ingest/replay-ingest.ts)
 * consumes it — currently a stub, to be implemented when operationally needed.
 *
 * British spelling throughout.
 */

import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

const REPLAY_LOG_PATH = resolve(homedir(), '.forge-truth', 'ingest-replay.jsonl')

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReplayLogEntry {
  /** Which ingest source made the API call ('mouser', 'digikey', 'farnell', etc.). */
  source: string
  /** The manufacturer part number that was looked up. */
  mpn: string
  /** The raw API response that failed to write to DB. */
  response: unknown
  /** ISO timestamp of the original API call. */
  ts: string
  /** The error message from the failed writeBack call. */
  error: string
}

// ── Core helper ───────────────────────────────────────────────────────────────

function appendReplayLog(entry: ReplayLogEntry): void {
  try {
    const dir = resolve(homedir(), '.forge-truth')
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    appendFileSync(REPLAY_LOG_PATH, JSON.stringify(entry) + '\n', 'utf-8')
  } catch (logErr) {
    // If we can't write the replay log either, just warn — never throw from
    // error-recovery code.
    console.warn(
      `[ingest-replay] could not append to ${REPLAY_LOG_PATH}: ${(logErr as Error).message}`,
    )
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Wraps a live API call + DB write-back so failures are recoverable.
 *
 * @param source    - Which distributor/ingest source ('mouser', 'digikey', etc.)
 * @param mpn       - Manufacturer part number being looked up.
 * @param fn        - The live API call to make. Should return a result T.
 * @param writeBack - Persists the result to DB. If this throws, the result is
 *                    logged to ingest-replay.jsonl for later retry.
 * @returns         - The API result T, or null if the API call itself failed.
 */
export async function withReplayLog<T>(
  source: string,
  mpn: string,
  fn: () => Promise<T>,
  writeBack: (result: T) => void,
): Promise<T | null> {
  let result: T
  try {
    result = await fn()
  } catch (apiErr) {
    console.error(
      `[ingest-replay] API call failed for ${source}:${mpn}: ${(apiErr as Error).message}`,
    )
    return null
  }

  try {
    writeBack(result)
  } catch (dbErr) {
    const entry: ReplayLogEntry = {
      source,
      mpn,
      response: result,
      ts: new Date().toISOString(),
      error: (dbErr as Error).message,
    }
    appendReplayLog(entry)
    console.warn(
      `[ingest-replay] writeBack failed for ${source}:${mpn} — logged to ${REPLAY_LOG_PATH}`,
    )
  }

  return result
}
