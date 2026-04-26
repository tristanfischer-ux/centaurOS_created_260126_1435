/**
 * @file setup-new-user.test.ts
 *
 * @description Unit tests for the setupNewUser function that handles
 * post-signup user provisioning: foundry creation, profile, memberships,
 * demo data seeding, and marketplace listing creation.
 *
 * Tests cover the SetupResult discriminated union:
 *   ok: true  — happy path + idempotency
 *   ok: false — foundry_creation_failed, foundry_slug_collision, rls_denied,
 *               profile_creation_failed, unknown
 *
 * @security Verifies that executives get isolated sandbox foundries
 * (not the shared forge-guild), and that founders/suppliers follow
 * their respective paths.
 */

import { setupNewUser, capitalizeRole } from '../setup-new-user'
import type { SupabaseClient } from '@supabase/supabase-js'

// Suppress expected console warnings / errors from non-fatal error paths
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

// ─── Mock the admin client used by persistSetupError ────────────────────────
// persistSetupError imports createAdminClient — mock it so tests don't hit Supabase.
// The shared-foundry existence check (`from('foundries').select('id').eq('id', X).single()`)
// AND the foundry creation path (`from('foundries').insert(...).select('id').single()`)
// both reuse this client, so the mock must expose a fully-chainable PostgREST-shaped
// builder AND let tests override per-case (failure-path tests inject errors into
// foundry insert).
//
// adminMockState is a module-scoped object the tests reach into to:
// - inspect every insert call (insertedData mirror for the admin client)
// - override the result of `from('foundries').insert(...).select('id').single()`
//   per-test (success | RLS denial | slug collision | unknown error)
type AdminInsertOverride = (data: unknown) => Promise<{ data: unknown; error: unknown }>
const adminMockState: {
  insertedData: Array<{ table: string } & Record<string, unknown>>
  foundryInsertOverride: AdminInsertOverride | null
} = {
  insertedData: [],
  foundryInsertOverride: null,
}
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    const makeChain = (table: string) => {
      let lastInsertData: unknown = null
      const chain: Record<string, unknown> = {}
      Object.assign(chain, {
        select: jest.fn(() => chain),
        insert: jest.fn((data: unknown) => {
          lastInsertData = data
          // Mirror to insertedData so tests that look there for the admin
          // client's foundry insert (sandbox-foundry test) find it.
          if (data && typeof data === 'object') {
            adminMockState.insertedData.push({ table, ...(data as Record<string, unknown>) })
          }
          return chain
        }),
        update: jest.fn(() => chain),
        upsert: jest.fn(() => chain),
        delete: jest.fn(() => chain),
        eq: jest.fn(() => chain),
        // single() resolves the chain. For the foundries table specifically,
        // route through the per-test override if one is set so failure-path
        // tests can simulate RLS denial / slug collision / unknown error.
        single: jest.fn().mockImplementation(async () => {
          if (table === 'foundries' && adminMockState.foundryInsertOverride && lastInsertData !== null) {
            return adminMockState.foundryInsertOverride(lastInsertData)
          }
          // Default: shared-foundry-exists check returns the row so production
          // code skips the create-shared-foundry branch.
          return { data: { id: 'shared' }, error: null }
        }),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
      })
      return chain
    }
    return { from: jest.fn((table: string) => makeChain(table)) }
  },
}))

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

    // Reset module-scoped admin client state — failure-path tests set
    // adminMockState.foundryInsertOverride; default is null (success).
    adminMockState.insertedData = []
    adminMockState.foundryInsertOverride = null

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

  // ─── Happy path ─────────────────────────────────────────────────────────────

  it('happy path: new executive → ok: true, redirect: /welcome, isNewUser: true', async () => {
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
        chain.insert.mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: { id: 'listing-123' }, error: null }),
          }),
        })
      }

      return chain
    })

    mock.rpc.mockResolvedValue({ data: null, error: null })

    const result = await setupNewUser({
      supabase: mock.client,
      userId: TEST_USER_ID,
      email: 'exec@example.com',
      fullName: 'Jane Smith',
      role: 'executive',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok: true')
    expect(result.redirect).toBe('/welcome')
    expect(result.isNewUser).toBe(true)
  })

  // ─── Idempotency ────────────────────────────────────────────────────────────

  it('existing profile: returning user → ok: true, redirect: /investors, isNewUser: false', async () => {
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

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok: true')
    // RED-TEAM-PIVOT-PLAN Tier 2 step 17: post-signup default landing is /investors.
    expect(result.redirect).toBe('/investors')
    expect(result.isNewUser).toBe(false)
  })

  // ─── Sandbox foundry for executives ─────────────────────────────────────────

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

    mock.rpc.mockResolvedValue({ data: null, error: null })

    const result = await setupNewUser({
      supabase: mock.client,
      userId: TEST_USER_ID,
      email: 'exec@example.com',
      fullName: 'Jane Smith',
      role: 'executive',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok: true')
    // Should NOT be forge-guild. The foundry insert goes through the
    // adminFoundries client (createAdminClient) so check adminMockState.
    const allInserts = [...insertedData, ...adminMockState.insertedData]
    const foundryInsert = allInserts.find(d => d.table === 'foundries' && (d.id as string)?.startsWith('sandbox-'))
    expect(foundryInsert).toBeDefined()
    expect(foundryInsert?.is_sandbox).toBe(true)
    expect(foundryInsert?.name).toBe("Jane's Company")
    // DECISION 2026-04-17: every brand-new user lands on /welcome for the guided tour
    expect(result.redirect).toBe('/welcome')
  })

  // ─── Marketplace listing for executives ─────────────────────────────────────

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

  // ─── Supplier ───────────────────────────────────────────────────────────────

  it('assigns suppliers to forge-suppliers and redirects to /welcome', async () => {
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

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok: true')
    // DECISION 2026-04-17: brand-new users land on /welcome (see setup-new-user.ts).
    expect(result.redirect).toBe('/welcome')
  })

  // ─── Error paths (ok: false) ─────────────────────────────────────────────────

  describe('error paths', () => {
    /**
     * Helper: wire up a mock that makes foundry creation fail with the given error
     * (both the first attempt and the retry).
     *
     * Note: production code does foundry insert via `adminFoundries` (the
     * createAdminClient mock at module-scope), NOT via the `supabase` client
     * the test passes. So failure injection happens through
     * adminMockState.foundryInsertOverride.
     */
    function mockWithFoundryError(error: { code?: string; message: string }) {
      adminMockState.foundryInsertOverride = async () => ({ data: null, error })

      // Still configure mock.from for profile-idempotency-check and any
      // non-foundry tables the action may touch.
      mock.from.mockImplementation((table: string) => {
        const chain = createMockChain()
        if (table === 'profiles') {
          chain.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
        }
        return chain
      })
    }

    it('RLS denial on foundry creation → ok: false, reason: rls_denied', async () => {
      mockWithFoundryError({ code: '42501', message: 'permission denied for table foundries' })

      const result = await setupNewUser({
        supabase: mock.client,
        userId: TEST_USER_ID,
        email: 'founder@example.com',
        fullName: 'Blocked Founder',
        role: 'founder',
        companyName: 'Blocked Corp',
      })

      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('expected ok: false')
      expect(result.reason).toBe('rls_denied')
      expect(result.userMessage).toContain('tristan.fischer@gmail.com')
      expect(result.errorId).toBeTruthy()
    })

    it('slug collision after 2 attempts → ok: false, reason: foundry_slug_collision', async () => {
      mockWithFoundryError({ code: '23505', message: 'duplicate key value violates unique constraint' })

      const result = await setupNewUser({
        supabase: mock.client,
        userId: TEST_USER_ID,
        email: 'founder@example.com',
        fullName: 'Slug Collider',
        role: 'founder',
        companyName: 'Widget Corp',
      })

      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('expected ok: false')
      expect(result.reason).toBe('foundry_slug_collision')
      expect(result.errorId).toBeTruthy()
    })

    it('profile creation fails → ok: false, reason: profile_creation_failed', async () => {
      mock.from.mockImplementation((table: string) => {
        const chain = createMockChain()

        if (table === 'profiles') {
          // Idempotency check: no existing profile
          chain.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
          // Profile insert fails
          chain.insert.mockResolvedValue({ error: { code: '23502', message: 'not-null violation' } })
        }

        if (table === 'foundries') {
          // Shared foundry check: exists
          chain.single.mockResolvedValue({ data: { id: 'forge-guild' }, error: null })
          // Foundry insert succeeds
          chain.insert.mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { id: `sandbox-${TEST_USER_ID.slice(0, 8)}` },
                error: null,
              }),
            }),
          })
          // delete for orphan cleanup
          chain.delete.mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) })
          chain.update.mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) })
        }

        return chain
      })

      // For executive: the profile insert happens after foundry. Use executive so we
      // hit the non-founder profile branch.
      const result = await setupNewUser({
        supabase: mock.client,
        userId: TEST_USER_ID,
        email: 'exec@example.com',
        fullName: 'Failed Profile',
        role: 'executive',
      })

      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('expected ok: false')
      expect(result.reason).toBe('profile_creation_failed')
      expect(result.userMessage).toContain('tristan.fischer@gmail.com')
      expect(result.errorId).toBeTruthy()
    })

    it('unknown / unexpected foundry error → ok: false, reason: foundry_creation_failed', async () => {
      mockWithFoundryError({ code: '99999', message: 'unexpected database error' })

      const result = await setupNewUser({
        supabase: mock.client,
        userId: TEST_USER_ID,
        email: 'founder@example.com',
        fullName: 'Mystery Founder',
        role: 'founder',
        companyName: 'Mystery Corp',
      })

      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('expected ok: false')
      expect(result.reason).toBe('foundry_creation_failed')
      expect(result.errorId).toBeTruthy()
      // friendly message — no raw error text
      expect(result.userMessage).toContain('tristan.fischer@gmail.com')
      expect(result.userMessage).not.toContain('unexpected database error')
    })
  })
})
