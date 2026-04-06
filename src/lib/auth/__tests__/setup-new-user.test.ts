/**
 * @file setup-new-user.test.ts
 *
 * @description Unit tests for the setupNewUser function that handles
 * post-signup user provisioning: foundry creation, profile, memberships,
 * demo data seeding, and marketplace listing creation.
 *
 * @security Verifies that executives get isolated sandbox foundries
 * (not the shared forge-guild), and that founders/suppliers follow
 * their respective paths.
 */

import { setupNewUser, capitalizeRole } from '../setup-new-user'
import type { SupabaseClient } from '@supabase/supabase-js'

// Suppress expected console warnings from non-fatal error paths
let consoleWarnSpy: jest.SpyInstance
let consoleErrorSpy: jest.SpyInstance
beforeAll(() => {
  consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterAll(() => {
  consoleWarnSpy.mockRestore()
  consoleErrorSpy.mockRestore()
})

// ─── Mock Supabase ──────────────────────────────────────────────

const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000'

type MockChain = {
  select: jest.Mock
  insert: jest.Mock
  update: jest.Mock
  upsert: jest.Mock
  delete: jest.Mock
  eq: jest.Mock
  single: jest.Mock
  maybeSingle: jest.Mock
}

function createMockChain(): MockChain {
  const chain: MockChain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
  }
  // Make chainable
  chain.select.mockReturnValue(chain)
  chain.insert.mockReturnValue(chain)
  chain.update.mockReturnValue(chain)
  chain.upsert.mockReturnValue(chain)
  chain.delete.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  return chain
}

function createMockSupabase() {
  const chains: Record<string, MockChain> = {}

  const mockFrom = jest.fn((table: string) => {
    if (!chains[table]) chains[table] = createMockChain()
    return chains[table]
  })

  const mockRpc = jest.fn().mockResolvedValue({ data: null, error: null })

  return {
    client: {
      auth: { getUser: jest.fn() },
      from: mockFrom,
      rpc: mockRpc,
    } as unknown as SupabaseClient,
    from: mockFrom,
    rpc: mockRpc,
    chains,
    getChain: (table: string) => {
      if (!chains[table]) chains[table] = createMockChain()
      return chains[table]
    },
  }
}

// ─── Tests ──────────────────────────────────────────────────────

describe('capitalizeRole', () => {
  it('capitalizes known roles', () => {
    expect(capitalizeRole('founder')).toBe('Founder')
    expect(capitalizeRole('executive')).toBe('Executive')
    expect(capitalizeRole('apprentice')).toBe('Apprentice')
    expect(capitalizeRole('supplier')).toBe('Supplier')
  })

  it('defaults to Apprentice for unknown roles', () => {
    expect(capitalizeRole('unknown')).toBe('Apprentice')
    expect(capitalizeRole('')).toBe('Apprentice')
  })
})

describe('setupNewUser', () => {
  let mock: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    mock = createMockSupabase()

    // Default: no existing profile (new user)
    mock.getChain('profiles').single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })

    // Default: shared foundries exist
    mock.getChain('foundries').single.mockResolvedValue({ data: { id: 'forge-guild' }, error: null })

    // Default: foundry insert succeeds
    mock.getChain('foundries').insert.mockImplementation(() => {
      const chain = mock.getChain('foundries')
      chain.single.mockResolvedValueOnce({ data: { id: `sandbox-${TEST_USER_ID.slice(0, 8)}` }, error: null })
      return chain
    })

    // Default: profile insert succeeds
    mock.getChain('profiles').insert.mockReturnValue({
      ...mock.getChain('profiles'),
      then: undefined, // break chain for insert (returns { error: null })
    })
    // Override: profile insert returns no error
    mock.from.mockImplementation((table: string) => {
      const chain = mock.getChain(table)
      if (table === 'profiles') {
        // First call = select (idempotency check), second = insert
        const originalInsert = chain.insert
        chain.insert = jest.fn().mockResolvedValue({ error: null })
        // Keep select working for idempotency check
        chain.select.mockReturnValue(chain)
        chain.eq.mockReturnValue(chain)
        chain.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
        // Restore
        void originalInsert
      }
      return chain
    })

    // Default: membership upsert succeeds
    mock.getChain('foundry_memberships').upsert.mockResolvedValue({ error: null })

    // Default: provider_profiles insert succeeds
    mock.getChain('provider_profiles').insert.mockResolvedValue({ error: null })

    // Default: marketplace_listings insert succeeds (chainable: .insert().select().single())
    mock.getChain('marketplace_listings').insert.mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: { id: 'listing-123' }, error: null }),
      }),
    })

    // Default: foundry owner update succeeds
    mock.getChain('foundries').update.mockReturnValue({
      ...mock.getChain('foundries'),
      eq: jest.fn().mockResolvedValue({ error: null }),
    })
  })

  it('returns early if profile already exists (idempotency)', async () => {
    // Profile already exists
    mock.from.mockImplementation((table: string) => {
      const chain = mock.getChain(table)
      if (table === 'profiles') {
        chain.single.mockResolvedValue({
          data: { id: TEST_USER_ID, foundry_id: 'existing-foundry' },
          error: null,
        })
      }
      return chain
    })

    const result = await setupNewUser({
      supabase: mock.client,
      userId: TEST_USER_ID,
      email: 'test@example.com',
      fullName: 'Test User',
      role: 'executive',
    })

    expect(result.foundryId).toBe('existing-foundry')
    expect(result.redirectPath).toBe('/today')
  })

  it('creates sandbox foundry for executives (not forge-guild)', async () => {
    const insertedData: Record<string, unknown>[] = []

    mock.from.mockImplementation((table: string) => {
      const chain = createMockChain()

      if (table === 'profiles') {
        // First call: idempotency check → no existing profile
        chain.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
        // Insert succeeds
        chain.insert.mockImplementation((data: unknown) => {
          insertedData.push({ table, ...(data as Record<string, unknown>) })
          return Promise.resolve({ error: null })
        })
      }

      if (table === 'foundries') {
        // Shared foundry check → exists
        chain.single.mockResolvedValue({ data: { id: 'forge-guild' }, error: null })
        // Insert → sandbox creation succeeds
        chain.insert.mockImplementation((data: unknown) => {
          const record = data as Record<string, unknown>
          insertedData.push({ table, ...record })
          return {
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { id: record.id },
                error: null,
              }),
            }),
          }
        })
        chain.update.mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        })
      }

      if (table === 'foundry_memberships') {
        chain.upsert.mockImplementation((data: unknown) => {
          insertedData.push({ table, ...(data as Record<string, unknown>) })
          return Promise.resolve({ error: null })
        })
      }

      if (table === 'provider_profiles') {
        chain.insert.mockImplementation((data: unknown) => {
          insertedData.push({ table, ...(data as Record<string, unknown>) })
          return Promise.resolve({ error: null })
        })
      }

      if (table === 'marketplace_listings') {
        chain.insert.mockImplementation((data: unknown) => {
          insertedData.push({ table, ...(data as Record<string, unknown>) })
          return {
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: { id: 'listing-123' }, error: null }),
            }),
          }
        })
      }

      return chain
    })

    // RPC calls succeed
    mock.rpc.mockResolvedValue({ data: null, error: null })

    const result = await setupNewUser({
      supabase: mock.client,
      userId: TEST_USER_ID,
      email: 'exec@example.com',
      fullName: 'Jane Smith',
      role: 'executive',
    })

    // Should NOT be forge-guild
    expect(result.foundryId).not.toBe('forge-guild')
    expect(result.foundryId).toBe(`sandbox-${TEST_USER_ID.slice(0, 8)}`)
    expect(result.redirectPath).toBe('/today')

    // Verify sandbox foundry was created with is_sandbox: true
    const foundryInsert = insertedData.find(d => d.table === 'foundries' && (d.id as string)?.startsWith('sandbox-'))
    expect(foundryInsert).toBeDefined()
    expect(foundryInsert?.is_sandbox).toBe(true)
    expect(foundryInsert?.name).toBe("Jane's Company")
  })

  it('creates marketplace listing for executives without function_category', async () => {
    const insertedData: Record<string, unknown>[] = []

    mock.from.mockImplementation((table: string) => {
      const chain = createMockChain()

      if (table === 'profiles') {
        chain.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
        chain.insert.mockResolvedValue({ error: null })
      }

      if (table === 'foundries') {
        chain.single.mockResolvedValue({ data: { id: 'forge-guild' }, error: null })
        chain.insert.mockImplementation((data: unknown) => {
          const record = data as Record<string, unknown>
          return {
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: { id: record.id }, error: null }),
            }),
          }
        })
        chain.update.mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) })
      }

      if (table === 'foundry_memberships') {
        chain.upsert.mockResolvedValue({ error: null })
      }

      if (table === 'provider_profiles') {
        chain.insert.mockResolvedValue({ error: null })
      }

      if (table === 'marketplace_listings') {
        chain.insert.mockImplementation((data: unknown) => {
          insertedData.push({ table, ...(data as Record<string, unknown>) })
          return {
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: { id: 'listing-123' }, error: null }),
            }),
          }
        })
      }

      return chain
    })

    mock.rpc.mockResolvedValue({ data: null, error: null })

    await setupNewUser({
      supabase: mock.client,
      userId: TEST_USER_ID,
      email: 'exec@example.com',
      fullName: 'Jane Smith',
      role: 'executive',
    })

    const listing = insertedData.find(d => d.table === 'marketplace_listings')
    expect(listing).toBeDefined()
    expect(listing?.category).toBe('People')
    expect(listing?.subcategory).toBe('Executive')
    // Should NOT have function_category hardcoded
    const attrs = listing?.attributes as Record<string, unknown> | undefined
    expect(attrs?.function_category).toBeUndefined()
    expect(attrs?.profile_id).toBe(TEST_USER_ID)
  })

  it('assigns suppliers to forge-suppliers (not sandbox)', async () => {
    mock.from.mockImplementation((table: string) => {
      const chain = createMockChain()

      if (table === 'profiles') {
        chain.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
        chain.insert.mockResolvedValue({ error: null })
      }

      if (table === 'foundries') {
        chain.single.mockResolvedValue({ data: { id: 'forge-suppliers' }, error: null })
      }

      if (table === 'foundry_memberships') {
        chain.upsert.mockResolvedValue({ error: null })
      }

      return chain
    })

    const result = await setupNewUser({
      supabase: mock.client,
      userId: TEST_USER_ID,
      email: 'supplier@example.com',
      fullName: 'Supplier Co',
      role: 'supplier',
    })

    expect(result.foundryId).toBe('forge-suppliers')
    expect(result.redirectPath).toBe('/supplier-portal')
  })
})
