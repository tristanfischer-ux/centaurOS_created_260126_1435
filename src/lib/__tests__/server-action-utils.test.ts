/**
 * @file server-action-utils.test.ts
 * 
 * @description Tests for the withAuth and withUser wrappers that provide
 * authentication and foundry context to server actions. These wrappers
 * replace 90+ copies of the same auth boilerplate.
 * 
 * @security Verifies that unauthenticated and foundry-less users are rejected.
 */

// Suppress expected console.error from auth wrapper error paths
let consoleErrorSpy: jest.SpyInstance
beforeAll(() => { consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {}) })
afterAll(() => { consoleErrorSpy.mockRestore() })

// Valid UUID test constants
const VALID_USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const VALID_FOUNDRY_ID = '550e8400-e29b-41d4-a716-446655440001'

// Mock Supabase client
const mockGetUser = jest.fn()
const mockSupabaseClient = {
  auth: { getUser: mockGetUser },
  from: jest.fn(),
  rpc: jest.fn(),
}

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => Promise.resolve(mockSupabaseClient)),
}))

const mockGetFoundryIdCached = jest.fn()
jest.mock('@/lib/supabase/foundry-context', () => ({
  getFoundryIdCached: (...args: unknown[]) => mockGetFoundryIdCached(...args),
}))

import { withAuth, withUser } from '../server-action-utils'
import type { AuthContext } from '../server-action-utils'

describe('withAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return Unauthorized when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    })

    const action = jest.fn()
    const result = await withAuth(action)

    expect(result).toEqual({ error: 'Unauthorized' })
    expect(action).not.toHaveBeenCalled()
  })

  it('should return Unauthorized when auth returns an error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'JWT expired' },
    })

    const action = jest.fn()
    const result = await withAuth(action)

    expect(result).toEqual({ error: 'Unauthorized' })
    expect(action).not.toHaveBeenCalled()
  })

  it('should return foundry error when user has no foundry', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: VALID_USER_ID } },
      error: null,
    })
    mockGetFoundryIdCached.mockResolvedValue(null)

    const action = jest.fn()
    const result = await withAuth(action)

    expect(result).toEqual({ error: 'User not in a foundry' })
    expect(action).not.toHaveBeenCalled()
  })

  it('should call action with correct context when auth succeeds', async () => {
    const mockUser = { id: VALID_USER_ID, email: 'test@example.com' }
    mockGetUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
    mockGetFoundryIdCached.mockResolvedValue(VALID_FOUNDRY_ID)

    const action = jest.fn().mockResolvedValue({ success: true })
    const result = await withAuth(action)

    expect(result).toEqual({ success: true })
    expect(action).toHaveBeenCalledTimes(1)

    // Verify the context passed to the action
    const ctx: AuthContext = action.mock.calls[0][0]
    expect(ctx.user).toEqual(mockUser)
    expect(ctx.foundryId).toBe(VALID_FOUNDRY_ID)
    expect(ctx.supabase).toBe(mockSupabaseClient)
  })

  it('should return action result directly when successful', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: VALID_USER_ID } },
      error: null,
    })
    mockGetFoundryIdCached.mockResolvedValue(VALID_FOUNDRY_ID)

    const expectedResult = { success: true, data: [{ id: '1' }, { id: '2' }] }
    const action = jest.fn().mockResolvedValue(expectedResult)
    const result = await withAuth(action)

    expect(result).toEqual(expectedResult)
  })

  it('should catch and handle errors thrown by the action', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: VALID_USER_ID } },
      error: null,
    })
    mockGetFoundryIdCached.mockResolvedValue(VALID_FOUNDRY_ID)

    const action = jest.fn().mockRejectedValue(new Error('Database connection failed'))
    const result = await withAuth(action)

    expect(result).toEqual({ error: 'An unexpected error occurred. Please try again or contact support if the problem persists.' })
  })

  it('should handle non-Error exceptions', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: VALID_USER_ID } },
      error: null,
    })
    mockGetFoundryIdCached.mockResolvedValue(VALID_FOUNDRY_ID)

    const action = jest.fn().mockRejectedValue('string error')
    const result = await withAuth(action)

    expect(result).toEqual({ error: 'An unexpected error occurred. Please try again or contact support if the problem persists.' })
  })

  it('should handle action returning error objects', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: VALID_USER_ID } },
      error: null,
    })
    mockGetFoundryIdCached.mockResolvedValue(VALID_FOUNDRY_ID)

    // Actions can return their own errors
    const action = jest.fn().mockResolvedValue({ error: 'Task not found' })
    const result = await withAuth(action)

    expect(result).toEqual({ error: 'Task not found' })
  })
})

describe('withUser', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return Unauthorized when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    })

    const action = jest.fn()
    const result = await withUser(action)

    expect(result).toEqual({ error: 'Unauthorized' })
    expect(action).not.toHaveBeenCalled()
  })

  it('should call action without foundryId in context', async () => {
    const mockUser = { id: VALID_USER_ID, email: 'test@example.com' }
    mockGetUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })

    const action = jest.fn().mockResolvedValue({ success: true })
    const result = await withUser(action)

    expect(result).toEqual({ success: true })
    expect(action).toHaveBeenCalledTimes(1)

    // Verify context has user and supabase but NOT foundryId
    const ctx = action.mock.calls[0][0]
    expect(ctx.user).toEqual(mockUser)
    expect(ctx.supabase).toBe(mockSupabaseClient)
    expect(ctx).not.toHaveProperty('foundryId')
  })

  it('should NOT require foundry context', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: VALID_USER_ID } },
      error: null,
    })
    // Even if foundry is null, withUser should still work
    mockGetFoundryIdCached.mockResolvedValue(null)

    const action = jest.fn().mockResolvedValue({ success: true })
    const result = await withUser(action)

    // Should succeed - withUser doesn't check foundry
    expect(result).toEqual({ success: true })
    expect(action).toHaveBeenCalledTimes(1)
  })

  it('should catch and handle errors thrown by the action', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: VALID_USER_ID } },
      error: null,
    })

    const action = jest.fn().mockRejectedValue(new Error('Something broke'))
    const result = await withUser(action)

    expect(result).toEqual({ error: 'An unexpected error occurred. Please try again or contact support if the problem persists.' })
  })
})
