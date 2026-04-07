/**
 * Migration: Investor news intelligence table
 *
 * Stores web-searched intelligence about investor firms, including recent news,
 * social media signals, deal activity, and current focus areas. Generated via
 * Anthropic web search tool to provide current context beyond static enrichment data.
 *
 * Refresh cadence: on-demand per firm, cached for 7 days.
 */

-- ============================================================
-- 1. investor_news_intel table
-- ============================================================

CREATE TABLE IF NOT EXISTS investor_news_intel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  -- Summary intelligence
  intel_summary text NOT NULL,
  -- Structured signals (JSONB array of {signal, sentiment, source_url, date})
  key_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Source URLs used (JSONB array of {title, url, snippet})
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Recent social media activity summary
  social_activity text,
  -- Current investment focus / thesis drift
  current_focus text,
  -- Recent deal activity
  recent_deals text,
  -- Generation metadata
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by text NOT NULL DEFAULT 'anthropic-web-search',
  -- Deduplication: only one active intel per listing
  UNIQUE (listing_id)
);

COMMENT ON TABLE investor_news_intel IS
  'Cached web-searched intelligence about investor firms. One row per listing, refreshed on-demand.';

-- ============================================================
-- 2. Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_investor_news_intel_listing
  ON investor_news_intel (listing_id);

CREATE INDEX IF NOT EXISTS idx_investor_news_intel_generated
  ON investor_news_intel (generated_at DESC);

-- ============================================================
-- 3. RLS
-- ============================================================

ALTER TABLE investor_news_intel ENABLE ROW LEVEL SECURITY;

-- Read access for all authenticated users (intel is not tenant-scoped)
CREATE POLICY "Authenticated users can read investor intel"
  ON investor_news_intel FOR SELECT
  TO authenticated
  USING (true);

-- Insert/update only via service role (server actions use admin client for writes)
-- No INSERT/UPDATE policy for authenticated — writes go through admin client
