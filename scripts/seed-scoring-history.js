#!/usr/bin/env node
/**
 * Seed ~/Downloads/engine-evidence/scoring-history.jsonl from existing
 * qa-scores.json files. Computes compound + rubric from known values,
 * assumes rubric=97 for BESS / 96 HP / 95 farm (documented in NOTES.md).
 *
 * Not a long-term utility — one-off hydration so the dashboard has
 * history visible immediately.
 */
const fs = require('fs')
const path = require('path')
const os = require('os')

const HISTORY_PATH = path.join(os.homedir(), 'Downloads/engine-evidence/scoring-history.jsonl')
const evidenceRoot = path.join(os.homedir(), 'Downloads/engine-evidence')

// Known rubric scores per brief from the 2026-05-07 all-items-shipped run
// (documented in ~/Downloads/engine-evidence/all-items-shipped/NOTES.md)
const knownRubric = {
  bess: 97,
  heatpump: 96,
  farm: 95,
}

function deriveBriefLabel(projectId) {
  const lower = (projectId || '').toLowerCase()
  if (lower.includes('battery') || lower.includes('bess')) return 'bess'
  if (lower.includes('heat_pump') || lower.includes('heatpump') || lower.includes('r290') || lower.includes('hydronic')) return 'heatpump'
  if (lower.includes('farm') || lower.includes('horticultur') || lower.includes('leafy') || lower.includes('greens')) return 'farm'
  return lower.split('_').slice(0, 3).join('_') || 'unknown'
}

function seedOne(qaPath, mtime) {
  const raw = fs.readFileSync(qaPath, 'utf-8')
  const qa = JSON.parse(raw)
  const label = deriveBriefLabel(qa.projectId)
  const sections = (qa.scores || []).map(s => ({ section: s.section, score: s.score }))
  const scored = sections.filter(s => s.score >= 0)
  const failed = sections.length - scored.length
  const councilAvg = scored.length > 0
    ? scored.reduce((a, b) => a + b.score, 0) / scored.length
    : null
  const rubric = knownRubric[label] || 90
  const compound = councilAvg === null
    ? rubric
    : Math.round(rubric * 0.4 + councilAvg * 10 * 0.6)

  return {
    timestamp: mtime.toISOString(),
    projectId: qa.projectId || 'unknown',
    briefLabel: label,
    compound,
    rubric,
    councilAvg,
    councilScored: scored.length,
    councilFailed: failed,
    sections,
  }
}

// Collect all qa-scores files under evidenceRoot
const records = []
function walk(dir) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.name === 'qa-scores.json') {
      const stat = fs.statSync(full)
      try {
        const rec = seedOne(full, stat.mtime)
        records.push(rec)
      } catch (err) {
        console.warn(`skip ${full}: ${err.message}`)
      }
    }
  }
}
walk(evidenceRoot)

records.sort((a, b) => a.timestamp.localeCompare(b.timestamp))

// Write JSONL
fs.writeFileSync(HISTORY_PATH, records.map(r => JSON.stringify(r)).join('\n') + '\n')
console.log(`Wrote ${records.length} records to ${HISTORY_PATH}`)

// Generate the dashboard inline (don't import the TS module from a node script)
function regenerateDashboard() {
  const history = records
  const byBrief = new Map()
  for (const r of history) {
    const arr = byBrief.get(r.briefLabel) || []
    arr.push(r)
    byBrief.set(r.briefLabel, arr)
  }
  for (const [k, v] of byBrief.entries()) {
    byBrief.set(k, v.slice(-20))
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch] || ch)
  }

  const briefCards = Array.from(byBrief.entries()).map(([label, runs]) => {
    const latest = runs[runs.length - 1]
    const tileColour = latest.compound >= 70 ? '#16a34a' :
      latest.compound >= 50 ? '#ea580c' : '#dc2626'

    const w = 200, h = 40
    const scoresArr = runs.map(r => r.compound)
    const min = Math.min(...scoresArr)
    const max = Math.max(...scoresArr)
    const range = Math.max(1, max - min)
    const points = scoresArr.map((s, i) => {
      const x = (i / Math.max(1, scoresArr.length - 1)) * w
      const y = h - ((s - min) / range) * h
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')

    const sectionRows = (latest.sections || []).slice(0, 12).map(s => {
      const pct = s.score < 0 ? 0 : (s.score / 10) * 100
      const colour = s.score < 0 ? '#a1a1aa' :
        s.score >= 7 ? '#16a34a' : s.score >= 5 ? '#ea580c' : '#dc2626'
      const lab = s.score < 0 ? '— not scored' : `${s.score}/10`
      return `<div class="section-row">
        <div class="section-label">${escapeHtml(s.section)}</div>
        <div class="section-bar-wrap"><div class="section-bar" style="width:${pct}%;background:${colour}"></div></div>
        <div class="section-score" style="color:${colour}">${lab}</div>
      </div>`
    }).join('')

    const trend = runs.length >= 2 ? (runs[runs.length-1].compound - runs[0].compound) : 0
    const trendLabel = runs.length >= 2 ? `${trend >= 0 ? '+' : ''}${trend} vs ${runs.length} runs ago` : 'first run'

    return `<div class="card">
      <div class="card-header">
        <h2>${escapeHtml(label)}</h2>
        <div class="big-score" style="background:${tileColour}">${latest.compound}/100</div>
      </div>
      <div class="meta">Rubric ${latest.rubric} / 100 · Council ${latest.councilAvg === null ? '—' : latest.councilAvg.toFixed(1) + '/10'} · ${latest.councilScored} scored, ${latest.councilFailed} failed · ${trendLabel}</div>
      <svg class="sparkline" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><polyline fill="none" stroke="${tileColour}" stroke-width="2" points="${points}"/></svg>
      <div class="sections">${sectionRows}</div>
      <div class="meta">Last run: ${escapeHtml(latest.timestamp)} · project ${escapeHtml(latest.projectId)}</div>
    </div>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="en-GB"><head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="5">
<title>Engine scoring dashboard</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fafafa;color:#111;margin:0;padding:24px}
h1{font-size:22px;margin:0 0 12px}
.subtitle{color:#6b7280;font-size:13px;margin-bottom:24px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:16px}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:16px;box-shadow:0 1px 2px rgba(0,0,0,0.03)}
.card-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
.card-header h2{font-size:16px;margin:0}
.big-score{color:#fff;font-weight:700;font-size:16px;padding:4px 10px;border-radius:4px}
.meta{color:#6b7280;font-size:11px;margin:6px 0}
.sparkline{width:100%;height:40px;margin:8px 0;background:#f9fafb;border-radius:4px}
.sections{margin-top:12px}
.section-row{display:grid;grid-template-columns:90px 1fr 90px;gap:8px;align-items:center;margin-bottom:3px;font-size:11px}
.section-label{font-weight:600;color:#1f2937}
.section-bar-wrap{background:#f3f4f6;height:10px;border-radius:5px;overflow:hidden}
.section-bar{height:10px;transition:width 0.3s}
.section-score{text-align:right;font-weight:600;font-size:11px}
.refresh-pill{position:fixed;top:16px;right:24px;background:#ffedd5;color:#9a3412;font-size:11px;padding:4px 10px;border-radius:12px}
</style></head>
<body>
<div class="refresh-pill">↻ Auto-refresh every 5s</div>
<h1>ForgeOS engine — scoring dashboard</h1>
<p class="subtitle">Compound score combines rubric completeness (40%) with council quality average (60%). Council sections that failed to score render as "— not scored" and are excluded from the average. History: last 20 runs per brief.</p>
<div class="grid">${briefCards}</div>
<div class="meta">Generated ${new Date().toISOString()} · data: ${escapeHtml(HISTORY_PATH)}</div>
</body></html>`
  const dashboardPath = path.join(os.homedir(), 'Downloads/engine-evidence/scoring-dashboard.html')
  fs.writeFileSync(dashboardPath, html)
  console.log(`Wrote dashboard: ${dashboardPath}`)
}
regenerateDashboard()
