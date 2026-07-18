/**
 * @file Off-chain ingest for exact manufacturer-backed PCB candidates.
 * @description Writes three frozen-reference identities into forge-truth so
 * chain-side resolution remains a DB-only read. No live distributor adapter is
 * imported or called from this module.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

import Database from 'better-sqlite3'

const DISCOVERY_SOURCE = 'manufacturer_verified_pcb_ingest'
const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 1536

interface PcbVerifiedCandidate {
  partName: string
  manufacturer: string
  partNumber: string
  componentClass: string
  function: string
  package: string
  ratings: Record<string, string | number>
  sourceUrl: string
  sourceCommit: string
  evidence: string
}

export interface PcbCandidateIngestOptions {
  databasePath: string
  commit: boolean
  embed?: (text: string) => Promise<Buffer | null>
  now?: string
}

export interface PcbCandidateIngestResult {
  inserted: number
  updated: number
  unchanged: number
  embedded: number
  dryRun: boolean
}

/**
 * @description The only identities this focused ingest is authorised to write.
 * Metadata is transcribed from the manufacturer sources and frozen reference
 * revisions already cited by the function-keyed PCB resolver.
 */
export const PCB_VERIFIED_CANDIDATES: readonly PcbVerifiedCandidate[] = [
  {
    partName: 'OP07C precision single operational amplifier',
    manufacturer: 'Texas Instruments',
    partNumber: 'OP07CDR',
    componentClass: 'op_amp',
    function: 'precision bipolar DAC shift and scale operational amplifier',
    package: 'SOIC (D), 8 pins, tape and reel',
    ratings: {
      recommendedSupplyVoltageV: 36,
      recommendedDualSupplyVoltageV: '±18',
      operatingTemperatureC: '0 to 70',
    },
    sourceUrl: 'https://www.ti.com/lit/ds/symlink/op07.pdf',
    sourceCommit: '86e4708fea84f8fc33bcbfc9a706b06f4b770efd',
    evidence: 'TI SLOS099H lists active OP07CDR in 8-pin SOIC (D); frozen Rodeostat BOM maps U11/U13 to OP07CDR.',
  },
  {
    partName: 'TL072C low-noise dual JFET-input operational amplifier',
    manufacturer: 'STMicroelectronics',
    partNumber: 'TL072CDT',
    componentClass: 'op_amp',
    function: 'dual selectable-gain transimpedance and current measurement amplifier',
    package: 'SO-8, tape and reel',
    ratings: {
      supplyVoltageV: 36,
      dualSupplyVoltageV: '±18',
      operatingTemperatureC: '0 to 70',
    },
    sourceUrl: 'https://www.st.com/resource/en/datasheet/tl072.pdf',
    sourceCommit: '86e4708fea84f8fc33bcbfc9a706b06f4b770efd',
    evidence: 'ST TL072 production datasheet specifies a dual JFET-input amplifier in SO-8; frozen Rodeostat BOM maps U9 to TL072CDT.',
  },
  {
    partName: 'USB 3.2 Gen 2 Type-C 24-contact receptacle',
    manufacturer: 'Amphenol ICC',
    partNumber: '12401610E4#2A',
    componentClass: 'usb_connector',
    function: 'full-featured USB-C power and data receptacle',
    package: 'right-angle top-mount dual-row SMT receptacle, 24 contacts',
    ratings: {
      candidateRequiredVoltageV: 5,
      candidateRequiredCurrentA: 5,
      contactCount: 24,
      interface: 'USB 3.2 Gen 2',
    },
    sourceUrl: 'https://www.amphenol-cs.com/product/12401610E42A.html',
    sourceCommit: '934a44db3ed41c24ae4dddb5b805a22e4166284b',
    evidence: 'Amphenol product data identifies 12401610E4#2A as a 24-contact right-angle top-mount USB Type-C receptacle; frozen OpenDrop J1 uses its exact footprint.',
  },
] as const

interface ExistingPartRow {
  id: number
  document_id: number
  part_name: string | null
  raw_excerpt: string | null
  confidence: number | null
  embedding?: Buffer | null
  embed_hash?: string | null
  component_class?: string | null
  source_doc_id?: string | null
  discovery_source?: string | null
}

function tableColumns(database: Database.Database, table: string): Set<string> {
  const rows = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return new Set(rows.map((row) => row.name))
}

function metadataFor(candidate: PcbVerifiedCandidate): string {
  return JSON.stringify({
    evidence: candidate.evidence,
    function: candidate.function,
    package: candidate.package,
    ratings: candidate.ratings,
    sourceCommit: candidate.sourceCommit,
    sourceUrl: candidate.sourceUrl,
  })
}

function embeddingSource(candidate: PcbVerifiedCandidate, metadata: string): string {
  return [
    candidate.partName,
    candidate.manufacturer,
    candidate.partNumber,
    candidate.componentClass,
    metadata,
  ].join(' ')
}

function embeddingHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 32)
}

function loadOpenAiKey(): string | null {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY
  const environmentPath = resolve(__dirname, '..', '..', '.env.local')
  if (!existsSync(environmentPath)) return null
  const match = readFileSync(environmentPath, 'utf8').match(/^OPENAI_API_KEY="?([^"\n]+)"?/m)
  return match?.[1] ?? null
}

async function requestEmbedding(text: string): Promise<Buffer | null> {
  const apiKey = loadOpenAiKey()
  if (!apiKey) return null
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: text.slice(0, 8000),
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    })
    if (!response.ok) {
      console.error('[PcbCandidateIngest] Embedding request failed:', {
        status: response.status,
      })
      return null
    }
    const payload = await response.json() as { data?: Array<{ embedding?: number[] }> }
    const vector = payload.data?.[0]?.embedding
    if (!vector || vector.length !== EMBEDDING_DIMENSIONS) {
      console.error('[PcbCandidateIngest] Embedding response has wrong dimensions:', {
        expected: EMBEDDING_DIMENSIONS,
        actual: vector?.length ?? 0,
      })
      return null
    }
    const buffer = Buffer.alloc(vector.length * 4)
    vector.forEach((value, index) => buffer.writeFloatLE(value, index * 4))
    return buffer
  } catch (error) {
    console.error('[PcbCandidateIngest] Embedding request errored:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return null
  }
}

function ensureDocument(
  database: Database.Database,
  candidate: PcbVerifiedCandidate,
): number {
  const existing = database.prepare(`
    SELECT id
    FROM pretraining_spec_documents
    WHERE source_url = ? AND LOWER(manufacturer) = LOWER(?) AND product_name = ?
    LIMIT 1
  `).get(
    candidate.sourceUrl,
    candidate.manufacturer,
    candidate.partNumber,
  ) as { id: number } | undefined
  if (existing) return existing.id

  const inserted = database.prepare(`
    INSERT INTO pretraining_spec_documents
      (product_class, manufacturer, product_name, source_url, document_type,
       extraction_status, source_type)
    VALUES ('pcb_component', ?, ?, ?, 'manufacturer_datasheet', 'done', ?)
  `).run(
    candidate.manufacturer,
    candidate.partNumber,
    candidate.sourceUrl,
    DISCOVERY_SOURCE,
  )
  return Number(inserted.lastInsertRowid)
}

function hasCurrentMetadata(
  row: ExistingPartRow,
  candidate: PcbVerifiedCandidate,
  metadata: string,
  hash: string,
  supportsEmbedding: boolean,
): boolean {
  return row.part_name === candidate.partName
    && row.raw_excerpt === metadata
    && row.confidence === 0.95
    && row.component_class === candidate.componentClass
    && row.source_doc_id === candidate.sourceUrl
    && row.discovery_source === DISCOVERY_SOURCE
    && (!supportsEmbedding || (row.embedding != null && row.embed_hash === hash))
}

/**
 * @description Idempotently ingests the exact manufacturer-backed PCB
 * candidates into a supplied forge-truth-compatible SQLite database.
 * @param options Database path, write mode, optional embedding implementation,
 * and deterministic timestamp override.
 * @returns Counts of inserted, updated, unchanged, and embedded rows.
 * @throws When the database or required tables/columns are unavailable.
 */
export async function ingestPcbVerifiedCandidates(
  options: PcbCandidateIngestOptions,
): Promise<PcbCandidateIngestResult> {
  // INTENT: Resolve frozen-gold identity misses through a separately operated
  // evidence ingest while preserving the runtime chain as a pure DB consumer.
  if (!existsSync(options.databasePath)) {
    throw new Error(`forge-truth database not found: ${options.databasePath}`)
  }
  const database = new Database(options.databasePath, { readonly: !options.commit })
  database.pragma('busy_timeout = 4000')
  const partColumns = tableColumns(database, 'pretraining_extracted_parts')
  const supportsEmbedding = partColumns.has('embedding') && partColumns.has('embed_hash')
  const supportsMetadata = ['component_class', 'source_doc_id', 'discovery_source', 'discovered_at']
    .every((column) => partColumns.has(column))
  if (!supportsMetadata) {
    database.close()
    throw new Error('pretraining_extracted_parts lacks required provenance metadata columns')
  }

  let inserted = 0
  let updated = 0
  let unchanged = 0
  let embedded = 0
  const now = options.now ?? new Date().toISOString()
  const embed = options.embed ?? requestEmbedding

  try {
    for (const candidate of PCB_VERIFIED_CANDIDATES) {
      const metadata = metadataFor(candidate)
      const sourceText = embeddingSource(candidate, metadata)
      const hash = embeddingHash(sourceText)
      const optionalSelect = supportsEmbedding ? ', embedding, embed_hash' : ''
      const existing = database.prepare(`
        SELECT id, document_id, part_name, raw_excerpt, confidence,
               component_class, source_doc_id, discovery_source
               ${optionalSelect}
        FROM pretraining_extracted_parts
        WHERE LOWER(manufacturer) = LOWER(?) AND LOWER(part_number) = LOWER(?)
        LIMIT 1
      `).get(candidate.manufacturer, candidate.partNumber) as ExistingPartRow | undefined

      if (existing && hasCurrentMetadata(existing, candidate, metadata, hash, supportsEmbedding)) {
        unchanged++
        continue
      }
      if (!options.commit) {
        if (existing) updated++
        else inserted++
        continue
      }

      const documentId = ensureDocument(database, candidate)
      const embedding = supportsEmbedding ? await embed(sourceText) : null
      if (embedding) embedded++
      if (existing) {
        const embeddingSet = supportsEmbedding ? ', embedding = ?, embed_hash = ?' : ''
        const values: unknown[] = [
          documentId,
          candidate.partName,
          metadata,
          candidate.componentClass,
          candidate.sourceUrl,
          now,
          DISCOVERY_SOURCE,
        ]
        if (supportsEmbedding) {
          values.push(
            embedding ?? existing.embedding ?? null,
            embedding ? hash : existing.embed_hash ?? null,
          )
        }
        values.push(existing.id)
        database.prepare(`
          UPDATE pretraining_extracted_parts
          SET document_id = ?, part_name = ?, raw_excerpt = ?, confidence = 0.95,
              component_class = ?, source_doc_id = ?, discovered_at = ?,
              discovery_source = ? ${embeddingSet}
          WHERE id = ?
        `).run(...values)
        updated++
      } else {
        const embeddingColumns = supportsEmbedding ? ', embedding, embed_hash' : ''
        const embeddingPlaceholders = supportsEmbedding ? ', ?, ?' : ''
        const values: unknown[] = [
          documentId,
          candidate.partName,
          candidate.manufacturer,
          candidate.partNumber,
          metadata,
          candidate.componentClass,
          candidate.sourceUrl,
          now,
          DISCOVERY_SOURCE,
        ]
        if (supportsEmbedding) values.push(embedding, embedding ? hash : null)
        database.prepare(`
          INSERT INTO pretraining_extracted_parts
            (document_id, part_name, manufacturer, part_number, raw_excerpt,
             confidence, component_class, source_doc_id, discovered_at,
             discovery_source ${embeddingColumns})
          VALUES (?, ?, ?, ?, ?, 0.95, ?, ?, ?, ? ${embeddingPlaceholders})
        `).run(...values)
        inserted++
      }
    }
  } finally {
    database.close()
  }

  return {
    inserted,
    updated,
    unchanged,
    embedded,
    dryRun: !options.commit,
  }
}

async function main(): Promise<void> {
  const databaseArg = process.argv.find((argument) => argument.startsWith('--db='))
  const databasePath = databaseArg?.slice('--db='.length)
    ?? resolve(homedir(), '.forge-truth', 'forge-truth.db')
  const commit = process.argv.includes('--commit')
  const result = await ingestPcbVerifiedCandidates({ databasePath, commit })
  console.log('[PcbCandidateIngest] Complete:', {
    databasePath,
    ...result,
  })
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('[PcbCandidateIngest] Failed:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    process.exit(1)
  })
}
