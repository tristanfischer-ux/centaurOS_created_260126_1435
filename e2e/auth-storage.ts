/**
 * Shared storage-state paths and helpers for authenticated persona sessions.
 *
 * Extracted from auth.setup.ts so that spec files can import them
 * without triggering Playwright's "test file should not import
 * test file" error.
 */
import path from 'path'
import type { Page } from '@playwright/test'

const authDir = path.join(__dirname, '../.playwright/auth')

export const EXECUTIVE_STORAGE = path.join(authDir, 'executive.json')
export const FOUNDER_STORAGE = path.join(authDir, 'founder.json')
export const APPRENTICE_STORAGE = path.join(authDir, 'apprentice.json')
export const SUPPLIER_STORAGE = path.join(authDir, 'supplier.json')
export const FREYA_STORAGE = path.join(authDir, 'freya.json')

/**
 * All localStorage keys that control onboarding modals.
 *
 * Setting these to 'true' prevents onboarding dialogs from appearing,
 * so walkthrough tests can interact with the real application UI.
 */
const ONBOARDING_KEYS = [
  'forgeos_onboarding_completed',
  'forgeos_intent_selected',
  'forgeos_supplier_onboarding_completed',
  'forgeos:onboarding:completed',
  'forgeos:marketplace:onboarding:completed',
] as const

/**
 * Marks all onboarding flows as completed in localStorage.
 *
 * @description Call this in beforeEach as a safety net — the auth setup
 * already bakes these flags into the saved storage state, but this
 * ensures they survive even if storage gets cleared between tests.
 *
 * Uses addInitScript so the localStorage flags are set BEFORE the page
 * renders, preventing any flash of the onboarding modal.
 */
export async function dismissOnboarding(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('forgeos_onboarding_completed', 'true')
    localStorage.setItem('forgeos_intent_selected', 'true')
    localStorage.setItem('forgeos_supplier_onboarding_completed', 'true')
    localStorage.setItem('forgeos:onboarding:completed', 'true')
    localStorage.setItem('forgeos:marketplace:onboarding:completed', 'true')
  })
}
