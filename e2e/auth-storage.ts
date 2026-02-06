/**
 * Shared storage-state paths for authenticated persona sessions.
 *
 * Extracted from auth.setup.ts so that spec files can import them
 * without triggering Playwright's "test file should not import
 * test file" error.
 */
import path from 'path'

const authDir = path.join(__dirname, '../.playwright/auth')

export const EXECUTIVE_STORAGE = path.join(authDir, 'executive.json')
export const FOUNDER_STORAGE = path.join(authDir, 'founder.json')
export const APPRENTICE_STORAGE = path.join(authDir, 'apprentice.json')
export const SUPPLIER_STORAGE = path.join(authDir, 'supplier.json')
