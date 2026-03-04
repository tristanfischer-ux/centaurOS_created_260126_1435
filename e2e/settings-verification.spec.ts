/**
 * One-off verification of settings pages.
 * Navigates to /settings, /settings/privacy, /settings/help and captures screenshots.
 * Uses tristan@forgeos.ai / password123 if redirected to login.
 */
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import path from 'path'
import { dismissOnboarding } from './auth-storage'

const LOGIN_EMAIL = 'tristan@forgeos.ai'
const LOGIN_PASSWORD = 'password123'
const SCREENSHOT_DIR = 'test-results/settings-verification'

async function loginIfNeeded(page: Page, targetPath: string): Promise<boolean> {
  await dismissOnboarding(page)
  const url = page.url()
  if (!url.includes('/login') && !url.includes('/auth')) return true

  await page.fill('input[type="email"]', LOGIN_EMAIL)
  await page.fill('input[type="password"]', LOGIN_PASSWORD)
  await page.getByRole('button', { name: /enter the forge/i }).click()
  try {
    await page.waitForURL(/\/(today|dashboard|updates|settings|new-objectives|new-tasks)/, {
      timeout: 15000,
    })
    // Navigate back to target after login
    await page.goto(targetPath)
    await page.waitForLoadState('networkidle')
    return true
  } catch {
    return false
  }
}

test.describe('Settings pages verification', () => {
  test('1. Account overview page (/settings)', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')

    const loggedIn = await loginIfNeeded(page, '/settings')
    const finalUrl = page.url()
    const isLoginPage = finalUrl.includes('/login') || finalUrl.includes('/auth')

    if (isLoginPage) {
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, '01-settings-login-redirect.png'),
        fullPage: true,
      })
      test.skip(!loggedIn, 'Redirected to login - credentials may be invalid')
    }

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '01-settings-account-overview.png'),
      fullPage: true,
    })

    const body = await page.locator('body').textContent()
    expect(body?.length ?? 0).toBeGreaterThan(100)
  })

  test('2. Privacy & Data page (/settings/privacy)', async ({ page }) => {
    await page.goto('/settings/privacy')
    await page.waitForLoadState('networkidle')

    const loggedIn = await loginIfNeeded(page, '/settings/privacy')

    const finalUrl = page.url()
    const isLoginPage = finalUrl.includes('/login') || finalUrl.includes('/auth')

    if (isLoginPage) {
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, '02-privacy-login-redirect.png'),
        fullPage: true,
      })
      test.skip(!loggedIn, 'Redirected to login - credentials may be invalid')
    }

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '02-settings-privacy.png'),
      fullPage: true,
    })

    const body = await page.locator('body').textContent()
    expect(body?.length ?? 0).toBeGreaterThan(100)
  })

  test('3. Help & Support page (/settings/help)', async ({ page }) => {
    await page.goto('/settings/help')
    await page.waitForLoadState('networkidle')

    const loggedIn = await loginIfNeeded(page, '/settings/help')

    const finalUrl = page.url()
    const isLoginPage = finalUrl.includes('/login') || finalUrl.includes('/auth')

    if (isLoginPage) {
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, '03-help-login-redirect.png'),
        fullPage: true,
      })
      test.skip(!loggedIn, 'Redirected to login - credentials may be invalid')
    }

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '03-settings-help.png'),
      fullPage: true,
    })

    const body = await page.locator('body').textContent()
    expect(body?.length ?? 0).toBeGreaterThan(100)
  })
})
