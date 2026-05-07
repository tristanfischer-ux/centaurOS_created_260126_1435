/**
 * @file scoring-history.ts — append-only cross-run scoring archive.
 *
 * After every pipeline run, summarise the compound + rubric + council
 * scores and append to ~/Downloads/engine-evidence/scoring-history.jsonl.
 * Also regenerates ~/Downloads/engine-evidence/scoring-dashboard.html with
 * auto-refresh so Tristan can see trends without opening JSON.
 *
 * JSONL schema (one record per run):
 *   {
 *     timestamp: ISO,
 *     projectId: string,
 *     briefLabel: string,        // 'bess' | 'heatpump' | 'farm' | ...
 *     compound: number,          // 0-100 headline
 *     rubric: number,            // 0-100 completeness
 *     councilAvg: number | null, // 1-10 or null
 *     councilScored: number,
 *     councilFailed: number,
 *     sections: Array<{ section, score }>
 *   }
 *
 * No telemetry, no network. Local filesystem only.
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'

const HISTORY_PATH = join(homedir(), 'Downloads/engine-evidence/scoring-history.jsonl')
const DASHBOARD_PATH = join(homedir(), 'Downloads/engine-evidence/scoring-dashboard.html')

export interface ScoringRecord {
  timestamp: string
  projectId: string
  briefLabel: string
  compound: number
  rubric: number
  councilAvg: number | null
  councilScored: number
  councilFailed: number
  sections: Array<{ section: string; score: number }>
}

/**
 * Append one run to the scoring history and regenerate the dashboard.
 * Silently no-ops if the target directory can't be created (e.g. CI).
 */
export function recordScoringRun(record: ScoringRecord): void {
  try {
    const dir = dirname(HISTORY_PATH)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    appendFileSync(HISTORY_PATH, JSON.stringify(record) + '\n')
    regenerateDashboard()
  } catch (err) {
    console.warn(`[scoring-history] write failed:`, (err as Error).message)
  }
}

function loadHistory(): ScoringRecord[] {
  if (!existsSync(HISTORY_PATH)) return []
  try {
    const raw = readFileSync(HISTORY_PATH, 'utf-8')
    return raw
      .split('\n')
      .filter(l => l.trim().length > 0)
      .map(l => { try { return JSON.parse(l) } catch { return null } })
      .filter((r): r is ScoringRecord => r !== null)
  } catch {
    return []
  }
}

/**
 * Build a minimal self-contained HTML dashboard with sparkline-style
 * history per brief. Auto-refreshes every 5 seconds. Light theme.
 */
function regenerateDashboard(): void {
  const history = loadHistory()
  if (history.length === 0) return

  // Group by briefLabel (last 20 runs per label)
  const byBrief = new Map<string, ScoringRecord[]>()
  for (const r of history) {
    const arr = byBrief.get(r.briefLabel) || []
    arr.push(r)
    byBrief.set(r.briefLabel, arr)
  }
  for (const [k, v] of byBrief.entries()) {
    byBrief.set(k, v.slice(-20))
  }

  const briefCards = Array.from(byBrief.entries()).map(([label, runs]) => {
    const latest = runs[runs.length - 1]
    const tileColour = latest.compound >= 70 ? '#16a34a' :
      latest.compound >= 50 ? '#ea580c' : '#dc2626'

    // sparkline of the last N compound scores
    const w = 200
    const h = 40
    const scoresArr = runs.map(r => r.compound)
    const min = Math.min(...scoresArr)
    const max = Math.max(...scoresArr)
    const range = Math.max(1, max - min)
    const points = scoresArr.map((s, i) => {
      const x = (i / Math.max(1, scoresArr.length - 1)) * w
      const y = h - ((s - min) / range) * h
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')

    // section bar chart (latest run)
    const sectionRows = (latest.sections || []).slice(0, 12).map(s => {
      const pct = s.score < 0 ? 0 : (s.score / 10) * 100
      const colour = s.score < 0 ? '#a1a1aa' :
        s.score >= 7 ? '#16a34a' : s.score >= 5 ? '#ea580c' : '#dc2626'
      const label = s.score < 0 ? '— not scored' : `${s.score}/10`
      return `<div class="section-row">
        <div class="section-label">${escapeHtml(s.section)}</div>
        <div class="section-bar-wrap">
          <div class="section-bar" style="width:${pct}%;background:${colour}"></div>
        </div>
        <div class="section-score" style="color:${colour}">${label}</div>
      </div>`
    }).join('')

    const trend = runs.length >= 2
      ? (runs[runs.length - 1].compound - runs[0].compound)
      : 0
    const trendLabel = runs.length >= 2
      ? `${trend >= 0 ? '+' : ''}${trend} vs ${runs.length} runs ago`
      : 'first run'

    return `<div class="card">
      <div class="card-header">
        <h2>${escapeHtml(label)}</h2>
        <div class="big-score" style="background:${tileColour}">${latest.compound}/100</div>
      </div>
      <div class="meta">
        Rubric ${latest.rubric} / 100 · Council ${latest.councilAvg === null ? '—' : latest.councilAvg.toFixed(1) + '/10'}
        · ${latest.councilScored} scored, ${latest.councilFailed} failed
        · ${trendLabel}
      </div>
      <svg class="sparkline" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
        <polyline fill="none" stroke="${tileColour}" stroke-width="2" points="${points}" />
      </svg>
      <div class="sections">${sectionRows}</div>
      <div class="meta">Last run: ${escapeHtml(latest.timestamp)} · project ${escapeHtml(latest.projectId)}</div>
    </div>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="5">
<title>Engine scoring dashboard</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #fafafa; color: #111; margin: 0; padding: 24px; }
  h1 { font-size: 22px; margin: 0 0 12px; }
  .subtitle { color: #6b7280; font-size: 13px; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 16px; }
  .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.03); }
  .card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  .card-header h2 { font-size: 16px; margin: 0; }
  .big-score { color: #fff; font-weight: 700; font-size: 16px; padding: 4px 10px; border-radius: 4px; }
  .meta { color: #6b7280; font-size: 11px; margin: 6px 0; }
  .sparkline { width: 100%; height: 40px; margin: 8px 0; background: #f9fafb; border-radius: 4px; }
  .sections { margin-top: 12px; }
  .section-row { display: grid; grid-template-columns: 90px 1fr 90px; gap: 8px; align-items: center; margin-bottom: 3px; font-size: 11px; }
  .section-label { font-weight: 600; color: #1f2937; }
  .section-bar-wrap { background: #f3f4f6; height: 10px; border-radius: 5px; overflow: hidden; }
  .section-bar { height: 10px; transition: width 0.3s; }
  .section-score { text-align: right; font-weight: 600; font-size: 11px; }
  .refresh-pill { position: fixed; top: 16px; right: 24px; background: #ffedd5; color: #9a3412; font-size: 11px; padding: 4px 10px; border-radius: 12px; }
</style>
</head>
<body>
<div class="refresh-pill">↻ Auto-refresh every 5s</div>
<h1>ForgeOS engine — scoring dashboard</h1>
<p class="subtitle">Compound score combines rubric completeness (40%) with council quality average (60%). Council sections that failed to score render as "— not scored" and are excluded from the average. History: last 20 runs per brief.</p>
<div class="grid">${briefCards}</div>
<div class="meta">Generated ${new Date().toISOString()} · data: ${escapeHtml(HISTORY_PATH)}</div>
</body>
</html>`

  try {
    writeFileSync(DASHBOARD_PATH, html)
  } catch (err) {
    console.warn(`[scoring-history] dashboard write failed:`, (err as Error).message)
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  } as Record<string, string>)[ch] || ch)
}

/**
 * Helper: derive a short briefLabel from projectId so multiple runs of
 * the same brief group together in the dashboard.
 */
export function deriveBriefLabel(projectId: string): string {
  const lower = (projectId || '').toLowerCase()
  if (lower.includes('battery') || lower.includes('bess')) return 'bess'
  if (lower.includes('heat_pump') || lower.includes('heatpump') || lower.includes('r290')) return 'heatpump'
  if (lower.includes('farm') || lower.includes('horticultur') || lower.includes('leafy')) return 'farm'
  if (lower.includes('haps') || lower.includes('stratospheric')) return 'haps'
  // Fallback: first 3 words
  return lower.split('_').slice(0, 3).join('_') || 'unknown'
}
