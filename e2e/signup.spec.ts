import { test, expect } from '@playwright/test'

const TEST_URL = process.env.TEST_URL || 'https://fractionalforge.app'

/**
 * Signup Flow E2E Tests
 * 
 * Tests all 4 signup types: Founder, Executive, Apprentice, Supplier
 * Each flow has two stages:
 * 1. Hook stage - Landing page with headline and CTA
 * 2. Form stage - Signup form with role-specific fields
 */

test.describe('Signup Flows', () => {
  
  test.describe('Founder Signup', () => {
    const SIGNUP_URL = `${TEST_URL}/join/founder`
    
    test('displays hook page with headline', async ({ page }) => {
      await page.goto(SIGNUP_URL)
      
      // Verify headline is visible
      await expect(page.getByText('YOUR VISION. OUR OPERATING SYSTEM.')).toBeVisible()
      
      // Verify subheadline
      await expect(page.getByText('Start with an idea. Launch with an army. Keep your equity.')).toBeVisible()
      
      // Verify protocol badge
      await expect(page.getByText('Induction Protocol: FOUNDER')).toBeVisible()
    })

    test('displays benefits list', async ({ page }) => {
      await page.goto(SIGNUP_URL)
      
      // Verify benefits are visible
      await expect(page.getByText('Fractional Execs + high-output Apprentices')).toBeVisible()
      await expect(page.getByText('Your team scales up and down on demand')).toBeVisible()
      await expect(page.getByText('Global manufacturing at your fingertips')).toBeVisible()
      await expect(page.getByText('Legal and IP fortress included')).toBeVisible()
    })

    test('displays CTA button', async ({ page }) => {
      await page.goto(SIGNUP_URL)
      
      // Verify CTA button is visible
      const ctaButton = page.getByRole('button', { name: /begin induction/i })
      await expect(ctaButton).toBeVisible()
    })

    test('transitions to form on CTA click', async ({ page }) => {
      await page.goto(SIGNUP_URL)
      
      // Click CTA button
      await page.getByRole('button', { name: /begin induction/i }).click()
      
      // Wait for form stage (founder has video transition, may take up to 2s)
      await expect(page.getByLabel(/full name/i)).toBeVisible({ timeout: 5000 })
    })

    test('form stage displays all required fields', async ({ page }) => {
      await page.goto(SIGNUP_URL)
      await page.getByRole('button', { name: /begin induction/i }).click()
      
      // Wait for and verify standard form fields
      await expect(page.getByLabel(/full name/i)).toBeVisible({ timeout: 5000 })
      await expect(page.getByLabel(/email/i)).toBeVisible()
      await expect(page.getByLabel(/password/i)).toBeVisible()
      
      // Verify founder-specific fields
      await expect(page.getByLabel(/company name/i)).toBeVisible()
      await expect(page.getByLabel(/industry/i)).toBeVisible()
      await expect(page.getByLabel(/stage/i)).toBeVisible()
      
      // Verify submit button
      await expect(page.getByRole('button', { name: /begin induction/i })).toBeVisible()
    })

    test('form fields are accessible with proper labels', async ({ page }) => {
      await page.goto(SIGNUP_URL)
      await page.getByRole('button', { name: /begin induction/i }).click()
      
      // Wait for form
      await expect(page.getByLabel(/full name/i)).toBeVisible({ timeout: 5000 })
      
      // Verify inputs can be interacted with via labels
      await page.getByLabel(/full name/i).fill('Test User')
      await expect(page.getByLabel(/full name/i)).toHaveValue('Test User')
      
      await page.getByLabel(/email/i).fill('test@example.com')
      await expect(page.getByLabel(/email/i)).toHaveValue('test@example.com')
    })

    test('has back button to return to hook stage', async ({ page }) => {
      await page.goto(SIGNUP_URL)
      await page.getByRole('button', { name: /begin induction/i }).click()
      
      // Wait for form
      await expect(page.getByLabel(/full name/i)).toBeVisible({ timeout: 5000 })
      
      // Click back button
      await page.getByRole('button', { name: /back/i }).click()
      
      // Should return to hook stage
      await expect(page.getByText('YOUR VISION. OUR OPERATING SYSTEM.')).toBeVisible()
    })

    test('demo mode pre-fills form fields', async ({ page }) => {
      await page.goto(`${SIGNUP_URL}?demo=true`)
      await page.getByRole('button', { name: /begin induction/i }).click()
      
      // Wait for form
      await expect(page.getByLabel(/full name/i)).toBeVisible({ timeout: 5000 })
      
      // Verify demo mode banner is visible
      await expect(page.getByText('Demo Mode Active')).toBeVisible()
      
      // Verify fields are pre-filled (values are not empty)
      const nameInput = page.getByLabel(/full name/i)
      await expect(nameInput).not.toHaveValue('')
      
      const emailInput = page.getByLabel(/email/i)
      await expect(emailInput).not.toHaveValue('')
    })
  })

  test.describe('Executive Signup', () => {
    const SIGNUP_URL = `${TEST_URL}/join/executive`
    
    test('displays hook page with headline', async ({ page }) => {
      await page.goto(SIGNUP_URL)
      
      // Verify headline
      await expect(page.getByText("YOUR EXPERTISE IS UNDERPRICED.")).toBeVisible()
      
      // Verify subheadline
      await expect(page.getByText('Deploy your skills where they matter. Build a portfolio of ventures.')).toBeVisible()
      
      // Verify protocol badge
      await expect(page.getByText('Induction Protocol: EXECUTIVE')).toBeVisible()
    })

    test('displays benefits list', async ({ page }) => {
      await page.goto(SIGNUP_URL)
      
      await expect(page.getByText('Work with multiple ventures simultaneously')).toBeVisible()
      await expect(page.getByText('Equity opportunities as relationships develop')).toBeVisible()
      await expect(page.getByText('No politics, no bureaucracy')).toBeVisible()
      await expect(page.getByText('Choose your engagement level')).toBeVisible()
    })

    test('displays CTA button', async ({ page }) => {
      await page.goto(SIGNUP_URL)
      
      const ctaButton = page.getByRole('button', { name: /join the cadre/i })
      await expect(ctaButton).toBeVisible()
    })

    test('transitions to form on CTA click', async ({ page }) => {
      await page.goto(SIGNUP_URL)
      
      await page.getByRole('button', { name: /join the cadre/i }).click()
      
      // Executive has no video, should transition immediately
      await expect(page.getByLabel(/full name/i)).toBeVisible()
    })

    test('form stage displays standard fields only', async ({ page }) => {
      await page.goto(SIGNUP_URL)
      await page.getByRole('button', { name: /join the cadre/i }).click()
      
      // Standard fields
      await expect(page.getByLabel(/full name/i)).toBeVisible()
      await expect(page.getByLabel(/email/i)).toBeVisible()
      await expect(page.getByLabel(/password/i)).toBeVisible()
      
      // Executive has no additional fields
      await expect(page.getByLabel(/company name/i)).not.toBeVisible()
      
      // Submit button
      await expect(page.getByRole('button', { name: /join the cadre/i })).toBeVisible()
    })

    test('demo mode pre-fills form fields', async ({ page }) => {
      await page.goto(`${SIGNUP_URL}?demo=true`)
      await page.getByRole('button', { name: /join the cadre/i }).click()
      
      await expect(page.getByLabel(/full name/i)).toBeVisible()
      await expect(page.getByText('Demo Mode Active')).toBeVisible()
      
      const nameInput = page.getByLabel(/full name/i)
      await expect(nameInput).not.toHaveValue('')
    })
  })

  test.describe('Apprentice Signup', () => {
    const SIGNUP_URL = `${TEST_URL}/join/apprentice`
    
    test('displays hook page with headline', async ({ page }) => {
      await page.goto(SIGNUP_URL)
      
      // Verify headline
      await expect(page.getByText("YOU'RE NOT JUNIOR.")).toBeVisible()
      
      // Verify subheadline
      await expect(page.getByText("You're Founder-in-Training. Your 10x toolkit awaits.")).toBeVisible()
      
      // Verify protocol badge
      await expect(page.getByText('Induction Protocol: APPRENTICE')).toBeVisible()
    })

    test('displays benefits list', async ({ page }) => {
      await page.goto(SIGNUP_URL)
      
      await expect(page.getByText('10x your output from day one')).toBeVisible()
      await expect(page.getByText('Ship real hardware in month one')).toBeVisible()
      await expect(page.getByText('Direct mentorship from fractional execs')).toBeVisible()
      await expect(page.getByText('Fast-track to the Founder track')).toBeVisible()
    })

    test('displays CTA button', async ({ page }) => {
      await page.goto(SIGNUP_URL)
      
      const ctaButton = page.getByRole('button', { name: /enter the guild/i })
      await expect(ctaButton).toBeVisible()
    })

    test('transitions to form on CTA click', async ({ page }) => {
      await page.goto(SIGNUP_URL)
      
      await page.getByRole('button', { name: /enter the guild/i }).click()
      
      await expect(page.getByLabel(/full name/i)).toBeVisible()
    })

    test('form stage displays standard fields only', async ({ page }) => {
      await page.goto(SIGNUP_URL)
      await page.getByRole('button', { name: /enter the guild/i }).click()
      
      // Standard fields
      await expect(page.getByLabel(/full name/i)).toBeVisible()
      await expect(page.getByLabel(/email/i)).toBeVisible()
      await expect(page.getByLabel(/password/i)).toBeVisible()
      
      // Apprentice has no additional fields
      await expect(page.getByLabel(/company name/i)).not.toBeVisible()
      
      // Submit button
      await expect(page.getByRole('button', { name: /enter the guild/i })).toBeVisible()
    })

    test('demo mode pre-fills form fields', async ({ page }) => {
      await page.goto(`${SIGNUP_URL}?demo=true`)
      await page.getByRole('button', { name: /enter the guild/i }).click()
      
      await expect(page.getByLabel(/full name/i)).toBeVisible()
      await expect(page.getByText('Demo Mode Active')).toBeVisible()
      
      const nameInput = page.getByLabel(/full name/i)
      await expect(nameInput).not.toHaveValue('')
    })
  })

  test.describe('Supplier Signup', () => {
    const SIGNUP_URL = `${TEST_URL}/join/supplier`
    
    test('displays hook page with headline', async ({ page }) => {
      await page.goto(SIGNUP_URL)
      
      // Verify headline
      await expect(page.getByText('SELL ON THE MARKETPLACE.')).toBeVisible()
      
      // Verify subheadline
      await expect(page.getByText('List your products. Get discovered. Grow your business.')).toBeVisible()
      
      // Verify protocol badge
      await expect(page.getByText('Induction Protocol: SUPPLIER')).toBeVisible()
    })

    test('displays benefits list', async ({ page }) => {
      await page.goto(SIGNUP_URL)
      
      await expect(page.getByText('List unlimited products and services')).toBeVisible()
      await expect(page.getByText('Respond to qualified RFQ opportunities')).toBeVisible()
      await expect(page.getByText('Manage orders from one dashboard')).toBeVisible()
      await expect(page.getByText('Get paid through secure escrow')).toBeVisible()
    })

    test('displays CTA button', async ({ page }) => {
      await page.goto(SIGNUP_URL)
      
      const ctaButton = page.getByRole('button', { name: /start selling/i })
      await expect(ctaButton).toBeVisible()
    })

    test('transitions to form on CTA click', async ({ page }) => {
      await page.goto(SIGNUP_URL)
      
      await page.getByRole('button', { name: /start selling/i }).click()
      
      await expect(page.getByLabel(/full name/i)).toBeVisible()
    })

    test('form stage displays supplier-specific fields', async ({ page }) => {
      await page.goto(SIGNUP_URL)
      await page.getByRole('button', { name: /start selling/i }).click()
      
      // Standard fields
      await expect(page.getByLabel(/full name/i)).toBeVisible()
      await expect(page.getByLabel(/email/i)).toBeVisible()
      await expect(page.getByLabel(/password/i)).toBeVisible()
      
      // Supplier-specific fields
      await expect(page.getByLabel(/business name/i)).toBeVisible()
      await expect(page.getByLabel(/what do you sell/i)).toBeVisible()
      
      // Submit button
      await expect(page.getByRole('button', { name: /start selling/i })).toBeVisible()
    })

    test('required fields are marked with asterisk', async ({ page }) => {
      await page.goto(SIGNUP_URL)
      await page.getByRole('button', { name: /start selling/i }).click()
      
      await expect(page.getByLabel(/full name/i)).toBeVisible()
      
      // Business Name has required indicator
      const businessNameLabel = page.locator('label', { hasText: /business name/i })
      await expect(businessNameLabel.locator('span')).toContainText('*')
    })

    test('demo mode pre-fills form fields', async ({ page }) => {
      await page.goto(`${SIGNUP_URL}?demo=true`)
      await page.getByRole('button', { name: /start selling/i }).click()
      
      await expect(page.getByLabel(/full name/i)).toBeVisible()
      await expect(page.getByText('Demo Mode Active')).toBeVisible()
      
      const nameInput = page.getByLabel(/full name/i)
      await expect(nameInput).not.toHaveValue('')
    })
  })

  test.describe('Success Page', () => {
    test('founder success page displays correct content', async ({ page }) => {
      await page.goto(`${TEST_URL}/join/success?type=signup&role=founder`)
      
      await expect(page.getByText('Welcome, Founder.')).toBeVisible()
      await expect(page.getByText('Your command center is being prepared.')).toBeVisible()
      await expect(page.getByRole('link', { name: /go to login/i })).toBeVisible()
    })

    test('executive success page displays correct content', async ({ page }) => {
      await page.goto(`${TEST_URL}/join/success?type=signup&role=executive`)
      
      await expect(page.getByText('Welcome to the Cadre.')).toBeVisible()
      await expect(page.getByText('Your expertise has a new home.')).toBeVisible()
      await expect(page.getByRole('link', { name: /go to login/i })).toBeVisible()
    })

    test('apprentice success page displays correct content', async ({ page }) => {
      await page.goto(`${TEST_URL}/join/success?type=signup&role=apprentice`)
      
      await expect(page.getByText('Welcome to The Guild.')).toBeVisible()
      await expect(page.getByText('Your toolkit is ready.')).toBeVisible()
      await expect(page.getByRole('link', { name: /go to login/i })).toBeVisible()
    })

    test('supplier success page displays correct content', async ({ page }) => {
      await page.goto(`${TEST_URL}/join/success?type=signup&role=supplier`)
      
      await expect(page.getByText('Welcome, Supplier.')).toBeVisible()
      await expect(page.getByText('Your storefront is being prepared.')).toBeVisible()
      await expect(page.getByRole('link', { name: /go to login/i })).toBeVisible()
    })
  })

  test.describe('Navigation Elements', () => {
    test('back link returns to home page', async ({ page }) => {
      await page.goto(`${TEST_URL}/join/founder`)
      
      // Find and click back link
      await page.getByRole('link', { name: /back/i }).click()
      
      // Should navigate to home
      await expect(page).toHaveURL(TEST_URL + '/')
    })

    test('login link is visible on hook page', async ({ page }) => {
      await page.goto(`${TEST_URL}/join/founder`)
      
      const loginLink = page.getByRole('link', { name: /already a member\? login/i })
      await expect(loginLink).toBeVisible()
    })

    test('login link navigates to login page', async ({ page }) => {
      await page.goto(`${TEST_URL}/join/founder`)
      
      await page.getByRole('link', { name: /already a member\? login/i }).click()
      
      await expect(page).toHaveURL(`${TEST_URL}/login`)
    })
  })

  test.describe('Form Validation', () => {
    test('email field validates email format', async ({ page }) => {
      await page.goto(`${TEST_URL}/join/executive`)
      await page.getByRole('button', { name: /join the cadre/i }).click()
      
      await expect(page.getByLabel(/full name/i)).toBeVisible()
      
      // Fill with invalid email
      await page.getByLabel(/full name/i).fill('Test User')
      await page.getByLabel(/email/i).fill('invalid-email')
      await page.getByLabel(/password/i).fill('password123')
      
      // Attempt to submit
      await page.getByRole('button', { name: /join the cadre/i }).click()
      
      // Email field should show validation state (browser validation)
      const emailInput = page.getByLabel(/email/i)
      await expect(emailInput).toHaveAttribute('type', 'email')
    })

    test('required fields prevent form submission when empty', async ({ page }) => {
      await page.goto(`${TEST_URL}/join/executive`)
      await page.getByRole('button', { name: /join the cadre/i }).click()
      
      await expect(page.getByLabel(/full name/i)).toBeVisible()
      
      // Verify required attributes are present
      const nameInput = page.getByLabel(/full name/i)
      const emailInput = page.getByLabel(/email/i)
      const passwordInput = page.getByLabel(/password/i)
      
      await expect(nameInput).toHaveAttribute('required', '')
      await expect(emailInput).toHaveAttribute('required', '')
      await expect(passwordInput).toHaveAttribute('required', '')
    })
  })

  test.describe('Accessibility', () => {
    test('hook page has proper heading hierarchy', async ({ page }) => {
      await page.goto(`${TEST_URL}/join/founder`)
      
      // Should have h1 heading
      const h1 = page.getByRole('heading', { level: 1 })
      await expect(h1).toBeVisible()
      await expect(h1).toContainText('YOUR VISION. OUR OPERATING SYSTEM.')
    })

    test('form stage has proper heading hierarchy', async ({ page }) => {
      await page.goto(`${TEST_URL}/join/founder`)
      await page.getByRole('button', { name: /begin induction/i }).click()
      
      await expect(page.getByLabel(/full name/i)).toBeVisible({ timeout: 5000 })
      
      // Should have heading for form
      const formHeading = page.getByRole('heading', { name: /create your account/i })
      await expect(formHeading).toBeVisible()
    })

    test('form inputs have associated labels', async ({ page }) => {
      await page.goto(`${TEST_URL}/join/executive`)
      await page.getByRole('button', { name: /join the cadre/i }).click()
      
      // Verify labels are properly associated via getByLabel
      await expect(page.getByLabel(/full name/i)).toBeVisible()
      await expect(page.getByLabel(/email/i)).toBeVisible()
      await expect(page.getByLabel(/password/i)).toBeVisible()
    })

    test('buttons are keyboard accessible', async ({ page }) => {
      await page.goto(`${TEST_URL}/join/founder`)
      
      // Tab to the CTA button
      const ctaButton = page.getByRole('button', { name: /begin induction/i })
      await ctaButton.focus()
      
      // Button should be focusable
      await expect(ctaButton).toBeFocused()
    })
  })

  test.describe('Mobile Responsiveness', () => {
    test.use({ viewport: { width: 375, height: 667 } })

    test('hook page renders correctly on mobile', async ({ page }) => {
      await page.goto(`${TEST_URL}/join/founder`)
      
      // Headline should be visible
      await expect(page.getByText('YOUR VISION. OUR OPERATING SYSTEM.')).toBeVisible()
      
      // CTA should be visible
      await expect(page.getByRole('button', { name: /begin induction/i })).toBeVisible()
    })

    test('form renders correctly on mobile', async ({ page }) => {
      await page.goto(`${TEST_URL}/join/executive`)
      await page.getByRole('button', { name: /join the cadre/i }).click()
      
      // Form fields should be visible
      await expect(page.getByLabel(/full name/i)).toBeVisible()
      await expect(page.getByLabel(/email/i)).toBeVisible()
      await expect(page.getByLabel(/password/i)).toBeVisible()
    })
  })
})
