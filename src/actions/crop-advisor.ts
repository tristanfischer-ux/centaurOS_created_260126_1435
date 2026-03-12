'use server'

/**
 * @file Crop Advisor Server Actions
 *
 * @description Scoring engine + buyer intent CRUD for the crop planning advisor.
 * Scores each product 0–100 from four signals: demand, price trend, supply gap,
 * and grower capability. Also handles buyer intent signals and grower responses.
 *
 * @security All actions require authentication. Multi-tenant isolation via foundry_id.
 * Buyer intents use RLS + application-level ownership checks.
 */

import { createClient } from '@/lib/supabase/server'
import { createNotification } from '@/actions/notifications'

// ============================================================================
// Types
// ============================================================================

export interface CropScore {
  productId: string
  productName: string
  productSlug: string
  category: string
  totalScore: number
  demandScore: number
  priceTrendScore: number
  supplyGapScore: number
  capabilityScore: number
  weeklyDemandKg: number
  weeklySupplyKg: number
  currentPricePerKg: number
  priceTrendPct: number
  revenueProjection: number
  intentCount: number
}

export interface DemandBreakdown {
  productId: string
  orderDemandKg: number
  intentDemandKg: number
  searchInterest: number
  totalWeeklyDemandKg: number
}

export interface BuyerIntent {
  id: string
  foundry_id: string
  profile_id: string
  product_id: string
  category: string
  quality_grade: string
  growing_method: string | null
  weekly_quantity_kg: number
  desired_start_date: string
  desired_end_date: string | null
  target_price_per_kg: number | null
  max_price_per_kg: number | null
  is_public: boolean
  status: string
  notes: string | null
  response_count: number
  created_at: string
  updated_at: string
  product_name?: string
  poster_name?: string
}

export interface IntentResponse {
  id: string
  intent_id: string
  foundry_id: string
  profile_id: string
  offered_price_per_kg: number
  offered_quantity_kg: number
  available_from: string
  growing_method: string | null
  quality_grade: string
  message: string | null
  status: string
  created_at: string
  responder_name?: string
  foundry_name?: string
}

// ============================================================================
// Helpers
// ============================================================================

async function getAuthContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('foundry_id, full_name, account_type')
    .eq('id', user.id)
    .single()

  if (!profile?.foundry_id) return null

  return { supabase, user, profile, foundryId: profile.foundry_id }
}

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value))
}

// ============================================================================
// Scoring Engine
// ============================================================================

/**
 * Run the scoring engine and return ranked crop recommendations.
 *
 * @description Scores each product 0–100 from four equally-weighted signals:
 *   1. Demand (0–25): orders + intents + saved searches
 *   2. Price Trend (0–25): UKSHI recent vs prior 4-week avg
 *   3. Supply Gap (0–25): undersupply = high score
 *   4. Grower Capability (0–25): product registration + capacity + history
 *
 * @returns Ranked array of CropScore, highest first
 */
export async function fetchCropScores(): Promise<{
  data: CropScore[] | null
  error: string | null
}> {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return { data: null, error: 'Not authenticated' }

    const { supabase, foundryId } = ctx

    // Fetch all data sources in parallel
    const now = new Date()
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const eightWeeksAgo = new Date(now.getTime() - 56 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const [
      productsRes,
      ordersRes,
      intentsRes,
      searchesRes,
      priceIndexRes,
      listingsRes,
    ] = await Promise.all([
      // All products
      supabase.from('products').select('id, name, slug, category'),

      // Orders in last 90 days (all buyers)
      supabase.from('orders')
        .select('listing_id, total_amount, status, created_at')
        .gte('created_at', ninetyDaysAgo)
        .in('status', ['completed', 'in_progress', 'accepted']),

      // Active buyer intents
      supabase.from('buyer_intent_signals')
        .select('product_id, weekly_quantity_kg, category')
        .eq('status', 'active')
        .eq('is_public', true),

      // Saved searches (proxy for interest)
      supabase.from('saved_searches')
        .select('filters')
        .not('filters', 'is', null),

      // Price index: last 8 weeks for trend calculation
      supabase.from('price_index')
        .select('week_start, product_category, product_id, avg_price_per_kg, volume_kg')
        .gte('week_start', eightWeeksAgo)
        .order('week_start', { ascending: false }),

      // Active marketplace listings (supply side)
      supabase.from('marketplace_listings')
        .select('id, category, subcategory, price')
        .eq('approval_status', 'approved'),
    ])

    const products = productsRes.data || []
    const orders = ordersRes.data || []
    const intents = intentsRes.data || []
    const searches = searchesRes.data || []
    const priceData = priceIndexRes.data || []
    const listings = listingsRes.data || []

    if (products.length === 0) {
      return { data: [], error: null }
    }

    // ── Build demand map per product ──
    // INTENT: We aggregate demand from multiple sources per product
    const demandByProduct = new Map<string, number>()
    const intentCountByProduct = new Map<string, number>()

    // Intent demand (most direct signal)
    for (const intent of intents) {
      const pid = intent.product_id
      demandByProduct.set(pid, (demandByProduct.get(pid) || 0) + Number(intent.weekly_quantity_kg))
      intentCountByProduct.set(pid, (intentCountByProduct.get(pid) || 0) + 1)
    }

    // Search interest by category (proxy: 5 kg/week per search)
    const searchCountByCategory = new Map<string, number>()
    for (const search of searches) {
      const filters = search.filters as Record<string, unknown> | null
      if (filters?.category && typeof filters.category === 'string') {
        searchCountByCategory.set(
          filters.category,
          (searchCountByCategory.get(filters.category) || 0) + 1
        )
      }
    }

    // ── Build price trend map ──
    // INTENT: Compare recent 4-week avg vs prior 4-week avg per product/category
    const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const priceTrendByCategory = new Map<string, { recent: number[]; prior: number[] }>()
    const latestPriceByCategory = new Map<string, number>()

    for (const row of priceData) {
      const cat = row.product_category
      if (!priceTrendByCategory.has(cat)) {
        priceTrendByCategory.set(cat, { recent: [], prior: [] })
      }
      const bucket = priceTrendByCategory.get(cat)!
      const price = Number(row.avg_price_per_kg)

      if (row.week_start >= fourWeeksAgo) {
        bucket.recent.push(price)
        if (!latestPriceByCategory.has(cat)) {
          latestPriceByCategory.set(cat, price)
        }
      } else {
        bucket.prior.push(price)
      }
    }

    // ── Build supply map by category ──
    const supplyByCategory = new Map<string, number>()
    for (const listing of listings) {
      const cat = listing.category || listing.subcategory
      if (cat) {
        supplyByCategory.set(cat, (supplyByCategory.get(cat) || 0) + 1)
      }
    }

    // ── Score each product ──
    const maxDemand = Math.max(1, ...Array.from(demandByProduct.values()))

    const scores: CropScore[] = products.map(product => {
      // Signal 1: Demand (0–25)
      const intentDemand = demandByProduct.get(product.id) || 0
      const searchProxy = (searchCountByCategory.get(product.category) || 0) * 5
      const weeklyDemandKg = intentDemand + searchProxy
      const demandScore = Math.min(25, (weeklyDemandKg / maxDemand) * 25)

      // Signal 2: Price Trend (0–25)
      const trend = priceTrendByCategory.get(product.category)
      let priceTrendPct = 0
      if (trend && trend.recent.length > 0 && trend.prior.length > 0) {
        const recentAvg = trend.recent.reduce((a, b) => a + b, 0) / trend.recent.length
        const priorAvg = trend.prior.reduce((a, b) => a + b, 0) / trend.prior.length
        if (priorAvg > 0) {
          priceTrendPct = ((recentAvg - priorAvg) / priorAvg) * 100
        }
      }
      // Maps ±5% to 0–25, neutral at 12.5
      const priceTrendScore = clamp(0, 25, 12.5 + priceTrendPct * 2.5)

      // Signal 3: Supply Gap (0–25)
      const categorySupply = supplyByCategory.get(product.category) || 0
      const weeklySupplyKg = categorySupply * 10 // rough proxy: 10kg/week per listing
      const supplyRatio = weeklyDemandKg > 0 ? weeklySupplyKg / weeklyDemandKg : 1
      const supplyGapScore = clamp(0, 25, (1 - supplyRatio) * 25)

      // Signal 4: Grower Capability (0–25)
      // DECISION: Without per-grower product registration data, we give a neutral 12.5
      // This can be enhanced when grower profiles have product capabilities
      const capabilityScore = 12.5

      const totalScore = Math.round(demandScore + priceTrendScore + supplyGapScore + capabilityScore)
      const currentPricePerKg = latestPriceByCategory.get(product.category) || 0
      const revenueProjection = Math.min(weeklySupplyKg, weeklyDemandKg) * currentPricePerKg

      return {
        productId: product.id,
        productName: product.name,
        productSlug: product.slug,
        category: product.category,
        totalScore,
        demandScore: Math.round(demandScore * 10) / 10,
        priceTrendScore: Math.round(priceTrendScore * 10) / 10,
        supplyGapScore: Math.round(supplyGapScore * 10) / 10,
        capabilityScore,
        weeklyDemandKg,
        weeklySupplyKg,
        currentPricePerKg,
        priceTrendPct: Math.round(priceTrendPct * 10) / 10,
        revenueProjection: Math.round(revenueProjection * 100) / 100,
        intentCount: intentCountByProduct.get(product.id) || 0,
      }
    })

    // Sort by total score descending
    scores.sort((a, b) => b.totalScore - a.totalScore)

    return { data: scores, error: null }
  } catch (err) {
    console.error('Failed to fetch crop scores:', err)
    return { data: null, error: 'Failed to calculate crop scores' }
  }
}

/**
 * Get detailed demand breakdown for a specific product.
 */
export async function fetchDemandBreakdown(productId: string): Promise<{
  data: DemandBreakdown | null
  error: string | null
}> {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return { data: null, error: 'Not authenticated' }

    const { supabase } = ctx
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

    // SECURITY: Validate productId format
    if (!/^[0-9a-f-]{36}$/i.test(productId)) {
      return { data: null, error: 'Invalid product ID' }
    }

    const [productRes, ordersRes, intentsRes, searchesRes] = await Promise.all([
      supabase.from('products').select('category').eq('id', productId).single(),

      supabase.from('orders')
        .select('total_amount, created_at')
        .eq('listing_id', productId)
        .gte('created_at', ninetyDaysAgo)
        .in('status', ['completed', 'in_progress']),

      supabase.from('buyer_intent_signals')
        .select('weekly_quantity_kg')
        .eq('product_id', productId)
        .eq('status', 'active'),

      supabase.from('saved_searches')
        .select('filters')
        .not('filters', 'is', null),
    ])

    const product = productRes.data
    const orderDemandKg = (ordersRes.data || []).reduce(
      (sum, o) => sum + Number(o.total_amount || 0), 0
    )
    const intentDemandKg = (intentsRes.data || []).reduce(
      (sum, i) => sum + Number(i.weekly_quantity_kg), 0
    )
    const searchInterest = (searchesRes.data || []).filter(s => {
      const filters = s.filters as Record<string, unknown> | null
      return filters?.category === product?.category
    }).length

    return {
      data: {
        productId,
        orderDemandKg: Math.round(orderDemandKg * 100) / 100,
        intentDemandKg,
        searchInterest,
        totalWeeklyDemandKg: intentDemandKg + searchInterest * 5,
      },
      error: null,
    }
  } catch (err) {
    console.error('Failed to fetch demand breakdown:', err)
    return { data: null, error: 'Failed to fetch demand breakdown' }
  }
}

// ============================================================================
// Buyer Intent CRUD
// ============================================================================

/**
 * List active public buyer intents (grower view).
 */
export async function fetchBuyerIntents(filters?: {
  category?: string
  productId?: string
}): Promise<{
  data: BuyerIntent[]
  error: string | null
}> {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return { data: [], error: 'Not authenticated' }

    const { supabase } = ctx

    let query = supabase
      .from('buyer_intent_signals')
      .select(`
        *,
        products!inner(name),
        profiles!inner(full_name)
      `)
      .eq('status', 'active')
      .eq('is_public', true)
      .order('created_at', { ascending: false })

    if (filters?.category) {
      query = query.eq('category', filters.category)
    }
    if (filters?.productId) {
      query = query.eq('product_id', filters.productId)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching buyer intents:', error)
      return { data: [], error: 'Failed to fetch buyer intents' }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const intents: BuyerIntent[] = (data || []).map((row: any) => ({
      ...row,
      product_name: row.products?.name,
      poster_name: row.profiles?.full_name || 'Anonymous',
      products: undefined,
      profiles: undefined,
    }))

    return { data: intents, error: null }
  } catch (err) {
    console.error('Failed to fetch buyer intents:', err)
    return { data: [], error: 'Failed to fetch buyer intents' }
  }
}

/**
 * Create a new buyer intent signal.
 */
export async function createBuyerIntent(input: {
  productId: string
  category: string
  qualityGrade?: string
  growingMethod?: string
  weeklyQuantityKg: number
  desiredStartDate: string
  desiredEndDate?: string
  targetPricePerKg?: number
  maxPricePerKg?: number
  isPublic?: boolean
  notes?: string
}): Promise<{ data: { id: string } | null; error: string | null }> {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return { data: null, error: 'Not authenticated' }

    const { supabase, user, profile, foundryId } = ctx

    // VALIDATION: Input checks
    if (input.weeklyQuantityKg <= 0) return { data: null, error: 'Quantity must be positive' }
    if (input.notes && input.notes.length > 2000) return { data: null, error: 'Notes too long (max 2000 chars)' }

    const { data, error } = await supabase
      .from('buyer_intent_signals')
      .insert({
        foundry_id: foundryId,
        profile_id: user.id,
        product_id: input.productId,
        category: input.category,
        quality_grade: input.qualityGrade || 'B',
        growing_method: input.growingMethod || null,
        weekly_quantity_kg: input.weeklyQuantityKg,
        desired_start_date: input.desiredStartDate,
        desired_end_date: input.desiredEndDate || null,
        target_price_per_kg: input.targetPricePerKg || null,
        max_price_per_kg: input.maxPricePerKg || null,
        is_public: input.isPublic ?? true,
        notes: input.notes || null,
      })
      .select('id')
      .single()

    if (error) {
      console.error('Error creating buyer intent:', error)
      return { data: null, error: 'Failed to create intent' }
    }

    // Notify growers who have matching products
    // FLOW: Uses create_notification RPC → notifies growers in the same foundry context
    try {
      const { data: product } = await supabase
        .from('products')
        .select('name')
        .eq('id', input.productId)
        .single()

      if (product) {
        // Get grower profiles in this foundry (excluding the buyer)
        const { data: growers } = await supabase
          .from('profiles')
          .select('id')
          .eq('foundry_id', foundryId)
          .eq('account_type', 'supplier')
          .neq('id', user.id)
          .limit(50)

        if (growers && growers.length > 0) {
          // Insert dedup alert
          await supabase.from('crop_advisor_alerts').insert({
            foundry_id: foundryId,
            alert_type: 'new_intent',
            product_id: input.productId,
            alert_key: `new_intent:${data.id}`,
          })

          // Notify each grower
          for (const grower of growers) {
            await createNotification({
              userId: grower.id,
              type: 'new_buyer_intent',
              title: `New demand signal: ${product.name}`,
              message: `${profile.full_name || 'A buyer'} is looking for ${input.weeklyQuantityKg}kg/week of ${product.name}`,
              link: '/crop-advisor?tab=signals',
            })
          }
        }
      }
    } catch {
      // Non-critical: notification failure shouldn't block intent creation
      console.error('Failed to send intent notifications')
    }

    return { data: { id: data.id }, error: null }
  } catch (err) {
    console.error('Failed to create buyer intent:', err)
    return { data: null, error: 'Failed to create intent' }
  }
}

/**
 * Grower responds to a buyer intent with an offer.
 */
export async function respondToIntent(input: {
  intentId: string
  offeredPricePerKg: number
  offeredQuantityKg: number
  availableFrom: string
  growingMethod?: string
  qualityGrade?: string
  message?: string
}): Promise<{ data: { id: string } | null; error: string | null }> {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return { data: null, error: 'Not authenticated' }

    const { supabase, user, profile, foundryId } = ctx

    // VALIDATION
    if (input.offeredPricePerKg <= 0) return { data: null, error: 'Price must be positive' }
    if (input.offeredQuantityKg <= 0) return { data: null, error: 'Quantity must be positive' }
    if (input.message && input.message.length > 2000) return { data: null, error: 'Message too long' }

    const { data, error } = await supabase
      .from('buyer_intent_responses')
      .insert({
        intent_id: input.intentId,
        foundry_id: foundryId,
        profile_id: user.id,
        offered_price_per_kg: input.offeredPricePerKg,
        offered_quantity_kg: input.offeredQuantityKg,
        available_from: input.availableFrom,
        growing_method: input.growingMethod || null,
        quality_grade: input.qualityGrade || 'B',
        message: input.message || null,
      })
      .select('id')
      .single()

    if (error) {
      if (error.code === '23505') {
        return { data: null, error: 'You have already responded to this intent' }
      }
      console.error('Error responding to intent:', error)
      return { data: null, error: 'Failed to submit response' }
    }

    // Notify the buyer who posted the intent
    try {
      const { data: intent } = await supabase
        .from('buyer_intent_signals')
        .select('profile_id, product_id, products!inner(name)')
        .eq('id', input.intentId)
        .single()

      if (intent) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const productName = (intent as any).products?.name || 'a product'
        await createNotification({
          userId: intent.profile_id,
          type: 'intent_response',
          title: `New response to your ${productName} demand signal`,
          message: `${profile.full_name || 'A grower'} offered ${input.offeredQuantityKg}kg/week at £${input.offeredPricePerKg}/kg`,
          link: '/crop-advisor?tab=my-intents',
        })
      }
    } catch {
      console.error('Failed to send response notification')
    }

    return { data: { id: data.id }, error: null }
  } catch (err) {
    console.error('Failed to respond to intent:', err)
    return { data: null, error: 'Failed to submit response' }
  }
}

/**
 * Buyer withdraws an intent.
 */
export async function withdrawIntent(intentId: string): Promise<{
  success: boolean
  error: string | null
}> {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return { success: false, error: 'Not authenticated' }

    const { supabase, user } = ctx

    const { error } = await supabase
      .from('buyer_intent_signals')
      .update({ status: 'withdrawn' })
      .eq('id', intentId)
      .eq('profile_id', user.id) // SECURITY: ownership check

    if (error) {
      console.error('Error withdrawing intent:', error)
      return { success: false, error: 'Failed to withdraw intent' }
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Failed to withdraw intent:', err)
    return { success: false, error: 'Failed to withdraw intent' }
  }
}

/**
 * Fetch buyer's own intents with response counts.
 */
export async function fetchMyIntents(): Promise<{
  data: BuyerIntent[]
  error: string | null
}> {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return { data: [], error: 'Not authenticated' }

    const { supabase, user } = ctx

    const { data, error } = await supabase
      .from('buyer_intent_signals')
      .select(`
        *,
        products!inner(name)
      `)
      .eq('profile_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching my intents:', error)
      return { data: [], error: 'Failed to fetch your intents' }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const intents: BuyerIntent[] = (data || []).map((row: any) => ({
      ...row,
      product_name: row.products?.name,
      products: undefined,
    }))

    return { data: intents, error: null }
  } catch (err) {
    console.error('Failed to fetch my intents:', err)
    return { data: [], error: 'Failed to fetch your intents' }
  }
}

/**
 * Fetch responses to a specific buyer intent.
 */
export async function fetchIntentResponses(intentId: string): Promise<{
  data: IntentResponse[]
  error: string | null
}> {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return { data: [], error: 'Not authenticated' }

    const { supabase } = ctx

    const { data, error } = await supabase
      .from('buyer_intent_responses')
      .select(`
        *,
        profiles!inner(full_name),
        foundries!inner(name)
      `)
      .eq('intent_id', intentId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching intent responses:', error)
      return { data: [], error: 'Failed to fetch responses' }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const responses: IntentResponse[] = (data || []).map((row: any) => ({
      ...row,
      responder_name: row.profiles?.full_name || 'Anonymous',
      foundry_name: row.foundries?.name || 'Unknown',
      profiles: undefined,
      foundries: undefined,
    }))

    return { data: responses, error: null }
  } catch (err) {
    console.error('Failed to fetch intent responses:', err)
    return { data: [], error: 'Failed to fetch responses' }
  }
}

/**
 * Buyer accepts a grower's response to their intent.
 */
export async function acceptIntentResponse(responseId: string): Promise<{
  success: boolean
  error: string | null
}> {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return { success: false, error: 'Not authenticated' }

    const { supabase, user } = ctx

    // First verify the response belongs to one of the buyer's intents
    const { data: response } = await supabase
      .from('buyer_intent_responses')
      .select('intent_id, profile_id')
      .eq('id', responseId)
      .single()

    if (!response) {
      return { success: false, error: 'Response not found' }
    }

    // SECURITY: Verify the current user owns the parent intent
    const { data: intent } = await supabase
      .from('buyer_intent_signals')
      .select('profile_id')
      .eq('id', response.intent_id)
      .eq('profile_id', user.id)
      .single()

    if (!intent) {
      return { success: false, error: 'Not authorized to accept this response' }
    }

    // Accept the response
    const { error: updateError } = await supabase
      .from('buyer_intent_responses')
      .update({ status: 'accepted' })
      .eq('id', responseId)

    if (updateError) {
      console.error('Error accepting response:', updateError)
      return { success: false, error: 'Failed to accept response' }
    }

    // Mark intent as fulfilled
    await supabase
      .from('buyer_intent_signals')
      .update({ status: 'fulfilled' })
      .eq('id', response.intent_id)

    // Notify the grower their response was accepted
    try {
      await createNotification({
        userId: response.profile_id,
        type: 'intent_response_accepted',
        title: 'Your offer was accepted!',
        message: 'A buyer accepted your response to their demand signal. Check your crop advisor for details.',
        link: '/crop-advisor?tab=signals',
      })
    } catch {
      console.error('Failed to send acceptance notification')
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('Failed to accept response:', err)
    return { success: false, error: 'Failed to accept response' }
  }
}
