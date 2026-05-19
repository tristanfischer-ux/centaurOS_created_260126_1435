-- Parts catalogue database — accumulated knowledge from every BoM run.
--
-- Tristan directive 2026-05-16: "The first thing you search is: does the part
-- exist in the database that we have? Over time, we should have thousands or
-- hundreds of thousands of parts ourselves which have been searched for and
-- found, and we know that are true."
--
-- Phase 0 of the cascade reads this DB before any external API calls. A hit
-- skips all external work. Misses trigger the cascade, and any new verified
-- part is inserted here so the next chain run gets it for free.
--
-- Location: ~/.forgeos/parts-catalogue.db
-- Engine:   better-sqlite3 (already a project dependency)

CREATE TABLE IF NOT EXISTS parts (
  -- Normalised composite key. Both fields case-folded + whitespace-stripped.
  -- This handles "TI" vs "Texas Instruments" by storing the manufacturer the
  -- distributor returned, AND a separately-indexed normalised form for lookup.
  manufacturer_norm        TEXT NOT NULL,    -- lowercase, alphanumeric-only
  part_number_norm         TEXT NOT NULL,    -- lowercase, alphanumeric-only

  -- Display values — what we'd render to the user
  manufacturer             TEXT NOT NULL,    -- original-case manufacturer
  part_number              TEXT NOT NULL,    -- original-case part_number

  -- Where the part was verified
  source_method            TEXT NOT NULL,    -- 'mouser'|'digikey'|'farnell'|'brave'|'tavily'|'gemini'|'lm-only'
  source_url               TEXT,             -- canonical product page URL
  source_title             TEXT,             -- page title / product description

  -- Distributor-specific data when available (snapshot at verify time)
  distributor_price_gbp    REAL,             -- price at qty 1, GBP
  distributor_availability TEXT,             -- "1234 in stock" or "On order" etc.
  distributor_datasheet_url TEXT,            -- direct datasheet PDF if known

  -- Verification status + freshness
  verified_at              TEXT NOT NULL,    -- ISO timestamp when entry was created/refreshed
  last_head_check_at       TEXT,             -- ISO timestamp of last urlResolves() check
  last_head_check_ok       INTEGER,          -- 1 = URL resolved at last check, 0 = failed

  -- Provenance — useful for debugging "where did this come from?"
  generated_by             TEXT,             -- e.g. "google/gemini-3.1-flash-lite (mouser)"
  first_seen_in            TEXT,             -- project_id / iter name of first BoM that used it

  PRIMARY KEY (manufacturer_norm, part_number_norm)
);

-- Lookup index on source_method for audit queries ("show me all the lm-only
-- entries that need migration to a verified source")
CREATE INDEX IF NOT EXISTS idx_parts_source_method ON parts(source_method);

-- Freshness index: queries like "find entries older than 60 days that need
-- re-verification" run as range scans on verified_at.
CREATE INDEX IF NOT EXISTS idx_parts_verified_at ON parts(verified_at);

-- ─── Diagnostic / audit views ──────────────────────────────────────────────

-- Count of parts per source_method — quick health check
CREATE VIEW IF NOT EXISTS v_parts_by_source AS
  SELECT source_method, COUNT(*) AS n, AVG(distributor_price_gbp) AS avg_price_gbp
  FROM parts
  GROUP BY source_method
  ORDER BY n DESC;

-- Entries that need re-HEAD-check (URL check >30 days old AND was OK last time)
CREATE VIEW IF NOT EXISTS v_parts_stale_head_check AS
  SELECT manufacturer, part_number, source_method, last_head_check_at
  FROM parts
  WHERE source_method NOT IN ('mouser', 'digikey', 'farnell')  -- distributor URLs trusted
    AND last_head_check_ok = 1
    AND (last_head_check_at IS NULL OR last_head_check_at < datetime('now', '-30 days'))
  ORDER BY last_head_check_at ASC NULLS FIRST;
