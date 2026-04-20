/**
 * @file csv-import-view.tsx — Mockup-faithful client view for the Money CSV
 * import flow. Ports MONEY-MOCKUP-CSV-IMPORT.html 1:1 into scoped `.csv2`
 * classes.
 *
 * @description Three sections rendered top-to-bottom, matching the mockup's
 * stepper (Upload → Map columns → Review & commit). The user picks or drops
 * a CSV; the file is parsed entirely in the browser (no network round-trip);
 * headers are matched against the canonical plan_line_items field set via a
 * synonym table; a sample value per column is surfaced for confirmation; the
 * first 6 rows are classified as ready / warning / skip.
 *
 * **Persistence is NOT wired.** The Commit CTA is disabled with an honest
 * "Persistence wires up next round" chip. The upload parser lives here;
 * the server action that actually inserts rows into plan_line_items will
 * arrive in the next Money wave (cash-burn-import.ts already has the insert
 * engine — only the Money V2 adapter is missing). No file leaves the
 * browser on this page.
 *
 * @security Browser-local parsing only. No file upload. Pasted file content
 * stays in React state until the user navigates away.
 */

"use client"

import Link from "next/link"
import { useCallback, useMemo, useRef, useState } from "react"

import "./csv-import-v2.css"

// ─── Types ──────────────────────────────────────────────────────────────

type TargetField =
    | "name"
    | "direction"
    | "category"
    | "amount"
    | "frequency"
    | "effective_from"
    | "effective_to"
    | "notes"
    | "tags"
    | "xero_account"
    | "__skip__"

interface TargetFieldSpec {
    /** Value shown in the mapping dropdown. */
    label: string
    /** Synonyms for auto-match (lower-cased, punctuation stripped). */
    synonyms: string[]
}

interface ColumnMapping {
    /** The original header as it appeared in the CSV. */
    sourceHeader: string
    /** The target field chosen (auto or user). */
    target: TargetField
    /** 0..100 — 0 means "user must pick"; 100 means certain auto-match. */
    confidence: number
    /** First non-empty sample value from this column, truncated for display. */
    sampleValue: string
}

interface ParsedRow {
    /** Original row index (1-based, header is row 1 in the source file). */
    rowNumber: number
    /** Values keyed by source header. */
    cells: Record<string, string>
}

interface ReviewRow {
    rowNumber: number
    name: string
    categoryHint: string | null
    amountDisplay: string
    amountDirection: "in" | "out" | "unknown"
    frequency: string
    status: "ready" | "warn" | "skip"
    statusReason: string
}

// ─── Canonical target fields ────────────────────────────────────────────

// Target set mirrors plan_line_items columns in MONEY-SCHEMA §2 — we only
// surface the columns a founder is likely to include in a spreadsheet.
const TARGET_FIELDS: Record<TargetField, TargetFieldSpec> = {
    name: {
        label: "name",
        synonyms: ["name", "item", "description", "line", "line item", "label"],
    },
    direction: {
        label: "direction",
        synonyms: ["direction", "type", "in/out", "flow", "in or out"],
    },
    category: {
        label: "category",
        synonyms: ["category", "bucket", "group", "class", "classification"],
    },
    amount: {
        label: "amount",
        synonyms: [
            "amount",
            "amount (£)",
            "amount (gbp)",
            "value",
            "cost",
            "price",
            "£",
            "gbp",
            "total",
            "sum",
        ],
    },
    frequency: {
        label: "frequency",
        synonyms: ["frequency", "freq", "cadence", "schedule", "when", "every"],
    },
    effective_from: {
        label: "effective_from",
        synonyms: [
            "effective from",
            "effective_from",
            "start",
            "start date",
            "from",
            "begin",
            "begins",
            "starts",
        ],
    },
    effective_to: {
        label: "effective_to",
        synonyms: [
            "effective to",
            "effective_to",
            "end",
            "end date",
            "to",
            "until",
            "finish",
        ],
    },
    notes: {
        label: "notes",
        synonyms: ["notes", "note", "comment", "memo", "detail", "details"],
    },
    tags: {
        label: "tags",
        synonyms: ["tags", "tag", "labels"],
    },
    xero_account: {
        label: "xero_account",
        synonyms: [
            "xero",
            "xero_account",
            "xero account",
            "xero_ref",
            "xero ref",
            "account_code",
            "account code",
            "ledger",
        ],
    },
    __skip__: {
        label: "-- Skip this column --",
        synonyms: [],
    },
}

// Fields already consumed by the mapping table's "always shown" list. Used
// when drawing the select dropdown per unresolved column.
const TARGET_FIELD_ORDER: TargetField[] = [
    "name",
    "direction",
    "category",
    "amount",
    "frequency",
    "effective_from",
    "effective_to",
    "notes",
    "tags",
    "xero_account",
]

// ─── CSV parsing ────────────────────────────────────────────────────────

// Minimal dependency-free CSV parser that handles:
//   - comma OR semicolon delimiter (auto-detected per first data line)
//   - double-quoted fields with escaped quotes ("" → ")
//   - UTF-8 BOM stripping
//   - \r\n and \n line endings
// Returns { headers, rows } — blank lines are dropped, trailing whitespace
// on headers is trimmed. If the file is empty or has no header row, returns
// null.
function parseCsv(
    text: string,
): { headers: string[]; rows: ParsedRow[]; delimiter: "," | ";" } | null {
    // Strip BOM
    let cleaned = text
    if (cleaned.charCodeAt(0) === 0xfeff) cleaned = cleaned.slice(1)
    if (!cleaned.trim()) return null

    // Detect delimiter — count commas vs semicolons outside quotes in the
    // first 2 KB so a description field with semicolons doesn't fool us.
    const sample = cleaned.slice(0, 2000)
    let inQuote = false
    let commaCount = 0
    let semiCount = 0
    for (const ch of sample) {
        if (ch === "\"") inQuote = !inQuote
        else if (!inQuote && ch === ",") commaCount += 1
        else if (!inQuote && ch === ";") semiCount += 1
    }
    const delimiter: "," | ";" = semiCount > commaCount ? ";" : ","

    // Tokenise — state machine per character.
    const rows: string[][] = []
    let row: string[] = []
    let cell = ""
    let inQ = false
    for (let i = 0; i < cleaned.length; i += 1) {
        const ch = cleaned[i]
        if (inQ) {
            if (ch === "\"") {
                if (cleaned[i + 1] === "\"") {
                    cell += "\""
                    i += 1
                } else {
                    inQ = false
                }
            } else {
                cell += ch
            }
            continue
        }
        if (ch === "\"") {
            inQ = true
            continue
        }
        if (ch === delimiter) {
            row.push(cell)
            cell = ""
            continue
        }
        if (ch === "\r") continue
        if (ch === "\n") {
            row.push(cell)
            cell = ""
            rows.push(row)
            row = []
            continue
        }
        cell += ch
    }
    // Flush final cell / row
    if (cell.length > 0 || row.length > 0) {
        row.push(cell)
        rows.push(row)
    }

    // Drop fully empty rows.
    const nonEmpty = rows.filter((r) => r.some((v) => v.trim().length > 0))
    if (nonEmpty.length === 0) return null

    const headers = nonEmpty[0].map((h) => h.trim())
    const dataRows = nonEmpty.slice(1).map((cells, idx) => {
        const obj: Record<string, string> = {}
        for (let i = 0; i < headers.length; i += 1) {
            obj[headers[i]] = (cells[i] ?? "").trim()
        }
        return { rowNumber: idx + 2, cells: obj } satisfies ParsedRow
    })
    return { headers, rows: dataRows, delimiter }
}

// ─── Auto-mapping ───────────────────────────────────────────────────────

function normaliseHeader(header: string): string {
    return header
        .toLowerCase()
        .replace(/[_\-.]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
}

function autoMap(header: string): { target: TargetField; confidence: number } {
    const norm = normaliseHeader(header)
    if (!norm) return { target: "__skip__", confidence: 0 }

    let bestTarget: TargetField = "__skip__"
    let bestScore = 0
    for (const target of TARGET_FIELD_ORDER) {
        const spec = TARGET_FIELDS[target]
        for (const syn of spec.synonyms) {
            const s = normaliseHeader(syn)
            if (!s) continue
            if (norm === s) {
                if (bestScore < 99) {
                    bestScore = 99
                    bestTarget = target
                }
            } else if (norm.includes(s) || s.includes(norm)) {
                const score = Math.max(
                    80,
                    Math.round(
                        (Math.min(norm.length, s.length) /
                            Math.max(norm.length, s.length)) *
                            95,
                    ),
                )
                if (score > bestScore) {
                    bestScore = score
                    bestTarget = target
                }
            }
        }
    }
    return { target: bestTarget, confidence: bestScore }
}

// ─── Review classification ──────────────────────────────────────────────

function classifyRow(
    row: ParsedRow,
    columnMap: Map<TargetField, string>,
): ReviewRow {
    const nameCol = columnMap.get("name")
    const amountCol = columnMap.get("amount")
    const directionCol = columnMap.get("direction")
    const categoryCol = columnMap.get("category")
    const frequencyCol = columnMap.get("frequency")

    const name = nameCol ? row.cells[nameCol] : ""
    const rawAmount = amountCol ? row.cells[amountCol] : ""
    const rawDirection = directionCol
        ? row.cells[directionCol].toLowerCase()
        : ""
    const rawCategory = categoryCol ? row.cells[categoryCol] : ""
    const rawFrequency = frequencyCol ? row.cells[frequencyCol] : ""

    // Skip rule — no name AND no amount.
    if (!name.trim() && !rawAmount.trim()) {
        return {
            rowNumber: row.rowNumber,
            name: `(row ${row.rowNumber} · blank)`,
            categoryHint: "No name or amount — will be skipped",
            amountDisplay: "",
            amountDirection: "unknown",
            frequency: "",
            status: "skip",
            statusReason: "Skipped",
        }
    }

    // Parse the amount — strip £/$/commas/whitespace, keep the sign.
    const cleanAmt = rawAmount.replace(/[£$€,\s]/g, "")
    const parsed = cleanAmt === "" ? NaN : Number(cleanAmt)
    const hasValidAmount = Number.isFinite(parsed)

    let direction: "in" | "out" | "unknown" = "unknown"
    if (rawDirection === "in" || rawDirection === "out") direction = rawDirection
    else if (hasValidAmount && parsed < 0) direction = "out"
    else if (hasValidAmount && parsed > 0 && directionCol) direction = "in"

    const amountDisplay = hasValidAmount
        ? formatAmountForReview(Math.abs(parsed))
        : rawAmount || "—"

    const frequency = toTitleCase(rawFrequency)

    // Warning rules
    const warnings: string[] = []
    if (!rawCategory.trim() && categoryCol) {
        warnings.push("Category missing — needs manual pick")
    } else if (!categoryCol) {
        warnings.push("No category column mapped")
    }
    if (!rawFrequency.trim() && frequencyCol) {
        warnings.push("Frequency missing")
    }
    if (!hasValidAmount && amountCol) {
        warnings.push("Amount couldn't be parsed")
    }

    const status: ReviewRow["status"] =
        warnings.length > 0 ? "warn" : "ready"
    const statusReason =
        status === "warn" ? warnings[0] : "Ready to import"

    return {
        rowNumber: row.rowNumber,
        name: name || `(row ${row.rowNumber})`,
        categoryHint: rawCategory
            ? `${rawCategory}${rawFrequency ? ` · ${rawFrequency.toLowerCase()}` : ""}`
            : null,
        amountDisplay,
        amountDirection: direction,
        frequency,
        status,
        statusReason,
    }
}

function formatAmountForReview(value: number): string {
    if (!Number.isFinite(value)) return "—"
    if (value >= 1000) return `£${Math.round(value).toLocaleString()}`
    return `£${value.toFixed(value % 1 === 0 ? 0 : 2)}`
}

function toTitleCase(s: string): string {
    if (!s) return ""
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

// ─── Component ──────────────────────────────────────────────────────────

const MAX_BYTES = 10 * 1024 * 1024 // 10MB per mockup copy

export function CsvImportView(): React.ReactElement {
    const [fileName, setFileName] = useState<string | null>(null)
    const [fileSize, setFileSize] = useState<number | null>(null)
    const [uploadedAt, setUploadedAt] = useState<Date | null>(null)
    const [delimiter, setDelimiter] = useState<"," | ";" | null>(null)
    const [headers, setHeaders] = useState<string[]>([])
    const [rows, setRows] = useState<ParsedRow[]>([])
    const [mappings, setMappings] = useState<ColumnMapping[]>([])
    const [parseError, setParseError] = useState<string | null>(null)
    const [dragOver, setDragOver] = useState(false)
    const fileInputRef = useRef<HTMLInputElement | null>(null)

    // Persistence is not wired yet — Commit stays disabled whatever the
    // founder does on this page. Wiring lands in the cash-burn-import.ts
    // adapter PR.
    const canCommit = false

    // Derived state ----------------------------------------------------

    const autoCount = mappings.filter(
        (m) => m.target !== "__skip__" && m.confidence >= 80,
    ).length

    const ambiguousCount = mappings.filter(
        (m) => m.target !== "__skip__" && m.confidence > 0 && m.confidence < 80,
    ).length
    const skipCount = mappings.filter((m) => m.target === "__skip__").length

    const columnMap = useMemo<Map<TargetField, string>>(() => {
        const m = new Map<TargetField, string>()
        for (const row of mappings) {
            if (row.target !== "__skip__" && !m.has(row.target)) {
                m.set(row.target, row.sourceHeader)
            }
        }
        return m
    }, [mappings])

    const reviewRows = useMemo<ReviewRow[]>(() => {
        if (rows.length === 0) return []
        return rows.slice(0, 6).map((r) => classifyRow(r, columnMap))
    }, [rows, columnMap])

    const readyCount = useMemo(() => {
        return rows
            .map((r) => classifyRow(r, columnMap))
            .filter((r) => r.status === "ready").length
    }, [rows, columnMap])

    const warnCount = useMemo(() => {
        return rows
            .map((r) => classifyRow(r, columnMap))
            .filter((r) => r.status === "warn").length
    }, [rows, columnMap])

    const skipRowCount = useMemo(() => {
        return rows
            .map((r) => classifyRow(r, columnMap))
            .filter((r) => r.status === "skip").length
    }, [rows, columnMap])

    const isUploaded = fileName != null && headers.length > 0

    // Step statuses (mockup's three-step pill row)
    const stepState: { upload: "done" | "active"; map: "done" | "active"; review: "done" | "active" } = {
        upload: isUploaded ? "done" : "active",
        map:
            isUploaded && ambiguousCount === 0 && autoCount > 0
                ? "done"
                : "active",
        review: "active",
    }

    // File handling -----------------------------------------------------

    const ingestFile = useCallback(async (file: File) => {
        setParseError(null)
        if (file.size > MAX_BYTES) {
            setParseError(
                `File is ${(file.size / 1024 / 1024).toFixed(1)}MB — max is 10MB. Split the sheet or drop sections separately.`,
            )
            return
        }
        try {
            const text = await file.text()
            const parsed = parseCsv(text)
            if (!parsed || parsed.headers.length === 0) {
                setParseError(
                    "Couldn't find any header row. Save the file as CSV (with column titles in row 1) and try again.",
                )
                return
            }
            const mappingsNext: ColumnMapping[] = parsed.headers.map((header) => {
                const { target, confidence } = autoMap(header)
                // First non-empty sample from the first 10 rows
                let sample = ""
                for (const r of parsed.rows.slice(0, 10)) {
                    const v = r.cells[header]
                    if (v && v.length > 0) {
                        sample = v
                        break
                    }
                }
                return {
                    sourceHeader: header,
                    target,
                    confidence,
                    sampleValue: sample.length > 48 ? `${sample.slice(0, 45)}…` : sample,
                }
            })
            setFileName(file.name)
            setFileSize(file.size)
            setUploadedAt(new Date())
            setDelimiter(parsed.delimiter)
            setHeaders(parsed.headers)
            setRows(parsed.rows)
            setMappings(mappingsNext)
        } catch (err) {
            console.error("[MONEY-CSV-IMPORT] parse failed:", err)
            setParseError(
                "Couldn't read that file as CSV. Open it in Excel or Sheets, save as CSV, and try again.",
            )
        }
    }, [])

    const handlePickClick = useCallback(() => {
        fileInputRef.current?.click()
    }, [])

    const handleInputChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const f = e.target.files?.[0]
            if (f) void ingestFile(f)
            e.target.value = "" // so picking the same file twice re-parses
        },
        [ingestFile],
    )

    const handleDrop = useCallback(
        (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault()
            setDragOver(false)
            const f = e.dataTransfer.files?.[0]
            if (f) void ingestFile(f)
        },
        [ingestFile],
    )

    const handleReplace = useCallback(() => {
        setFileName(null)
        setFileSize(null)
        setUploadedAt(null)
        setDelimiter(null)
        setHeaders([])
        setRows([])
        setMappings([])
        setParseError(null)
        // Let the user pick a new file in the same gesture.
        setTimeout(() => fileInputRef.current?.click(), 0)
    }, [])

    const handleMappingChange = useCallback(
        (sourceHeader: string, value: string) => {
            setMappings((prev) =>
                prev.map((m) =>
                    m.sourceHeader === sourceHeader
                        ? {
                              ...m,
                              target: value as TargetField,
                              // User-overridden mappings are treated as certain.
                              confidence: value === "__skip__" ? 0 : 100,
                          }
                        : m,
                ),
            )
        },
        [],
    )

    // Render ------------------------------------------------------------

    return (
        <div className="csv2">
            {/* 1 · Breadcrumb + cancel */}
            <div className="csv2-page-head">
                <div className="csv2-crumbs">
                    <Link href="/money">Money</Link>
                    <span className="sep">›</span>
                    <Link href="/money/plan">Plan</Link>
                    <span className="sep">›</span>
                    <span className="current">Import CSV</span>
                </div>
                <div>
                    <Link href="/money/plan" className="csv2-btn sm">
                        ← Cancel
                    </Link>
                </div>
            </div>

            {/* 2 · Hero with honest-persistence chip */}
            <div className="csv2-head">
                <h1>Import from CSV</h1>
                <div className="sub">
                    Upload your spreadsheet — we&apos;ll guess which column is
                    which and you review the mapping before commit. Works with
                    Google Sheets export, Excel, or any plain CSV.
                </div>
                <div className="csv2-head-chips">
                    <span className="csv2-persist-chip">
                        Persistence wires up next round
                    </span>
                </div>
            </div>

            {/* 3 · Stepper */}
            <div className="csv2-stepper">
                <div className="stepper-label">Step</div>
                <a
                    href="#upload"
                    className={`step ${stepState.upload === "done" ? "done" : "active"}`}
                >
                    <span className="n">01</span>
                    <span className="lbl">Upload</span>
                    <span className="sub">
                        {isUploaded
                            ? `${fileName ?? ""} ✓`
                            : "Drop your CSV"}
                    </span>
                </a>
                <a
                    href="#map"
                    className={`step ${
                        isUploaded
                            ? stepState.map === "done"
                                ? "done"
                                : "active"
                            : ""
                    }`}
                >
                    <span className="n">02</span>
                    <span className="lbl">Map columns</span>
                    <span className="sub">
                        {isUploaded
                            ? `${autoCount} of ${mappings.length} auto`
                            : "Waiting on a file"}
                    </span>
                </a>
                <a
                    href="#review"
                    className={`step ${isUploaded ? "active" : ""}`}
                >
                    <span className="n">03</span>
                    <span className="lbl">Review &amp; commit</span>
                    <span className="sub">
                        {isUploaded
                            ? `${rows.length} row${rows.length === 1 ? "" : "s"}`
                            : "Not yet"}
                    </span>
                </a>
            </div>

            {/* STEP 1: UPLOAD */}
            <div className="csv2-section" id="upload">
                <h3>01 · Upload your CSV</h3>
                <div className="section-sub">
                    Drag-drop or browse. Max 10MB. Supports comma or semicolon
                    delimiters.
                </div>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv,text/plain"
                    className="hidden"
                    style={{ display: "none" }}
                    onChange={handleInputChange}
                />

                {!isUploaded && (
                    <div
                        className={`csv2-drop-zone ${dragOver ? "dragover" : ""}`}
                        onClick={handlePickClick}
                        onDragOver={(e) => {
                            e.preventDefault()
                            setDragOver(true)
                        }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault()
                                handlePickClick()
                            }
                        }}
                    >
                        <div className="dz-ic" aria-hidden="true">
                            ⬆
                        </div>
                        <h4>Drop your CSV here</h4>
                        <p>or click to browse. .csv only, max 10MB.</p>
                        <div className="btn-wrap">
                            <span className="csv2-btn">Choose a file</span>
                        </div>
                    </div>
                )}

                {isUploaded && fileName && fileSize != null && (
                    <div className="csv2-uploaded">
                        <div className="ic" aria-hidden="true">
                            ✓
                        </div>
                        <div>
                            <h4>{fileName} uploaded</h4>
                            <p>
                                {rows.length} row{rows.length === 1 ? "" : "s"} ·{" "}
                                {headers.length} column
                                {headers.length === 1 ? "" : "s"} detected ·{" "}
                                {formatRelativeUpload(uploadedAt)}
                                {delimiter === ";" && " · semicolon delimiter"}
                            </p>
                        </div>
                        <button
                            type="button"
                            className="csv2-btn sm"
                            onClick={handleReplace}
                        >
                            Replace
                        </button>
                    </div>
                )}

                {parseError && (
                    <div className="csv2-error-banner" role="alert">
                        <strong>Couldn&apos;t parse that file.</strong>{" "}
                        {parseError}
                    </div>
                )}

                <details className="csv2-template">
                    <summary>Download our CSV template</summary>
                    <div className="csv2-template-body">
                        <p style={{ margin: "0 0 8px" }}>
                            Columns we expect (all optional; order doesn&apos;t
                            matter):
                        </p>
                        <code>
                            name, direction, category, amount, frequency,
                            effective_from, notes, tags
                        </code>
                        <p style={{ margin: "8px 0 0" }}>
                            <a
                                className="link"
                                href={sampleCsvDataUri}
                                download="forgeos-plan-template.csv"
                            >
                                ⬇ template.csv
                            </a>
                        </p>
                    </div>
                </details>
            </div>

            {/* STEP 2: MAP */}
            <div className="csv2-section" id="map">
                <h3>02 · Column mapping</h3>
                <div className="section-sub">
                    {isUploaded
                        ? `${autoCount} of ${mappings.length} columns auto-matched.${
                              ambiguousCount > 0
                                  ? ` Review the ${ambiguousCount} ambiguous column${
                                        ambiguousCount === 1 ? "" : "s"
                                    }.`
                                  : ""
                          }${
                              skipCount > 0
                                  ? ` ${skipCount} will be skipped.`
                                  : ""
                          }`
                        : "Your column headers will appear here once you drop a file. We auto-match on name, direction, amount, frequency, dates, and Xero account codes."}
                </div>

                {isUploaded && mappings.length > 0 ? (
                    <>
                        <div className="csv2-map-head-row">
                            <div>Your column</div>
                            <div></div>
                            <div>Maps to</div>
                            <div className="sample-head">Sample row</div>
                            <div className="status-head">Status</div>
                        </div>
                        {mappings.map((m) => {
                            const isAuto =
                                m.target !== "__skip__" && m.confidence >= 80
                            const isAmbiguous =
                                m.target !== "__skip__" &&
                                m.confidence > 0 &&
                                m.confidence < 80
                            const isSkipped = m.target === "__skip__"
                            return (
                                <div
                                    key={m.sourceHeader}
                                    className={`csv2-map-row ${
                                        isAmbiguous || isSkipped ? "warn" : ""
                                    }`}
                                >
                                    <div className="m-left" title={m.sourceHeader}>
                                        {m.sourceHeader}
                                    </div>
                                    <div className="m-arrow" aria-hidden="true">
                                        →
                                    </div>
                                    <select
                                        className={`m-right ${isAuto ? "auto" : ""}`}
                                        value={m.target}
                                        onChange={(e) =>
                                            handleMappingChange(
                                                m.sourceHeader,
                                                e.target.value,
                                            )
                                        }
                                        aria-label={`Map column ${m.sourceHeader}`}
                                    >
                                        {TARGET_FIELD_ORDER.map((t) => (
                                            <option key={t} value={t}>
                                                {TARGET_FIELDS[t].label}
                                            </option>
                                        ))}
                                        <option value="__skip__">
                                            {TARGET_FIELDS.__skip__.label}
                                        </option>
                                    </select>
                                    <div
                                        className="m-sample"
                                        title={m.sampleValue}
                                    >
                                        {m.sampleValue
                                            ? `"${m.sampleValue}"`
                                            : "(empty)"}
                                    </div>
                                    {isAuto ? (
                                        <div className="m-status ok">
                                            Auto · {m.confidence}%
                                        </div>
                                    ) : isSkipped ? (
                                        <div className="m-status skip">Skip</div>
                                    ) : (
                                        <div className="m-status check">
                                            Needs confirm
                                        </div>
                                    )}
                                </div>
                            )
                        })}

                        {mappings.some(
                            (m) =>
                                m.target === "xero_account" ||
                                m.sourceHeader.toLowerCase().includes("xero"),
                        ) && (
                            <div className="csv2-map-hint">
                                <strong>Looks like a Xero account code.</strong>{" "}
                                If you plan to connect Xero later, map this to{" "}
                                <code>xero_account</code> so sync can auto-match.
                                Otherwise skip.
                            </div>
                        )}
                    </>
                ) : (
                    <div className="csv2-empty-preview">
                        <strong>Nothing to map yet.</strong>
                        Drop a file in the section above to see your columns
                        lined up against ours. We auto-match common names —
                        you only confirm the ambiguous ones.
                    </div>
                )}
            </div>

            {/* STEP 3: REVIEW */}
            <div className="csv2-section" id="review">
                <h3>
                    03 · Review before committing
                    {isUploaded ? ` · ${rows.length} row${rows.length === 1 ? "" : "s"}` : ""}
                </h3>
                <div className="section-sub">
                    {isUploaded
                        ? `Preview the first ${reviewRows.length} row${reviewRows.length === 1 ? "" : "s"}.${
                              readyCount > 0
                                  ? ` ${readyCount} will import cleanly`
                                  : ""
                          }${
                              warnCount > 0
                                  ? `, ${warnCount} need${warnCount === 1 ? "s" : ""} review`
                                  : ""
                          }${
                              skipRowCount > 0
                                  ? `, ${skipRowCount} will be skipped`
                                  : ""
                          }.`
                        : "Once a file is mapped, we classify every row as ready, warning, or skip so you see what would land before committing."}
                </div>

                {isUploaded && reviewRows.length > 0 ? (
                    <>
                        <div className="csv2-pill-row">
                            <span className="csv2-pill-strong ok">
                                {readyCount} ready
                            </span>
                            {warnCount > 0 && (
                                <span className="csv2-pill-strong warn">
                                    {warnCount} warning
                                    {warnCount === 1 ? "" : "s"}
                                </span>
                            )}
                            {skipRowCount > 0 && (
                                <span className="csv2-pill-strong skip">
                                    {skipRowCount} skip
                                    {skipRowCount === 1 ? "" : "s"}
                                </span>
                            )}
                        </div>

                        {reviewRows.map((r) => (
                            <div
                                key={r.rowNumber}
                                className={`csv2-review-row ${r.status === "warn" ? "warn" : ""}${r.status === "skip" ? " skip" : ""}`}
                            >
                                <div className="ic" aria-hidden="true">
                                    {r.status === "skip"
                                        ? "—"
                                        : r.status === "warn"
                                          ? "!"
                                          : "✓"}
                                </div>
                                <div className="name">
                                    {r.name}
                                    {r.categoryHint && (
                                        <small>{r.categoryHint}</small>
                                    )}
                                </div>
                                <div
                                    className={`amt ${r.amountDirection === "out" ? "out" : r.amountDirection === "in" ? "in" : ""}`}
                                >
                                    {r.amountDisplay}
                                </div>
                                <div className="freq">{r.frequency}</div>
                                <div className="status">{r.statusReason}</div>
                                <div className="fix-slot">
                                    {r.status === "warn" && (
                                        <button
                                            type="button"
                                            className="csv2-btn sm"
                                            disabled
                                            title="Inline fix wires up next round"
                                        >
                                            Fix
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}

                        {rows.length > reviewRows.length && (
                            <div className="csv2-review-more">
                                Showing {reviewRows.length} of {rows.length}.
                                Full-row review comes with the commit wiring.
                            </div>
                        )}
                    </>
                ) : (
                    <div className="csv2-empty-preview">
                        <strong>No rows to review yet.</strong>
                        Drop a file above and we&apos;ll preview the first
                        six rows here, each tagged ready, warning, or skip.
                    </div>
                )}
            </div>

            {/* FOOTER */}
            <div className="csv2-foot">
                <div className="summary">
                    {isUploaded
                        ? `${readyCount + warnCount} row${
                              readyCount + warnCount === 1 ? "" : "s"
                          } queued · ${skipRowCount} will be skipped${
                              warnCount > 0
                                  ? ` · ${warnCount} warning${warnCount === 1 ? "" : "s"} to resolve`
                                  : ""
                          } · commit wires up next round`
                        : "Drop a CSV to see your queue · commit wires up next round"}
                </div>
                <div className="ctas">
                    <Link href="/money/plan" className="csv2-btn">
                        Cancel
                    </Link>
                    <button
                        type="button"
                        className="csv2-btn"
                        disabled
                        title="Mapping templates save alongside commit wiring"
                    >
                        Save mapping as template
                    </button>
                    <button
                        type="button"
                        className="csv2-btn primary"
                        disabled={!canCommit}
                        title="Commit wires up alongside the plan_line_items insert engine"
                    >
                        {isUploaded
                            ? `Import ${readyCount + warnCount} row${readyCount + warnCount === 1 ? "" : "s"} →`
                            : "Import rows →"}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ─── Helpers ────────────────────────────────────────────────────────────

function formatRelativeUpload(date: Date | null): string {
    if (!date) return ""
    const delta = Date.now() - date.getTime()
    const secs = Math.max(1, Math.round(delta / 1000))
    if (secs < 60) return `uploaded ${secs} sec${secs === 1 ? "" : "s"} ago`
    const mins = Math.round(secs / 60)
    if (mins < 60) return `uploaded ${mins} min${mins === 1 ? "" : "s"} ago`
    const hrs = Math.round(mins / 60)
    return `uploaded ${hrs}h ago`
}

// Inline sample template — served as a data URI so there's no extra asset.
const sampleCsvDataUri = `data:text/csv;charset=utf-8,${encodeURIComponent(
    [
        "name,direction,category,amount,frequency,effective_from,notes,tags",
        "Payroll — 5 FTEs,out,people,34220,monthly,2026-01-01,standing · 5 FTEs,",
        "Workshop rent,out,premises,2400,quarterly,2026-01-01,,",
        "Cloud + tools,out,tools,480,monthly,2026-01-01,,",
        "NimFarm pilot revenue,in,revenue,5000,milestone,2026-02-15,Phase 1 delivery,pilot",
        "R&D grant income,in,grants,2400,monthly,2026-01-01,Innovate UK,",
    ].join("\n"),
)}`
