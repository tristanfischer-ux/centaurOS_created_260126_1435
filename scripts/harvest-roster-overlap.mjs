#!/usr/bin/env node
// Cross-archetype roster + supplier OVERLAP harvester (Tristan 2026-06-09).
//
// Reads N dossier state.json files (one per archetype) and computes, across them:
//   • which fractional-executive ROLES recur (-> recruit these first)
//   • which SUPPLIERS recur (-> the cross-archetype vendor shortlist)
//   • which suppliers are "fabricated / bespoke" makers (could-be fractional-exec
//     candidates in their own right — Tristan's crossover point)
//
// READ-ONLY: writes a markdown report, touches no database. This is the analysis
// proof; the persistent learning-DB version (forge-truth.db tables + the DB-first
// -> on-miss-search -> write-back loop) is the follow-on build.
//
// Usage: node scripts/harvest-roster-overlap.mjs <archetype>=<state.json> [...more]
//   node scripts/harvest-roster-overlap.mjs \
//     co2=out/co2-docfix/state.json saf=out/oxccu-saf-v18/state.json

import fs from 'fs'

const pairs = process.argv.slice(2).map((a) => {
  const i = a.indexOf('=')
  return { archetype: a.slice(0, i), file: a.slice(i + 1) }
}).filter((p) => p.archetype && p.file)

if (!pairs.length) { console.error('usage: harvest-roster-overlap.mjs <archetype>=<state.json> ...'); process.exit(1) }

// ---- canonicalisation -------------------------------------------------------
const SENIORITY = /^(senior|principal|lead(ing)?|chief|head of|junior|staff|distinguished|expert|specialist)\s+/i
function canonRole(role) {
  let r = String(role || '').toLowerCase().trim().replace(/[.,;]+$/, '')
  r = r.replace(/^(a|an|the)\s+/i, '').trim()           // leading article ("A senior…")
  // strip a stacked seniority prefix or two (article may sit before seniority)
  for (let k = 0; k < 3; k++) r = r.replace(SENIORITY, '').replace(/^(a|an|the)\s+/i, '').trim()
  r = r.replace(/\bchartered\b/g, '').replace(/\s+/g, ' ').trim()  // "chartered" is not a discipline
  // common discipline synonyms -> one key
  r = r
    .replace(/\bp\.?eng\b/g, 'engineer')
    .replace(/\bsme\b/g, 'subject matter expert')
    .replace(/\benvironmental\b/g, 'environment')
    .replace(/\bhealth and safety\b|\bhse\b|\behs\b/g, 'safety')
    .replace(/\s+/g, ' ')
    .trim()
  return r
}
function canonSupplier(name) {
  return String(name || '').toLowerCase()
    .replace(/\b(ltd|limited|inc|gmbh|ag|s\.?a\.?|plc|llc|co|corp|group|international)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim()
}
const GENERIC = /^(generic|tbd|t\.b\.d|tbc|n\/?a|various|unknown|none|internal|in[- ]?house|fabricated|fabrication|bespoke|custom|made[- ]to[- ]order|standard)$/i

// ---- harvest ----------------------------------------------------------------
const roles = new Map()      // canon -> { display, archetypes:Set, byArch:{arch:[{role,covers,module}]} }
const suppliers = new Map()  // canon -> { display, archetypes:Set, bespokeMaker:bool, parts:Set }

for (const { archetype, file } of pairs) {
  const st = JSON.parse(fs.readFileSync(file, 'utf8'))
  // --- advisors / fractional execs ---
  const ae = st.advisorEngagement || {}
  for (const key of Object.keys(ae)) {
    const grp = ae[key] || {}
    const moduleName = grp.module_name || grp.module_id || key
    for (const c of (Array.isArray(grp.cards) ? grp.cards : [])) {
      const role = c.specialist_role || c.role
      if (!role) continue
      const ck = canonRole(role)
      if (!ck) continue
      const disp = String(role).replace(/^(a|an|the)\s+/i, '').replace(/\bchartered\b/gi, '').replace(/\s+/g, ' ').trim()
      if (!roles.has(ck)) roles.set(ck, { display: disp.charAt(0).toUpperCase() + disp.slice(1), archetypes: new Set(), hits: [] })
      const e = roles.get(ck)
      e.archetypes.add(archetype)
      e.hits.push({ archetype, role, covers: c.covers || '', module: moduleName, background: c.background || '' })
    }
  }
  // --- suppliers ---
  for (const p of (Array.isArray(st.partVerifications) ? st.partVerifications : [])) {
    const raw = String(p.manufacturer || '').trim()
    const isBespoke = /fabricat|bespoke|custom|made[- ]to[- ]order/i.test(String(p.part_number || '') + ' ' + raw)
    if (!raw || GENERIC.test(raw)) {
      // a bespoke/fabricated MAKER with a real named manufacturer is still captured above;
      // pure "fabricated"/"internal" with no name => skip (no entity to dedup)
      continue
    }
    const ck = canonSupplier(raw)
    if (!ck) continue
    if (!suppliers.has(ck)) suppliers.set(ck, { display: raw, archetypes: new Set(), bespokeMaker: false, parts: new Set() })
    const e = suppliers.get(ck)
    e.archetypes.add(archetype)
    if (isBespoke) e.bespokeMaker = true
    if (p.word_name) e.parts.add(`${archetype}: ${p.word_name}`)
  }
}

const nArch = pairs.length
const sortByReach = (a, b) => b[1].archetypes.size - a[1].archetypes.size || a[0].localeCompare(b[0])

// ---- report -----------------------------------------------------------------
const L = []
L.push(`# Cross-archetype roster + supplier overlap`)
L.push(``)
L.push(`Archetypes harvested (${nArch}): ${pairs.map((p) => `**${p.archetype}** (${p.file.replace('out/', '').replace('/state.json', '')})`).join(' · ')}`)
L.push(``)

// --- recurring roles ---
const sharedRoles = [...roles.entries()].filter(([, e]) => e.archetypes.size >= 2).sort(sortByReach)
L.push(`## Fractional-executive roles by reach (recruit highest-reach first)`)
L.push(``)
L.push(`${roles.size} distinct roles across ${nArch} archetypes · ${sharedRoles.length} recur in ≥2.`)
L.push(``)
L.push(`| Reach | Canonical role | Appears in | Covers (sample) |`)
L.push(`|---|---|---|---|`)
for (const [, e] of [...roles.entries()].sort(sortByReach)) {
  const reach = `${e.archetypes.size}/${nArch}`
  const arch = [...e.archetypes].join(', ')
  const covers = [...new Set(e.hits.map((h) => h.covers).filter(Boolean))].slice(0, 2).join('; ')
  L.push(`| ${reach} | ${e.display} | ${arch} | ${covers.slice(0, 90)} |`)
}
L.push(``)

// --- recurring suppliers ---
const sharedSup = [...suppliers.entries()].filter(([, e]) => e.archetypes.size >= 2).sort(sortByReach)
L.push(`## Suppliers by reach`)
L.push(``)
L.push(`${suppliers.size} distinct named suppliers · ${sharedSup.length} recur in ≥2 archetypes.`)
L.push(``)
L.push(`| Reach | Supplier | Appears in | Bespoke-maker? (exec candidate) |`)
L.push(`|---|---|---|---|`)
for (const [, e] of sharedSup) {
  L.push(`| ${e.archetypes.size}/${nArch} | ${e.display} | ${[...e.archetypes].join(', ')} | ${e.bespokeMaker ? 'yes' : '—'} |`)
}
L.push(``)

// --- supplier -> exec crossover candidates ---
const execCand = [...suppliers.entries()].filter(([, e]) => e.bespokeMaker).sort(sortByReach)
L.push(`## Supplier → fractional-exec crossover candidates`)
L.push(``)
L.push(`Named makers tied to bespoke/fabricated scope — the ones whose engineers could be fractional execs in their own right:`)
L.push(``)
for (const [, e] of execCand.slice(0, 25)) {
  L.push(`- **${e.display}** (${e.archetypes.size}/${nArch}) — ${[...e.parts].slice(0, 3).join(' · ')}`)
}
L.push(``)

const out = 'ROSTER-OVERLAP.md'
fs.writeFileSync(out, L.join('\n'))
console.log(`wrote ${out}`)
console.log(`roles: ${roles.size} total, ${sharedRoles.length} shared (>=2 archetypes)`)
console.log(`suppliers: ${suppliers.size} total, ${sharedSup.length} shared, ${execCand.length} bespoke-maker exec candidates`)
console.log(``)
console.log(`TOP SHARED ROLES:`)
for (const [, e] of sharedRoles.slice(0, 12)) console.log(`  ${e.archetypes.size}/${nArch}  ${e.display}`)
console.log(`TOP SHARED SUPPLIERS:`)
for (const [, e] of sharedSup.slice(0, 12)) console.log(`  ${e.archetypes.size}/${nArch}  ${e.display}${e.bespokeMaker ? '  [bespoke-maker]' : ''}`)
