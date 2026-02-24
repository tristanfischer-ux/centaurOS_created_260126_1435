/**
 * @file table-export.ts — Markdown table parsing and CSV export utilities.
 *
 * @description Provides functions to extract markdown tables from specialist AI
 * responses, convert them to RFC 4180 compliant CSV, and trigger browser downloads.
 * No external dependencies — pure string manipulation.
 *
 * @flow Used by MessageExportMenu to offer "Download as CSV" for messages containing tables.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ParsedTable {
    headers: string[]
    rows: string[][]
    /** Original markdown text of this table */
    raw: string
}

// ─── Markdown Table Parsing ──────────────────────────────────────────────────

/**
 * Extract all markdown tables from a string and return structured data.
 *
 * @description Finds contiguous blocks of lines starting with `|`, parses the
 * header row and separator, then parses each data row. Handles escaped pipes
 * (`\|`) within cell content.
 *
 * @param content - Raw markdown string (e.g. from a specialist response)
 * @returns Array of ParsedTable objects (empty if no tables found)
 */
export function parseMarkdownTables(content: string): ParsedTable[] {
    const lines = content.split("\n")
    const tables: ParsedTable[] = []

    let i = 0
    while (i < lines.length) {
        const line = lines[i].trim()

        // INTENT: A table starts with a pipe-delimited header row
        if (line.startsWith("|") && line.endsWith("|")) {
            const blockStart = i
            const tableLines: string[] = []

            // Collect all contiguous pipe-starting lines
            while (i < lines.length) {
                const current = lines[i].trim()
                if (current.startsWith("|") && current.endsWith("|")) {
                    tableLines.push(current)
                    i++
                } else {
                    break
                }
            }

            // Need at least 3 lines: header, separator, one data row
            if (tableLines.length >= 3) {
                const separatorLine = tableLines[1]
                // INTENT: The separator row contains only |, -, :, and spaces
                if (/^[|\-:\s]+$/.test(separatorLine)) {
                    const headers = parsePipeRow(tableLines[0])
                    const rows: string[][] = []

                    for (let r = 2; r < tableLines.length; r++) {
                        rows.push(parsePipeRow(tableLines[r]))
                    }

                    const raw = lines.slice(blockStart, blockStart + tableLines.length).join("\n")
                    tables.push({ headers, rows, raw })
                }
            }
        } else {
            i++
        }
    }

    return tables
}

/**
 * Parse a single pipe-delimited row into an array of cell values.
 *
 * @description Handles escaped pipes (`\|`) by temporarily replacing them,
 * splitting on `|`, then restoring the pipe character. Trims whitespace from
 * each cell.
 *
 * @param line - A single markdown table row (e.g. `| A | B | C |`)
 * @returns Array of trimmed cell strings
 */
function parsePipeRow(line: string): string[] {
    // INTENT: Temporarily replace escaped pipes so they don't break splitting
    const ESCAPED_PIPE_PLACEHOLDER = "\x00PIPE\x00"
    const escaped = line.replace(/\\\|/g, ESCAPED_PIPE_PLACEHOLDER)

    return escaped
        .split("|")
        .slice(1, -1) // Drop empty strings from leading/trailing `|`
        .map((cell) => cell.replace(new RegExp(ESCAPED_PIPE_PLACEHOLDER, "g"), "|").trim())
}

// ─── Markdown Stripping ──────────────────────────────────────────────────────

/**
 * Strip common markdown formatting from a string for clean CSV output.
 *
 * @description Removes bold, italic, inline code, and link syntax while
 * preserving the visible text content.
 *
 * @param text - Cell text potentially containing markdown
 * @returns Plain text with formatting removed
 */
function stripMarkdownFormatting(text: string): string {
    return (
        text
            // Bold: **text** or __text__
            .replace(/\*\*(.+?)\*\*/g, "$1")
            .replace(/__(.+?)__/g, "$1")
            // Italic: *text* or _text_ (single)
            .replace(/\*(.+?)\*/g, "$1")
            .replace(/_(.+?)_/g, "$1")
            // Inline code: `text`
            .replace(/`(.+?)`/g, "$1")
            // Links: [text](url) → text
            .replace(/\[(.+?)\]\(.+?\)/g, "$1")
            // Strikethrough: ~~text~~
            .replace(/~~(.+?)~~/g, "$1")
    )
}

// ─── CSV Conversion ──────────────────────────────────────────────────────────

/**
 * Convert a ParsedTable to RFC 4180 compliant CSV.
 *
 * @description Strips markdown formatting from cells, then properly escapes
 * cells containing commas, double quotes, or newlines by wrapping in double
 * quotes (with internal quotes doubled).
 *
 * @param table - A ParsedTable from parseMarkdownTables()
 * @returns CSV string with CRLF line endings per RFC 4180
 */
export function tableToCsv(table: ParsedTable): string {
    const escapeCell = (cell: string): string => {
        const clean = stripMarkdownFormatting(cell)
        // RFC 4180: if a cell contains comma, double quote, or newline, wrap it
        if (clean.includes(",") || clean.includes('"') || clean.includes("\n")) {
            return `"${clean.replace(/"/g, '""')}"`
        }
        return clean
    }

    const headerLine = table.headers.map(escapeCell).join(",")
    const dataLines = table.rows.map((row) => row.map(escapeCell).join(","))

    return [headerLine, ...dataLines].join("\r\n")
}

// ─── Browser Download ────────────────────────────────────────────────────────

/**
 * Trigger a browser file download with the given CSV content.
 *
 * @description Creates a temporary Blob URL, clicks a hidden anchor, then
 * revokes the URL. Only works in browser environments.
 *
 * @param csv - CSV string to download
 * @param filename - Suggested filename (e.g. "cfo-2026-02-23.csv")
 */
export function downloadCsv(csv: string, filename: string): void {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)

    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = filename
    anchor.style.display = "none"
    document.body.appendChild(anchor)
    anchor.click()

    // INTENT: Clean up to prevent memory leaks
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
}

// ─── Multi-Table Export ──────────────────────────────────────────────────────

/**
 * Combine multiple tables into a single CSV Blob, separated by blank lines.
 *
 * @description Useful when a specialist response contains multiple tables that
 * should be exported together as one file.
 *
 * @param tables - Array of ParsedTable objects
 * @returns Blob with text/csv MIME type
 */
export function tablesToCsvBlob(tables: ParsedTable[]): Blob {
    const csvParts = tables.map(tableToCsv)
    const combined = csvParts.join("\r\n\r\n")
    return new Blob([combined], { type: "text/csv;charset=utf-8;" })
}
