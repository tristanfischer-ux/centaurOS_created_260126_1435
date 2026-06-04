/**
 * One-off ingest: CO₂ Stage-0 harvest extract → pretraining corpus DB
 * (the growing-DB moat) WITH embeddings, so future chain runs retrieve real
 * CO₂ parts / specs / standards / suppliers.
 *
 * Embedding convention is COPIED EXACTLY from
 * scripts/lib/background-enrichment.ts (~line 278-303):
 *   OpenAI text-embedding-3-small, dimensions: 1536, stored Float32LE BLOB,
 *   so new vectors match the corpus's existing 1536-d vectors.
 *
 * Part embed-text shape matches background-enrichment.ts processPart():
 *   [part_name, manufacturer, part_number, raw_excerpt].filter(Boolean).join(' ')
 *
 * gate-20: NEVER write an unverified MPN — part_number column is NULL for
 * candidate (unverified) parts; the discovery_source records the distinction.
 *
 * Idempotent on the spec_documents file_hash UNIQUE key + per-table dedup.
 * Plain .mjs (not .tsx) because tsx is not installed locally; better-sqlite3
 * 12.9.0 loads on system Node 25 (verified). British spelling throughout.
 */

import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

// --- env loading: identical set + precedence to background-enrichment.ts ----
for (const envPath of [
  resolve(process.cwd(), '.env.local'),
  resolve(homedir(), '.claude/secrets/distributor-apis.env'),
  resolve(homedir(), '.claude/secrets/tavily.env'),
  resolve(homedir(), '.claude/secrets/brave.env'),
  resolve(homedir(), '.claude/secrets/openrouter.env'),
  resolve(homedir(), 'Developer/Forge-Capital/.env'),
]) {
  try {
    if (!existsSync(envPath)) continue
    const c = readFileSync(envPath, 'utf-8')
    for (const line of c.split('\n')) {
      const t = line.trim()
      if (t && !t.startsWith('#') && t.includes('=')) {
        const [k, ...rest] = t.split('=')
        const v = rest.join('=').replace(/^["']|["']$/g, '')
        if (!process.env[k]) process.env[k] = v
      }
    }
  } catch { /* non-fatal */ }
}

const OPENAI_KEY = process.env.OPENAI_API_KEY || ''
const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMS = 1536

if (!OPENAI_KEY) {
  console.error('FATAL: OPENAI_API_KEY not found in .env.local or secrets. Aborting (would write NULL embeddings — the exact failure we are fixing).')
  process.exit(1)
}

// --- embedding helper: byte-identical to background-enrichment.ts -----------
async function embedText(text) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: text.slice(0, 4096), model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMS }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`embed failed ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = await res.json()
  const vec = data?.data?.[0]?.embedding
  if (!vec || vec.length !== EMBEDDING_DIMS) throw new Error(`embed returned ${vec ? vec.length : 'null'} dims, expected ${EMBEDDING_DIMS}`)
  const buf = Buffer.alloc(EMBEDDING_DIMS * 4)
  for (let i = 0; i < EMBEDDING_DIMS; i++) buf.writeFloatLE(vec[i], i * 4)
  return buf
}

const embedHashOf = (text) => createHash('sha256').update(text).digest('hex').slice(0, 32)

// Embed with one retry, then build the {embedding, embed_hash} pair. The whole
// ingest aborts (transaction never commits) if an embed genuinely fails — we
// MUST NOT insert NULL-embedding rows.
async function embedPair(text) {
  const src = (text || '').trim() || '(empty)'
  try {
    return { embedding: await embedText(src), embed_hash: embedHashOf(src) }
  } catch (e) {
    await new Promise((r) => setTimeout(r, 1500))
    return { embedding: await embedText(src), embed_hash: embedHashOf(src) }
  }
}

const DB_PATH = resolve(homedir(), '.forge-truth/forge-truth.db')
const INPUT = resolve(homedir(), 'Downloads/forge-demos/stage-0-reference/co2/co2-extracted.json')
const PRODUCT_CLASS = 'co2_mineralisation'
const FILE_HASH = 'stage0-harvest-co2-v1'
const nowIso = new Date().toISOString()

const extract = JSON.parse(readFileSync(INPUT, 'utf-8'))
const parts = extract.parts || []
const specs = extract.specs || []
const standards = extract.standards || []
const suppliers = extract.suppliers || []

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('busy_timeout = 10000')

// --- 1. spec_documents row (idempotent via UNIQUE file_hash) ----------------
let docId
const existingDoc = db.prepare('SELECT id FROM pretraining_spec_documents WHERE file_hash = ?').get(FILE_HASH)
if (existingDoc) {
  docId = existingDoc.id
  console.log(`[doc] reusing existing spec_documents id=${docId} (file_hash=${FILE_HASH})`)
} else {
  const r = db.prepare(`
    INSERT INTO pretraining_spec_documents
      (product_class, manufacturer, product_name, source_url, document_type,
       file_hash, extraction_status, extracted_at, extraction_model, source_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    PRODUCT_CLASS,
    '(stage0-harvest)',
    'CO₂ capture + mineralisation — Stage 0 reference harvest (10-LLM union + web)',
    'internal://stage-0-harvest/co2',
    'harvest',
    FILE_HASH,
    'done',
    nowIso,
    '10-LLM-union+web',
    'stage0_harvest',
  )
  docId = Number(r.lastInsertRowid)
  console.log(`[doc] inserted spec_documents id=${docId}`)
}

// --- prepared statements ----------------------------------------------------
const partDedupStmt = db.prepare(`
  SELECT id FROM pretraining_extracted_parts
  WHERE component_class = ?
    AND COALESCE(manufacturer,'') = COALESCE(?, '')
    AND COALESCE(part_name,'') = ?
    AND COALESCE(sub_module_assignment,'') = ?
  LIMIT 1
`)
const partInsertStmt = db.prepare(`
  INSERT INTO pretraining_extracted_parts
    (document_id, part_name, manufacturer, part_number, quantity, unit_price_gbp,
     module_assignment, sub_module_assignment, raw_excerpt, confidence,
     component_class, discovery_source, discovered_at, embedding, embed_hash)
  VALUES (@document_id, @part_name, @manufacturer, @part_number, @quantity, @unit_price_gbp,
          @module_assignment, @sub_module_assignment, @raw_excerpt, @confidence,
          @component_class, @discovery_source, @discovered_at, @embedding, @embed_hash)
`)
const specInsertStmt = db.prepare(`
  INSERT INTO pretraining_extracted_specs
    (document_id, spec_key, spec_value, spec_unit, raw_excerpt, embedding, embed_hash)
  VALUES (@document_id, @spec_key, @spec_value, @spec_unit, @raw_excerpt, @embedding, @embed_hash)
`)
const standardInsertStmt = db.prepare(`
  INSERT INTO pretraining_extracted_standards
    (document_id, standard_name, scope, raw_excerpt, embedding, embed_hash)
  VALUES (@document_id, @standard_name, @scope, @raw_excerpt, @embedding, @embed_hash)
`)
const supplierInsertStmt = db.prepare(`
  INSERT INTO pretraining_extracted_suppliers
    (document_id, company_name, role, website, raw_excerpt, embedding, embed_hash)
  VALUES (@document_id, @company_name, @role, @website, @raw_excerpt, @embedding, @embed_hash)
`)

// Dedup guards for specs/standards/suppliers (these tables have no UNIQUE
// constraint). embed_hash is the deterministic SHA-256(embed_text) prefix, so
// (document_id, embed_hash) is a stable idempotency key — a re-run skips rows
// already present instead of duplicating them.
const specExistsStmt = db.prepare('SELECT 1 FROM pretraining_extracted_specs WHERE document_id = ? AND embed_hash = ? LIMIT 1')
const standardExistsStmt = db.prepare('SELECT 1 FROM pretraining_extracted_standards WHERE document_id = ? AND embed_hash = ? LIMIT 1')
const supplierExistsStmt = db.prepare('SELECT 1 FROM pretraining_extracted_suppliers WHERE document_id = ? AND embed_hash = ? LIMIT 1')

// ---------------------------------------------------------------------------
// PHASE A — embed everything OUTSIDE the transaction (async network calls
// cannot run inside a better-sqlite3 synchronous transaction). We assemble
// fully-formed row objects, then commit them all atomically in PHASE B.
// ---------------------------------------------------------------------------

const stats = { parts_ins: 0, parts_skip: 0, parts_mpn_nulled: 0, specs_ins: 0, specs_skip: 0, standards_ins: 0, standards_drop: 0, standards_skip: 0, suppliers_ins: 0, suppliers_skip: 0 }
const partRows = []
const specRows = []
const standardRows = []
const supplierRows = []

// PARTS
for (const p of parts) {
  const partName = p.part_name ?? null
  const manufacturer = p.manufacturer ?? null
  const subMod = p.sub_module_assignment ?? null
  // dedup against existing rows
  const existing = partDedupStmt.get(PRODUCT_CLASS, manufacturer, partName ?? '', subMod ?? '')
  if (existing) { stats.parts_skip += 1; continue }

  const verified = p.verified === true
  // gate-20: NEVER persist an unverified MPN
  const partNumber = verified ? (p.part_number ?? null) : null
  if (!verified && p.part_number) stats.parts_mpn_nulled += 1

  // embed-text shape matches background-enrichment.ts processPart embedSource.
  // Uses the REAL part_name + manufacturer + (real) part_number + excerpt for
  // retrieval quality — the MPN is present in the *embedding text* for an
  // unverified candidate (so it is still findable) but NULL in the column.
  const embedSource = [partName, manufacturer, p.part_number, p.raw_excerpt].filter(Boolean).join(' ')
  const { embedding, embed_hash } = await embedPair(embedSource)

  partRows.push({
    document_id: docId,
    part_name: partName,
    manufacturer,
    part_number: partNumber,
    quantity: p.quantity ?? null,
    unit_price_gbp: p.unit_price_gbp ?? null,
    module_assignment: p.module_assignment ?? null,
    sub_module_assignment: subMod,
    raw_excerpt: p.raw_excerpt ?? null,
    confidence: p.confidence ?? null,
    component_class: PRODUCT_CLASS,
    discovery_source: verified ? 'stage0_harvest:verified' : 'stage0_harvest:candidate',
    discovered_at: nowIso,
    embedding,
    embed_hash,
  })
}

// SPECS
for (const s of specs) {
  const embedSource = [s.spec_name, s.value, s.unit, s.raw_excerpt].filter(Boolean).join(' ')
  const eh = embedHashOf((embedSource || '').trim() || '(empty)')
  if (specExistsStmt.get(docId, eh)) { stats.specs_skip += 1; continue }
  const { embedding, embed_hash } = await embedPair(embedSource)
  specRows.push({
    document_id: docId,
    spec_key: s.spec_name ?? null,
    spec_value: s.value ?? null,
    spec_unit: s.unit ?? null,
    raw_excerpt: s.raw_excerpt ?? null,
    embedding,
    embed_hash,
  })
}

// STANDARDS (with the drop-filter so we never poison the standards RAG)
for (const st of standards) {
  const ref = String(st.standard_ref ?? '')
  const appliesTo = String(st.applies_to ?? '')
  const conf = st.confidence
  const drop =
    /1473|27914/.test(ref) ||
    appliesTo.includes('DROPPED') ||
    appliesTo.includes('DOWNGRADED') ||
    (typeof conf === 'number' && conf < 0.5)
  if (drop) { stats.standards_drop += 1; continue }

  const scope = `${st.what_it_requires ?? ''} | applies: ${appliesTo}`
  const embedSource = [ref, st.title, st.what_it_requires, appliesTo].filter(Boolean).join(' ')
  const eh = embedHashOf((embedSource || '').trim() || '(empty)')
  if (standardExistsStmt.get(docId, eh)) { stats.standards_skip += 1; continue }
  const { embedding, embed_hash } = await embedPair(embedSource)
  standardRows.push({
    document_id: docId,
    standard_name: ref || null,
    scope,
    raw_excerpt: st.title ?? null,
    embedding,
    embed_hash,
  })
}

// SUPPLIERS
for (const sup of suppliers) {
  const servesUk = sup.serves_uk === true
  const rawExcerpt = `${sup.supplies ?? ''} | ${sup.hq_location ?? ''}${servesUk ? ' | UK-serving' : ''}`
  const embedSource = [sup.supplier_name, sup.supplies, sup.hq_location].filter(Boolean).join(' ')
  const eh = embedHashOf((embedSource || '').trim() || '(empty)')
  if (supplierExistsStmt.get(docId, eh)) { stats.suppliers_skip += 1; continue }
  const { embedding, embed_hash } = await embedPair(embedSource)
  supplierRows.push({
    document_id: docId,
    company_name: sup.supplier_name ?? null,
    role: sup.is_epc_contractor ? 'epc_principal' : 'oem_or_subsupplier',
    website: sup.contact ?? null,
    raw_excerpt: rawExcerpt,
    embedding,
    embed_hash,
  })
}

// ---------------------------------------------------------------------------
// PHASE B — single atomic transaction over the fully-embedded rows.
// ---------------------------------------------------------------------------
const commit = db.transaction(() => {
  for (const r of partRows) { partInsertStmt.run(r); stats.parts_ins += 1 }
  for (const r of specRows) { specInsertStmt.run(r); stats.specs_ins += 1 }
  for (const r of standardRows) { standardInsertStmt.run(r); stats.standards_ins += 1 }
  for (const r of supplierRows) { supplierInsertStmt.run(r); stats.suppliers_ins += 1 }
})
commit()

// ---------------------------------------------------------------------------
// VERIFY
// ---------------------------------------------------------------------------
const q = (sql, ...args) => db.prepare(sql).get(...args)

const sampleDim = q(
  `SELECT length(embedding)/4 AS dim FROM pretraining_extracted_parts
   WHERE document_id = ? AND discovery_source LIKE 'stage0_harvest%' ORDER BY id DESC LIMIT 1`,
  docId,
)?.dim
const gate20 = q(
  `SELECT COUNT(*) AS c FROM pretraining_extracted_parts
   WHERE discovery_source = 'stage0_harvest:candidate' AND part_number IS NOT NULL`,
).c
const nullEmbedNew = q(
  `SELECT COUNT(*) AS c FROM pretraining_extracted_parts
   WHERE document_id = ? AND embedding IS NULL`,
  docId,
).c
const en1473 = q(
  `SELECT COUNT(*) AS c FROM pretraining_extracted_standards
   WHERE document_id = ? AND (standard_name LIKE '%1473%' OR standard_name LIKE '%27914%')`,
  docId,
).c
const specDim = q(
  `SELECT length(embedding)/4 AS dim FROM pretraining_extracted_specs WHERE document_id = ? ORDER BY id DESC LIMIT 1`,
  docId,
)?.dim
const stdDim = q(
  `SELECT length(embedding)/4 AS dim FROM pretraining_extracted_standards WHERE document_id = ? ORDER BY id DESC LIMIT 1`,
  docId,
)?.dim
const supDim = q(
  `SELECT length(embedding)/4 AS dim FROM pretraining_extracted_suppliers WHERE document_id = ? ORDER BY id DESC LIMIT 1`,
  docId,
)?.dim

db.close()

console.log('\n===== INGEST COMPLETE =====')
console.log(`doc_id................... ${docId}`)
console.log(`parts inserted........... ${stats.parts_ins}  (dedup-skipped: ${stats.parts_skip}, unverified-MPNs nulled: ${stats.parts_mpn_nulled})`)
console.log(`specs inserted........... ${stats.specs_ins}  (dedup-skipped: ${stats.specs_skip})`)
console.log(`standards inserted....... ${stats.standards_ins}  (dropped not-applicable: ${stats.standards_drop}, dedup-skipped: ${stats.standards_skip})`)
console.log(`suppliers inserted....... ${stats.suppliers_ins}  (dedup-skipped: ${stats.suppliers_skip})`)
console.log('--- verification ---')
console.log(`sample new PART embed dim. ${sampleDim}  (expect 1536)`)
console.log(`new SPEC embed dim........ ${specDim}  (expect 1536)`)
console.log(`new STANDARD embed dim.... ${stdDim}  (expect 1536)`)
console.log(`new SUPPLIER embed dim.... ${supDim}  (expect 1536)`)
console.log(`gate-20 candidate-MPN!=NULL ${gate20}  (MUST be 0)`)
console.log(`new rows with NULL embed... ${nullEmbedNew}  (MUST be 0)`)
console.log(`EN 1473 / 27914 in new std. ${en1473}  (MUST be 0)`)

if (gate20 !== 0 || nullEmbedNew !== 0 || en1473 !== 0 || sampleDim !== 1536) {
  console.error('\nVERIFY FAILED — see above.')
  process.exit(2)
}
console.log('\nAll invariants hold.')
