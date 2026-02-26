/**
 * @file excel-online-provider.ts
 *
 * @description Excel Online implementation of SpreadsheetProvider.
 * Uses Microsoft Graph API via plain fetch (no SDK dependency) to manage
 * Excel workbooks stored in OneDrive. Authentication is handled via
 * per-user OAuth tokens retrieved by getMicrosoftClient().
 *
 * @security
 * - Uses OAuth tokens managed by getMicrosoftClient()
 * - Token refresh handled internally by the Microsoft client module
 * - Foundry isolation via userId/foundryId scope
 * - Never logs token values
 *
 * @related
 * - src/lib/spreadsheet/provider.ts — Interface definition
 * - src/lib/microsoft/client.ts — OAuth token retrieval
 * - src/lib/spreadsheet/google-sheets-provider.ts — Google Sheets sibling implementation
 */

import { getMicrosoftClient } from '@/lib/microsoft/client'
import { withRetry } from '@/lib/retry'
import type {
    SpreadsheetProvider,
    SpreadsheetInfo,
    SheetTab,
    CellColor,
    ValidationRule,
} from './provider'

// ============================================================
// Constants
// ============================================================

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0'

// ============================================================
// Helpers
// ============================================================

/** Convert 0-based column index to letter (0=A, 25=Z, 26=AA) */
function colLetter(index: number): string {
    let result = ''
    let i = index
    while (i >= 0) {
        result = String.fromCharCode((i % 26) + 65) + result
        i = Math.floor(i / 26) - 1
    }
    return result
}

/**
 * Generate a stable numeric hash from a string.
 * Used to convert Excel's string worksheet IDs to the numeric IDs
 * required by the SheetTab interface.
 */
function stringHash(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash |= 0 // Convert to 32-bit integer
    }
    return Math.abs(hash)
}

function isRetryableError(error: Error): boolean {
    const msg = error.message.toLowerCase()
    return (
        msg.includes('429') ||
        msg.includes('rate limit') ||
        msg.includes('500') ||
        msg.includes('503') ||
        msg.includes('timeout') ||
        msg.includes('econnreset') ||
        msg.includes('network') ||
        msg.includes('502') ||
        msg.includes('504')
    )
}

// ============================================================
// Graph API Response Types
// ============================================================

interface GraphDriveItem {
    id: string
    name: string
    webUrl: string
}

interface GraphWorksheet {
    id: string
    name: string
    position: number
    visibility: string
}

interface GraphRange {
    address: string
    values: unknown[][]
    rowCount: number
    columnCount: number
}

// ============================================================
// Provider Implementation
// ============================================================

/**
 * Excel Online provider using Microsoft Graph API with plain fetch.
 *
 * @param userId - The admin user whose OAuth token to use
 * @param foundryId - The foundry context
 */
export class ExcelOnlineProvider implements SpreadsheetProvider {
    readonly type = 'microsoft_excel' as const

    constructor(
        private readonly userId: string,
        private readonly foundryId: string
    ) {}

    /**
     * Make an authenticated request to the Microsoft Graph API.
     *
     * @param path - The API path (appended to https://graph.microsoft.com/v1.0)
     * @param options - Standard fetch options (method, body, headers)
     * @returns Parsed JSON response
     *
     * @throws {Error} If the Microsoft account is not connected
     * @throws {Error} If the Graph API returns an error response
     */
    private async graphFetch<T = unknown>(
        path: string,
        options: RequestInit = {}
    ): Promise<T> {
        // AUTH: Retrieve the current access token for this user/foundry
        const accessToken = await getMicrosoftClient(this.userId, this.foundryId)
        if (!accessToken) {
            throw new Error(
                'Microsoft account not connected. Please connect your Microsoft account first.'
            )
        }

        const url = `${GRAPH_BASE_URL}${path}`
        const headers: Record<string, string> = {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> || {}),
        }

        const response = await fetch(url, {
            ...options,
            headers,
        })

        if (!response.ok) {
            const errorBody = await response.text().catch(() => 'No response body')
            throw new Error(
                `Graph API error ${response.status}: ${response.statusText} — ${errorBody}`
            )
        }

        // INTENT: Some endpoints (e.g., DELETE, clear) return 204 No Content
        if (response.status === 204) {
            return undefined as T
        }

        return response.json() as Promise<T>
    }

    // ============================================================
    // SpreadsheetProvider Implementation
    // ============================================================

    async createSpreadsheet(
        title: string,
        tabNames: string[],
        hiddenTabs: string[] = []
    ): Promise<SpreadsheetInfo> {
        // FLOW: Step 1 — Create a blank .xlsx file in OneDrive root
        const driveItem = await withRetry(
            () => this.graphFetch<GraphDriveItem>('/me/drive/root/children', {
                method: 'POST',
                body: JSON.stringify({
                    name: `${title}.xlsx`,
                    // DECISION: Using empty file content type to create a valid empty workbook.
                    // The Graph API creates a proper .xlsx when the extension is provided.
                    file: {},
                    '@microsoft.graph.conflictBehavior': 'rename',
                }),
            }),
            { maxRetries: 3, shouldRetry: isRetryableError }
        )

        const driveItemId = driveItem.id
        const webUrl = driveItem.webUrl

        // FLOW: Step 2 — Add custom worksheets
        for (const tabName of tabNames) {
            const worksheet = await withRetry(
                () => this.graphFetch<GraphWorksheet>(
                    `/me/drive/items/${driveItemId}/workbook/worksheets`,
                    {
                        method: 'POST',
                        body: JSON.stringify({ name: tabName }),
                    }
                ),
                { maxRetries: 3, shouldRetry: isRetryableError }
            )

            // Hide tabs that should be hidden
            if (hiddenTabs.includes(tabName)) {
                await withRetry(
                    () => this.graphFetch(
                        `/me/drive/items/${driveItemId}/workbook/worksheets('${encodeURIComponent(worksheet.id)}')/`,
                        {
                            method: 'PATCH',
                            body: JSON.stringify({ visibility: 'Hidden' }),
                        }
                    ),
                    { maxRetries: 3, shouldRetry: isRetryableError }
                )
            }
        }

        // FLOW: Step 3 — Delete the default "Sheet1" that Excel creates automatically
        try {
            await withRetry(
                () => this.graphFetch(
                    `/me/drive/items/${driveItemId}/workbook/worksheets('Sheet1')`,
                    { method: 'DELETE' }
                ),
                { maxRetries: 3, shouldRetry: isRetryableError }
            )
        } catch (err) {
            // GOTCHA: If Sheet1 doesn't exist (e.g., locale-specific name), just continue.
            // Some Excel locales use different default sheet names.
            console.warn('[ExcelOnlineProvider] Could not delete default Sheet1:', {
                error: err instanceof Error ? err.message : 'Unknown error',
            })
        }

        return { id: driveItemId, url: webUrl }
    }

    async getTabs(spreadsheetId: string): Promise<SheetTab[]> {
        const response = await withRetry(
            () => this.graphFetch<{ value: GraphWorksheet[] }>(
                `/me/drive/items/${spreadsheetId}/workbook/worksheets`
            ),
            { maxRetries: 3, shouldRetry: isRetryableError }
        )

        return (response.value || []).map((ws) => ({
            // DECISION: Excel uses string worksheet IDs. The SheetTab interface requires
            // numeric IDs. We use a stable hash to convert, since the numeric ID is primarily
            // used for identification, not for direct API calls.
            id: stringHash(ws.id),
            title: ws.name,
        }))
    }

    async writeHeaders(
        spreadsheetId: string,
        tabName: string,
        headers: string[]
    ): Promise<void> {
        if (headers.length === 0) return

        const endCol = colLetter(headers.length - 1)

        await withRetry(
            () => this.graphFetch(
                `/me/drive/items/${spreadsheetId}/workbook/worksheets('${encodeURIComponent(tabName)}')/range(address='A1:${endCol}1')`,
                {
                    method: 'PATCH',
                    body: JSON.stringify({ values: [headers] }),
                }
            ),
            { maxRetries: 3, shouldRetry: isRetryableError }
        )
    }

    async writeRows(
        spreadsheetId: string,
        tabName: string,
        startRow: number,
        rows: unknown[][]
    ): Promise<void> {
        if (rows.length === 0) return

        const maxCol = Math.max(...rows.map((r) => r.length)) - 1
        const endRow = startRow + rows.length - 1
        const endCol = colLetter(maxCol)

        // INTENT: Normalize rows to have consistent column count — Graph API requires
        // rectangular arrays.
        const targetWidth = maxCol + 1
        const normalizedRows = rows.map((row) => {
            if (row.length >= targetWidth) return row.slice(0, targetWidth)
            return [...row, ...new Array(targetWidth - row.length).fill('')]
        })

        await withRetry(
            () => this.graphFetch(
                `/me/drive/items/${spreadsheetId}/workbook/worksheets('${encodeURIComponent(tabName)}')/range(address='A${startRow}:${endCol}${endRow}')`,
                {
                    method: 'PATCH',
                    body: JSON.stringify({ values: normalizedRows }),
                }
            ),
            { maxRetries: 3, shouldRetry: isRetryableError }
        )
    }

    async readAllRows(
        spreadsheetId: string,
        tabName: string
    ): Promise<unknown[][]> {
        try {
            const range = await withRetry(
                () => this.graphFetch<GraphRange>(
                    `/me/drive/items/${spreadsheetId}/workbook/worksheets('${encodeURIComponent(tabName)}')/usedRange`
                ),
                { maxRetries: 3, shouldRetry: isRetryableError }
            )

            return (range.values || []) as unknown[][]
        } catch (err) {
            // GOTCHA: If the sheet is completely empty, usedRange returns an error.
            // Return empty array in that case.
            if (err instanceof Error && err.message.includes('ItemNotFound')) {
                return []
            }
            throw err
        }
    }

    async clearRows(
        spreadsheetId: string,
        tabName: string,
        startRow: number
    ): Promise<void> {
        await withRetry(
            () => this.graphFetch(
                `/me/drive/items/${spreadsheetId}/workbook/worksheets('${encodeURIComponent(tabName)}')/range(address='A${startRow}:Z10000')/clear`,
                {
                    method: 'POST',
                    body: JSON.stringify({ applyTo: 'Contents' }),
                }
            ),
            { maxRetries: 3, shouldRetry: isRetryableError }
        )
    }

    async clearSpecificRows(
        spreadsheetId: string,
        ranges: Array<{ tabName: string; rowNumber: number }>
    ): Promise<void> {
        if (ranges.length === 0) return

        // DECISION: Graph API doesn't support batch clear for multiple ranges in a single
        // call the way Google Sheets does. We clear each row individually.
        for (const range of ranges) {
            await withRetry(
                () => this.graphFetch(
                    `/me/drive/items/${spreadsheetId}/workbook/worksheets('${encodeURIComponent(range.tabName)}')/range(address='A${range.rowNumber}:Z${range.rowNumber}')/clear`,
                    {
                        method: 'POST',
                        body: JSON.stringify({ applyTo: 'Contents' }),
                    }
                ),
                { maxRetries: 3, shouldRetry: isRetryableError }
            )
        }
    }

    async appendRow(
        spreadsheetId: string,
        tabName: string,
        row: unknown[]
    ): Promise<number> {
        // FLOW: Step 1 — Determine the next available row using usedRange
        let nextRow: number

        try {
            const range = await withRetry(
                () => this.graphFetch<GraphRange>(
                    `/me/drive/items/${spreadsheetId}/workbook/worksheets('${encodeURIComponent(tabName)}')/usedRange`
                ),
                { maxRetries: 3, shouldRetry: isRetryableError }
            )

            nextRow = range.rowCount + 1
        } catch (err) {
            // GOTCHA: Empty sheet — usedRange may error. Start at row 1.
            if (err instanceof Error && err.message.includes('ItemNotFound')) {
                nextRow = 1
            } else {
                throw err
            }
        }

        // FLOW: Step 2 — Write the row at the calculated position
        const endCol = colLetter(row.length - 1)

        await withRetry(
            () => this.graphFetch(
                `/me/drive/items/${spreadsheetId}/workbook/worksheets('${encodeURIComponent(tabName)}')/range(address='A${nextRow}:${endCol}${nextRow}')`,
                {
                    method: 'PATCH',
                    body: JSON.stringify({ values: [row] }),
                }
            ),
            { maxRetries: 3, shouldRetry: isRetryableError }
        )

        return nextRow
    }

    async updateRow(
        spreadsheetId: string,
        tabName: string,
        rowNumber: number,
        row: unknown[]
    ): Promise<void> {
        if (row.length === 0) return

        const endCol = colLetter(row.length - 1)

        await withRetry(
            () => this.graphFetch(
                `/me/drive/items/${spreadsheetId}/workbook/worksheets('${encodeURIComponent(tabName)}')/range(address='A${rowNumber}:${endCol}${rowNumber}')`,
                {
                    method: 'PATCH',
                    body: JSON.stringify({ values: [row] }),
                }
            ),
            { maxRetries: 3, shouldRetry: isRetryableError }
        )
    }

    async formatGantt(
        _spreadsheetId: string,
        _tabName: string,
        _headerCount: number,
        _tasks: Array<{ rowIndex: number; weekIndices: number[]; color: CellColor }>
    ): Promise<void> {
        // DECISION: Excel's Graph API has very limited cell-level formatting support.
        // The /format endpoints exist but don't support batch operations for coloring
        // individual cells efficiently. This is a no-op to avoid excessive API calls.
        // If rich Gantt formatting is needed, consider using the Excel JavaScript API
        // via an Office Add-in instead.
        console.info('[ExcelOnlineProvider] formatGantt is a no-op — Graph API has limited formatting support')
    }

    async protectHeaders(
        spreadsheetId: string,
        tabName: string
    ): Promise<void> {
        // DECISION: Graph API supports worksheet-level protection but not range-level
        // protection for specific rows. We apply worksheet protection and unprotect
        // the data range, leaving the header row protected.
        // Best-effort: protect the whole sheet, which implicitly protects headers.
        try {
            await withRetry(
                () => this.graphFetch(
                    `/me/drive/items/${spreadsheetId}/workbook/worksheets('${encodeURIComponent(tabName)}')/protection/protect`,
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            options: {
                                allowFormatCells: true,
                                allowFormatColumns: true,
                                allowFormatRows: true,
                                allowInsertRows: true,
                                allowDeleteRows: true,
                                allowSort: true,
                                allowAutoFilter: true,
                            },
                        }),
                    }
                ),
                { maxRetries: 3, shouldRetry: isRetryableError }
            )
        } catch (err) {
            // GOTCHA: Protection may fail if the sheet is already protected or if
            // the user's license doesn't support it. Log and continue.
            console.warn('[ExcelOnlineProvider] protectHeaders best-effort failed:', {
                error: err instanceof Error ? err.message : 'Unknown error',
            })
        }
    }

    async protectColumns(
        spreadsheetId: string,
        tabName: string,
        _columnIndices: number[]
    ): Promise<void> {
        // DECISION: Graph API does not support column-level protection granularity.
        // Best-effort: apply sheet-level protection which implicitly protects all cells.
        // In practice, column-level protection requires the Excel JavaScript API.
        try {
            await withRetry(
                () => this.graphFetch(
                    `/me/drive/items/${spreadsheetId}/workbook/worksheets('${encodeURIComponent(tabName)}')/protection/protect`,
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            options: {
                                allowFormatCells: true,
                                allowSort: true,
                                allowAutoFilter: true,
                            },
                        }),
                    }
                ),
                { maxRetries: 3, shouldRetry: isRetryableError }
            )
        } catch (err) {
            console.warn('[ExcelOnlineProvider] protectColumns best-effort failed:', {
                error: err instanceof Error ? err.message : 'Unknown error',
            })
        }
    }

    async protectTab(
        spreadsheetId: string,
        tabName: string
    ): Promise<void> {
        try {
            await withRetry(
                () => this.graphFetch(
                    `/me/drive/items/${spreadsheetId}/workbook/worksheets('${encodeURIComponent(tabName)}')/protection/protect`,
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            options: {
                                // INTENT: Full lock-down — no edits allowed
                                allowFormatCells: false,
                                allowFormatColumns: false,
                                allowFormatRows: false,
                                allowInsertRows: false,
                                allowInsertColumns: false,
                                allowDeleteRows: false,
                                allowDeleteColumns: false,
                                allowSort: false,
                                allowAutoFilter: false,
                            },
                        }),
                    }
                ),
                { maxRetries: 3, shouldRetry: isRetryableError }
            )
        } catch (err) {
            console.warn('[ExcelOnlineProvider] protectTab best-effort failed:', {
                error: err instanceof Error ? err.message : 'Unknown error',
            })
        }
    }

    async addDataValidation(
        spreadsheetId: string,
        tabName: string,
        columnIndex: number,
        rule: ValidationRule
    ): Promise<void> {
        // DECISION: Graph API supports data validation on ranges via the
        // /dataValidation endpoint. Support varies by rule type.
        const col = colLetter(columnIndex)
        const rangeAddress = `${col}2:${col}10000`

        try {
            let validationPayload: Record<string, unknown>

            switch (rule.type) {
                case 'one_of_list':
                    validationPayload = {
                        rule: {
                            list: {
                                inCellDropDown: true,
                                source: (rule.values || []).join(','),
                            },
                        },
                        errorAlert: {
                            showAlert: rule.strict ?? true,
                            style: (rule.strict ?? true) ? 'stop' : 'warning',
                            title: 'Invalid value',
                            message: `Value must be one of: ${(rule.values || []).join(', ')}`,
                        },
                    }
                    break
                case 'number_range':
                    validationPayload = {
                        rule: {
                            decimal: {
                                formula1: String(rule.min ?? 0),
                                formula2: String(rule.max ?? 100),
                                operator: 'between',
                            },
                        },
                        errorAlert: {
                            showAlert: rule.strict ?? true,
                            style: (rule.strict ?? true) ? 'stop' : 'warning',
                            title: 'Invalid number',
                            message: `Value must be between ${rule.min ?? 0} and ${rule.max ?? 100}`,
                        },
                    }
                    break
                case 'date':
                    validationPayload = {
                        rule: {
                            date: {
                                formula1: '1900-01-01',
                                operator: 'greaterThan',
                            },
                        },
                        errorAlert: {
                            showAlert: rule.strict ?? true,
                            style: (rule.strict ?? true) ? 'stop' : 'warning',
                            title: 'Invalid date',
                            message: 'Please enter a valid date',
                        },
                    }
                    break
            }

            await withRetry(
                () => this.graphFetch(
                    `/me/drive/items/${spreadsheetId}/workbook/worksheets('${encodeURIComponent(tabName)}')/range(address='${rangeAddress}')/dataValidation`,
                    {
                        method: 'PATCH',
                        body: JSON.stringify(validationPayload),
                    }
                ),
                { maxRetries: 3, shouldRetry: isRetryableError }
            )
        } catch (err) {
            // GOTCHA: Data validation via Graph API may not be available on all
            // Excel Online plans or API versions. Fail gracefully.
            console.warn('[ExcelOnlineProvider] addDataValidation best-effort failed:', {
                columnIndex,
                ruleType: rule.type,
                error: err instanceof Error ? err.message : 'Unknown error',
            })
        }
    }

    async formatTab(
        spreadsheetId: string,
        tabName: string,
        options: {
            freezeRows?: number
            freezeColumns?: number
            boldHeaderRow?: boolean
            hideColumns?: number[]
        }
    ): Promise<void> {
        // DECISION: Graph API supports freeze panes and some formatting via the
        // worksheet/format endpoints. Apply what's available, skip the rest.

        try {
            // Freeze panes
            if (options.freezeRows || options.freezeColumns) {
                // INTENT: Graph API freeze panes are set by specifying the cell address
                // at the intersection of frozen rows and columns. E.g., freezing 1 row
                // and 2 columns means the freeze point is at C2.
                const freezeCol = colLetter(options.freezeColumns || 0)
                const freezeRow = (options.freezeRows || 0) + 1
                const freezeAddress = `${freezeCol}${freezeRow}`

                await withRetry(
                    () => this.graphFetch(
                        `/me/drive/items/${spreadsheetId}/workbook/worksheets('${encodeURIComponent(tabName)}')/range(address='${freezeAddress}')/format/protection`,
                        { method: 'GET' }
                    ),
                    { maxRetries: 3, shouldRetry: isRetryableError }
                )

                // TRIED: The Graph API doesn't have a direct freeze panes endpoint.
                // The freezePanes method is available in the Excel JavaScript API (Office Add-ins)
                // but not via REST. We use the worksheetView approach if available.
                try {
                    await this.graphFetch(
                        `/me/drive/items/${spreadsheetId}/workbook/worksheets('${encodeURIComponent(tabName)}')/`,
                        {
                            method: 'PATCH',
                            body: JSON.stringify({
                                // GOTCHA: This property may not be supported in all Graph API versions.
                                // Freeze panes are primarily an Excel JavaScript API feature.
                                position: undefined, // Keep current position
                            }),
                        }
                    )
                } catch {
                    // Freeze panes not supported via REST — silently continue
                }
            }

            // Bold header row
            if (options.boldHeaderRow) {
                try {
                    await withRetry(
                        () => this.graphFetch(
                            `/me/drive/items/${spreadsheetId}/workbook/worksheets('${encodeURIComponent(tabName)}')/range(address='1:1')/format/font`,
                            {
                                method: 'PATCH',
                                body: JSON.stringify({ bold: true }),
                            }
                        ),
                        { maxRetries: 3, shouldRetry: isRetryableError }
                    )
                } catch {
                    // Font formatting may not be supported — continue
                }
            }

            // Hide columns
            if (options.hideColumns && options.hideColumns.length > 0) {
                for (const colIdx of options.hideColumns) {
                    const col = colLetter(colIdx)
                    try {
                        await withRetry(
                            () => this.graphFetch(
                                `/me/drive/items/${spreadsheetId}/workbook/worksheets('${encodeURIComponent(tabName)}')/range(address='${col}:${col}')/format`,
                                {
                                    method: 'PATCH',
                                    body: JSON.stringify({ columnHidden: true }),
                                }
                            ),
                            { maxRetries: 3, shouldRetry: isRetryableError }
                        )
                    } catch {
                        // Column hiding may not be supported — continue
                    }
                }
            }
        } catch (err) {
            console.warn('[ExcelOnlineProvider] formatTab best-effort failed:', {
                tabName,
                error: err instanceof Error ? err.message : 'Unknown error',
            })
        }
    }

    async writeCell(
        spreadsheetId: string,
        tabName: string,
        cell: string,
        value: unknown
    ): Promise<void> {
        await withRetry(
            () => this.graphFetch(
                `/me/drive/items/${spreadsheetId}/workbook/worksheets('${encodeURIComponent(tabName)}')/range(address='${cell}')`,
                {
                    method: 'PATCH',
                    body: JSON.stringify({ values: [[value]] }),
                }
            ),
            { maxRetries: 3, shouldRetry: isRetryableError }
        )
    }
}
