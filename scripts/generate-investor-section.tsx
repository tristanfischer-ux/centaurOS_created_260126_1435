/**
 * scripts/generate-investor-section.tsx
 *
 * INVESTOR-FIT SECTION generator (2026-06-03) — the Fractional Forge lead-gen
 * appendix for a dossier. Given a brief, it:
 *   1. LLM-extracts the investment signals (sectors, geography, stage, one-liner),
 *   2. matches them against the Forge Capital investor DB (~/.forge-capital/
 *      forge-capital.db — NOT corrupted.db, which is malformed on a full scan;
 *      14k+ investors with thesis_summary / sector_focus / stage_focus / geo_focus),
 *   3. LLM-picks the 5 strongest-fit firms and writes why-them / why-you /
 *      how-to-pitch GROUNDED in each firm's real thesis (it frames; it does not
 *      fabricate preferences),
 *   4. renders the "Potential Investors" section HTML (the signed-off mockup
 *      format: firm named, partner withheld, Fractional Forge upsell CTA).
 *
 * This is the standalone generator; the in-PDF render-section integration is the
 * next step. British spelling.
 *
 *   npx tsx scripts/generate-investor-section.tsx <brief.md> [out.html]
 */
import Database from 'better-sqlite3'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'
import { callFastExtract, GEMINI_3_1_FLASH_LITE } from '../src/lib/pdf-engine-v2/lib/openrouter-models'

function parseLooseJson(raw: string): any {
  if (!raw) return null
  let s = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const a = s.indexOf('{'); const aa = s.indexOf('[')
  const start = aa !== -1 && (a === -1 || aa < a) ? aa : a
  const end = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'))
  if (start === -1 || end <= start) return null
  try { return JSON.parse(s.slice(start, end + 1)) } catch { return null }
}

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

interface Candidate { firm_name: string; thesis_summary: string | null; thesis_deep: string | null; stage_focus: string | null; sector_focus: string | null; geo_focus: string | null }
interface Pick { firm: string; stage?: string; fit?: string; why_them: string; why_you: string; how_to_pitch: string }

async function main(): Promise<void> {
  const briefPath = process.argv[2]
  if (!briefPath || !existsSync(briefPath)) { console.error('usage: generate-investor-section.tsx <brief.md> [out.html]'); process.exit(2) }
  const brief = readFileSync(briefPath, 'utf-8').slice(0, 4000)
  const outPath = process.argv[3] || resolve('out', `investor-section-${briefPath.split('/').pop()?.replace(/\.md$/, '') ?? 'brief'}.html`)

  // 1. Extract investment signals from the brief.
  console.error('[investor] extracting investment signals…')
  const sigRaw = await callFastExtract(
    `Brief:\n${brief}\n\nReturn STRICT JSON: {"sectors": [3-6 lowercase investor-sector keywords e.g. "climate","carbon","cleantech","deep tech","hardware","energy"], "geo": "UK|Europe|US|Global", "stage": "pre-seed|seed|series a|growth", "one_liner": "one sentence describing the venture for an investor"}`,
    { model: GEMINI_3_1_FLASH_LITE, systemPrompt: 'You extract venture-investment signals from a hardware product brief. Strict JSON only.', maxTokens: 500, timeoutMs: 60_000 },
  ).catch(() => '')
  const sig = parseLooseJson(sigRaw) ?? {}
  const sectors: string[] = Array.isArray(sig.sectors) && sig.sectors.length ? sig.sectors.map((s: any) => String(s).toLowerCase()) : ['deep tech', 'hardware']
  const oneLiner: string = String(sig.one_liner ?? brief.slice(0, 200))
  console.error(`[investor] sectors=${JSON.stringify(sectors)} geo=${sig.geo} stage=${sig.stage}`)

  // 2. Match against the Forge Capital investor DB.
  const dbPath = resolve(homedir(), '.forge-capital', 'forge-capital.db')
  const db = new Database(dbPath, { readonly: true })
  db.pragma('busy_timeout = 3000')
  const likeClauses = sectors.map(() => `LOWER(COALESCE(sector_focus,'')||COALESCE(sector_canonical,'')||COALESCE(thesis_summary,'')) LIKE ?`).join(' OR ')
  const rows = db.prepare(
    `SELECT firm_name, thesis_summary, thesis_deep, stage_focus, sector_focus, geo_focus
     FROM investors
     WHERE (${likeClauses}) AND COALESCE(thesis_summary,'') != '' AND firm_name IS NOT NULL
     ORDER BY COALESCE(thesis_accuracy,0) DESC, COALESCE(synthesis_confidence,0) DESC
     LIMIT 18`,
  ).all(...sectors.map((s) => `%${s}%`)) as Candidate[]
  db.close()
  console.error(`[investor] ${rows.length} candidate firms from forge-capital.db`)
  if (rows.length === 0) { console.error('[investor] no matches — broaden the sector keywords'); process.exit(1) }

  // 3. LLM picks the 5 strongest fits + writes why/pitch grounded in the real thesis.
  console.error('[investor] selecting top 5 + writing why/pitch…')
  const candBlock = rows.map((r, i) => `${i + 1}. ${r.firm_name} | stage: ${r.stage_focus ?? '?'} | thesis: ${(r.thesis_summary ?? r.thesis_deep ?? '').slice(0, 280)}`).join('\n')
  const pickRaw = await callFastExtract(
    `Venture (the founder raising): ${oneLiner}\n\nCandidate investors (firm | stage | their real thesis):\n${candBlock}\n\nPick the FIVE strongest-fit firms for THIS venture. For each, write three short, specific lines GROUNDED IN THEIR STATED THESIS (do not invent preferences): why_them (their thesis fit), why_you (the specific angle of this venture that fits), how_to_pitch (the framing this firm responds to). Return STRICT JSON: {"picks":[{"firm","stage","fit":"strong|good","why_them","why_you","how_to_pitch"}]}`,
    { model: GEMINI_3_1_FLASH_LITE, systemPrompt: 'You are a venture-fundraising adviser matching a hardware venture to investors. Ground every line in the firm\'s stated thesis; never fabricate. Strict JSON only.', maxTokens: 2200, timeoutMs: 90_000 },
  ).catch(() => '')
  const parsed = parseLooseJson(pickRaw)
  const picks: Pick[] = (parsed?.picks ?? parsed ?? []).slice(0, 5)
  if (picks.length === 0) { console.error('[investor] LLM returned no picks'); process.exit(1) }

  // 4. Render the section HTML (signed-off mockup format).
  const cards = picks.map((p) => `
    <div class="card">
      <div class="card-top"><div class="firm">${esc(p.firm)} <span class="locked">· partner withheld</span></div><span class="fit">Thesis fit: ${esc(p.fit ?? 'good')}</span></div>
      <div class="row"><div class="lab">Why them</div><div class="val">${esc(p.why_them)}</div></div>
      <div class="row"><div class="lab">Why you</div><div class="val">${esc(p.why_you)}</div></div>
      <div class="row"><div class="lab">How to pitch</div><div class="val">${esc(p.how_to_pitch)}</div></div>
    </div>`).join('')
  const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>Potential Investors</title>
<style>:root{--ink:#1a2230;--muted:#5b6678;--line:#e3e8f0;--accent:#0b6b5b;--accent-soft:#eaf5f2;--gold:#a9802f;--chip:#f4f7fb}*{box-sizing:border-box}body{margin:0;background:#f0f2f5;color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}.page{max-width:820px;margin:28px auto;background:#fff;padding:46px 54px 40px;box-shadow:0 2px 18px rgba(20,30,50,.10);border-radius:4px}.eyebrow{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);font-weight:700}h1{font-size:25px;margin:6px 0 4px}.lede{color:var(--muted);font-size:14px;line-height:1.5;margin:0 0 18px;max-width:64ch}.card{border:1px solid var(--line);border-radius:7px;padding:16px 18px;margin-bottom:14px}.card-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:9px}.firm{font-size:16px;font-weight:700}.firm .locked{font-weight:500;color:var(--muted);font-size:12.5px}.row{display:flex;gap:10px;font-size:13px;line-height:1.5;margin:7px 0}.row .lab{flex:0 0 132px;color:var(--accent);font-weight:700;font-size:11px;letter-spacing:.04em;text-transform:uppercase;padding-top:1px}.row .val{flex:1;color:#28313f}.fit{font-size:10.5px;font-weight:700;color:var(--accent);background:var(--accent-soft);border-radius:4px;padding:2px 8px}.cta{margin-top:22px;border:1px solid #cfe6e0;background:linear-gradient(180deg,#f3faf8,#eaf5f2);border-radius:8px;padding:18px 20px}.cta h3{margin:0 0 5px;font-size:15px;color:var(--accent)}.cta p{margin:0 0 12px;font-size:13px;color:#2c3a44;line-height:1.5}.cta a{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;font-weight:700;font-size:13px;padding:9px 16px;border-radius:6px}.foot{margin-top:18px;font-size:10.5px;color:var(--muted);line-height:1.5;border-top:1px solid var(--line);padding-top:10px}</style></head>
<body><div class="page"><div class="eyebrow">Appendix · Fundraising</div><h1>Potential Investors</h1>
<p class="lede">${esc(oneLiner)} — these firms have a thesis that fits. We've named the firm; the specific partner to approach is available through Fractional Forge.</p>
${cards}
<div class="cta"><h3>Want the named partners and the full match list?</h3><p>This dossier shows 5 of your strongest-fit firms (matched live from ${rows.length} candidates in Fractional Forge's investor intelligence). The specific partner to approach at each — plus the wider matched set, warm-intro paths and live fund status — are at Fractional Forge.</p><a href="https://www.fractionalforge.com">Find your investors at Fractional Forge →</a></div>
<div class="foot">Investor matches are generated from your brief against Fractional Forge's investor database and are indicative signals, not investment advice or any endorsement by the named firms. Individuals are withheld by design.</div></div></body></html>`
  writeFileSync(outPath, html)
  console.error(`[investor] wrote ${picks.length}-investor section → ${outPath}`)
  for (const p of picks) console.error(`   • ${p.firm} (${p.fit ?? 'good'})`)
}

main().catch((e) => { console.error('FAILED:', (e as Error)?.message ?? e); process.exit(1) })
