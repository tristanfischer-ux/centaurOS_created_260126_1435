import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseCsvRecords } from './io/csv'
import {
  PRODUCT_CLASSES,
  type ProductClass,
  type SourceGrade,
  type SourcingEvidenceRecord,
  type VerificationEvidenceKind,
  type VerificationEvidenceRecord,
  type VerificationEvidenceVerdict,
} from './schema/types'
import { runReportCompiler } from './pipeline/run-report-compiler'
import { renderReportArtifactIndex, writeReportArtifacts, type ReportArtifactSet } from './pipeline/report-artifacts'

export interface CompileBriefOptions {
  id: string
  briefText: string
  title?: string
  productClass?: ProductClass
  outDir: string
  writePdf?: boolean
  sourcingEvidence?: SourcingEvidenceRecord[]
  verificationEvidence?: VerificationEvidenceRecord[]
}

export interface CompileBriefResult {
  artifacts: ReportArtifactSet
  indexPath: string
  productClass: ProductClass
  verdict: string
  htmlPath: string
  pdfPath?: string
  pdfSkippedReason?: string
}

export async function compileBriefToArtifacts(options: CompileBriefOptions): Promise<CompileBriefResult> {
  const result = await runReportCompiler({
    id: options.id,
    briefText: options.briefText,
    productClass: options.productClass,
    sourcingEvidence: options.sourcingEvidence,
    verificationEvidence: options.verificationEvidence,
  })
  const title = options.title ?? result.dossier.brief.productName
  const artifacts = await writeReportArtifacts({
    id: options.id,
    title,
    outDir: options.outDir,
    result,
    writePdf: options.writePdf,
  })
  const indexPath = resolve(options.outDir, 'index.html')
  await writeFile(indexPath, renderReportArtifactIndex([artifacts], `${title} Artifacts`), 'utf8')
  const readiness = JSON.parse(await readFile(artifacts.readinessGatePath, 'utf8')) as { verdict?: string }
  return {
    artifacts,
    indexPath,
    productClass: result.dossier.productClass,
    verdict: readiness.verdict ?? 'unknown',
    htmlPath: artifacts.htmlPath,
    pdfPath: artifacts.pdfPath,
    pdfSkippedReason: artifacts.pdfSkippedReason,
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }
  const briefText = await resolveBriefText(args)
  const id = sanitiseId(args.id ?? 'custom-report')
  const productClass = parseProductClass(args.productClass)
  const outDir = resolve(args.outDir ?? `report-compiler-prototype/out/custom-${id}`)
  if (args.sourcingEvidenceFile && args.sourcingEvidenceCsv) throw new Error('Use either --sourcing-evidence-file or --sourcing-evidence-csv, not both.')
  if (args.verificationEvidenceFile && args.verificationEvidenceCsv) throw new Error('Use either --verification-evidence-file or --verification-evidence-csv, not both.')
  const sourcingEvidence = args.sourcingEvidenceFile
    ? await readJsonArray<SourcingEvidenceRecord>(args.sourcingEvidenceFile, 'sourcing evidence')
    : args.sourcingEvidenceCsv
      ? await readSourcingEvidenceCsv(args.sourcingEvidenceCsv)
      : undefined
  const verificationEvidence = args.verificationEvidenceFile
    ? await readJsonArray<VerificationEvidenceRecord>(args.verificationEvidenceFile, 'verification evidence')
    : args.verificationEvidenceCsv
      ? await readVerificationEvidenceCsv(args.verificationEvidenceCsv)
      : undefined
  const compiled = await compileBriefToArtifacts({
    id,
    title: args.title,
    briefText,
    productClass,
    outDir,
    writePdf: !args.noPdf,
    sourcingEvidence,
    verificationEvidence,
  })
  console.log(JSON.stringify({
    id,
    productClass: compiled.productClass,
    verdict: compiled.verdict,
    indexPath: compiled.indexPath,
    htmlPath: compiled.htmlPath,
    pdfPath: compiled.pdfPath,
    pdfSkippedReason: compiled.pdfSkippedReason,
  }, null, 2))
}

interface CliArgs {
  id?: string
  title?: string
  brief?: string
  briefFile?: string
  productClass?: string
  outDir?: string
  sourcingEvidenceFile?: string
  sourcingEvidenceCsv?: string
  verificationEvidenceFile?: string
  verificationEvidenceCsv?: string
  noPdf: boolean
  help: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const parsed: CliArgs = { noPdf: false, help: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') parsed.help = true
    else if (arg === '--no-pdf') parsed.noPdf = true
    else if (arg === '--id') parsed.id = requiredValue(argv, ++i, arg)
    else if (arg === '--title') parsed.title = requiredValue(argv, ++i, arg)
    else if (arg === '--brief') parsed.brief = requiredValue(argv, ++i, arg)
    else if (arg === '--brief-file') parsed.briefFile = requiredValue(argv, ++i, arg)
    else if (arg === '--product-class') parsed.productClass = requiredValue(argv, ++i, arg)
    else if (arg === '--out-dir') parsed.outDir = requiredValue(argv, ++i, arg)
    else if (arg === '--sourcing-evidence-file') parsed.sourcingEvidenceFile = requiredValue(argv, ++i, arg)
    else if (arg === '--sourcing-evidence-csv') parsed.sourcingEvidenceCsv = requiredValue(argv, ++i, arg)
    else if (arg === '--verification-evidence-file') parsed.verificationEvidenceFile = requiredValue(argv, ++i, arg)
    else if (arg === '--verification-evidence-csv') parsed.verificationEvidenceCsv = requiredValue(argv, ++i, arg)
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`)
  }
  return parsed
}

async function resolveBriefText(args: CliArgs): Promise<string> {
  if (args.brief && args.briefFile) throw new Error('Use either --brief or --brief-file, not both.')
  const briefText = args.brief ?? (args.briefFile ? await readFile(args.briefFile, 'utf8') : '')
  if (!briefText.trim()) throw new Error(`Missing project brief.\n${usage()}`)
  return briefText.trim()
}

function parseProductClass(value: string | undefined): ProductClass | undefined {
  if (!value) return undefined
  if (!PRODUCT_CLASSES.includes(value as ProductClass)) {
    throw new Error(`Unknown product class "${value}". Expected one of: ${PRODUCT_CLASSES.join(', ')}`)
  }
  return value as ProductClass
}

async function readJsonArray<T>(path: string, label: string): Promise<T[]> {
  const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown
  if (!Array.isArray(parsed)) throw new Error(`${label} file must contain a JSON array.`)
  return parsed as T[]
}

export async function readSourcingEvidenceCsv(path: string): Promise<SourcingEvidenceRecord[]> {
  const records = parseCsvRecords(await readFile(path, 'utf8'))
  return records
    .filter(row => hasAnyValue(row, ['supplierName', 'manufacturer', 'mpn', 'unitCostGbp', 'leadTimeWeeks', 'evidence.ref', 'evidence.quote', 'retrievedAt']))
    .map((row, index) => ({
      componentWordId: requiredCell(row, 'componentWordId', path, index),
      supplierName: row.supplierName ?? '',
      manufacturer: blankToUndefined(row.manufacturer),
      mpn: blankToUndefined(row.mpn),
      unitCostGbp: parseOptionalNumber(row.unitCostGbp) ?? 0,
      leadTimeWeeks: parseOptionalNumber(row.leadTimeWeeks),
      sourceGrade: parseSourceGrade(row.sourceGrade, path, index),
      evidence: {
        kind: 'source',
        ref: row['evidence.ref'] ?? '',
        quote: row['evidence.quote'] ?? '',
      },
      retrievedAt: row.retrievedAt ?? '',
    }))
}

export async function readVerificationEvidenceCsv(path: string): Promise<VerificationEvidenceRecord[]> {
  const records = parseCsvRecords(await readFile(path, 'utf8'))
  return records
    .filter(row => hasAnyValue(row, ['reviewerName', 'verdict', 'evidenceRef', 'evidenceNote', 'reviewedAt']))
    .map((row, index) => ({
      activityId: requiredCell(row, 'activityId', path, index),
      evidenceKind: parseVerificationEvidenceKind(row.evidenceKind, path, index),
      reviewerName: row.reviewerName ?? '',
      verdict: parseVerificationVerdict(row.verdict, path, index),
      evidenceRef: row.evidenceRef ?? '',
      evidenceNote: row.evidenceNote ?? '',
      reviewedAt: row.reviewedAt ?? '',
    }))
}

function hasAnyValue(row: Record<string, string>, keys: string[]): boolean {
  return keys.some(key => Boolean(row[key]?.trim()))
}

function requiredCell(row: Record<string, string>, key: string, path: string, index: number): string {
  const value = row[key]?.trim()
  if (!value) throw new Error(`${path} row ${index + 2} is missing required ${key}.`)
  return value
}

function blankToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseSourceGrade(value: string | undefined, path: string, index: number): Extract<SourceGrade, 'verified' | 'priced' | 'catalogue'> {
  if (value === 'verified' || value === 'priced' || value === 'catalogue') return value
  if (!value?.trim()) return 'catalogue'
  throw new Error(`${path} row ${index + 2} has invalid sourceGrade "${value}".`)
}

function parseVerificationEvidenceKind(value: string | undefined, path: string, index: number): Exclude<VerificationEvidenceKind, 'source_evidence'> {
  if (value === 'design_review' || value === 'calculation' || value === 'interface_review' || value === 'compliance_review') return value
  throw new Error(`${path} row ${index + 2} has invalid verification evidenceKind "${value ?? ''}".`)
}

function parseVerificationVerdict(value: string | undefined, path: string, index: number): VerificationEvidenceVerdict {
  if (value === 'accepted' || value === 'rejected' || value === 'deferred') return value
  throw new Error(`${path} row ${index + 2} has invalid verification verdict "${value ?? ''}".`)
}

function requiredValue(argv: string[], index: number, flag: string): string {
  const value = argv[index]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`)
  return value
}

function sanitiseId(value: string): string {
  const id = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  if (!id) throw new Error('Report id must contain at least one letter or number.')
  return id
}

function usage(): string {
  return [
    'Usage:',
    '  npx tsx report-compiler-prototype/src/compile-brief.ts --id my-report --brief "Design ..."',
    '',
    'Options:',
    '  --brief TEXT                         Project brief to compile.',
    '  --brief-file PATH                    Read project brief from a text file.',
    '  --id ID                              Artifact id prefix. Default: custom-report.',
    '  --title TITLE                        Human-readable report title.',
    '  --product-class CLASS                Optional override; otherwise classifier selects a class.',
    '  --out-dir PATH                       Output directory. Default: report-compiler-prototype/out/custom-<id>.',
    '  --sourcing-evidence-file PATH        Optional JSON array of source-backed sourcing records.',
    '  --sourcing-evidence-csv PATH         Optional filled sourcing intake CSV exported by a prior run.',
    '  --verification-evidence-file PATH    Optional JSON array of reviewer evidence records.',
    '  --verification-evidence-csv PATH     Optional filled verification intake CSV exported by a prior run.',
    '  --no-pdf                             Skip PDF rendering.',
  ].join('\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
