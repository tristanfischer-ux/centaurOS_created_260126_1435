import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Creates a Supabase client for the apex-outreach project (kgkajatjyqfetdtbzmwg).
 * This is a SEPARATE Supabase project from ForgeOS's own (jyarhvinengfyrwgtskq).
 *
 * Used to query investor deep profiles, page chunks, and recent news data
 * from the apex-outreach database. The bridge column is
 * `marketplace_listings.forge_capital_id` in ForgeOS → `investor_id` in apex-outreach.
 *
 * SECURITY: Server-side only. Never expose this client or the service role key
 * to the browser.
 *
 * Required environment variables:
 *   APEX_SUPABASE_URL     - https://kgkajatjyqfetdtbzmwg.supabase.co
 *   APEX_SERVICE_ROLE_KEY  - service_role key for the apex-outreach project
 *
 * Graceful degradation: if the env vars are missing, `createApexClient()` returns
 * null and logs a warning. Callers must handle the null case — the investor detail
 * page still renders, just without apex-outreach enrichment data.
 */

// ---------------------------------------------------------------------------
// Types for the apex-outreach tables we read
// ---------------------------------------------------------------------------

/** Row shape for `investor_deep_profiles` in apex-outreach. */
export interface ApexInvestorDeepProfile {
  investor_id: number;
  profile_json: {
    recent_news?: string[];
    investment_thesis?: string;
    recent_investments?: Array<{
      company: string;
      date?: string;
      amount?: string;
      stage?: string;
    }>;
    fund_details?: Record<string, unknown>;
    team?: Array<{ name: string; title?: string; bio?: string }>;
    quality_assessment?: Record<string, unknown>;
    fact_checks?: Array<{ claim: string; status: string; source?: string }>;
    sources?: string[];
    [key: string]: unknown;
  };
  updated_at: string;
}

/** Row shape for `investor_page_chunks` in apex-outreach. */
export interface ApexInvestorPageChunk {
  id: number;
  investor_id: number;
  url: string;
  title: string | null;
  chunk_text: string;
  chunk_index: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Client singleton (server-side only)
// ---------------------------------------------------------------------------

let _apexClient: SupabaseClient | null = null;
let _warned = false;

/**
 * Returns a Supabase client pointed at the apex-outreach project, or `null`
 * if the required env vars (`APEX_SUPABASE_URL`, `APEX_SERVICE_ROLE_KEY`) are
 * not configured. A warning is logged once per process when the bridge is
 * unavailable.
 */
export function createApexClient(): SupabaseClient | null {
  if (_apexClient) return _apexClient;

  const url = process.env.APEX_SUPABASE_URL;
  const key = process.env.APEX_SERVICE_ROLE_KEY;

  if (!url || !key) {
    if (!_warned) {
      console.warn(
        "[apex-client] APEX_SUPABASE_URL and/or APEX_SERVICE_ROLE_KEY not set — " +
          "apex-outreach enrichment data will be unavailable. " +
          "Set both env vars to enable the cross-project bridge."
      );
      _warned = true;
    }
    return null;
  }

  _apexClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return _apexClient;
}
