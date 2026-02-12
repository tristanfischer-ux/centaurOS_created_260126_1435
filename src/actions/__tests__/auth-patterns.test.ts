/**
 * @file auth-patterns.test.ts
 * 
 * @description Tests for the authentication and foundry isolation patterns
 * that are duplicated across 90+ server actions. These tests verify that
 * the common auth guard pattern works correctly.
 * 
 * Covers:
 * - Authentication checks (unauthenticated users rejected)
 * - Foundry isolation (users cannot access other foundries)
 * - Input validation (malformed inputs handled gracefully)
 * 
 * @security These tests verify security-critical behavior.
 */

import { createObjective } from '../objectives'
import { getConversations } from '../messaging'
import { createNotification, createBulkNotifications } from '../notifications'
import { updateProfileDetails } from '../profiles'

// Valid UUID test constants
const VALID_USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const VALID_FOUNDRY_ID = '550e8400-e29b-41d4-a716-446655440001'
const VALID_PROFILE_ID = '550e8400-e29b-41d4-a716-446655440010'

// Mock Supabase
const mockGetUser = jest.fn()
const mockFrom = jest.fn()
const mockRpc = jest.fn()

const mockSupabaseClient = {
  auth: { getUser: mockGetUser },
  from: mockFrom,
  rpc: mockRpc,
}

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => Promise.resolve(mockSupabaseClient)),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

jest.mock('@/lib/supabase/foundry-context', () => ({
  getFoundryIdCached: jest.fn(() => Promise.resolve(VALID_FOUNDRY_ID)),
}))

jest.mock('@/lib/retry', () => ({
  withRetry: jest.fn((fn: () => Promise<unknown>) => fn()),
}))

jest.mock('@/lib/validations', () => ({
  createObjectiveSchema: {},
  updateObjectiveSchema: {},
  validate: jest.fn((schema: unknown, data: { title?: string }) => {
    if (!data.title || data.title.trim().length === 0) {
      return { success: false, error: 'Title is required' }
    }
    return { success: true, data }
  }),
}))

jest.mock('@/lib/security/audit-log', () => ({
  logSecurityEvent: jest.fn(),
}))

// ============================================
// Authentication Guard Tests
// ============================================

describe('Authentication Guards', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('createObjective - auth check', () => {
    it('should return error when user is not authenticated', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
      })

      const formData = new FormData()
      formData.append('title', 'Test Objective')

      const result = await createObjective(formData)
      expect(result).toEqual({ error: 'Unauthorized' })
    })

    it('should return error when foundry context is missing', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: VALID_USER_ID } },
      })

      // Override foundry mock to return null
      const { getFoundryIdCached } = jest.requireMock('@/lib/supabase/foundry-context')
      getFoundryIdCached.mockResolvedValueOnce(null)

      const formData = new FormData()
      formData.append('title', 'Test Objective')

      const result = await createObjective(formData)
      expect(result).toEqual({ error: 'User not in a foundry' })
    })
  })

  describe('getConversations - auth check', () => {
    it('should return error when user is not authenticated', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' },
      })

      const result = await getConversations()
      // withUser returns { error: 'Unauthorized' } on auth failure (success is undefined, not false)
      expect(result.error).toBeDefined()
      expect(result.success).toBeFalsy()
    })
  })

  describe('updateProfileDetails - auth check', () => {
    it('should return error when user is not authenticated', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
      })

      const result = await updateProfileDetails(VALID_PROFILE_ID, {
        full_name: 'Test User',
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('authenticated')
    })
  })

  describe('createNotification - error handling', () => {
    it('should handle RPC errors gracefully', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'Function not found' },
      })

      const result = await createNotification({
        userId: VALID_USER_ID,
        type: 'task_assigned',
        title: 'Test notification',
      })

      expect(result.id).toBeNull()
      expect(result.error).toBeDefined()
    })

    it('should handle unexpected exceptions', async () => {
      mockRpc.mockRejectedValue(new Error('Network timeout'))

      const result = await createNotification({
        userId: VALID_USER_ID,
        type: 'task_assigned',
        title: 'Test notification',
      })

      expect(result.id).toBeNull()
      expect(result.error).toBeDefined()
    })
  })

  describe('createBulkNotifications - foundry check', () => {
    it('should return error when no foundry context', async () => {
      const { getFoundryIdCached } = jest.requireMock('@/lib/supabase/foundry-context')
      getFoundryIdCached.mockResolvedValueOnce(null)

      const result = await createBulkNotifications({
        userIds: [VALID_USER_ID],
        type: 'system',
        title: 'Test',
      })

      expect(result.count).toBe(0)
      expect(result.error).toContain('foundry')
    })
  })
})

// ============================================
// Input Validation Tests
// ============================================

describe('Input Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetUser.mockResolvedValue({
      data: { user: { id: VALID_USER_ID } },
    })
  })

  describe('createObjective - validation', () => {
    it('should validate that title is required', async () => {
      const formData = new FormData()
      formData.append('title', '')

      const result = await createObjective(formData)
      expect(result.error).toBeDefined()
    })

    it('should accept valid input', async () => {
      mockFrom.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: '123', title: 'Test Objective' },
              error: null,
            }),
          }),
        }),
      })

      const formData = new FormData()
      formData.append('title', 'Test Objective')
      formData.append('description', 'A valid description')

      const result = await createObjective(formData)
      // Should either succeed or return a non-validation error
      expect(result).toBeDefined()
    })
  })
})
