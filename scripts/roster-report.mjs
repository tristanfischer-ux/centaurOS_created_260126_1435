#!/usr/bin/env node
// roster-report.mjs — READ-ONLY report from the learning DB (forge-truth.db).
// Renders the cross-archetype fractional-exec + supplier overlap that the
// harvester (harvest-roster-to-db.mjs) has accumulated. Writes ROSTER-OVERLAP.md.
import Database from 'better-sqlite3'
import fs from 'fs'

const DB_PATH = '/Users/tristanfischer/.forge-truth/forge-truth.db'
const db = new Database(DB_PATH, { readonly: true })

const archetypes = db.prepare(`SELECT DISTINCT archetype FROM project_supplier_needs
  UNION SELECT DISTINCT archetype FROM project_exec_needs`).all().map((r) => r.archetype).sort()
const nArch = archetypes.length

const execs = db.prepare(`SELECT e.display_role, e.discipline, e.archetype_count AS reach,
  (SELECT GROUP_CONCAT(DISTINCT n.archetype) FROM project_exec_needs n WHERE n.exec_id = e.id) AS arches,
  e.capabilities
  FROM fractional_execs e ORDER BY e.archetype_count DESC, e.discipline, e.canonical_role`).all()

const sup = db.prepare(`SELECT supplier_name, COUNT(DISTINCT archetype) AS reach, MAX(bespoke_maker) AS bespoke,
  GROUP_CONCAT(DISTINCT archetype) AS arches
  FROM project_supplier_needs GROUP BY company_id ORDER BY reach DESC, supplier_name`).all()

const cross = db.prepare(`SELECT supplier_name, COUNT(DISTINCT archetype) AS reach, GROUP_CONCAT(DISTINCT archetype) AS arches
  FROM project_supplier_needs WHERE bespoke_maker = 1 GROUP BY company_id ORDER BY reach DESC, supplier_name`).all()

const execArch = db.prepare(`SELECT DISTINCT archetype FROM project_exec_needs`).all().map((r) => r.archetype).sort()

const L = []
L.push(`# Cross-archetype roster + supplier overlap`)
L.push(``)
L.push(`Source: \`forge-truth.db\` learning DB · ${nArch} archetypes harvested: ${archetypes.map((a) => `\`${a}\``).join(', ')}`)
L.push(``)
L.push(`> Exec roles are present for only ${execArch.length} archetypes (${execArch.map((a) => `\`${a}\``).join(', ')}) — the others were built before the advisor stage existed (advisorEngagement empty). Supplier coverage is all ${nArch}.`)
L.push(``)

L.push(`## Fractional-executive roles by reach`)
L.push(``)
L.push(`${execs.length} canonical roles · reach = how many archetypes need it (recruit highest-reach first).`)
L.push(``)
L.push(`| Reach | Discipline | Role | Appears in |`)
L.push(`|---|---|---|---|`)
for (const e of execs) L.push(`| ${e.reach} | ${e.discipline} | ${e.display_role} | ${e.arches || ''} |`)
L.push(``)

L.push(`## Suppliers by reach`)
L.push(``)
L.push(`${sup.length} distinct suppliers across ${nArch} archetypes · ${sup.filter((s) => s.reach >= 2).length} recur in ≥2.`)
L.push(``)
L.push(`| Reach | Supplier | Bespoke-maker? | Appears in |`)
L.push(`|---|---|---|---|`)
for (const s of sup.filter((s) => s.reach >= 2)) L.push(`| ${s.reach} | ${s.supplier_name} | ${s.bespoke ? 'yes' : '—'} | ${s.arches} |`)
L.push(``)

L.push(`## Supplier → fractional-exec crossover candidates`)
L.push(``)
L.push(`Named makers of bespoke/fabricated scope — engineers who could be fractional execs in their own right:`)
L.push(``)
L.push(`| Reach | Maker | Appears in |`)
L.push(`|---|---|---|`)
for (const c of cross) L.push(`| ${c.reach} | ${c.supplier_name} | ${c.arches} |`)
L.push(``)

fs.writeFileSync('ROSTER-OVERLAP.md', L.join('\n'))
console.log(`wrote ROSTER-OVERLAP.md — ${nArch} archetypes, ${execs.length} roles, ${sup.length} suppliers, ${cross.length} crossover candidates`)
db.close()
