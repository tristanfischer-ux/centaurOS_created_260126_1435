#!/usr/bin/env node
// harvest-roster-to-db.mjs — persist a dossier's fractional-exec ROLES + named
// SUPPLIERS into the learning DB (forge-truth.db), archetype-tagged, so the
// roster + supplier overlap GROWS with every dossier (Tristan 2026-06-09).
//
// This is the write-back half of the learning loop, mirroring the supplier
// loop in scripts/supplier-enrichment/persist-web-fallback.ts:
//   • Suppliers: matched to an EXISTING companies row by name_normalized (never
//     duplicated); the archetype tag is appended to attributes_json
//     .archetype_matches[] — the SAME shape the supplier loop already reads, so
//     queryArchetypeTaggedCandidates() picks dossier suppliers up too. Bespoke
//     makers get a crossover marker merged into fractional_signals_json.
//   • Execs: new tables fractional_execs (canonical, deduped role) +
//     project_exec_needs (role × archetype × module + the questions). Roles ONLY
//     — named people come from Nick's vetted roster, never auto-scraped here.
//
// Storage = forge-truth.db (truth-data, per Tristan's 29-Apr DB rule). Supabase
// is reached later by a push script, not written here.
//
// Usage: npx tsx scripts/harvest-roster-to-db.mjs <archetype>=<state.json> [...]
//   npx tsx scripts/harvest-roster-to-db.mjs \
//     co2_mineralisation=out/co2-docfix/state.json \
//     e_fuel_synthesis=out/oxccu-saf-v18/state.json
//
// NOTE on dates: this runtime forbids Date.now()/new Date() in some contexts;
// here we run as a plain node/tsx script (not a workflow) so Date is available.

import Database from 'better-sqlite3'
import fs from 'fs'

const DB_PATH = '/Users/tristanfischer/.forge-truth/forge-truth.db'
const SOURCE = 'dossier_harvest'
const NOW = new Date().toISOString()

const pairs = process.argv.slice(2).map((a) => {
  const i = a.indexOf('=')
  return { archetype: a.slice(0, i), file: a.slice(i + 1) }
}).filter((p) => p.archetype && p.file && fs.existsSync(p.file))
if (!pairs.length) { console.error('usage: harvest-roster-to-db.mjs <archetype>=<state.json> ...'); process.exit(1) }

// ── canonicalisation (shared with harvest-roster-overlap.mjs) ────────────────
const SENIORITY = /^(senior|principal|lead(ing)?|chief|head of|junior|staff|distinguished|expert|specialist)\s+/i
function canonRole(role) {
  let r = String(role || '').toLowerCase().trim().replace(/[.,;]+$/, '')
  r = r.replace(/^(a|an|the)\s+/i, '').trim()
  for (let k = 0; k < 3; k++) r = r.replace(SENIORITY, '').replace(/^(a|an|the)\s+/i, '').trim()
  r = r.replace(/\bchartered\b/g, '')
    .replace(/\bp\.?eng\b/g, 'engineer').replace(/\bsme\b/g, 'subject matter expert')
    .replace(/\benvironmental\b/g, 'environment').replace(/\bhealth and safety\b|\bhse\b|\behs\b/g, 'safety')
    .replace(/\s+/g, ' ').trim()
  return r
}
function dispRole(role) {
  const d = String(role).replace(/^(a|an|the)\s+/i, '').replace(/\bchartered\b/gi, '').replace(/\s+/g, ' ').trim()
  return d.charAt(0).toUpperCase() + d.slice(1)
}
function disciplineOf(canon) {
  const r = canon
  if (/\b(instrument|control|automation|plc|dcs|scada|analytical)\b/.test(r)) return 'instrumentation_control'
  if (/\b(electrical|power|drive|motor|busbar|switchgear)\b/.test(r)) return 'electrical'
  if (/\b(process|chemical|reaction|separation|catalysis|purification|distillation|mass balance)\b/.test(r)) return 'process'
  if (/\b(mechanical|equipment|rotating|heat transfer|vessel|piping|compress|pump)\b/.test(r)) return 'mechanical'
  if (/\b(structural|civil|steel|foundation|plinth)\b/.test(r)) return 'structural'
  if (/\b(safety|functional safety|hazop|relief)\b/.test(r)) return 'safety'
  if (/\b(thermal|combustion|heater|boiler|steam)\b/.test(r)) return 'thermal'
  if (/\b(utility|utilities|cooling|nitrogen|water)\b/.test(r)) return 'utilities'
  if (/\b(packaging|bagging|palletis)\b/.test(r)) return 'packaging'
  if (/\b(storage|tank|custody|loading)\b/.test(r)) return 'storage_handling'
  return 'other'
}
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) }
function canonSupplier(name) {
  return String(name || '').toLowerCase()
    .replace(/\b(ltd|limited|inc|gmbh|ag|s\.?a\.?|plc|llc|co|corp|group|international)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim()
}
const GENERIC = /^(generic|tbd|t\.b\.d|tbc|n\/?a|various|unknown|none|internal|in[- ]?house|fabricated|fabrication|bespoke|custom|made[- ]to[- ]order|standard)$/i

// ── DB + schema ──────────────────────────────────────────────────────────────
const db = new Database(DB_PATH)
db.pragma('busy_timeout = 8000')   // tolerate the background-enrichment writer (one-writer-rule courtesy)
db.exec(`
CREATE TABLE IF NOT EXISTS fractional_execs (
  id TEXT PRIMARY KEY,
  canonical_role TEXT NOT NULL,
  display_role TEXT,
  discipline TEXT,
  capabilities TEXT,
  typical_background TEXT,
  archetype_count INTEGER DEFAULT 0,
  source TEXT,
  named_person TEXT,
  named_person_source TEXT,
  created_at TEXT,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS project_exec_needs (
  id TEXT PRIMARY KEY,
  exec_id TEXT NOT NULL,
  archetype TEXT NOT NULL,
  project_run TEXT,
  module_id TEXT,
  module_name TEXT,
  covers TEXT,
  questions_json TEXT,
  qty_needed INTEGER DEFAULT 1,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_pen_exec ON project_exec_needs(exec_id);
CREATE INDEX IF NOT EXISTS idx_pen_arch ON project_exec_needs(archetype);
CREATE TABLE IF NOT EXISTS project_supplier_needs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  supplier_name TEXT,
  archetype TEXT NOT NULL,
  project_run TEXT,
  parts_json TEXT,
  bespoke_maker INTEGER DEFAULT 0,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_psn_company ON project_supplier_needs(company_id);
CREATE INDEX IF NOT EXISTS idx_psn_arch ON project_supplier_needs(archetype);
`)

// prepared statements
const getExec = db.prepare('SELECT id, capabilities, typical_background FROM fractional_execs WHERE id = ?')
const insExec = db.prepare(`INSERT INTO fractional_execs (id,canonical_role,display_role,discipline,capabilities,typical_background,source,created_at,updated_at)
  VALUES (@id,@canonical_role,@display_role,@discipline,@capabilities,@typical_background,@source,@created_at,@updated_at)`)
const updExec = db.prepare('UPDATE fractional_execs SET capabilities=@capabilities, typical_background=@typical_background, updated_at=@updated_at WHERE id=@id')
const upNeed = db.prepare(`INSERT OR REPLACE INTO project_exec_needs (id,exec_id,archetype,project_run,module_id,module_name,covers,questions_json,qty_needed,created_at)
  VALUES (@id,@exec_id,@archetype,@project_run,@module_id,@module_name,@covers,@questions_json,@qty_needed,@created_at)`)
const findCoExact = db.prepare("SELECT id, attributes_json, fractional_signals_json FROM companies WHERE name_normalized = ? LIMIT 1")
const findCoPrefix = db.prepare("SELECT id, attributes_json, fractional_signals_json FROM companies WHERE name_normalized LIKE ? LIMIT 1")
const insCo = db.prepare(`INSERT INTO companies (id,name,name_normalized,source,category,attributes_json,created_at,updated_at)
  VALUES (@id,@name,@name_normalized,@source,@category,@attributes_json,@created_at,@updated_at)`)
const updCoAttrs = db.prepare('UPDATE companies SET attributes_json=@attributes_json, updated_at=@updated_at WHERE id=@id')
const updCoFrac = db.prepare('UPDATE companies SET fractional_signals_json=@fractional_signals_json, updated_at=@updated_at WHERE id=@id')
const upSupNeed = db.prepare(`INSERT OR REPLACE INTO project_supplier_needs (id,company_id,supplier_name,archetype,project_run,parts_json,bespoke_maker,created_at)
  VALUES (@id,@company_id,@supplier_name,@archetype,@project_run,@parts_json,@bespoke_maker,@created_at)`)

function addArchetypeMatch(attrsRaw, archetype, briefClass) {
  let attrs = {}
  try { attrs = attrsRaw ? JSON.parse(attrsRaw) : {} } catch { attrs = {} }
  if (!Array.isArray(attrs.archetype_matches)) attrs.archetype_matches = []
  if (!attrs.archetype_matches.some((m) => m.archetype_id === archetype)) {
    attrs.archetype_matches.push({ archetype_id: archetype, first_matched_at: NOW, brief_class: briefClass, source: SOURCE })
  }
  return JSON.stringify(attrs)
}

// ── harvest ──────────────────────────────────────────────────────────────────
let nExec = 0, nNeed = 0, nSupTag = 0, nSupNew = 0, nCross = 0
const run = db.transaction(() => {
  for (const { archetype, file } of pairs) {
    const st = JSON.parse(fs.readFileSync(file, 'utf8'))
    const projectRun = file.replace('out/', '').replace('/state.json', '')

    // execs
    const ae = st.advisorEngagement || {}
    for (const key of Object.keys(ae)) {
      const grp = ae[key] || {}
      const moduleName = grp.module_name || grp.module_id || key
      const moduleId = grp.module_id || key
      for (const c of (Array.isArray(grp.cards) ? grp.cards : [])) {
        const role = c.specialist_role || c.role
        if (!role) continue
        const canon = canonRole(role); if (!canon) continue
        const id = 'fe_' + slug(canon)
        const ex = getExec.get(id)
        const covers = String(c.covers || '').trim()
        if (!ex) {
          insExec.run({ id, canonical_role: canon, display_role: dispRole(role), discipline: disciplineOf(canon),
            capabilities: covers, typical_background: String(c.background || '').trim(), source: SOURCE, created_at: NOW, updated_at: NOW })
          nExec++
        } else {
          const caps = new Set(String(ex.capabilities || '').split(' · ').filter(Boolean))
          if (covers) caps.add(covers)
          updExec.run({ id, capabilities: [...caps].slice(0, 12).join(' · '), typical_background: ex.typical_background || String(c.background || '').trim(), updated_at: NOW })
        }
        upNeed.run({ id: `${id}::${archetype}::${moduleId}`, exec_id: id, archetype, project_run: projectRun,
          module_id: moduleId, module_name: moduleName, covers, questions_json: JSON.stringify(Array.isArray(c.questions) ? c.questions : []),
          qty_needed: 1, created_at: NOW })
        nNeed++
      }
    }

    // suppliers — aggregate parts per supplier within this archetype
    const byCo = new Map() // canon -> { name, parts:Set, bespoke }
    for (const p of (Array.isArray(st.partVerifications) ? st.partVerifications : [])) {
      const raw = String(p.manufacturer || '').trim()
      if (!raw || GENERIC.test(raw)) continue
      const canon = canonSupplier(raw); if (!canon) continue
      const isBespoke = /fabricat|bespoke|custom|made[- ]to[- ]order/i.test(String(p.part_number || '') + ' ' + raw)
      if (!byCo.has(canon)) byCo.set(canon, { name: raw, parts: new Set(), bespoke: false })
      const e = byCo.get(canon)
      if (p.word_name) e.parts.add(String(p.word_name))
      if (isBespoke) e.bespoke = true
    }
    for (const [canon, e] of byCo) {
      // match existing company by normalized name; else prefix; else create dsp_ row
      let co = findCoExact.get(canon) || findCoPrefix.get(canon + ' %')
      let companyId
      if (co) {
        companyId = co.id
        updCoAttrs.run({ id: companyId, attributes_json: addArchetypeMatch(co.attributes_json, archetype, archetype), updated_at: NOW })
        nSupTag++
      } else {
        companyId = 'dsp_' + slug(canon)
        try {
          insCo.run({ id: companyId, name: e.name, name_normalized: canon, source: SOURCE, category: 'Manufacturer / OEM',
            attributes_json: addArchetypeMatch(null, archetype, archetype), created_at: NOW, updated_at: NOW })
          nSupNew++
        } catch { /* race: someone inserted it — re-fetch */ co = findCoExact.get(canon); companyId = co ? co.id : companyId }
      }
      // crossover marker for bespoke makers (merge, don't clobber existing signals)
      if (e.bespoke && co !== null) {
        let fr = {}
        try { fr = co?.fractional_signals_json ? JSON.parse(co.fractional_signals_json) : {} } catch { fr = {} }
        const arches = new Set([...(fr.dossier_exec_candidate?.archetypes || []), archetype])
        fr.dossier_exec_candidate = { is_candidate: true, reason: 'Named maker of bespoke/fabricated dossier scope', archetypes: [...arches], updated_at: NOW }
        updCoFrac.run({ id: companyId, fractional_signals_json: JSON.stringify(fr), updated_at: NOW })
        nCross++
      }
      upSupNeed.run({ id: `${companyId}::${archetype}`, company_id: companyId, supplier_name: e.name, archetype,
        project_run: projectRun, parts_json: JSON.stringify([...e.parts].slice(0, 30)), bespoke_maker: e.bespoke ? 1 : 0, created_at: NOW })
    }
  }
  // recompute exec reach
  db.exec(`UPDATE fractional_execs SET archetype_count = (
    SELECT COUNT(DISTINCT archetype) FROM project_exec_needs WHERE project_exec_needs.exec_id = fractional_execs.id)`)
})
run()

// ── summary ──────────────────────────────────────────────────────────────────
const reachExec = db.prepare(`SELECT display_role, discipline, archetype_count,
  (SELECT GROUP_CONCAT(DISTINCT archetype) FROM project_exec_needs n WHERE n.exec_id = fractional_execs.id) AS arches
  FROM fractional_execs ORDER BY archetype_count DESC, canonical_role LIMIT 60`).all()
const reachSup = db.prepare(`SELECT supplier_name, COUNT(DISTINCT archetype) AS reach, MAX(bespoke_maker) AS bespoke,
  GROUP_CONCAT(DISTINCT archetype) AS arches
  FROM project_supplier_needs GROUP BY company_id ORDER BY reach DESC, supplier_name`).all()

console.log(`\nharvested ${pairs.length} archetype(s): ${pairs.map((p) => p.archetype).join(', ')}`)
console.log(`execs: +${nExec} new canonical roles, ${nNeed} project-need rows`)
console.log(`suppliers: ${nSupTag} tagged existing companies, +${nSupNew} new dsp_ rows, ${nCross} crossover-flagged`)
console.log(`\nEXEC ROLES BY REACH (recruit highest first):`)
for (const r of reachExec.filter((r) => r.archetype_count >= 1).slice(0, 18))
  console.log(`  ${r.archetype_count}  [${r.discipline}] ${r.display_role}  (${r.arches})`)
console.log(`\nSUPPLIERS BY REACH (top 18):`)
for (const r of reachSup.slice(0, 18))
  console.log(`  ${r.reach}  ${r.supplier_name}${r.bespoke ? ' [bespoke-maker]' : ''}  (${r.arches})`)
db.close()
