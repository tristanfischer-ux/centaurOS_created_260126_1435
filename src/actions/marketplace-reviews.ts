"use server"

/**
 * @file marketplace-reviews.ts
 * @description Server actions for marketplace listing reviews.
 * Enables startups to rate and review suppliers with denormalised
 * average_rating / review_count kept in sync on marketplace_listings.
 */

import { withAuth, type ActionError } from "@/lib/server-action-utils"
import { sanitizeErrorMessage } from "@/lib/security/sanitize"
import { createClient } from "@/lib/supabase/server"

// ── Types ────────────────────────────────────────────────────────────────────

export interface MarketplaceReview {
  id: string
  listing_id: string
  reviewer_id: string
  foundry_id: string
  rating: number
  title: string | null
  body: string | null
  is_verified_purchase: boolean
  created_at: string
  updated_at: string
  reviewer_name: string | null
  reviewer_avatar: string | null
}

export interface ReviewsResult {
  reviews: MarketplaceReview[]
  error?: string
}

export interface ReviewMutationResult {
  success: boolean
  error?: string
}

export type ReviewSortOption = "newest" | "highest" | "lowest"

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Recalculates and updates the denormalised average_rating and review_count
 * on a marketplace_listings row after any review mutation.
 */
async function recalculateListingRating(
  supabase: Awaited<ReturnType<typeof createClient>>,
  listingId: string
) {
  const { data: reviews } = await supabase
    .from("marketplace_reviews")
    .select("rating")
    .eq("listing_id", listingId)

  const count = reviews?.length ?? 0
  const avg =
    count > 0
      ? reviews!.reduce((sum, r) => sum + r.rating, 0) / count
      : null

  await supabase
    .from("marketplace_listings")
    .update({
      average_rating: avg !== null ? Math.round(avg * 100) / 100 : null,
      review_count: count,
    })
    .eq("id", listingId)
}

// ── Public Actions ───────────────────────────────────────────────────────────

/**
 * Fetch all reviews for a listing, joined with reviewer profile info.
 * Publicly readable (no auth required) but we still create a client for the query.
 */
export async function getReviewsForListing(
  listingId: string,
  sort: ReviewSortOption = "newest"
): Promise<ReviewsResult> {
  try {
    const supabase = await createClient()

    const orderCol = "rating"
    const ascending = sort === "lowest"
    const orderBy =
      sort === "newest"
        ? { column: "created_at" as const, ascending: false }
        : { column: orderCol as "rating", ascending }

    const { data, error } = await supabase
      .from("marketplace_reviews")
      .select(
        `
        id,
        listing_id,
        reviewer_id,
        foundry_id,
        rating,
        title,
        body,
        is_verified_purchase,
        created_at,
        updated_at,
        reviewer:profiles!marketplace_reviews_reviewer_id_fkey(
          full_name,
          avatar_url
        )
      `
      )
      .eq("listing_id", listingId)
      .order(orderBy.column, { ascending: orderBy.ascending })

    if (error) {
      console.error("[getReviewsForListing] Query error:", error)
      return { reviews: [], error: sanitizeErrorMessage(error) }
    }

    const reviews: MarketplaceReview[] = (data ?? []).map((r) => ({
      id: r.id,
      listing_id: r.listing_id,
      reviewer_id: r.reviewer_id,
      foundry_id: r.foundry_id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      is_verified_purchase: r.is_verified_purchase ?? false,
      created_at: r.created_at ?? "",
      updated_at: r.updated_at ?? "",
      // GOTCHA: Supabase returns the joined row as an object (single FK),
      // but TypeScript types it as an array. Cast safely.
      reviewer_name:
        (r.reviewer as unknown as { full_name: string | null })?.full_name ??
        null,
      reviewer_avatar:
        (r.reviewer as unknown as { avatar_url: string | null })?.avatar_url ??
        null,
    }))

    return { reviews }
  } catch (err) {
    console.error("[getReviewsForListing] Unexpected error:", err)
    return { reviews: [], error: "Failed to fetch reviews" }
  }
}

/**
 * Create a new review. One review per user per listing (DB constraint).
 * Recalculates the listing's denormalised rating after insert.
 */
export async function createReview(
  listingId: string,
  input: { rating: number; title?: string; body?: string }
): Promise<ReviewMutationResult> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // VALIDATION: rating range
    if (input.rating < 1 || input.rating > 5) {
      return { success: false, error: "Rating must be between 1 and 5" }
    }

    // VALIDATION: body length
    if (input.body && input.body.length > 2000) {
      return { success: false, error: "Review body must be 2000 characters or fewer" }
    }

    const { error } = await supabase.from("marketplace_reviews").insert({
      listing_id: listingId,
      reviewer_id: user.id,
      foundry_id: foundryId,
      rating: Math.round(input.rating),
      title: input.title?.trim() || null,
      body: input.body?.trim() || null,
    })

    if (error) {
      // Unique constraint violation → user already reviewed this listing
      if (error.code === "23505") {
        return { success: false, error: "You have already reviewed this listing" }
      }
      console.error("[createReview] Insert error:", error)
      return { success: false, error: sanitizeErrorMessage(error) }
    }

    await recalculateListingRating(supabase, listingId)

    return { success: true }
  })
}

/**
 * Update an existing review. Only the review owner can update (RLS enforced).
 * Recalculates the listing's denormalised rating after update.
 */
export async function updateReview(
  reviewId: string,
  input: { rating: number; title?: string; body?: string }
): Promise<ReviewMutationResult> {
  return withAuth(async ({ supabase }) => {
    if (input.rating < 1 || input.rating > 5) {
      return { success: false, error: "Rating must be between 1 and 5" }
    }

    if (input.body && input.body.length > 2000) {
      return { success: false, error: "Review body must be 2000 characters or fewer" }
    }

    // Fetch review first to get listing_id for recalculation
    const { data: review, error: fetchError } = await supabase
      .from("marketplace_reviews")
      .select("listing_id")
      .eq("id", reviewId)
      .single()

    if (fetchError || !review) {
      return { success: false, error: "Review not found" }
    }

    const { error } = await supabase
      .from("marketplace_reviews")
      .update({
        rating: Math.round(input.rating),
        title: input.title?.trim() || null,
        body: input.body?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", reviewId)

    if (error) {
      console.error("[updateReview] Update error:", error)
      return { success: false, error: sanitizeErrorMessage(error) }
    }

    await recalculateListingRating(supabase, review.listing_id)

    return { success: true }
  })
}

/**
 * Delete a review. Only the review owner can delete (RLS enforced).
 * Recalculates the listing's denormalised rating after deletion.
 */
export async function deleteReview(
  reviewId: string
): Promise<ReviewMutationResult> {
  return withAuth(async ({ supabase }) => {
    // Fetch review first to get listing_id for recalculation
    const { data: review, error: fetchError } = await supabase
      .from("marketplace_reviews")
      .select("listing_id")
      .eq("id", reviewId)
      .single()

    if (fetchError || !review) {
      return { success: false, error: "Review not found" }
    }

    const { error } = await supabase
      .from("marketplace_reviews")
      .delete()
      .eq("id", reviewId)

    if (error) {
      console.error("[deleteReview] Delete error:", error)
      return { success: false, error: sanitizeErrorMessage(error) }
    }

    await recalculateListingRating(supabase, review.listing_id)

    return { success: true }
  })
}

/**
 * Check if the current user has already reviewed a specific listing.
 * Returns the existing review if found, null otherwise.
 */
export async function getUserReviewForListing(
  listingId: string
): Promise<{ review: MarketplaceReview | null; error?: string }> {
  return withAuth(async ({ supabase, user }) => {
    const { data, error } = await supabase
      .from("marketplace_reviews")
      .select("*")
      .eq("listing_id", listingId)
      .eq("reviewer_id", user.id)
      .maybeSingle()

    if (error) {
      console.error("[getUserReviewForListing] Error:", error)
      return { review: null, error: sanitizeErrorMessage(error) }
    }

    if (!data) return { review: null }

    return {
      review: {
        id: data.id,
        listing_id: data.listing_id,
        reviewer_id: data.reviewer_id,
        foundry_id: data.foundry_id,
        rating: data.rating,
        title: data.title,
        body: data.body,
        is_verified_purchase: data.is_verified_purchase ?? false,
        created_at: data.created_at ?? "",
        updated_at: data.updated_at ?? "",
        reviewer_name: null,
        reviewer_avatar: null,
      },
    }
  })
}
