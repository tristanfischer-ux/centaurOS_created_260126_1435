import { test as base } from '@playwright/test'

// Extend base test with app-specific fixtures
export const test = base.extend({
  // Add authenticated user fixture in the future
})

export { expect } from '@playwright/test'
