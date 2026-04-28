/**
 * @file _url-blocklist.ts — URL-shape blocklist for Gate 5 (Supplier Validity).
 *
 * @description Deterministic regex patterns that flag URLs as invalid
 * supplier contacts. A URL matching any pattern is NOT a manufacturer or
 * direct supplier — it is a blog post, marketplace product listing,
 * news article, social media post, academic page, or similar non-supplier
 * destination.
 *
 * This file is the single source of truth for domain / path blocklist
 * patterns used by gate-5.ts. The `supplier-verification.ts` library
 * has a similar list at a different abstraction layer (it returns
 * `SupplierUrlVerification`). This file is the gate-level version: a
 * lighter boolean check that returns a reason string, used when the full
 * HEAD-request verifier isn't needed (e.g. in unit tests or fixture runs).
 *
 * Patterns are additive — new junk-URL classes should be added here rather
 * than inlining patterns in gate-5.ts.
 *
 * @see src/lib/supplier-verification.ts  — full HEAD-request verifier (Gate 5 uses both)
 * @see src/lib/forge-v2/stage-gates/gate-5.ts  — consumer
 * @see src/lib/forge-v2/stage-gates/fixtures/dead_supplier_urls.json — test corpus
 */

// ── Blocklist entry shape ───────────────────────────────────────────────────

interface BlocklistEntry {
    /** Pattern applied to the full URL string. Case-insensitive. */
    pattern: RegExp
    /** Human-readable reason, used in gate failure details. */
    reason: string
}

// ── Blocklist patterns ──────────────────────────────────────────────────────

/**
 * URL patterns that reliably identify non-supplier destinations.
 *
 * Ordered: most specific patterns first so the first match is the most
 * informative. The check exits on first match (see `isBlocklistedUrl`).
 *
 * Maintenance note: when the engine ships a bad URL class in a PDF and
 * the loop critique names it, add it here. Each entry should cite the
 * evidence it was derived from.
 */
const BLOCKLIST: ReadonlyArray<BlocklistEntry> = [
    // ── Social media / aggregator platforms ─────────────────────────────
    // These are never a manufacturer's canonical supplier contact.
    {
        pattern: /\blinkedin\.com\/(posts?|pulse|feed)\//i,
        reason: "LinkedIn post or article — not a supplier contact page",
    },
    {
        pattern: /\btwitter\.com\b/i,
        reason: "Twitter — not a supplier contact page",
    },
    {
        pattern: /\bx\.com\b/i,
        reason: "X (formerly Twitter) — not a supplier contact page",
    },
    {
        pattern: /\bmedium\.com\b/i,
        reason: "Medium blog platform — not a supplier contact page",
    },
    {
        pattern: /\bsubstack\.com\b/i,
        reason: "Substack newsletter — not a supplier contact page",
    },

    // ── Marketplace product listing pages ───────────────────────────────
    // These are product listings, not manufacturer homepages or contact
    // pages. Flagged by Tristan after BESS demo PDF shipped an Alibaba
    // product listing as a "supplier" (memory: forgeos_pdf_and_supplier_gotchas).
    {
        pattern: /\bamazon\.com\/dp\//i,
        reason: "Amazon product listing — not a direct supplier",
    },
    {
        pattern: /\bamazon\.co\.uk\/dp\//i,
        reason: "Amazon product listing — not a direct supplier",
    },
    {
        pattern: /\balibaba\.com\/product-detail\//i,
        reason: "Alibaba product listing — not a direct supplier",
    },
    {
        pattern: /\balibaba\.com\/offer\//i,
        reason: "Alibaba product offer — not a direct supplier",
    },
    {
        pattern: /\baliexpress\.com\/item\//i,
        reason: "AliExpress product listing — not a direct supplier",
    },
    {
        pattern: /\bebay\.(co\.uk|com)\/itm\//i,
        reason: "eBay item listing — not a direct supplier",
    },
    {
        pattern: /\bthomasnet\.com\/products\//i,
        reason: "ThomasNet product listing — use the supplier profile page instead",
    },
    {
        pattern: /\bglobalspec\.com\/datasheet\//i,
        reason: "GlobalSpec datasheet — not a supplier contact page",
    },

    // ── News and blog content ─────────────────────────────────────────
    // News articles frequently surface in semantic matches because they
    // mention product specs alongside company names. They are never
    // supplier contact pages.
    {
        pattern: /\bnews\.[a-z]+\.[a-z]+\//i,
        reason: "News subdomain URL — not a supplier home page",
    },
    {
        pattern: /\/news\//i,
        reason: "URL is a news section — not a supplier home page",
    },
    {
        pattern: /\/blog(s)?\//i,
        reason: "URL is a blog post — not a supplier home page",
    },
    {
        pattern: /\/article(s)?\//i,
        reason: "URL is a news article — not a supplier home page",
    },
    {
        pattern: /\/press-release(s)?\//i,
        reason: "URL is a press release — not a supplier contact page",
    },

    // ── Academic and educational domains ─────────────────────────────
    // .edu and .ac.* domains are universities, not manufacturers.
    {
        pattern: /\.edu(\/|$)/i,
        reason: "Academic domain (.edu) — not a supplier",
    },
    {
        pattern: /\.ac\.[a-z]{2}(\/|$)/i,
        reason: "Academic domain (.ac.*) — not a supplier",
    },
    {
        pattern: /\/research\//i,
        reason: "URL is a research page — likely university or institute",
    },
    {
        pattern: /\/(study|studies|publications?|papers?|preprint)\//i,
        reason: "URL is an academic publication — not a supplier",
    },

    // ── Reference / encyclopaedia sites ──────────────────────────────
    {
        pattern: /\bwikipedia\.org\b/i,
        reason: "Wikipedia — not a supplier",
    },
    {
        pattern: /\bwikipedia\.[a-z]+\b/i,
        reason: "Wikipedia (non-English edition) — not a supplier",
    },

    // ── PDF / document URLs ───────────────────────────────────────────
    // A raw PDF URL is a datasheet or spec sheet, not a supplier home page.
    {
        pattern: /\.pdf(\?|#|$)/i,
        reason: "URL is a PDF document — not a supplier home page",
    },

    // ── WordPress media paths ─────────────────────────────────────────
    {
        pattern: /\/wp-content\//i,
        reason: "WordPress media path — not a supplier home page",
    },

    // ── Case study / whitepaper content ──────────────────────────────
    {
        pattern: /\/(case-stud(y|ies)|whitepaper|white-paper)\//i,
        reason: "URL is a case study or whitepaper — not a supplier contact page",
    },
]

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns true if the URL matches any blocklist pattern — i.e. it is NOT
 * a valid supplier contact page. Returns false for valid-looking URLs.
 *
 * This is a SYNCHRONOUS shape check only — no network I/O. It runs before
 * the HEAD-request liveness check so bad-shape URLs are flagged cheaply
 * without incurring a network round-trip.
 *
 * @param url - The URL to test. Accepts any string; malformed URLs return false
 *              (they will fail the URL-parse step in the HEAD-check layer).
 * @returns true  → URL matches a blocklist pattern → NOT a valid supplier URL
 * @returns false → URL does not match any blocklist pattern → proceed to HEAD check
 */
export function isBlocklistedUrl(url: string): boolean {
    if (!url || typeof url !== "string") return true
    return BLOCKLIST.some(({ pattern }) => pattern.test(url))
}

/**
 * Same as `isBlocklistedUrl` but returns the human-readable reason for the
 * first matched pattern. Returns null when the URL is not blocklisted.
 *
 * Used by gate-5.ts to populate `failure_details` in the GateVerdict row.
 *
 * @param url - The URL to test.
 * @returns Reason string on match, null on no match.
 */
export function blocklistReason(url: string): string | null {
    if (!url || typeof url !== "string") return "URL is empty or not a string"
    for (const { pattern, reason } of BLOCKLIST) {
        if (pattern.test(url)) return reason
    }
    return null
}

/**
 * Returns the full blocklist for inspection / testing purposes.
 * Gate-5 fixtures and unit tests use this to verify coverage.
 */
export function getBlocklist(): ReadonlyArray<{ pattern: RegExp; reason: string }> {
    return BLOCKLIST
}
