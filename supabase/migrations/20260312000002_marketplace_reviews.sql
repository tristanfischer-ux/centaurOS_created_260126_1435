-- Marketplace reviews table
-- Enables startups to rate and review suppliers, providing social proof
-- that currently only comes from self-authored supplier profiles.

CREATE TABLE public.marketplace_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  foundry_id TEXT NOT NULL REFERENCES public.foundries(id),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  body TEXT,
  is_verified_purchase BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(listing_id, reviewer_id)  -- one review per user per listing
);

-- RLS policies
ALTER TABLE public.marketplace_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews are publicly readable"
  ON public.marketplace_reviews FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create reviews"
  ON public.marketplace_reviews FOR INSERT
  WITH CHECK (auth.uid() = reviewer_id);

CREATE POLICY "Users can update own reviews"
  ON public.marketplace_reviews FOR UPDATE
  USING (auth.uid() = reviewer_id);

CREATE POLICY "Users can delete own reviews"
  ON public.marketplace_reviews FOR DELETE
  USING (auth.uid() = reviewer_id);

-- Denormalised rating columns on listings for fast queries
ALTER TABLE public.marketplace_listings
  ADD COLUMN IF NOT EXISTS average_rating NUMERIC(3,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0;

-- Index for fast review lookups by listing
CREATE INDEX idx_marketplace_reviews_listing_id ON public.marketplace_reviews(listing_id);
CREATE INDEX idx_marketplace_reviews_reviewer_id ON public.marketplace_reviews(reviewer_id);
