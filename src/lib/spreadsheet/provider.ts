/**
 * @file provider.ts
 *
 * @description Abstraction layer for spreadsheet providers (Google Sheets, Excel Online).
 * Defines the SpreadsheetProvider interface that both implementations share,
 * enabling the sync engine to be provider-agnostic.
 *
 * @related
 * - src/lib/spreadsheet/google-sheets-provider.ts — Google Sheets implementation
 * - src/lib/spreadsheet/excel-online-provider.ts — Excel Online implementation
 * - src/lib/spreadsheet/sync-engine.ts — Provider-agnostic sync engine
 */

// ============================================================
// Types
// ============================================================

export type ProviderType = 'google_sheets' | 'microsoft_excel'

export interface ValidationRule {
    type: 'one_of_list' | 'number_range' | 'date'
    /** For one_of_list: the allowed values */
    values?: string[]
    /** For number_range: min value (inclusive) */
    min?: number
    /** For number_range: max value (inclusive) */
    max?: number
    /** Whether to enforce strictly (reject invalid input vs show warning) */
    strict?: boolean
}

export interface SpreadsheetInfo {
    id: string
    url: string
}

export interface SheetTab {
    id: string | number
    title: string
}

export interface CellColor {
    red: number
    green: number
    blue: number
}

// ============================================================
// Provider Interface
// ============================================================

/**
 * Abstraction for spreadsheet operations. Implemented by Google Sheets and Excel Online providers.
 *
 * All methods operate on a specific spreadsheet identified by spreadsheetId.
 * The provider handles authentication internally using stored OAuth tokens.
 */
export interface SpreadsheetProvider {
    /** Provider identifier */
    readonly type: ProviderType

    /**
     * Create a new spreadsheet with the given title and tabs.
     *
     * @param title - Spreadsheet title
     * @param tabNames - Names of tabs to create
     * @param hiddenTabs - Names of tabs that should be hidden
     * @returns Spreadsheet ID and URL
     */
    createSpreadsheet(
        title: string,
        tabNames: string[],
        hiddenTabs?: string[]
    ): Promise<SpreadsheetInfo>

    /**
     * Get all tabs in a spreadsheet.
     *
     * @param spreadsheetId - The spreadsheet to query
     * @returns Array of tab info (id + title)
     */
    getTabs(spreadsheetId: string): Promise<SheetTab[]>

    /**
     * Write header values to the first row of a tab.
     *
     * @param spreadsheetId - The spreadsheet
     * @param tabName - The tab name
     * @param headers - Header labels
     */
    writeHeaders(spreadsheetId: string, tabName: string, headers: string[]): Promise<void>

    /**
     * Write multiple rows of data starting at a given row.
     *
     * @param spreadsheetId - The spreadsheet
     * @param tabName - The tab name
     * @param startRow - 1-indexed row number to start writing at
     * @param rows - 2D array of cell values
     */
    writeRows(
        spreadsheetId: string,
        tabName: string,
        startRow: number,
        rows: unknown[][]
    ): Promise<void>

    /**
     * Read all rows from a tab (including the header row).
     *
     * @param spreadsheetId - The spreadsheet
     * @param tabName - The tab name
     * @returns 2D array of cell values
     */
    readAllRows(spreadsheetId: string, tabName: string): Promise<unknown[][]>

    /**
     * Clear all data rows from startRow onward in a tab.
     *
     * @param spreadsheetId - The spreadsheet
     * @param tabName - The tab name
     * @param startRow - 1-indexed row number to start clearing from
     */
    clearRows(spreadsheetId: string, tabName: string, startRow: number): Promise<void>

    /**
     * Clear specific rows in one or more tabs.
     *
     * @param spreadsheetId - The spreadsheet
     * @param ranges - Array of { tabName, rowNumbers } to clear
     */
    clearSpecificRows(
        spreadsheetId: string,
        ranges: Array<{ tabName: string; rowNumber: number }>
    ): Promise<void>

    /**
     * Append a single row to the end of a tab.
     *
     * @param spreadsheetId - The spreadsheet
     * @param tabName - The tab name
     * @param row - Array of cell values
     * @returns The 1-indexed row number where the data was written
     */
    appendRow(
        spreadsheetId: string,
        tabName: string,
        row: unknown[]
    ): Promise<number>

    /**
     * Update a single existing row in place.
     *
     * @param spreadsheetId - The spreadsheet
     * @param tabName - The tab name
     * @param rowNumber - 1-indexed row number
     * @param row - Array of cell values
     */
    updateRow(
        spreadsheetId: string,
        tabName: string,
        rowNumber: number,
        row: unknown[]
    ): Promise<void>

    /**
     * Apply formatting to the Gantt tab (colors for task timelines).
     *
     * @param spreadsheetId - The spreadsheet
     * @param tabName - The Gantt tab name
     * @param headerCount - Number of header columns before timeline columns
     * @param tasks - Array of { rowIndex, weekIndices, color } for coloring
     */
    formatGantt(
        spreadsheetId: string,
        tabName: string,
        headerCount: number,
        tasks: Array<{
            rowIndex: number
            weekIndices: number[]
            color: CellColor
        }>
    ): Promise<void>

    /**
     * Protect the header row (row 1) of a tab so users can't edit it.
     */
    protectHeaders(spreadsheetId: string, tabName: string): Promise<void>

    /**
     * Protect specific columns in a tab (make them read-only).
     *
     * @param spreadsheetId - The spreadsheet
     * @param tabName - The tab name
     * @param columnIndices - 0-based column indices to protect
     */
    protectColumns(
        spreadsheetId: string,
        tabName: string,
        columnIndices: number[]
    ): Promise<void>

    /**
     * Protect an entire tab (make it fully read-only).
     */
    protectTab(spreadsheetId: string, tabName: string): Promise<void>

    /**
     * Add data validation to a column.
     *
     * @param spreadsheetId - The spreadsheet
     * @param tabName - The tab name
     * @param columnIndex - 0-based column index
     * @param rule - Validation rule to apply
     */
    addDataValidation(
        spreadsheetId: string,
        tabName: string,
        columnIndex: number,
        rule: ValidationRule
    ): Promise<void>

    /**
     * Apply initial formatting to a tab (freeze header, bold header, hide columns).
     *
     * @param spreadsheetId - The spreadsheet
     * @param tabName - The tab name
     * @param options - Formatting options
     */
    formatTab(
        spreadsheetId: string,
        tabName: string,
        options: {
            freezeRows?: number
            freezeColumns?: number
            boldHeaderRow?: boolean
            hideColumns?: number[]
        }
    ): Promise<void>

    /**
     * Write a value to a specific cell.
     *
     * @param spreadsheetId - The spreadsheet
     * @param tabName - The tab name
     * @param cell - Cell address (e.g., 'A1')
     * @param value - The value to write
     */
    writeCell(spreadsheetId: string, tabName: string, cell: string, value: unknown): Promise<void>
}
