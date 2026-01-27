import { test, expect } from '@playwright/test'

test.describe('Health Check', () => {
  test('API health endpoint returns healthy status', async ({ request }) => {
    const response = await request.get('/api/health')
    expect(response.ok()).toBeTruthy()
    
    const body = await response.json()
    expect(body.status).toBe('healthy')
    expect(body.checks.database).toBe('connected')
  })
})
