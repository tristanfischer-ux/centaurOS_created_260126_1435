/**
 * @file Off-chain ingest for exact manufacturer-backed PCB candidates.
 * @description Writes frozen-reference identities into forge-truth so
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
  ratings: Record<string, string | number | boolean>
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
    partName: 'ESP-WROOM-02 ESP8266 Wi-Fi module',
    manufacturer: 'Espressif Systems',
    partNumber: 'ESP-WROOM-02',
    componentClass: 'connectivity_ic',
    function: '3.3 V Wi-Fi control module with UART, GPIO and PCB antenna',
    package: '18-pad 18 x 20 mm surface-mount module with PCB antenna',
    ratings: {
      supplyVoltageV: '3.0 to 3.6',
      recommendedSupplyCurrentA: 0.5,
      pinCount: 18,
    },
    sourceUrl: 'https://documentation.espressif.com/0c-esp-wroom-02_datasheet_en.pdf',
    sourceCommit: '181768d6ec068a6dd68593042167699285744768',
    evidence: 'Espressif datasheet defines the 18-pad module pinout, 3.3 V supply and antenna keepout; frozen NinjaPCR ESP2 uses the exact ESP-WROOM-02 symbol and footprint.',
  },
  {
    partName: 'MAX1771 adjustable step-up DC-DC controller',
    manufacturer: 'Maxim Integrated',
    partNumber: 'MAX1771ESA',
    componentClass: 'regulator',
    function: 'adjustable high-voltage boost converter controller with external N-channel MOSFET',
    package: '8-pin narrow SO surface-mount package',
    ratings: {
      inputVoltageV: '2 to 16.5',
      presetOutputVoltageV: 12,
      switchingFrequencyKhz: 300,
    },
    sourceUrl: 'https://www.analog.com/media/en/technical-documentation/data-sheets/MAX1771.pdf',
    sourceCommit: '934a44db3ed41c24ae4dddb5b805a22e4166284b',
    evidence: 'Maxim datasheet lists MAX1771ESA in 8-pin SO with a 2-16.5 V input range; frozen OpenDrop U1 uses exact value MAX1771ESA and SO08 footprint.',
  },
  {
    partName: 'ADS1114 single-channel 16-bit delta-sigma ADC',
    manufacturer: 'Texas Instruments',
    partNumber: 'ADS1114IDGSR',
    componentClass: 'sensor_ic',
    function: 'precision photodiode signal conversion with PGA, reference, comparator and I2C',
    package: 'VSSOP (DGS), 10 pins, tape and reel',
    ratings: {
      supplyVoltageV: '2.0 to 5.5',
      resolutionBits: 16,
      sampleRateSps: 860,
    },
    sourceUrl: 'https://www.ti.com/lit/ds/symlink/ads1114.pdf',
    sourceCommit: 'ca40a91e728801b139b1086853f7cf74ce76def9',
    evidence: 'TI SBAS444E lists ADS1114IDGSR in 10-pin VSSOP; frozen Eye-Spy BOM and U2 schematic property give the exact ordering code and DGS footprint.',
  },
  {
    partName: 'MCP1700 fixed 3.3 V low-quiescent-current LDO',
    manufacturer: 'Microchip Technology',
    partNumber: 'MCP1700T-3302E/TT',
    componentClass: 'regulator',
    function: '3.3 V low-current linear regulation from a supply no higher than 6 V',
    package: '3-lead SOT-23 (TT), tape and reel',
    ratings: {
      inputVoltageV: '2.3 to 6.0',
      outputVoltageV: 3.3,
      outputCurrentA: 0.25,
      pinCount: 3,
    },
    sourceUrl: 'https://ww1.microchip.com/downloads/en/DeviceDoc/MCP1700-Data-Sheet-20001826F.pdf',
    sourceCommit: 'd43f46aafa1b722fe2f7a42cd1e026712acfe4b5',
    evidence: 'Microchip DS20001826F identifies MCP1700T-3302E/TT as 3.3 V in three-lead SOT-23 and defines pins 1 GND, 2 VOUT, 3 VIN; its 6 V maximum rejects direct use on a 12 V rail.',
  },
  {
    partName: 'NAU7802 24-bit bridge-sensor ADC',
    manufacturer: 'Nuvoton Technology Corporation',
    partNumber: 'NAU7802SGI',
    componentClass: 'sensor_ic',
    function: 'high-resolution low-rate differential bridge and strain-gauge conversion',
    package: 'SOP-16, 150 mil',
    ratings: {
      supplyVoltageV: '2.7 to 5.5',
      resolutionBits: 24,
      pinCount: 16,
    },
    sourceUrl: 'https://www.nuvoton.com/export/resource-files/en-us--DS_NAU7802_DataSheet_EN_Rev2.6.pdf',
    sourceCommit: 'd43f46aafa1b722fe2f7a42cd1e026712acfe4b5',
    evidence: 'Nuvoton NAU7802 Rev2.6 defines the complete SOP-16 pinout and the NAU7802SGI product record identifies SOP-16; this bridge ADC is not evidence for generic electrochemical or high-voltage ADC roles.',
  },
  {
    partName: 'OPA334 zero-drift operational amplifier with shutdown',
    manufacturer: 'Texas Instruments',
    partNumber: 'OPA334AIDBVR',
    componentClass: 'op_amp',
    function: 'single-supply zero-drift amplification with logic-controlled shutdown',
    package: 'SOT-23 (DBV), 6 pins, tape and reel',
    ratings: {
      supplyVoltageV: '2.7 to 5.5',
      pinCount: 6,
      shutdown: true,
    },
    sourceUrl: 'https://www.ti.com/lit/ds/symlink/opa334.pdf',
    sourceCommit: 'd43f46aafa1b722fe2f7a42cd1e026712acfe4b5',
    evidence: 'TI SBOS213D identifies OPA334AIDBVR as the shutdown version in six-pin SOT-23 DBV and defines pins 1 OUT, 2 V-, 3 +IN, 4 -IN, 5 ENABLE, 6 V+; the prior SOT-23-5 mapping was false.',
  },
  {
    partName: 'KK 254 three-circuit vertical friction-lock header',
    manufacturer: 'Molex',
    partNumber: '22-23-2031',
    componentClass: 'connector',
    function: 'three-circuit keyed fan power and tachometer wire-to-board interconnect',
    package: 'vertical through-hole header, 3 circuits, 2.54 mm pitch',
    ratings: {
      voltageV: 250,
      currentA: 2.5,
      contactCount: 3,
    },
    sourceUrl: 'https://www.molex.com/en-us/products/part-detail/22232031',
    sourceCommit: '181768d6ec068a6dd68593042167699285744768',
    evidence: 'Molex KK 254 product specification covers 6410 vertical friction-lock headers at 250 V and 2.5 A; frozen NinjaPCR FAN1 uses exact ordering code 22-23-2031.',
  },
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
