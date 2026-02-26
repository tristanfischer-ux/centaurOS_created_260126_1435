/**
 * @file google-sheets-provider.ts
 *
 * @description Google Sheets implementation of SpreadsheetProvider.
 * Uses per-user OAuth tokens (not Service Accounts) to access Google Sheets API.
 * The admin's OAuth token is used for all sync operations.
 *
 * @security
 * - Uses OAuth tokens from google_oauth_tokens table
 * - Token refresh handled by getGoogleClient()
 * - Foundry isolation via userId/foundryId scope
 *
 * @related
 * - src/lib/spreadsheet/provider.ts — Interface definition
 * - src/lib/google/client.ts — OAuth2 client factory
 * - src/lib/google/scopes.ts — Required scopes (spreadsheets)
 */

import { google, sheets_v4 } from 'googleapis'
import { getGoogleClient } from '@/lib/google/client'
import { withRetry } from '@/lib/retry'
import type {
    SpreadsheetProvider,
    SpreadsheetInfo,
    SheetTab,
    CellColor,
    ValidationRule,
} from './provider'

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

function isRetryableError(error: Error): boolean {
    const msg = error.message.toLowerCase()
    return (
        msg.includes('429') ||
        msg.includes('rate limit') ||
        msg.includes('500') ||
        msg.includes('503') ||
        msg.includes('timeout') ||
        msg.includes('econnreset') ||
        msg.includes('network')
    )
}

// ============================================================
// Provider Implementation
// ============================================================

/**
 * Google Sheets provider using per-user OAuth2 tokens.
 *
 * @param userId - The admin user whose OAuth token to use
 * @param foundryId - The foundry context
 */
export class GoogleSheetsProvider implements SpreadsheetProvider {
    readonly type = 'google_sheets' as const
    private sheetsClient: sheets_v4.Sheets | null = null

    constructor(
        private readonly userId: string,
        private readonly foundryId: string
    ) {}

    /**
     * Get or create an authenticated Sheets API client.
     * @throws {Error} If no OAuth token is available
     */
    private async getClient(): Promise<sheets_v4.Sheets> {
        if (this.sheetsClient) return this.sheetsClient

        const oauth2Client = await getGoogleClient(this.userId, this.foundryId)
        if (!oauth2Client) {
            throw new Error('Google account not connected. Please connect your Google account first.')
        }

        this.sheetsClient = google.sheets({ version: 'v4', auth: oauth2Client })
        return this.sheetsClient
    }

    async createSpreadsheet(
        title: string,
        tabNames: string[],
        hiddenTabs: string[] = []
    ): Promise<SpreadsheetInfo> {
        const sheets = await this.getClient()

        const sheetProperties = tabNames.map((name, i) => ({
            title: name,
            index: i,
            hidden: hiddenTabs.includes(name),
        }))

        const response = await withRetry(
            () => sheets.spreadsheets.create({
                requestBody: {
                    properties: { title },
                    sheets: sheetProperties.map(props => ({ properties: props })),
                },
            }),
            { maxRetries: 3, shouldRetry: isRetryableError }
        )

        const spreadsheetId = response.data.spreadsheetId
        const spreadsheetUrl = response.data.spreadsheetUrl

        if (!spreadsheetId || !spreadsheetUrl) {
            throw new Error('Spreadsheet creation returned no ID or URL')
        }

        return { id: spreadsheetId, url: spreadsheetUrl }
    }

    async getTabs(spreadsheetId: string): Promise<SheetTab[]> {
        const sheets = await this.getClient()

        const response = await withRetry(
            () => sheets.spreadsheets.get({
                spreadsheetId,
                fields: 'sheets.properties',
            }),
            { maxRetries: 3, shouldRetry: isRetryableError }
        )

        return (response.data.sheets || [])
            .filter(s => s.properties?.title && s.properties.sheetId != null)
            .map(s => ({
                id: s.properties!.sheetId!,
                title: s.properties!.title!,
            }))
    }

    async writeHeaders(spreadsheetId: string, tabName: string, headers: string[]): Promise<void> {
        const sheets = await this.getClient()

        await withRetry(
            () => sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `'${tabName}'!A1:${colLetter(headers.length - 1)}1`,
                valueInputOption: 'RAW',
                requestBody: { values: [headers] },
            }),
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
        const sheets = await this.getClient()

        const maxCol = Math.max(...rows.map(r => r.length)) - 1
        const endRow = startRow + rows.length - 1

        await withRetry(
            () => sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `'${tabName}'!A${startRow}:${colLetter(maxCol)}${endRow}`,
                valueInputOption: 'RAW',
                requestBody: { values: rows },
            }),
            { maxRetries: 3, shouldRetry: isRetryableError }
        )
    }

    async readAllRows(spreadsheetId: string, tabName: string): Promise<unknown[][]> {
        const sheets = await this.getClient()

        const response = await withRetry(
            () => sheets.spreadsheets.values.get({
                spreadsheetId,
                range: `'${tabName}'`,
            }),
            { maxRetries: 3, shouldRetry: isRetryableError }
        )

        return (response.data.values || []) as unknown[][]
    }

    async clearRows(spreadsheetId: string, tabName: string, startRow: number): Promise<void> {
        const sheets = await this.getClient()

        await withRetry(
            () => sheets.spreadsheets.values.clear({
                spreadsheetId,
                range: `'${tabName}'!A${startRow}:Z10000`,
            }),
            { maxRetries: 3, shouldRetry: isRetryableError }
        )
    }

    async clearSpecificRows(
        spreadsheetId: string,
        ranges: Array<{ tabName: string; rowNumber: number }>
    ): Promise<void> {
        if (ranges.length === 0) return
        const sheets = await this.getClient()

        const clearRanges = ranges.map(r =>
            `'${r.tabName}'!A${r.rowNumber}:Z${r.rowNumber}`
        )

        await withRetry(
            () => sheets.spreadsheets.values.batchClear({
                spreadsheetId,
                requestBody: { ranges: clearRanges },
            }),
            { maxRetries: 3, shouldRetry: isRetryableError }
        )
    }

    async appendRow(
        spreadsheetId: string,
        tabName: string,
        row: unknown[]
    ): Promise<number> {
        const sheets = await this.getClient()

        const result = await withRetry(
            () => sheets.spreadsheets.values.append({
                spreadsheetId,
                range: `'${tabName}'!A:${colLetter(row.length - 1)}`,
                valueInputOption: 'RAW',
                insertDataOption: 'INSERT_ROWS',
                requestBody: { values: [row] },
            }),
            { maxRetries: 3, shouldRetry: isRetryableError }
        )

        const updatedRange = result.data.updates?.updatedRange || ''
        const rowMatch = updatedRange.match(/(\d+)$/)
        return rowMatch ? parseInt(rowMatch[1], 10) : 0
    }

    async updateRow(
        spreadsheetId: string,
        tabName: string,
        rowNumber: number,
        row: unknown[]
    ): Promise<void> {
        const sheets = await this.getClient()

        await withRetry(
            () => sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `'${tabName}'!A${rowNumber}:${colLetter(row.length - 1)}${rowNumber}`,
                valueInputOption: 'RAW',
                requestBody: { values: [row] },
            }),
            { maxRetries: 3, shouldRetry: isRetryableError }
        )
    }

    async formatGantt(
        spreadsheetId: string,
        tabName: string,
        headerCount: number,
        tasks: Array<{ rowIndex: number; weekIndices: number[]; color: CellColor }>
    ): Promise<void> {
        const sheets = await this.getClient()
        const tabs = await this.getTabs(spreadsheetId)
        const tab = tabs.find(t => t.title === tabName)
        if (!tab) return

        const requests: sheets_v4.Schema$Request[] = []

        // Header formatting
        requests.push({
            repeatCell: {
                range: { sheetId: tab.id as number, startRowIndex: 0, endRowIndex: 1 },
                cell: {
                    userEnteredFormat: {
                        textFormat: { bold: true },
                        backgroundColor: { red: 0.97, green: 0.97, blue: 0.98 },
                    },
                },
                fields: 'userEnteredFormat(textFormat,backgroundColor)',
            },
        })

        // Freeze header row + fixed columns
        requests.push({
            updateSheetProperties: {
                properties: {
                    sheetId: tab.id as number,
                    gridProperties: { frozenRowCount: 1, frozenColumnCount: headerCount },
                },
                fields: 'gridProperties(frozenRowCount,frozenColumnCount)',
            },
        })

        // Color cells for each task's date range
        for (const task of tasks) {
            for (const weekIdx of task.weekIndices) {
                requests.push({
                    repeatCell: {
                        range: {
                            sheetId: tab.id as number,
                            startRowIndex: task.rowIndex + 1,
                            endRowIndex: task.rowIndex + 2,
                            startColumnIndex: weekIdx + headerCount,
                            endColumnIndex: weekIdx + headerCount + 1,
                        },
                        cell: {
                            userEnteredFormat: {
                                backgroundColor: task.color,
                            },
                        },
                        fields: 'userEnteredFormat.backgroundColor',
                    },
                })
            }
        }

        if (requests.length > 0) {
            await withRetry(
                () => sheets.spreadsheets.batchUpdate({
                    spreadsheetId,
                    requestBody: { requests },
                }),
                { maxRetries: 3, shouldRetry: isRetryableError }
            )
        }
    }

    async protectHeaders(spreadsheetId: string, tabName: string): Promise<void> {
        const sheets = await this.getClient()
        const tabs = await this.getTabs(spreadsheetId)
        const tab = tabs.find(t => t.title === tabName)
        if (!tab) return

        await withRetry(
            () => sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                    requests: [{
                        addProtectedRange: {
                            protectedRange: {
                                range: {
                                    sheetId: tab.id as number,
                                    startRowIndex: 0,
                                    endRowIndex: 1,
                                },
                                description: 'Header row is auto-generated',
                                warningOnly: false,
                            },
                        },
                    }],
                },
            }),
            { maxRetries: 3, shouldRetry: isRetryableError }
        )
    }

    async protectColumns(
        spreadsheetId: string,
        tabName: string,
        columnIndices: number[]
    ): Promise<void> {
        const sheets = await this.getClient()
        const tabs = await this.getTabs(spreadsheetId)
        const tab = tabs.find(t => t.title === tabName)
        if (!tab) return

        const requests = columnIndices.map(colIdx => ({
            addProtectedRange: {
                protectedRange: {
                    range: {
                        sheetId: tab.id as number,
                        startRowIndex: 1,
                        startColumnIndex: colIdx,
                        endColumnIndex: colIdx + 1,
                    },
                    description: `Column ${colLetter(colIdx)} is read-only`,
                    warningOnly: false,
                },
            },
        }))

        if (requests.length > 0) {
            await withRetry(
                () => sheets.spreadsheets.batchUpdate({
                    spreadsheetId,
                    requestBody: { requests },
                }),
                { maxRetries: 3, shouldRetry: isRetryableError }
            )
        }
    }

    async protectTab(spreadsheetId: string, tabName: string): Promise<void> {
        const sheets = await this.getClient()
        const tabs = await this.getTabs(spreadsheetId)
        const tab = tabs.find(t => t.title === tabName)
        if (!tab) return

        await withRetry(
            () => sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                    requests: [{
                        addProtectedRange: {
                            protectedRange: {
                                range: { sheetId: tab.id as number },
                                description: 'This tab is auto-generated and read-only',
                                warningOnly: false,
                            },
                        },
                    }],
                },
            }),
            { maxRetries: 3, shouldRetry: isRetryableError }
        )
    }

    async addDataValidation(
        spreadsheetId: string,
        tabName: string,
        columnIndex: number,
        rule: ValidationRule
    ): Promise<void> {
        const sheets = await this.getClient()
        const tabs = await this.getTabs(spreadsheetId)
        const tab = tabs.find(t => t.title === tabName)
        if (!tab) return

        let condition: sheets_v4.Schema$BooleanCondition

        switch (rule.type) {
            case 'one_of_list':
                condition = {
                    type: 'ONE_OF_LIST',
                    values: (rule.values || []).map(v => ({ userEnteredValue: v })),
                }
                break
            case 'number_range':
                condition = {
                    type: 'NUMBER_BETWEEN',
                    values: [
                        { userEnteredValue: String(rule.min ?? 0) },
                        { userEnteredValue: String(rule.max ?? 100) },
                    ],
                }
                break
            case 'date':
                condition = {
                    type: 'DATE_IS_VALID',
                }
                break
        }

        await withRetry(
            () => sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                    requests: [{
                        setDataValidation: {
                            range: {
                                sheetId: tab.id as number,
                                startRowIndex: 1,
                                startColumnIndex: columnIndex,
                                endColumnIndex: columnIndex + 1,
                            },
                            rule: {
                                condition,
                                showCustomUi: true,
                                strict: rule.strict ?? true,
                            },
                        },
                    }],
                },
            }),
            { maxRetries: 3, shouldRetry: isRetryableError }
        )
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
        const sheets = await this.getClient()
        const tabs = await this.getTabs(spreadsheetId)
        const tab = tabs.find(t => t.title === tabName)
        if (!tab) return

        const requests: sheets_v4.Schema$Request[] = []

        // Freeze rows/columns
        if (options.freezeRows || options.freezeColumns) {
            requests.push({
                updateSheetProperties: {
                    properties: {
                        sheetId: tab.id as number,
                        gridProperties: {
                            frozenRowCount: options.freezeRows || 0,
                            frozenColumnCount: options.freezeColumns || 0,
                        },
                    },
                    fields: 'gridProperties(frozenRowCount,frozenColumnCount)',
                },
            })
        }

        // Bold + background for header row
        if (options.boldHeaderRow) {
            requests.push({
                repeatCell: {
                    range: { sheetId: tab.id as number, startRowIndex: 0, endRowIndex: 1 },
                    cell: {
                        userEnteredFormat: {
                            textFormat: { bold: true },
                            backgroundColor: { red: 0.97, green: 0.97, blue: 0.98 },
                        },
                    },
                    fields: 'userEnteredFormat(textFormat,backgroundColor)',
                },
            })
        }

        // Hide columns
        if (options.hideColumns && options.hideColumns.length > 0) {
            for (const colIdx of options.hideColumns) {
                requests.push({
                    updateDimensionProperties: {
                        range: {
                            sheetId: tab.id as number,
                            dimension: 'COLUMNS',
                            startIndex: colIdx,
                            endIndex: colIdx + 1,
                        },
                        properties: { pixelSize: 1 },
                        fields: 'pixelSize',
                    },
                })
            }
        }

        if (requests.length > 0) {
            await withRetry(
                () => sheets.spreadsheets.batchUpdate({
                    spreadsheetId,
                    requestBody: { requests },
                }),
                { maxRetries: 3, shouldRetry: isRetryableError }
            )
        }
    }

    async writeCell(
        spreadsheetId: string,
        tabName: string,
        cell: string,
        value: unknown
    ): Promise<void> {
        const sheets = await this.getClient()

        await withRetry(
            () => sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `'${tabName}'!${cell}`,
                valueInputOption: 'RAW',
                requestBody: { values: [[value]] },
            }),
            { maxRetries: 3, shouldRetry: isRetryableError }
        )
    }
}
