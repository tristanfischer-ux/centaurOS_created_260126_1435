/**
 * src/lib/pdf-engine-v2/lib/investor-section.ts
 *
 * INVESTOR-FIT SECTION builder (2026-06-03) — the Fractional Forge lead-gen
 * appendix, as a chain-callable library. Given the brief text it returns the
 * 5-investor section data (or null on any failure — the renderer skips it):
 *   1. LLM-extract the brief's investment signals (sectors / geo / stage / one-liner),
 *   2. match against the Forge Capital investor DB (~/.forge-capital/forge-capital.db —
 *      14k+ investors; NOT corrupted.db, which is malformed on a full scan),
 *   3. LLM-pick the 5 strongest fits + write why-them / why-you / how-to-pitch
 *      GROUNDED in each firm's real thesis (frame, never fabricate).
 *
 * Fail-safe by construction: any error (DB missing/corrupt, LLM error, no match)
 * returns null so a dossier renders unchanged. The standalone HTML generator lives
 * at scripts/generate-investor-section.tsx; this is the in-chain version. British spelling.
 */

import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'
import { callFastExtract, GEMINI_3_1_FLASH_LITE } from './openrouter-models'

export interface InvestorPick {
  firm: string
  stage?: string
  fit?: string
  why_them: string
  why_you: string
  how_to_pitch: string
}
export interface InvestorSection {
  one_liner: string
  candidate_count: number
  picks: InvestorPick[]
}

function parseLooseJson(raw: string): any {
  if (!raw) return null
  const s = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const a = s.indexOf('{')
  const aa = s.indexOf('[')
  const start = aa !== -1 && (a === -1 || aa < a) ? aa : a
  const end = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'))
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(s.slice(start, end + 1))
  } catch {
    return null
  }
}

interface Candidate {
  firm_name: string
  thesis_summary: string | null
  thesis_deep: string | null
  stage_focus: string | null
}

export async function buildInvestorSection(
  briefText: string,
  opts: { dbPath?: string; log?: (l: string) => void } = {},
): Promise<InvestorSection | null> {
  const log = opts.log ?? ((l: string) => console.error(l))
  const dbPath = opts.dbPath ?? resolve(homedir(), '.forge-capital', 'forge-capital.db')
  if (!existsSync(dbPath)) {
    log('[investor-section] no Forge Capital DB — skipping')
    return null
  }
  const brief = String(briefText ?? '').slice(0, 4000)

  try {
    // 1. signals
    const sigRaw = await callFastExtract(
      `Brief:\n${brief}\n\nReturn STRICT JSON: {"sectors": [3-6 lowercase investor-sector keywords e.g. "climate","carbon","cleantech","deep tech","hardware","energy","space","medtech"], "geo": "UK|Europe|US|Global", "stage": "pre-seed|seed|series a|growth", "one_liner": "one sentence describing the venture for an investor"}`,
      { model: GEMINI_3_1_FLASH_LITE, systemPrompt: 'You extract venture-investment signals from a hardware product brief. Strict JSON only.', maxTokens: 500, timeoutMs: 60_000 },
    ).catch(() => '')
    const sig = parseLooseJson(sigRaw) ?? {}
    const sectors: string[] = Array.isArray(sig.sectors) && sig.sectors.length
      ? sig.sectors.map((s: any) => String(s).toLowerCase()).slice(0, 6)
      : ['deep tech', 'hardware']
    const oneLiner: string = String(sig.one_liner ?? brief.slice(0, 200))

    // 2. match
    const db = new Database(dbPath, { readonly: true })
    db.pragma('busy_timeout = 3000')
    const likeClauses = sectors.map(() => `LOWER(COALESCE(sector_focus,'')||COALESCE(sector_canonical,'')||COALESCE(thesis_summary,'')) LIKE ?`).join(' OR ')
    let rows: Candidate[] = []
    try {
      rows = db.prepare(
        `SELECT firm_name, thesis_summary, thesis_deep, stage_focus
         FROM investors
         WHERE (${likeClauses}) AND COALESCE(thesis_summary,'') != '' AND firm_name IS NOT NULL
         ORDER BY COALESCE(thesis_accuracy,0) DESC, COALESCE(synthesis_confidence,0) DESC
         LIMIT 18`,
      ).all(...sectors.map((s) => `%${s}%`)) as Candidate[]
    } finally {
      try { db.close() } catch { /* no-op */ }
    }
    if (rows.length === 0) {
      log('[investor-section] no investor matches — skipping')
      return null
    }

    // 3. pick 5 + why/pitch (grounded)
    const candBlock = rows.map((r, i) => `${i + 1}. ${r.firm_name} | stage: ${r.stage_focus ?? '?'} | thesis: ${(r.thesis_summary ?? r.thesis_deep ?? '').slice(0, 280)}`).join('\n')
    const pickRaw = await callFastExtract(
      `Venture (the founder raising): ${oneLiner}\n\nCandidate investors (firm | stage | their real thesis):\n${candBlock}\n\nPick the FIVE strongest-fit firms for THIS venture. For each, write three short, specific lines GROUNDED IN THEIR STATED THESIS (do not invent preferences): why_them (their thesis fit), why_you (the specific angle of this venture that fits), how_to_pitch (the framing this firm responds to). Return STRICT JSON: {"picks":[{"firm","stage","fit":"strong|good","why_them","why_you","how_to_pitch"}]}`,
      { model: GEMINI_3_1_FLASH_LITE, systemPrompt: 'You are a venture-fundraising adviser matching a hardware venture to investors. Ground every line in the firm\'s stated thesis; never fabricate. Strict JSON only.', maxTokens: 2200, timeoutMs: 90_000 },
    ).catch(() => '')
    const parsed = parseLooseJson(pickRaw)
    const picks: InvestorPick[] = ((parsed?.picks ?? parsed ?? []) as InvestorPick[])
      .filter((p) => p && p.firm && p.why_them)
      .slice(0, 5)
    if (picks.length === 0) {
      log('[investor-section] LLM returned no picks — skipping')
      return null
    }

    log(`[investor-section] ${picks.length} investors matched from ${rows.length} candidates: ${picks.map((p) => p.firm).join(', ')}`)
    return { one_liner: oneLiner, candidate_count: rows.length, picks }
  } catch (err) {
    log(`[investor-section] failed (non-fatal): ${(err as Error).message}`)
    return null
  }
}
