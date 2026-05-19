/**
 * @file rate-limit.ts — Per-provider token bucket with daily caps.
 *
 * Tristan directive 2026-05-16: be strategic about which provider gets
 * queried for which part. Each provider has hard per-minute and per-day
 * limits; tripping them costs us errors and adds latency. The scheduler
 * acquires N tokens before firing a batch — if the bucket is empty, it
 * waits until the bucket refills.
 *
 * Daily counts persist to ~/.forgeos/rate-limits.json so a script restart
 * doesn't reset the count and accidentally over-consume a daily cap.
 *
 * Reset window: per-minute buckets reset every 60s rolling; per-day caps
 * reset at midnight UTC (the next reset is computed from `now()` each call).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { homedir } from 'os'

export const STATE_PATH = resolve(homedir(), '.forgeos', 'rate-limits.json')

export interface ProviderConfig {
  /** Per-minute cap (rolling 60s window). */
  per_minute: number
  /** Per-day cap (resets midnight UTC). 0 = unlimited. */
  per_day: number
  /** Soft cap as fraction of per_day where the scheduler starts to throttle
   * harder (e.g. 0.9 = pause if 90% of daily used). Set to 1.0 to disable. */
  soft_cap_fraction: number
}

// Defaults — adjust per provider's published limits.
export const PROVIDER_LIMITS: Record<string, ProviderConfig> = {
  mouser:  { per_minute: 30,  per_day: 1000,  soft_cap_fraction: 0.9 },
  digikey: { per_minute: 240, per_day: 1000,  soft_cap_fraction: 0.9 },
  farnell: { per_minute: 60,  per_day: 0,     soft_cap_fraction: 1.0 },
  brave:   { per_minute: 60,  per_day: 0,     soft_cap_fraction: 1.0 },  // 2000/month — track separately
  tavily:  { per_minute: 60,  per_day: 0,     soft_cap_fraction: 1.0 },
  gemini:  { per_minute: 60,  per_day: 1000,  soft_cap_fraction: 0.9 },
  // openrouter LLM judge calls — high limit, separate provider
  openrouter: { per_minute: 100, per_day: 0, soft_cap_fraction: 1.0 },
}

interface BucketState {
  /** Timestamps of recent acquires, kept only when within the 60s window. */
  recent_acquires_ms: number[]
  /** UTC day string (YYYY-MM-DD) we're counting against. */
  day_utc: string
  /** Acquire count today. */
  count_today: number
}

class TokenBucket {
  private state: BucketState
  constructor(public provider: string, public config: ProviderConfig, state?: BucketState) {
    this.state = state ?? {
      recent_acquires_ms: [],
      day_utc: utcDayString(new Date()),
      count_today: 0,
    }
  }

  private rollDay(): void {
    const today = utcDayString(new Date())
    if (today !== this.state.day_utc) {
      this.state.day_utc = today
      this.state.count_today = 0
    }
  }

  private gcMinute(): void {
    const cutoff = Date.now() - 60_000
    this.state.recent_acquires_ms = this.state.recent_acquires_ms.filter(t => t >= cutoff)
  }

  /** Available tokens RIGHT NOW (does not wait). */
  availableNow(): { perMinute: number; remainingDaily: number } {
    this.rollDay()
    this.gcMinute()
    const perMinute = Math.max(0, this.config.per_minute - this.state.recent_acquires_ms.length)
    const remainingDaily = this.config.per_day === 0
      ? Number.POSITIVE_INFINITY
      : Math.max(0, this.config.per_day - this.state.count_today)
    return { perMinute, remainingDaily }
  }

  /** Are we under the soft cap? Returns true if usage < soft_cap × per_day. */
  underSoftCap(): boolean {
    this.rollDay()
    if (this.config.per_day === 0) return true
    return this.state.count_today < this.config.per_day * this.config.soft_cap_fraction
  }

  /**
   * Acquire `n` tokens. Waits if necessary until the per-minute window has
   * room. Returns the timestamps acquired (for accounting). Throws if the
   * daily cap is exhausted.
   */
  async acquire(n: number): Promise<number[]> {
    this.rollDay()
    if (this.config.per_day > 0 && this.state.count_today + n > this.config.per_day) {
      throw new Error(`[rate-limit] ${this.provider} daily cap (${this.config.per_day}) exhausted: ${this.state.count_today} used today, ${n} requested`)
    }
    const acquired: number[] = []
    while (acquired.length < n) {
      this.gcMinute()
      const room = this.config.per_minute - this.state.recent_acquires_ms.length
      if (room <= 0) {
        // Sleep until the oldest token expires (or 1s, whichever sooner).
        const oldest = this.state.recent_acquires_ms[0]
        const sleepMs = oldest !== undefined ? Math.max(50, (oldest + 60_000) - Date.now()) : 1000
        await sleep(Math.min(sleepMs, 1000))
        continue
      }
      const grab = Math.min(room, n - acquired.length)
      const now = Date.now()
      for (let i = 0; i < grab; i++) {
        this.state.recent_acquires_ms.push(now + i)
        acquired.push(now + i)
      }
      this.state.count_today += grab
    }
    return acquired
  }

  /** Release tokens (failed call doesn't deplete daily cap). */
  release(n: number): void {
    this.state.count_today = Math.max(0, this.state.count_today - n)
    this.state.recent_acquires_ms = this.state.recent_acquires_ms.slice(0, Math.max(0, this.state.recent_acquires_ms.length - n))
  }

  /** Get the persistable state. */
  getState(): BucketState {
    return { ...this.state }
  }
}

function utcDayString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

// ─── Persistence ────────────────────────────────────────────────────────────

interface PersistedState {
  buckets: Record<string, BucketState>
  written_at: string
}

function loadPersistedState(): Record<string, BucketState> {
  try {
    if (!existsSync(STATE_PATH)) return {}
    const raw = readFileSync(STATE_PATH, 'utf8')
    const parsed = JSON.parse(raw) as PersistedState
    // Drop any buckets from a different UTC day — fresh start.
    const today = utcDayString(new Date())
    const out: Record<string, BucketState> = {}
    for (const [k, v] of Object.entries(parsed.buckets || {})) {
      if (v.day_utc === today) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function savePersistedState(buckets: Record<string, BucketState>): void {
  try {
    mkdirSync(dirname(STATE_PATH), { recursive: true })
    const persisted: PersistedState = { buckets, written_at: new Date().toISOString() }
    writeFileSync(STATE_PATH, JSON.stringify(persisted, null, 2))
  } catch {
    // Best-effort — failure to persist is non-fatal.
  }
}

// ─── Scheduler — singleton, holds all provider buckets ─────────────────────

class RateLimitScheduler {
  private buckets = new Map<string, TokenBucket>()

  constructor() {
    const persisted = loadPersistedState()
    for (const [provider, config] of Object.entries(PROVIDER_LIMITS)) {
      this.buckets.set(provider, new TokenBucket(provider, config, persisted[provider]))
    }
  }

  get(provider: string): TokenBucket {
    let b = this.buckets.get(provider)
    if (!b) {
      // Unknown provider — assume modest defaults (60/min, no daily cap).
      b = new TokenBucket(provider, { per_minute: 60, per_day: 0, soft_cap_fraction: 1.0 })
      this.buckets.set(provider, b)
    }
    return b
  }

  /**
   * Acquire N tokens for a provider, blocking until available. Persists
   * state to disk after acquire so restart respects daily caps.
   */
  async acquire(provider: string, n: number = 1): Promise<void> {
    await this.get(provider).acquire(n)
    this.persist()
  }

  release(provider: string, n: number): void {
    this.get(provider).release(n)
    this.persist()
  }

  /** Convenient summary for logs. */
  status(): Record<string, { used_today: number; daily_cap: number | 'unlimited'; per_min_room_now: number }> {
    const out: Record<string, any> = {}
    for (const [provider, b] of this.buckets) {
      const avail = b.availableNow()
      out[provider] = {
        used_today: (b as any).state.count_today,
        daily_cap: b.config.per_day === 0 ? 'unlimited' : b.config.per_day,
        per_min_room_now: avail.perMinute,
      }
    }
    return out
  }

  private persist(): void {
    const snapshot: Record<string, BucketState> = {}
    for (const [k, b] of this.buckets) snapshot[k] = b.getState()
    savePersistedState(snapshot)
  }
}

let _scheduler: RateLimitScheduler | null = null

export function getScheduler(): RateLimitScheduler {
  if (!_scheduler) _scheduler = new RateLimitScheduler()
  return _scheduler
}

/**
 * Convenience wrapper: acquire(provider, n) → fn() → release on failure.
 * Logs nothing — caller adds telemetry.
 */
export async function withRateLimit<T>(provider: string, fn: () => Promise<T>, tokens: number = 1): Promise<T> {
  const sched = getScheduler()
  await sched.acquire(provider, tokens)
  try {
    return await fn()
  } catch (e) {
    // Failed call — refund the tokens so we don't waste a daily budget on errors.
    sched.release(provider, tokens)
    throw e
  }
}
