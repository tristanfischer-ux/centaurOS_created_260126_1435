"use client"

/**
 * @file listing-reviews.tsx
 * @description Reviews section for marketplace listing detail page.
 * Star breakdown chart, review cards, write-a-review dialog, sort controls.
 */

import { useState, useCallback } from "react"
import { Star, MessageSquarePlus, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  getReviewsForListing,
  createReview,
  updateReview,
  deleteReview,
  type MarketplaceReview,
  type ReviewSortOption,
} from "@/actions/marketplace-reviews"

// ── Star Display ─────────────────────────────────────────────────────────────

function StarDisplay({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const iconSize = size === "md" ? "h-5 w-5" : "h-3.5 w-3.5"
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={cn(
            iconSize,
            s <= Math.round(rating)
              ? "text-warning fill-warning"
              : "text-muted-foreground"
          )}
        />
      ))}
    </div>
  )
}

// ── Interactive Star Selector ────────────────────────────────────────────────

function StarSelector({
  value,
  onChange,
}: {
  value: number
  onChange: (rating: number) => void
}) {
  const [hovered, setHovered] = useState(0)

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          onMouseEnter={() => setHovered(s)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(s)}
          className="p-0.5 transition-transform hover:scale-110"
        >
          <Star
            className={cn(
              "h-8 w-8 transition-colors",
              s <= (hovered || value)
                ? "text-warning fill-warning"
                : "text-muted-foreground"
            )}
          />
        </button>
      ))}
      {(hovered || value) > 0 && (
        <span className="ml-2 text-sm text-muted-foreground">
          {hovered || value}/5
        </span>
      )}
    </div>
  )
}

// ── Star Breakdown Chart ─────────────────────────────────────────────────────

function StarBreakdown({ reviews }: { reviews: MarketplaceReview[] }) {
  const dist: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  for (const r of reviews) {
    const rounded = Math.round(r.rating) as 1 | 2 | 3 | 4 | 5
    if (rounded >= 1 && rounded <= 5) dist[rounded]++
  }
  const total = reviews.length

  return (
    <div className="space-y-1.5">
      {[5, 4, 3, 2, 1].map((star) => {
        const count = dist[star]
        const pct = total > 0 ? (count / total) * 100 : 0
        return (
          <div key={star} className="flex items-center gap-2 text-sm">
            <span className="w-6 text-right text-muted-foreground">{star}</span>
            <Star className="h-3.5 w-3.5 text-warning fill-warning" />
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-warning transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-8 text-right text-xs text-muted-foreground">
              {count}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Review Card ──────────────────────────────────────────────────────────────

function ReviewCard({
  review,
  isOwn,
  onEdit,
  onDelete,
}: {
  review: MarketplaceReview
  isOwn: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const date = review.created_at
    ? new Date(review.created_at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : ""

  return (
    <Card>
      <CardContent className="pt-4 space-y-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            {review.reviewer_avatar ? (
              <img
                src={review.reviewer_avatar}
                alt=""
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                {(review.reviewer_name ?? "A")[0]?.toUpperCase()}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">
                  {review.reviewer_name ?? "Anonymous"}
                </span>
                {review.is_verified_purchase && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/10 text-success font-medium">
                    Verified
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <StarDisplay rating={review.rating} />
                <span className="text-xs text-muted-foreground">{date}</span>
              </div>
            </div>
          </div>

          {isOwn && (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={onEdit} className="h-7 text-xs">
                Edit
              </Button>
              <Button variant="ghost" size="sm" onClick={onDelete} className="h-7 text-xs text-destructive">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>

        {review.title && (
          <p className="font-semibold text-foreground">{review.title}</p>
        )}
        {review.body && (
          <p className="text-sm text-muted-foreground leading-relaxed">
            {review.body}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ── Write / Edit Review Dialog ───────────────────────────────────────────────

function WriteReviewDialog({
  open,
  onOpenChange,
  listingId,
  existingReview,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  listingId: string
  existingReview?: MarketplaceReview | null
  onSuccess: () => void
}) {
  const isEditing = !!existingReview
  const [rating, setRating] = useState(existingReview?.rating ?? 0)
  const [title, setTitle] = useState(existingReview?.title ?? "")
  const [body, setBody] = useState(existingReview?.body ?? "")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error("Please select a rating")
      return
    }

    setIsSubmitting(true)
    try {
      const result = isEditing
        ? await updateReview(existingReview!.id, { rating, title, body })
        : await createReview(listingId, { rating, title, body })

      if (result.success) {
        toast.success(isEditing ? "Review updated" : "Review submitted")
        onOpenChange(false)
        onSuccess()
      } else {
        toast.error(result.error ?? "Something went wrong")
      }
    } catch {
      toast.error("Failed to submit review")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Review" : "Write a Review"}</DialogTitle>
          <DialogDescription>
            Share your experience with this supplier
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Star rating */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Rating
            </label>
            <StarSelector value={rating} onChange={setRating} />
          </div>

          {/* Title */}
          <div>
            <label
              htmlFor="review-title"
              className="text-sm font-medium text-foreground mb-1 block"
            >
              Title <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              id="review-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Summarise your experience"
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              maxLength={200}
            />
          </div>

          {/* Body */}
          <div>
            <label
              htmlFor="review-body"
              className="text-sm font-medium text-foreground mb-1 block"
            >
              Review <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              id="review-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Tell others about your experience..."
              rows={4}
              maxLength={2000}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
            <p className="text-xs text-muted-foreground text-right mt-1">
              {body.length}/2000
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || rating === 0}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : isEditing ? (
              "Update Review"
            ) : (
              "Submit Review"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Sort Dropdown ────────────────────────────────────────────────────────────

const SORT_LABELS: Record<ReviewSortOption, string> = {
  newest: "Most Recent",
  highest: "Highest Rated",
  lowest: "Lowest Rated",
}

// ── Main Export ──────────────────────────────────────────────────────────────

export function ListingReviewsSection({
  listingId,
  initialReviews,
  currentUserId,
}: {
  listingId: string
  initialReviews: MarketplaceReview[]
  currentUserId: string | null
}) {
  const [reviews, setReviews] = useState(initialReviews)
  const [sort, setSort] = useState<ReviewSortOption>("newest")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingReview, setEditingReview] = useState<MarketplaceReview | null>(null)

  const userReview = currentUserId
    ? reviews.find((r) => r.reviewer_id === currentUserId)
    : null
  const hasReviewed = !!userReview

  const refreshReviews = useCallback(async () => {
    const result = await getReviewsForListing(listingId, sort)
    if (!result.error) setReviews(result.reviews)
  }, [listingId, sort])

  const handleSortChange = useCallback(
    async (newSort: ReviewSortOption) => {
      setSort(newSort)
      const result = await getReviewsForListing(listingId, newSort)
      if (!result.error) setReviews(result.reviews)
    },
    [listingId]
  )

  const handleDelete = useCallback(
    async (reviewId: string) => {
      if (!confirm("Delete this review?")) return
      const result = await deleteReview(reviewId)
      if (result.success) {
        toast.success("Review deleted")
        refreshReviews()
      } else {
        toast.error(result.error ?? "Failed to delete review")
      }
    },
    [refreshReviews]
  )

  const handleEdit = useCallback((review: MarketplaceReview) => {
    setEditingReview(review)
    setDialogOpen(true)
  }, [])

  const handleWriteNew = useCallback(() => {
    setEditingReview(null)
    setDialogOpen(true)
  }, [])

  // Rating summary
  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <MessageSquarePlus className="h-5 w-5" />
          Reviews
          {reviews.length > 0 && (
            <span className="text-muted-foreground font-normal text-base">
              ({reviews.length})
            </span>
          )}
        </h2>

        <div className="flex items-center gap-2">
          {/* Sort dropdown */}
          {reviews.length > 1 && (
            <select
              value={sort}
              onChange={(e) =>
                handleSortChange(e.target.value as ReviewSortOption)
              }
              className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {(Object.keys(SORT_LABELS) as ReviewSortOption[]).map((key) => (
                <option key={key} value={key}>
                  {SORT_LABELS[key]}
                </option>
              ))}
            </select>
          )}

          {/* Write a Review button — only if logged in and hasn't reviewed */}
          {currentUserId && !hasReviewed && (
            <Button size="sm" onClick={handleWriteNew}>
              <Star className="h-3.5 w-3.5 mr-1.5" />
              Write a Review
            </Button>
          )}
        </div>
      </div>

      {/* Summary + breakdown */}
      {reviews.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-6 items-start">
          {/* Big average */}
          <div className="text-center sm:text-left">
            <p className="text-4xl font-bold text-foreground">
              {avgRating.toFixed(1)}
            </p>
            <StarDisplay rating={avgRating} size="md" />
            <p className="text-xs text-muted-foreground mt-1">
              {reviews.length} review{reviews.length !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Bar chart */}
          <StarBreakdown reviews={reviews} />
        </div>
      )}

      {/* Review list */}
      {reviews.length > 0 ? (
        <div className="space-y-3">
          {reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              isOwn={review.reviewer_id === currentUserId}
              onEdit={() => handleEdit(review)}
              onDelete={() => handleDelete(review.id)}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <Star className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              No reviews yet. Be the first to share your experience.
            </p>
            {currentUserId && (
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={handleWriteNew}
              >
                Write a Review
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dialog */}
      <WriteReviewDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        listingId={listingId}
        existingReview={editingReview}
        onSuccess={refreshReviews}
      />
    </section>
  )
}

/**
 * Compact star rating display for the listing header.
 * Shows "★ 4.3 (12 reviews)" inline.
 */
export function ListingRatingSummary({
  averageRating,
  reviewCount,
}: {
  averageRating: number | null
  reviewCount: number
}) {
  if (!averageRating || reviewCount === 0) return null

  return (
    <div className="flex items-center gap-1.5">
      <StarDisplay rating={averageRating} />
      <span className="text-sm font-medium text-foreground">
        {averageRating.toFixed(1)}
      </span>
      <span className="text-sm text-muted-foreground">
        ({reviewCount} review{reviewCount !== 1 ? "s" : ""})
      </span>
    </div>
  )
}
