import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Database from 'better-sqlite3'

import {
  PCB_VERIFIED_CANDIDATES,
  ingestPcbVerifiedCandidates,
} from './ingest-pcb-verified-candidates'

describe('off-chain verified PCB candidate ingest', () => {
  const temporaryDirectories: string[] = []

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  function createTemporaryDatabase(): string {
    const directory = mkdtempSync(join(tmpdir(), 'pcb-candidate-ingest-'))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, 'forge-truth.db')
    const database = new Database(databasePath)
    database.exec(`
      CREATE TABLE pretraining_spec_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_class TEXT,
        manufacturer TEXT,
        product_name TEXT,
        source_url TEXT,
        document_type TEXT,
        extraction_status TEXT,
        source_type TEXT
      );
      CREATE TABLE pretraining_extracted_parts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        part_name TEXT,
        manufacturer TEXT,
        part_number TEXT,
        raw_excerpt TEXT,
        confidence REAL,
        embedding BLOB,
        embed_hash TEXT,
        component_class TEXT,
        source_doc_id TEXT,
        discovered_at TEXT,
        discovery_source TEXT
      );
    `)
    database.close()
    return databasePath
  }

  it('writes only the declared exact candidates with complete evidence metadata', async () => {
    const databasePath = createTemporaryDatabase()
    const embedding = Buffer.alloc(1536 * 4, 7)

    const result = await ingestPcbVerifiedCandidates({
      databasePath,
      commit: true,
      embed: async () => embedding,
      now: '2026-07-18T22:30:00.000Z',
    })

    expect(result).toEqual({
      inserted: PCB_VERIFIED_CANDIDATES.length,
      updated: 0,
      unchanged: 0,
      embedded: PCB_VERIFIED_CANDIDATES.length,
      dryRun: false,
    })

    const database = new Database(databasePath, { readonly: true })
    const rows = database.prepare(`
      SELECT manufacturer, part_number, raw_excerpt, component_class,
             source_doc_id, discovery_source, confidence, length(embedding) AS embedding_bytes
      FROM pretraining_extracted_parts
      ORDER BY part_number
    `).all() as Array<Record<string, unknown>>
    database.close()

    expect(rows).toHaveLength(PCB_VERIFIED_CANDIDATES.length)
    expect(rows.map((row) => row.part_number).sort()).toEqual(
      PCB_VERIFIED_CANDIDATES.map((candidate) => candidate.partNumber).sort(),
    )
    for (const row of rows) {
      const metadata = JSON.parse(String(row.raw_excerpt)) as Record<string, unknown>
      expect(metadata).toEqual(expect.objectContaining({
        sourceUrl: expect.stringMatching(/^https:\/\//),
        sourceCommit: expect.stringMatching(/^[0-9a-f]{40}$/),
        package: expect.any(String),
        function: expect.any(String),
        ratings: expect.any(Object),
      }))
      expect(row.source_doc_id).toBe(metadata.sourceUrl)
      expect(row.discovery_source).toBe('manufacturer_verified_pcb_ingest')
      expect(row.confidence).toBe(0.95)
      expect(row.embedding_bytes).toBe(1536 * 4)
    }
    expect(rows.map((row) => row.part_number)).toEqual(expect.arrayContaining([
      'ESP-WROOM-02',
      'MAX1771ESA',
      'ADS1114IDGSR',
      '22-23-2031',
      'MCP1700T-3302E/TT',
      'NAU7802SGI',
      'OPA334AIDBVR',
      'SZYY0603B',
      '1.0T-4P',
      'SSQ-120-03-T-D',
      'MCP41050-I/SN',
      'PESD5V0L5UY',
      'MCP6002-I/SN',
    ]))
  })

  it('is idempotent and does not duplicate documents or part rows', async () => {
    const databasePath = createTemporaryDatabase()
    const options = {
      databasePath,
      commit: true,
      embed: async (): Promise<Buffer> => Buffer.alloc(1536 * 4, 3),
      now: '2026-07-18T22:30:00.000Z',
    }

    await ingestPcbVerifiedCandidates(options)
    const second = await ingestPcbVerifiedCandidates(options)

    expect(second).toEqual({
      inserted: 0,
      updated: 0,
      unchanged: PCB_VERIFIED_CANDIDATES.length,
      embedded: 0,
      dryRun: false,
    })

    const database = new Database(databasePath, { readonly: true })
    const documentCount = database.prepare(
      'SELECT COUNT(*) AS count FROM pretraining_spec_documents',
    ).get() as { count: number }
    const partCount = database.prepare(
      'SELECT COUNT(*) AS count FROM pretraining_extracted_parts',
    ).get() as { count: number }
    database.close()

    expect(documentCount.count).toBe(PCB_VERIFIED_CANDIDATES.length)
    expect(partCount.count).toBe(PCB_VERIFIED_CANDIDATES.length)
  })

  it('preserves an existing embedding when an update cannot generate a replacement', async () => {
    const databasePath = createTemporaryDatabase()
    const originalEmbedding = Buffer.alloc(1536 * 4, 9)
    const database = new Database(databasePath)
    database.prepare(`
      INSERT INTO pretraining_spec_documents
        (product_class, manufacturer, product_name, source_url, document_type,
         extraction_status, source_type)
      VALUES ('legacy', 'Texas Instruments', 'OP07CDR', 'https://example.invalid',
              'legacy', 'done', 'legacy')
    `).run()
    database.prepare(`
      INSERT INTO pretraining_extracted_parts
        (document_id, part_name, manufacturer, part_number, raw_excerpt,
         confidence, embedding, embed_hash, component_class, source_doc_id,
         discovered_at, discovery_source)
      VALUES (1, 'Legacy OP07', 'Texas Instruments', 'OP07CDR', '{}',
              0.5, ?, 'legacy-hash', 'legacy', 'legacy', '2020-01-01', 'legacy')
    `).run(originalEmbedding)
    database.close()

    const result = await ingestPcbVerifiedCandidates({
      databasePath,
      commit: true,
      embed: async () => null,
      now: '2026-07-18T22:30:00.000Z',
    })

    expect(result.updated).toBe(1)
    const verified = new Database(databasePath, { readonly: true })
    const row = verified.prepare(`
      SELECT embedding
      FROM pretraining_extracted_parts
      WHERE part_number = 'OP07CDR'
    `).get() as { embedding: Buffer }
    verified.close()
    expect(row.embedding.equals(originalEmbedding)).toBe(true)
  })
})
