"use client"

/**
 * Review Form Component
 * Star rating selector with comment input
 */

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Star, Send, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface ReviewFormProps {
  orderId: string
  sellerName: string
  onSubmit: (data: {
    orderId: string
    rating: number
    comment: string
    isPublic: boolean
  }) => Promise<{ success: boolean; error?: string }>
  onCancel?: () => void
  showCategoryRatings?: boolean
}

export function ReviewForm({
  orderId,
  sellerName,
  onSubmit,
  onCancel,
  showCategoryRatings = false,
}: ReviewFormProps) {
  const [rating, setRating] = useState(0)
  const [hoveredRating, setHoveredRating] = useState(0)
  const [comment, setComment] = useState("")
  const [isPublic, setIsPublic] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Optional category ratings
  const [categoryRatings, setCategoryRatings] = useState({
    quality: 0,
    communication: 0,
    timeliness: 0,
    value: 0,
  })

  const handleStarClick = (value: number) => {
    setRating(value)
  }

  const handleStarHover = (value: number) => {
    setHoveredRating(value)
  }

  const handleStarLeave = () => {
    setHoveredRating(0)
  }

  const handleCategoryRating = (category: keyof typeof categoryRatings, value: number) => {
    setCategoryRatings((prev) => ({
      ...prev,
      [category]: value,
    }))
  }

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error("Please select a rating")
      return
    }

    setIsSubmitting(true)

    try {
      const result = await onSubmit({
        orderId,
        rating,
        comment: comment.trim(),
        isPublic,
      })

      if (result.success) {
        toast.success("Review submitted successfully")
      } else {
        toast.error(result.error || "Failed to submit review")
      }
    } catch {
      toast.error("An error occurred while submitting the review")
    } finally {
      setIsSubmitting(false)
    }
  }

  const getRatingLabel = (value: number) => {
    switch (value) {
      case 1:
        return "Poor"
      case 2:
        return "Fair"
      case 3:
        return "Good"
      case 4:
        return "Very Good"
      case 5:
        return "Excellent"
      default:
        return "Select a rating"
    }
  }

  const displayRating = hoveredRating || rating

  return (
    <Card>
      <CardHeader>
        <CardTitle>Leave a Review</CardTitle>
        <CardDescription>
          How was your experience with {sellerName}?
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Star Rating */}
        <div className="space-y-2">
          <Label>Overall Rating</Label>
          <div className="flex items-center gap-4">
            <div
              className="flex gap-1"
              onMouseLeave={handleStarLeave}
              role="radiogroup"
              aria-label="Rating"
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => handleStarClick(value)}
                  onMouseEnter={() => handleStarHover(value)}
                  className="p-1 rounded focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  aria-checked={rating === value}
                  role="radio"
                  aria-label={`${value} star${value > 1 ? "s" : ""}`}
                >
                  <Star
                    className={cn(
                      "h-8 w-8 transition-all",
                      value <= displayRating
                        ? "text-amber-400 fill-amber-400"
                        : "text-muted-foreground"
                    )}
                  />
                </button>
              ))}
            </div>
            <span className="text-sm text-muted-foreground">
              {getRatingLabel(displayRating)}
            </span>
          </div>
        </div>

        {/* Category Ratings (Optional) */}
        {showCategoryRatings && (
          <div className="space-y-4">
            <Label>Category Ratings (Optional)</Label>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(categoryRatings).map(([category, value]) => (
                <div key={category} className="space-y-2">
                  <span className="text-sm capitalize text-muted-foreground">
                    {category}
                  </span>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() =>
                          handleCategoryRating(
                            category as keyof typeof categoryRatings,
                            star
                          )
                        }
                        className="p-0.5"
                      >
                        <Star
                          className={cn(
                            "h-4 w-4 transition-all",
                            star <= value
                              ? "text-amber-400 fill-amber-400"
                              : "text-muted-foreground"
                          )}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comment */}
        <div className="space-y-2">
          <Label htmlFor="comment">Your Review</Label>
          <Textarea
            id="comment"
            placeholder="Tell others about your experience..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            maxLength={1000}
          />
          <p className="text-xs text-muted-foreground text-right">
            {comment.length}/1000 characters
          </p>
        </div>

        {/* Public Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="public-toggle">Public Review</Label>
            <p className="text-sm text-muted-foreground">
              {isPublic
                ? "Your review will be visible to everyone"
                : "Your review will only be visible to the provider"}
            </p>
          </div>
          <Switch
            id="public-toggle"
            checked={isPublic}
            onCheckedChange={setIsPublic}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4">
          {onCancel && (
            <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </Button>
          )}
          <Button
            onClick={handleSubmit}
            disabled={rating === 0 || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Submit Review
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Compact inline star selector
 */
interface StarSelectorProps {
  value: number
  onChange: (value: number) => void
  size?: "sm" | "md" | "lg"
  disabled?: boolean
}

export function StarSelector({
  value,
  onChange,
  size = "md",
  disabled = false,
}: StarSelectorProps) {
  const [hoveredRating, setHoveredRating] = useState(0)

  const starSize = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-8 w-8" : "h-6 w-6"
  const displayRating = hoveredRating || value

  return (
    <div
      className="flex gap-0.5"
      onMouseLeave={() => setHoveredRating(0)}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => !disabled && onChange(star)}
          onMouseEnter={() => !disabled && setHoveredRating(star)}
          disabled={disabled}
          className={cn(
            "p-0.5 transition-transform",
            !disabled && "hover:scale-110"
          )}
        >
          <Star
            className={cn(
              starSize,
              "transition-all",
              star <= displayRating
                ? "text-amber-400 fill-amber-400"
                : "text-muted-foreground",
              disabled && "opacity-50"
            )}
          />
        </button>
      ))}
    </div>
  )
}

export default ReviewForm
