/**
 * Rating System Service
 * Handles reviews, ratings, and statistical calculations
 */

import { SupabaseClient } from "@supabase/supabase-js"
import { Database } from "@/types/database.types"

// Types
export interface Review {
  id: string
  order_id: string
  reviewer_id: string
  reviewee_id: string
  rating: number
  comment: string | null
  is_public: boolean
  created_at: string
}

export interface ReviewWithDetails extends Review {
  reviewer?: {
    full_name: string | null
    avatar_url: string | null
  }
  order?: {
    order_number: string
    total_amount: number
  }
}

export interface ProviderRating {
  provider_id: string
  average_rating: number
  total_reviews: number
  total_transactions: number
  updated_at: string
}

export interface RatingBreakdown {
  average: number
  total: number
  distribution: {
    5: number
    4: number
    3: number
    2: number
    1: number
  }
  wilsonScore: number
  showRating: boolean
  recentTrend: "improving" | "stable" | "declining" | "new"
}

export interface SubmitReviewParams {
  orderId: string
  rating: number
  comment?: string
  isPublic?: boolean
  categoryRatings?: {
    quality?: number
    communication?: number
    timeliness?: number
    value?: number
  }
}

// Minimum reviews required to show public rating
const MIN_REVIEWS_FOR_PUBLIC_RATING = 3

/**
 * Submit a review for a completed order
 */
export async function submitReview(
  supabase: SupabaseClient<Database>,
  reviewerId: string,
  params: SubmitReviewParams
): Promise<{ data: Review | null; error: string | null }> {
  const { orderId, rating, comment, isPublic = true } = params

  // Validate rating
  if (rating < 1 || rating > 5) {
    return { data: null, error: "Rating must be between 1 and 5" }
  }

  // Get order details to verify reviewer is the buyer
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("buyer_id, seller_id, status")
    .eq("id", orderId)
    .single()

  if (orderError || !order) {
    return { data: null, error: "Order not found" }
  }

  if (order.buyer_id !== reviewerId) {
    return { data: null, error: "Only the buyer can review this order" }
  }

  if (order.status !== "completed") {
    return { data: null, error: "Can only review completed orders" }
  }

  // Check if review already exists
  const { data: existingReview } = await supabase
    .from("reviews")
    .select("id")
    .eq("order_id", orderId)
    .eq("reviewer_id", reviewerId)
    .single()

  if (existingReview) {
    return { data: null, error: "You have already reviewed this order" }
  }

  // Create review
  const { data, error } = await supabase
    .from("reviews")
    .insert({
      order_id: orderId,
      reviewer_id: reviewerId,
      reviewee_id: order.seller_id,
      rating,
      comment: comment || null,
      is_public: isPublic,
    })
    .select()
    .single()

  if (error) {
    return { data: null, error: error.message }
  }

  // The trigger on the reviews table will automatically update provider_ratings
  // But we can manually trigger recalculation if needed
  await updateProviderRating(supabase, order.seller_id)

  return { data: data as Review, error: null }
}

/**
 * Get aggregated rating for a provider
 */
export async function getProviderRating(
  supabase: SupabaseClient<Database>,
  providerId: string
): Promise<{ data: RatingBreakdown | null; error: string | null }> {
  // Get the aggregated rating
  const { data: ratingData } = await supabase
    .from("provider_ratings")
    .select("*")
    .eq("provider_id", providerId)
    .single()

  // Get detailed review data for distribution
  const { data: reviews, error: reviewsError } = await supabase
    .from("reviews")
    .select("rating, created_at")
    .eq("reviewee_id", providerId)
    .eq("is_public", true)
    .order("created_at", { ascending: false })

  if (reviewsError) {
    return { data: null, error: reviewsError.message }
  }

  // Calculate distribution
  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  for (const review of reviews || []) {
    const r = review.rating as 1 | 2 | 3 | 4 | 5
    if (r >= 1 && r <= 5) {
      distribution[r]++
    }
  }

  const total = reviews?.length || 0
  const average = ratingData?.average_rating 
    ? Number(ratingData.average_rating) 
    : total > 0 
      ? reviews!.reduce((sum, r) => sum + r.rating, 0) / total 
      : 0

  // Calculate Wilson score for confidence interval
  const wilsonScore = calculateWilsonScore(reviews || [])

  // Determine recent trend
  const recentTrend = calculateTrend(reviews || [])

  return {
    data: {
      average: Math.round(average * 100) / 100,
      total,
      distribution,
      wilsonScore: Math.round(wilsonScore * 100) / 100,
      showRating: total >= MIN_REVIEWS_FOR_PUBLIC_RATING,
      recentTrend,
    },
    error: null,
  }
}

/**
 * Check if a provider has enough reviews to show public rating
 */
export async function shouldShowRating(
  supabase: SupabaseClient<Database>,
  providerId: string
): Promise<{ show: boolean; reviewCount: number }> {
  const { count } = await supabase
    .from("reviews")
    .select("*", { count: "exact", head: true })
    .eq("reviewee_id", providerId)
    .eq("is_public", true)

  const reviewCount = count || 0
  return {
    show: reviewCount >= MIN_REVIEWS_FOR_PUBLIC_RATING,
    reviewCount,
  }
}

/**
 * Calculate Wilson score for statistical confidence
 * Uses Wilson score interval for binomial proportion confidence
 * Treats 4-5 stars as "positive" and 1-3 as "negative"
 */
export function calculateWilsonScore(
  reviews: Array<{ rating: number }>
): number {
  if (reviews.length === 0) return 0

  const n = reviews.length
  const positiveCount = reviews.filter((r) => r.rating >= 4).length
  const p = positiveCount / n

  // z-score for 95% confidence (1.96)
  const z = 1.96
  const z2 = z * z

  // Wilson score lower bound formula
  const numerator = p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)
  const denominator = 1 + z2 / n

  // Convert to 0-5 scale
  return Math.max(0, (numerator / denominator) * 5)
}

/**
 * Update aggregated provider rating
 */
export async function updateProviderRating(
  supabase: SupabaseClient<Database>,
  providerId: string
): Promise<{ success: boolean; error: string | null }> {
  // Calculate new aggregate
  const { data: reviews, error: reviewsError } = await supabase
    .from("reviews")
    .select("rating")
    .eq("reviewee_id", providerId)
    .eq("is_public", true)

  if (reviewsError) {
    return { success: false, error: reviewsError.message }
  }

  const totalReviews = reviews?.length || 0
  const averageRating =
    totalReviews > 0
      ? reviews!.reduce((sum, r) => sum + r.rating, 0) / totalReviews
      : 0

  // Get total transactions
  const { count: totalTransactions } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("seller_id", providerId)
    .eq("status", "completed")

  // Upsert provider rating
  const { error } = await supabase.from("provider_ratings").upsert(
    {
      provider_id: providerId,
      average_rating: Math.round(averageRating * 100) / 100,
      total_reviews: totalReviews,
      total_transactions: totalTransactions || 0,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "provider_id",
    }
  )

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, error: null }
}

/**
 * Get reviews for a provider
 */
export async function getProviderReviews(
  supabase: SupabaseClient<Database>,
  providerId: string,
  options: {
    limit?: number
    offset?: number
    publicOnly?: boolean
  } = {}
): Promise<{
  data: ReviewWithDetails[]
  error: string | null
  total: number
}> {
  const { limit = 10, offset = 0, publicOnly = true } = options

  let query = supabase
    .from("reviews")
    .select(
      `
      *,
      reviewer:profiles!reviews_reviewer_id_fkey(full_name, avatar_url),
      order:orders!reviews_order_id_fkey(order_number, total_amount)
    `,
      { count: "exact" }
    )
    .eq("reviewee_id", providerId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (publicOnly) {
    query = query.eq("is_public", true)
  }

  const { data, error, count } = await query

  if (error) {
    return { data: [], error: error.message, total: 0 }
  }

  return {
    data: (data || []) as ReviewWithDetails[],
    error: null,
    total: count || 0,
  }
}

/**
 * Get review for a specific order
 */
export async function getOrderReview(
  supabase: SupabaseClient<Database>,
  orderId: string,
  reviewerId: string
): Promise<{ data: Review | null; error: string | null }> {
  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("order_id", orderId)
    .eq("reviewer_id", reviewerId)
    .single()

  if (error && error.code !== "PGRST116") {
    return { data: null, error: error.message }
  }

  return { data: data as Review | null, error: null }
}

/**
 * Check if user can review an order
 */
export async function canReviewOrder(
  supabase: SupabaseClient<Database>,
  orderId: string,
  userId: string
): Promise<{
  canReview: boolean
  reason: string | null
}> {
  // Check if order exists and is completed
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("buyer_id, status")
    .eq("id", orderId)
    .single()

  if (orderError || !order) {
    return { canReview: false, reason: "Order not found" }
  }

  if (order.buyer_id !== userId) {
    return { canReview: false, reason: "Only the buyer can review" }
  }

  if (order.status !== "completed") {
    return { canReview: false, reason: "Order must be completed first" }
  }

  // Check if already reviewed
  const { data: existingReview } = await supabase
    .from("reviews")
    .select("id")
    .eq("order_id", orderId)
    .eq("reviewer_id", userId)
    .single()

  if (existingReview) {
    return { canReview: false, reason: "Already reviewed" }
  }

  return { canReview: true, reason: null }
}

/**
 * Get pending reviews for a user (orders they haven't reviewed yet)
 */
export async function getPendingReviews(
  supabase: SupabaseClient<Database>,
  userId: string,
  limit: number = 10
): Promise<{
  data: Array<{
    orderId: string
    orderNumber: string
    sellerName: string
    completedAt: string
  }>
  error: string | null
}> {
  // Get completed orders as buyer that haven't been reviewed
  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      `
      id,
      order_number,
      completed_at,
      seller:provider_profiles!orders_seller_id_fkey(
        company_name,
        display_name
      )
    `
    )
    .eq("buyer_id", userId)
    .eq("status", "completed")
    .not(
      "id",
      "in",
      `(SELECT order_id FROM reviews WHERE reviewer_id = '${userId}')`
    )
    .order("completed_at", { ascending: false })
    .limit(limit)

  if (error) {
    return { data: [], error: error.message }
  }

  // Transform to cleaner format
  type OrderWithSeller = {
    id: string
    order_number: string
    completed_at: string | null
    seller?: {
      company_name: string
      display_name: string | null
    }
  }

  return {
    data: ((orders as OrderWithSeller[]) || []).map((order) => ({
      orderId: order.id,
      orderNumber: order.order_number,
      sellerName: order.seller?.display_name || order.seller?.company_name || "Unknown",
      completedAt: order.completed_at || new Date().toISOString(),
    })),
    error: null,
  }
}

// Helper functions

function calculateTrend(
  reviews: Array<{ rating: number; created_at: string }>
): "improving" | "stable" | "declining" | "new" {
  if (reviews.length < 5) return "new"

  // Compare last 5 reviews to previous 5
  const recent = reviews.slice(0, 5)
  const previous = reviews.slice(5, 10)

  if (previous.length < 5) return "new"

  const recentAvg = recent.reduce((sum, r) => sum + r.rating, 0) / recent.length
  const previousAvg = previous.reduce((sum, r) => sum + r.rating, 0) / previous.length

  const diff = recentAvg - previousAvg

  if (diff > 0.3) return "improving"
  if (diff < -0.3) return "declining"
  return "stable"
}
