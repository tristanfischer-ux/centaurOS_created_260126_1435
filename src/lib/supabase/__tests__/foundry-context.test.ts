/**
 * @file foundry-context.test.ts
 * 
 * @description Tests for the foundry context module - the multi-tenant isolation layer.
 * This module is used by 50+ server actions. If it breaks, every query returns 
 * wrong data or fails silently.
 * 
 * @security Foundry isolation is a security boundary. These tests verify that
 * users can only access data within their own foundry.
 */

// Valid UUID test constants
const VALID_USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const VALID_FOUNDRY_ID = '550e8400-e29b-41d4-a716-446655440001'
const VALID_ACTIVE_FOUNDRY_ID = '550e8400-e29b-41d4-a716-446655440002'
const OTHER_USER_ID = '550e8400-e29b-41d4-a716-446655440003'
const OTHER_FOUNDRY_ID = '550e8400-e29b-41d4-a716-446655440004'

// Mock the Supabase server client
const mockGetUser = jest.fn()
const mockFrom = jest.fn()

const mockSupabaseClient = {
  auth: { getUser: mockGetUser },
  from: mockFrom,
}

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => Promise.resolve(mockSupabaseClient)),
}))

// Import AFTER mocking
import { getFoundryIdCached, clearFoundryCache } from '../foundry-context'

describe('getFoundryIdCached', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Clear the in-memory cache before each test
    clearFoundryCache()
  })

  it('should return null when user is not authenticated', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
    })

    const result = await getFoundryIdCached()
    expect(result).toBeNull()
  })

  it('should return active_foundry_id when set on profile', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: VALID_USER_ID } },
    })

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: {
              foundry_id: VALID_FOUNDRY_ID,
              active_foundry_id: VALID_ACTIVE_FOUNDRY_ID,
            },
            error: null,
          }),
        }),
      }),
    })

    const result = await getFoundryIdCached()
    expect(result).toBe(VALID_ACTIVE_FOUNDRY_ID)
  })

  it('should fall back to foundry_id when active_foundry_id is null', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: VALID_USER_ID } },
    })

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: {
              foundry_id: VALID_FOUNDRY_ID,
              active_foundry_id: null,
            },
            error: null,
          }),
        }),
      }),
    })

    const result = await getFoundryIdCached()
    expect(result).toBe(VALID_FOUNDRY_ID)
  })

  it('should return null when profile has no foundry at all', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: VALID_USER_ID } },
    })

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: {
              foundry_id: null,
              active_foundry_id: null,
            },
            error: null,
          }),
        }),
      }),
    })

    const result = await getFoundryIdCached()
    expect(result).toBeNull()
  })

  it('should return null when profile query errors', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: VALID_USER_ID } },
    })

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'Profile not found', code: 'PGRST116' },
          }),
        }),
      }),
    })

    const result = await getFoundryIdCached()
    expect(result).toBeNull()
  })

  it('should cache results for the same user', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: VALID_USER_ID } },
    })

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: {
              foundry_id: VALID_FOUNDRY_ID,
              active_foundry_id: null,
            },
            error: null,
          }),
        }),
      }),
    })

    // First call - hits the database
    const result1 = await getFoundryIdCached()
    expect(result1).toBe(VALID_FOUNDRY_ID)

    // Second call - should use cache (mockFrom should only be called once)
    const result2 = await getFoundryIdCached()
    expect(result2).toBe(VALID_FOUNDRY_ID)

    // from() called once for profile query (first call only)
    // The second call should hit the cache
    expect(mockFrom).toHaveBeenCalledTimes(1)
  })

  it('should return different foundries for different users', async () => {
    // First user
    mockGetUser.mockResolvedValue({
      data: { user: { id: VALID_USER_ID } },
    })

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { foundry_id: VALID_FOUNDRY_ID, active_foundry_id: null },
            error: null,
          }),
        }),
      }),
    })

    const result1 = await getFoundryIdCached()
    expect(result1).toBe(VALID_FOUNDRY_ID)

    // Clear cache and switch to second user
    clearFoundryCache()

    mockGetUser.mockResolvedValue({
      data: { user: { id: OTHER_USER_ID } },
    })

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { foundry_id: OTHER_FOUNDRY_ID, active_foundry_id: null },
            error: null,
          }),
        }),
      }),
    })

    const result2 = await getFoundryIdCached()
    expect(result2).toBe(OTHER_FOUNDRY_ID)
    expect(result1).not.toBe(result2)
  })
})

describe('clearFoundryCache', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    clearFoundryCache()
  })

  it('should clear cache for a specific user', async () => {
    // Populate cache
    mockGetUser.mockResolvedValue({
      data: { user: { id: VALID_USER_ID } },
    })

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { foundry_id: VALID_FOUNDRY_ID, active_foundry_id: null },
            error: null,
          }),
        }),
      }),
    })

    await getFoundryIdCached()
    expect(mockFrom).toHaveBeenCalledTimes(1)

    // Clear cache for this user
    clearFoundryCache(VALID_USER_ID)

    // Next call should hit database again
    await getFoundryIdCached()
    expect(mockFrom).toHaveBeenCalledTimes(2)
  })

  it('should clear all cache entries when no userId provided', async () => {
    // Populate cache
    mockGetUser.mockResolvedValue({
      data: { user: { id: VALID_USER_ID } },
    })

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { foundry_id: VALID_FOUNDRY_ID, active_foundry_id: null },
            error: null,
          }),
        }),
      }),
    })

    await getFoundryIdCached()

    // Clear all
    clearFoundryCache()

    // Next call should hit database again
    await getFoundryIdCached()
    expect(mockFrom).toHaveBeenCalledTimes(2)
  })
})
