/**
 * Jest Test Utilities for CentaurOS
 * 
 * Provides helpers for:
 * - Mock Stripe client
 * - Test data factories for orders, providers, etc.
 * - Helper to create authenticated test context
 */

import type Stripe from 'stripe'

// Use Jest's mock functions
const mockFn = jest.fn

// ===========================================
// Type Definitions
// ===========================================

// Database types (aligned with database.types.ts)
type OrderStatus = 'pending' | 'accepted' | 'in_progress' | 'completed' | 'disputed' | 'cancelled'
type EscrowStatus = 'pending' | 'held' | 'partial_release' | 'released' | 'refunded'
type OrderType = 'people_booking' | 'product_rfq' | 'service'
type SupplierTier = 'verified_partner' | 'approved' | 'pending' | 'suspended'
type MarketplaceCategory = 'People' | 'Products' | 'Services' | 'AI'

interface TestOrder {
  id: string
  order_number: string
  buyer_id: string
  seller_id: string
  listing_id: string | null
  order_type: OrderType
  status: OrderStatus
  total_amount: number
  platform_fee: number
  currency: string
  stripe_payment_intent_id: string | null
  escrow_status: EscrowStatus
  vat_amount: number
  vat_rate: number
  created_at: string
  completed_at: string | null
}

interface TestProviderProfile {
  id: string
  user_id: string
  listing_id: string | null
  stripe_account_id: string | null
  stripe_onboarding_complete: boolean
  day_rate: number
  currency: string
  bio: string
  headline: string
  tier: SupplierTier
  is_active: boolean
  max_concurrent_orders: number
  current_order_count: number
  created_at: string
}

interface TestMarketplaceListing {
  id: string
  title: string
  description: string | null
  category: MarketplaceCategory
  subcategory: string
  is_verified: boolean
  image_url: string | null
  attributes: Record<string, unknown> | null
  created_at: string
}

interface TestProfile {
  id: string
  email: string
  full_name: string | null
  role: 'Executive' | 'Apprentice' | 'AI_Agent' | 'Founder'
  foundry_id: string
  avatar_url: string | null
  bio: string | null
  skills: string[] | null
  stripe_account_id: string | null
  created_at: string
  updated_at: string
}

interface TestReview {
  id: string
  order_id: string
  reviewer_id: string
  reviewee_id: string
  rating: number
  comment: string | null
  is_public: boolean
  created_at: string
}

interface TestRFQ {
  id: string
  buyer_id: string
  rfq_type: 'commodity' | 'custom' | 'service'
  title: string
  specifications: Record<string, unknown>
  budget_min: number
  budget_max: number
  deadline: string
  category: string
  status: 'Open' | 'Bidding' | 'Awarded' | 'Closed'
  foundry_id: string
  created_at: string
}

// ===========================================
// UUID Generator
// ===========================================

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

// ===========================================
// Mock Stripe Client
// ===========================================

/**
 * Creates a mock Stripe client for testing.
 * 
 * @example
 * ```ts
 * const mockStripe = createMockStripeClient()
 * 
 * // Override specific methods
 * mockStripe.paymentIntents.create.mockResolvedValue({
 *   id: 'pi_test123',
 *   status: 'succeeded',
 *   // ... other fields
 * })
 * ```
 */
export function createMockStripeClient() {
  const mockPaymentIntent: Partial<Stripe.PaymentIntent> = {
    id: 'pi_test_123456789',
    object: 'payment_intent',
    amount: 10000,
    currency: 'gbp',
    status: 'requires_payment_method',
    client_secret: 'pi_test_123456789_secret_test',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
  }

  const mockTransfer: Partial<Stripe.Transfer> = {
    id: 'tr_test_123456789',
    object: 'transfer',
    amount: 9000,
    currency: 'gbp',
    destination: 'acct_test_provider',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
  }

  const mockAccount: Partial<Stripe.Account> = {
    id: 'acct_test_123456789',
    object: 'account',
    type: 'express',
    charges_enabled: true,
    payouts_enabled: true,
    details_submitted: true,
    email: 'test@example.com',
    created: Math.floor(Date.now() / 1000),
  }

  const mockAccountLink: Partial<Stripe.AccountLink> = {
    object: 'account_link',
    url: 'https://connect.stripe.com/setup/test',
    created: Math.floor(Date.now() / 1000),
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  }

  const mockRefund: Partial<Stripe.Refund> = {
    id: 're_test_123456789',
    object: 'refund',
    amount: 10000,
    currency: 'gbp',
    status: 'succeeded',
    created: Math.floor(Date.now() / 1000),
  }

  return {
    paymentIntents: {
      create: mockFn().mockResolvedValue(mockPaymentIntent),
      retrieve: mockFn().mockResolvedValue(mockPaymentIntent),
      update: mockFn().mockResolvedValue(mockPaymentIntent),
      confirm: mockFn().mockResolvedValue({ ...mockPaymentIntent, status: 'succeeded' }),
      cancel: mockFn().mockResolvedValue({ ...mockPaymentIntent, status: 'canceled' }),
      capture: mockFn().mockResolvedValue({ ...mockPaymentIntent, status: 'succeeded' }),
    },
    transfers: {
      create: mockFn().mockResolvedValue(mockTransfer),
      retrieve: mockFn().mockResolvedValue(mockTransfer),
      list: mockFn().mockResolvedValue({ data: [mockTransfer] }),
    },
    accounts: {
      create: mockFn().mockResolvedValue(mockAccount),
      retrieve: mockFn().mockResolvedValue(mockAccount),
      update: mockFn().mockResolvedValue(mockAccount),
      del: mockFn().mockResolvedValue({ id: mockAccount.id, deleted: true }),
    },
    accountLinks: {
      create: mockFn().mockResolvedValue(mockAccountLink),
    },
    refunds: {
      create: mockFn().mockResolvedValue(mockRefund),
      retrieve: mockFn().mockResolvedValue(mockRefund),
    },
    webhooks: {
      constructEvent: mockFn().mockImplementation((payload, sig, secret) => {
        return JSON.parse(payload)
      }),
    },
  }
}

/**
 * Type alias for the mock Stripe client
 */
export type MockStripeClient = ReturnType<typeof createMockStripeClient>

// ===========================================
// Test Data Factories
// ===========================================

let orderCounter = 0

/**
 * Factory for creating test orders
 */
export function createTestOrder(overrides: Partial<TestOrder> = {}): TestOrder {
  orderCounter++
  const now = new Date().toISOString()
  
  return {
    id: generateUUID(),
    order_number: `ORD-2026-${String(orderCounter).padStart(5, '0')}`,
    buyer_id: generateUUID(),
    seller_id: generateUUID(),
    listing_id: generateUUID(),
    order_type: 'people_booking',
    status: 'pending',
    total_amount: 1000,
    platform_fee: 100,
    currency: 'GBP',
    stripe_payment_intent_id: null,
    escrow_status: 'pending',
    vat_amount: 200,
    vat_rate: 0.20,
    created_at: now,
    completed_at: null,
    ...overrides,
  }
}

/**
 * Factory for creating test provider profiles
 */
export function createTestProviderProfile(overrides: Partial<TestProviderProfile> = {}): TestProviderProfile {
  return {
    id: generateUUID(),
    user_id: generateUUID(),
    listing_id: generateUUID(),
    stripe_account_id: null,
    stripe_onboarding_complete: false,
    day_rate: 500,
    currency: 'GBP',
    bio: 'Test provider bio',
    headline: 'Test Provider',
    tier: 'approved',
    is_active: true,
    max_concurrent_orders: 5,
    current_order_count: 0,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Factory for creating test marketplace listings
 */
export function createTestMarketplaceListing(overrides: Partial<TestMarketplaceListing> = {}): TestMarketplaceListing {
  return {
    id: generateUUID(),
    title: 'Test Listing',
    description: 'A test marketplace listing',
    category: 'People',
    subcategory: 'Consultant',
    is_verified: false,
    image_url: null,
    attributes: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Factory for creating test user profiles
 */
export function createTestProfile(overrides: Partial<TestProfile> = {}): TestProfile {
  const id = generateUUID()
  return {
    id,
    email: `test-${id.slice(0, 8)}@example.com`,
    full_name: 'Test User',
    role: 'Apprentice',
    foundry_id: 'foundry-demo',
    avatar_url: null,
    bio: null,
    skills: null,
    stripe_account_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Factory for creating test reviews
 */
export function createTestReview(overrides: Partial<TestReview> = {}): TestReview {
  return {
    id: generateUUID(),
    order_id: generateUUID(),
    reviewer_id: generateUUID(),
    reviewee_id: generateUUID(),
    rating: 5,
    comment: 'Excellent service!',
    is_public: true,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * Factory for creating test RFQs
 */
export function createTestRFQ(overrides: Partial<TestRFQ> = {}): TestRFQ {
  return {
    id: generateUUID(),
    buyer_id: generateUUID(),
    rfq_type: 'service',
    title: 'Test RFQ',
    specifications: { description: 'Test requirements' },
    budget_min: 1000,
    budget_max: 5000,
    deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    category: 'Technology',
    status: 'Open',
    foundry_id: 'foundry-demo',
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

// ===========================================
// Batch Test Data Creation
// ===========================================

/**
 * Creates a batch of test orders with various statuses
 */
export function createTestOrderBatch(count = 5): TestOrder[] {
  const statuses: OrderStatus[] = ['pending', 'accepted', 'in_progress', 'completed', 'disputed']
  
  return Array.from({ length: count }).map((_, i) => 
    createTestOrder({
      status: statuses[i % statuses.length],
      total_amount: 1000 + (i * 500),
    })
  )
}

/**
 * Creates a complete test provider with profile and listing
 */
export function createCompleteTestProvider(tier: SupplierTier = 'approved') {
  const userId = generateUUID()
  const listing = createTestMarketplaceListing({
    is_verified: tier === 'verified_partner',
  })
  const profile = createTestProfile({
    id: userId,
    role: 'Apprentice',
  })
  const provider = createTestProviderProfile({
    user_id: userId,
    listing_id: listing.id,
    tier,
    is_active: tier !== 'pending' && tier !== 'suspended',
    stripe_onboarding_complete: tier === 'verified_partner',
  })
  
  return { profile, provider, listing }
}

// ===========================================
// Authenticated Test Context Helpers
// ===========================================

/**
 * Creates a mock authenticated user context for testing
 */
export function createMockAuthContext(overrides: Partial<TestProfile> = {}) {
  const user = createTestProfile(overrides)
  
  return {
    user,
    session: {
      access_token: 'mock_access_token_' + user.id,
      refresh_token: 'mock_refresh_token_' + user.id,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      expires_in: 3600,
      token_type: 'bearer',
      user: {
        id: user.id,
        email: user.email,
        user_metadata: { full_name: user.full_name },
        app_metadata: {},
        aud: 'authenticated',
        created_at: user.created_at,
      },
    },
    getUser: mockFn().mockResolvedValue({ data: { user }, error: null }),
    getSession: mockFn().mockResolvedValue({ 
      data: { 
        session: {
          access_token: 'mock_access_token_' + user.id,
          user: { id: user.id, email: user.email },
        }
      }, 
      error: null 
    }),
    signOut: mockFn().mockResolvedValue({ error: null }),
  }
}

/**
 * Creates a mock Supabase client for testing
 */
export function createMockSupabaseClient() {
  const mockQuery = {
    select: mockFn().mockReturnThis(),
    insert: mockFn().mockReturnThis(),
    update: mockFn().mockReturnThis(),
    delete: mockFn().mockReturnThis(),
    upsert: mockFn().mockReturnThis(),
    eq: mockFn().mockReturnThis(),
    neq: mockFn().mockReturnThis(),
    gt: mockFn().mockReturnThis(),
    gte: mockFn().mockReturnThis(),
    lt: mockFn().mockReturnThis(),
    lte: mockFn().mockReturnThis(),
    like: mockFn().mockReturnThis(),
    ilike: mockFn().mockReturnThis(),
    is: mockFn().mockReturnThis(),
    in: mockFn().mockReturnThis(),
    order: mockFn().mockReturnThis(),
    limit: mockFn().mockReturnThis(),
    single: mockFn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: mockFn().mockResolvedValue({ data: null, error: null }),
    then: mockFn().mockResolvedValue({ data: [], error: null }),
  }
  
  return {
    from: mockFn().mockReturnValue(mockQuery),
    rpc: mockFn().mockResolvedValue({ data: null, error: null }),
    auth: createMockAuthContext(),
    storage: {
      from: mockFn().mockReturnValue({
        upload: mockFn().mockResolvedValue({ data: { path: 'test/path' }, error: null }),
        download: mockFn().mockResolvedValue({ data: new Blob(), error: null }),
        getPublicUrl: mockFn().mockReturnValue({ data: { publicUrl: 'https://example.com/test' } }),
        remove: mockFn().mockResolvedValue({ data: null, error: null }),
      }),
    },
  }
}

// ===========================================
// Webhook Testing Helpers
// ===========================================

/**
 * Creates a mock Stripe webhook event for testing
 */
export function createMockStripeWebhookEvent(
  type: string,
  data: Record<string, unknown> = {}
): Stripe.Event {
  return {
    id: `evt_test_${generateUUID().slice(0, 8)}`,
    object: 'event',
    api_version: '2025-02-24',
    created: Math.floor(Date.now() / 1000),
    type,
    livemode: false,
    pending_webhooks: 0,
    request: {
      id: `req_test_${generateUUID().slice(0, 8)}`,
      idempotency_key: null,
    },
    data: {
      object: data,
    },
  } as unknown as Stripe.Event
}

/**
 * Creates payment intent succeeded event
 */
export function createPaymentIntentSucceededEvent(
  paymentIntentId = 'pi_test_123',
  amount = 10000,
  currency = 'gbp'
) {
  return createMockStripeWebhookEvent('payment_intent.succeeded', {
    id: paymentIntentId,
    object: 'payment_intent',
    amount,
    currency,
    status: 'succeeded',
    metadata: {},
  })
}

/**
 * Creates transfer created event
 */
export function createTransferCreatedEvent(
  transferId = 'tr_test_123',
  amount = 9000,
  destination = 'acct_test_provider'
) {
  return createMockStripeWebhookEvent('transfer.created', {
    id: transferId,
    object: 'transfer',
    amount,
    currency: 'gbp',
    destination,
  })
}

// ===========================================
// Assertion Helpers
// ===========================================

/**
 * Asserts that an order has valid structure
 */
export function assertValidOrder(order: unknown): asserts order is TestOrder {
  if (!order || typeof order !== 'object') {
    throw new Error('Order must be an object')
  }
  
  const o = order as Record<string, unknown>
  
  if (typeof o.id !== 'string') throw new Error('Order must have string id')
  if (typeof o.buyer_id !== 'string') throw new Error('Order must have string buyer_id')
  if (typeof o.seller_id !== 'string') throw new Error('Order must have string seller_id')
  if (typeof o.total_amount !== 'number') throw new Error('Order must have numeric total_amount')
}

/**
 * Asserts that a provider profile has valid structure
 */
export function assertValidProviderProfile(provider: unknown): asserts provider is TestProviderProfile {
  if (!provider || typeof provider !== 'object') {
    throw new Error('Provider profile must be an object')
  }
  
  const p = provider as Record<string, unknown>
  
  if (typeof p.id !== 'string') throw new Error('Provider must have string id')
  if (typeof p.user_id !== 'string') throw new Error('Provider must have string user_id')
  if (typeof p.day_rate !== 'number') throw new Error('Provider must have numeric day_rate')
}

// ===========================================
// Export all utilities
// ===========================================

export {
  generateUUID,
  type TestOrder,
  type TestProviderProfile,
  type TestMarketplaceListing,
  type TestProfile,
  type TestReview,
  type TestRFQ,
  type OrderStatus,
  type EscrowStatus,
  type OrderType,
  type SupplierTier,
  type MarketplaceCategory,
}
