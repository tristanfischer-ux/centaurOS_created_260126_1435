/**
 * Seed Marketplace Test Data
 * 
 * Creates test data for the marketplace escrow system including:
 * - Provider profiles with different tiers
 * - Marketplace listings linked to providers
 * - Orders in various states
 * - RFQs
 * - Reviews
 * 
 * This script is idempotent - it cleans up existing test data before creating new data.
 * Test data is identifiable by the 'test-' prefix on IDs or 'Test' in names.
 * 
 * Usage:
 *   npx tsx scripts/seed-marketplace-test-data.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { v4 as uuidv4 } from 'uuid'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Missing credentials in .env.local')
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// ===========================================
// Test Data Configuration
// ===========================================

const TEST_FOUNDRY_ID = 'foundry-demo'
const TEST_PREFIX = 'test-'
const TEST_TITLE_PREFIX = '[TEST] ' // Used to identify test data in titles/names

// Provider tiers for testing
const PROVIDER_TIERS = ['verified_partner', 'approved', 'pending'] as const
type SupplierTier = typeof PROVIDER_TIERS[number]

// Order statuses for testing
const ORDER_STATUSES = ['pending', 'accepted', 'in_progress', 'completed', 'disputed', 'cancelled'] as const
type OrderStatus = typeof ORDER_STATUSES[number]

// ===========================================
// Test Data Definitions
// ===========================================

interface TestProvider {
  email: string
  fullName: string
  companyName: string
  tier: SupplierTier
  dayRate: number
  headline: string
  bio: string
  category: 'People' | 'Services'
}

const TEST_PROVIDERS: TestProvider[] = [
  {
    email: 'test-provider-partner@centauros.app',
    fullName: 'Alex Partner',
    companyName: 'Test Consulting Ltd',
    tier: 'verified_partner',
    dayRate: 850,
    headline: 'Senior Strategy Consultant',
    bio: 'Experienced consultant specializing in business transformation and growth strategy.',
    category: 'People',
  },
  {
    email: 'test-provider-approved@centauros.app',
    fullName: 'Jordan Approved',
    companyName: 'Test Engineering Co',
    tier: 'approved',
    dayRate: 650,
    headline: 'Full-Stack Developer',
    bio: 'Full-stack engineer with expertise in React, Node.js, and cloud architecture.',
    category: 'People',
  },
  {
    email: 'test-provider-pending@centauros.app',
    fullName: 'Sam Pending',
    companyName: 'Test Design Studio',
    tier: 'pending',
    dayRate: 550,
    headline: 'UX/UI Designer',
    bio: 'Creative designer focused on user-centered design and brand identity.',
    category: 'People',
  },
  {
    email: 'test-provider-service@centauros.app',
    fullName: 'Taylor Service',
    companyName: 'Test Legal Partners',
    tier: 'approved',
    dayRate: 1200,
    headline: 'Corporate Law Services',
    bio: 'Full-service legal support for startups and growing businesses.',
    category: 'Services',
  },
]

interface TestOrder {
  status: OrderStatus
  orderType: 'people_booking' | 'service'
  totalAmount: number
  description: string
}

const TEST_ORDERS: TestOrder[] = [
  { status: 'pending', orderType: 'people_booking', totalAmount: 4250, description: '5-day strategy workshop' },
  { status: 'accepted', orderType: 'people_booking', totalAmount: 3250, description: '5-day development sprint' },
  { status: 'in_progress', orderType: 'service', totalAmount: 2400, description: 'Legal contract review' },
  { status: 'completed', orderType: 'people_booking', totalAmount: 1700, description: 'Brand design package' },
  { status: 'disputed', orderType: 'people_booking', totalAmount: 850, description: 'Consultation session (disputed)' },
  { status: 'cancelled', orderType: 'service', totalAmount: 1200, description: 'Cancelled project' },
]

interface TestRFQ {
  title: string
  rfqType: 'commodity' | 'custom' | 'service'
  budgetMin: number
  budgetMax: number
  status: 'Open' | 'Bidding' | 'Awarded' | 'Closed'
  category: string
}

const TEST_RFQS: TestRFQ[] = [
  { title: 'React Development Support', rfqType: 'service', budgetMin: 5000, budgetMax: 15000, status: 'Open', category: 'Technology' },
  { title: 'Marketing Strategy Consultation', rfqType: 'custom', budgetMin: 3000, budgetMax: 8000, status: 'Bidding', category: 'Marketing' },
  { title: 'Legal Document Review', rfqType: 'service', budgetMin: 1000, budgetMax: 3000, status: 'Awarded', category: 'Legal' },
  { title: 'UX Audit for Mobile App', rfqType: 'custom', budgetMin: 2000, budgetMax: 5000, status: 'Open', category: 'Design' },
]

interface TestReview {
  rating: number
  comment: string
}

const TEST_REVIEWS: TestReview[] = [
  { rating: 5, comment: 'Excellent work! Delivered on time and exceeded expectations.' },
  { rating: 4, comment: 'Great communication and quality deliverables.' },
  { rating: 5, comment: 'Highly professional. Would definitely work with them again.' },
  { rating: 3, comment: 'Good work but some delays in delivery.' },
]

// ===========================================
// Cleanup Functions
// ===========================================

async function cleanupTestData(): Promise<void> {
  console.log('\n🧹 Cleaning up existing test data...')
  
  try {
    // Delete in order of dependencies (most dependent first)
    
    // Delete marketplace listings with test prefix in title (and cascade to related data)
    const { error: listingsError } = await supabase
      .from('marketplace_listings')
      .delete()
      .like('title', `${TEST_TITLE_PREFIX}%`)
    if (listingsError && !listingsError.message.includes('does not exist')) {
      console.log('   - Listings: skipped (table may not exist yet)')
    } else {
      console.log('   ✅ Marketplace Listings cleaned')
    }
    
    // Delete RFQs with test prefix in title
    const { error: rfqsError } = await supabase
      .from('rfqs')
      .delete()
      .like('title', `${TEST_TITLE_PREFIX}%`)
    if (rfqsError && !rfqsError.message.includes('does not exist')) {
      console.log('   - RFQs: skipped (table may not exist yet)')
    } else {
      console.log('   ✅ RFQs cleaned')
    }
    
    // Note: Orders, reviews, provider_profiles will be cleaned by cascade or through user deletion
    
    // Delete test user profiles (but not the auth users - those are handled separately)
    const { error: profilesError } = await supabase
      .from('profiles')
      .delete()
      .like('email', 'test-provider-%')
    if (profilesError) {
      console.log(`   ⚠️ Profiles cleanup warning: ${profilesError.message}`)
    } else {
      console.log('   ✅ Test Profiles cleaned')
    }
    
    console.log('✅ Cleanup complete\n')
  } catch (error) {
    console.error('⚠️ Some cleanup operations failed (tables may not exist yet)')
  }
}

// ===========================================
// Seed Functions
// ===========================================

async function getOrCreateTestUser(email: string, fullName: string): Promise<string | null> {
  console.log(`👤 Processing User: ${email}...`)
  let userId: string
  
  // Check if user exists in auth
  const { data: users } = await supabase.auth.admin.listUsers()
  const existingUser = users?.users.find(u => u.email === email)
  
  if (existingUser) {
    console.log(`   - User already exists: ${existingUser.id}`)
    userId = existingUser.id
  } else {
    const password = process.env.TEST_USER_PASSWORD || 'password123'
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName }
    })
    
    if (error) {
      console.error(`   ❌ Error creating auth user: ${error.message}`)
      return null
    }
    
    userId = data.user.id
    console.log(`   ✅ Created Auth User: ${userId}`)
  }
  
  // Upsert profile
  const { error: profileError } = await supabase.from('profiles').upsert({
    id: userId,
    email,
    full_name: fullName,
    role: 'Apprentice', // Providers are typically apprentices
    foundry_id: TEST_FOUNDRY_ID,
    updated_at: new Date().toISOString()
  })
  
  if (profileError) {
    console.error(`   ❌ Error updating profile: ${profileError.message}`)
    return null
  }
  
  console.log(`   ✅ Profile synced`)
  return userId
}

async function createTestBuyer(): Promise<string | null> {
  const email = 'test-buyer@centauros.app'
  console.log(`👤 Creating test buyer: ${email}...`)
  
  const { data: users } = await supabase.auth.admin.listUsers()
  const existingUser = users?.users.find(u => u.email === email)
  
  let userId: string
  
  if (existingUser) {
    userId = existingUser.id
    console.log(`   - Buyer already exists: ${userId}`)
  } else {
    const password = process.env.TEST_USER_PASSWORD || 'password123'
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Test Buyer' }
    })
    
    if (error) {
      console.error(`   ❌ Error creating buyer: ${error.message}`)
      return null
    }
    
    userId = data.user.id
    console.log(`   ✅ Created buyer: ${userId}`)
  }
  
  // Upsert profile
  const { error: profileError } = await supabase.from('profiles').upsert({
    id: userId,
    email,
    full_name: 'Test Buyer',
    role: 'Executive',
    foundry_id: TEST_FOUNDRY_ID,
    updated_at: new Date().toISOString()
  })
  
  if (profileError) {
    console.error(`   ❌ Error updating buyer profile: ${profileError.message}`)
    return null
  }
  
  console.log(`   ✅ Buyer profile synced`)
  return userId
}

async function seedProviders(): Promise<Map<string, { userId: string; providerId: string; listingId: string }>> {
  console.log('\n🏪 Creating test providers...')
  
  const providerMap = new Map<string, { userId: string; providerId: string; listingId: string }>()
  
  for (const provider of TEST_PROVIDERS) {
    const userId = await getOrCreateTestUser(provider.email, provider.fullName)
    if (!userId) continue
    
    // Create marketplace listing (using proper UUID, test data identified by title prefix)
    const listingId = uuidv4()
    const { error: listingError } = await supabase.from('marketplace_listings').insert({
      id: listingId,
      title: `${TEST_TITLE_PREFIX}${provider.companyName} - ${provider.headline}`,
      description: provider.bio,
      category: provider.category,
      subcategory: provider.headline.split(' ')[0],
      is_verified: provider.tier === 'verified_partner',
      attributes: {
        company_name: provider.companyName,
        day_rate: provider.dayRate,
        tier: provider.tier,
      }
    })
    
    if (listingError) {
      console.error(`   ❌ Error creating listing for ${provider.email}: ${listingError.message}`)
      continue
    }
    console.log(`   ✅ Created listing: ${listingId}`)
    
    // Create provider profile (using proper UUID)
    const providerId = uuidv4()
    const { error: providerError } = await supabase.from('provider_profiles').insert({
      id: providerId,
      user_id: userId,
      listing_id: listingId,
      day_rate: provider.dayRate,
      currency: 'GBP',
      bio: provider.bio,
      headline: provider.headline,
      tier: provider.tier,
      is_active: provider.tier !== 'pending',
      stripe_onboarding_complete: provider.tier === 'verified_partner',
    })
    
    if (providerError) {
      console.error(`   ❌ Error creating provider profile for ${provider.email}: ${providerError.message}`)
      continue
    }
    
    console.log(`   ✅ Created provider profile: ${providerId} (${provider.tier})`)
    providerMap.set(provider.email, { userId, providerId, listingId })
  }
  
  return providerMap
}

async function seedOrders(
  buyerId: string,
  providerMap: Map<string, { userId: string; providerId: string; listingId: string }>
): Promise<string[]> {
  console.log('\n📦 Creating test orders...')
  
  const orderIds: string[] = []
  const providers = Array.from(providerMap.values())
  
  for (let i = 0; i < TEST_ORDERS.length; i++) {
    const order = TEST_ORDERS[i]
    const provider = providers[i % providers.length]
    const orderId = uuidv4()
    
    const { error } = await supabase.from('orders').insert({
      id: orderId,
      buyer_id: buyerId,
      seller_id: provider.providerId,
      listing_id: provider.listingId,
      order_type: order.orderType,
      status: order.status,
      total_amount: order.totalAmount,
      platform_fee: Math.round(order.totalAmount * 0.1 * 100) / 100,
      currency: 'GBP',
      escrow_status: order.status === 'completed' ? 'released' : order.status === 'cancelled' ? 'refunded' : 'held',
      completed_at: order.status === 'completed' ? new Date().toISOString() : null,
    })
    
    if (error) {
      console.error(`   ❌ Error creating order: ${error.message}`)
      continue
    }
    
    orderIds.push(orderId)
    console.log(`   ✅ Created order: ${orderId} (${order.status})`)
  }
  
  return orderIds
}

async function seedRFQs(buyerId: string): Promise<string[]> {
  console.log('\n📋 Creating test RFQs...')
  
  const rfqIds: string[] = []
  
  for (const rfq of TEST_RFQS) {
    const rfqId = uuidv4()
    
    const { error } = await supabase.from('rfqs').insert({
      id: rfqId,
      buyer_id: buyerId,
      rfq_type: rfq.rfqType,
      title: `${TEST_TITLE_PREFIX}${rfq.title}`,
      specifications: {
        description: `Test RFQ: ${rfq.title}`,
        requirements: ['Requirement 1', 'Requirement 2'],
      },
      budget_min: rfq.budgetMin,
      budget_max: rfq.budgetMax,
      deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
      category: rfq.category,
      status: rfq.status,
      foundry_id: TEST_FOUNDRY_ID,
    })
    
    if (error) {
      console.error(`   ❌ Error creating RFQ: ${error.message}`)
      continue
    }
    
    rfqIds.push(rfqId)
    console.log(`   ✅ Created RFQ: ${rfqId} (${rfq.status})`)
  }
  
  return rfqIds
}

async function seedReviews(
  buyerId: string,
  orderIds: string[],
  providerMap: Map<string, { userId: string; providerId: string; listingId: string }>
): Promise<void> {
  console.log('\n⭐ Creating test reviews...')
  
  // Get completed orders only
  const { data: completedOrders } = await supabase
    .from('orders')
    .select('id, seller_id')
    .in('id', orderIds)
    .eq('status', 'completed')
  
  if (!completedOrders || completedOrders.length === 0) {
    console.log('   ℹ️ No completed orders found for reviews')
    return
  }
  
  for (let i = 0; i < completedOrders.length && i < TEST_REVIEWS.length; i++) {
    const order = completedOrders[i]
    const review = TEST_REVIEWS[i]
    
    const { error } = await supabase.from('reviews').insert({
      order_id: order.id,
      reviewer_id: buyerId,
      reviewee_id: order.seller_id,
      rating: review.rating,
      comment: review.comment,
      is_public: true,
    })
    
    if (error) {
      console.error(`   ❌ Error creating review: ${error.message}`)
      continue
    }
    
    console.log(`   ✅ Created review for order: ${order.id}`)
  }
}

// ===========================================
// Main Execution
// ===========================================

async function seed(): Promise<void> {
  console.log('🌱 Starting Marketplace Test Data Seed...')
  console.log('================================================')
  console.log(`Foundry ID: ${TEST_FOUNDRY_ID}`)
  console.log(`Test Prefix: ${TEST_PREFIX}`)
  console.log('================================================')
  
  try {
    // Step 1: Clean up existing test data
    await cleanupTestData()
    
    // Step 2: Create test buyer
    const buyerId = await createTestBuyer()
    if (!buyerId) {
      console.error('❌ Failed to create test buyer. Aborting.')
      process.exit(1)
    }
    
    // Step 3: Create providers with listings
    const providerMap = await seedProviders()
    if (providerMap.size === 0) {
      console.error('❌ Failed to create any providers. Aborting.')
      process.exit(1)
    }
    
    // Step 4: Create orders
    const orderIds = await seedOrders(buyerId, providerMap)
    
    // Step 5: Create RFQs
    const rfqIds = await seedRFQs(buyerId)
    
    // Step 6: Create reviews (for completed orders)
    await seedReviews(buyerId, orderIds, providerMap)
    
    // Summary
    console.log('\n================================================')
    console.log('🎉 Seed Complete!')
    console.log('================================================')
    console.log('Created:')
    console.log(`   - 1 Test Buyer: test-buyer@centauros.app`)
    console.log(`   - ${providerMap.size} Providers`)
    console.log(`   - ${providerMap.size} Marketplace Listings`)
    console.log(`   - ${orderIds.length} Orders`)
    console.log(`   - ${rfqIds.length} RFQs`)
    console.log('')
    console.log('Test Account Credentials:')
    console.log('-------------------------------------------')
    console.log('Buyer:    test-buyer@centauros.app / password123')
    console.log('Provider: test-provider-partner@centauros.app / password123')
    console.log('Provider: test-provider-approved@centauros.app / password123')
    console.log('Provider: test-provider-pending@centauros.app / password123')
    console.log('Provider: test-provider-service@centauros.app / password123')
    console.log('-------------------------------------------')
  } catch (error) {
    console.error('❌ Seed failed with error:', error)
    process.exit(1)
  }
}

// Run the seed
seed()
