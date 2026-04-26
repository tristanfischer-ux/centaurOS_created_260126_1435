/**
 * @file supplier-verification.ts — fast URL-shape + HEAD-check for supplier matches.
 *
 * @description Tristan-flagged 2026-04-26 NIGHT after the engine recommended
 * a marketplace product listing as a "supplier" in the BESS demo PDF. Two
 * cheap checks that catch >90% of bad-URL cases without an LLM call:
 *
 * 1. URL shape — reject paths that look like blog posts, university research
 *    pages, marketplace product listings, news articles, or PDFs hosted on
 *    aggregator sites. These are the recurring junk patterns the semantic
 *    matcher pulls in (memory `forgeos_supplier_matcher_no_url_shape_filter`).
 * 2. HEAD request — confirm the URL resolves to a live page (200) within 5 s.
 *    Fast, cheap, runs in parallel across the BOM's supplier set.
 *
 * Designed to be called in parallel against the supplier set after match
 * synthesis. Caller annotates each match with `verified: true|false` +
 * `verifyReason: string`. The PDF render hides un-verified suppliers from
 * the founder so they aren't shown a 404 link or a marketplace product
 * page.
 *
 * Optional next step (L8-P7 follow-up): pass GET'd content through a
 * non-LLM heuristic — page must contain words like "products", "services",
 * "manufacture", "supply", "company", "industries". This catches obvious
 * blog/university pages even when the URL shape is ambiguous. Skipped
 * here to keep the cost model simple: Flash content sanity is best done
 * lazily as a follow-up batch when an unverified URL surfaces in a PDF.
 */

export interface SupplierUrlVerification {
    /** True if URL is well-shaped AND HEAD-resolvable to 200. */
    ok: boolean
    /** Human-readable reason on failure, empty on success. */
    reason: string
    /** HTTP status from the HEAD request (or null if URL-shape failed first). */
    status: number | null
    /** Final URL after redirects. */
    finalUrl: string | null
}

/**
 * URL paths that consistently produce junk supplier matches in the
 * marketplace_listings table. Tightening this list is cheaper than
 * any LLM-based filter.
 */
const URL_SHAPE_REJECTS: ReadonlyArray<{
    pattern: RegExp
    reason: string
}> = [
    { pattern: /\/blog(s)?\//i, reason: "URL is a blog post, not a supplier home page" },
    { pattern: /\/article(s)?\//i, reason: "URL is a news article, not a supplier home page" },
    { pattern: /\/news\//i, reason: "URL is a news page, not a supplier home page" },
    { pattern: /\/research\//i, reason: "URL is a research page, likely university or institute" },
    { pattern: /\/(study|studies|publications?|papers?)\//i, reason: "URL is academic publication, not a supplier home page" },
    { pattern: /\.edu(\.|\/|$)/i, reason: "Domain is an academic institution (.edu), not a UK supplier" },
    { pattern: /\.ac\.[a-z]{2}(\/|$)/i, reason: "Domain is an academic institution (.ac.*), not a UK supplier" },
    { pattern: /\/product(s)?\/[^/]+\.html?$/i, reason: "URL is a marketplace product listing, not a supplier home page" },
    { pattern: /\.amazon\./i, reason: "URL is on Amazon — not a direct supplier" },
    { pattern: /alibaba\.com/i, reason: "URL is on Alibaba marketplace — not a direct supplier" },
    { pattern: /\.ebay\./i, reason: "URL is on eBay — not a direct supplier" },
    { pattern: /\.aliexpress\./i, reason: "URL is on AliExpress — not a direct supplier" },
    { pattern: /\.pdf(\?|$)/i, reason: "URL is a PDF document, not a supplier home page" },
    { pattern: /\/wp-content\//i, reason: "URL is a WordPress media path, not a supplier home page" },
    { pattern: /\/(wiki|forum|reddit)\//i, reason: "URL is a wiki / forum page, not a supplier home page" },
    { pattern: /\/(case-study|case-studies|whitepaper|white-paper)\//i, reason: "URL is a case study / whitepaper, not a supplier home page" },
]

/**
 * Quick supplier-NAME gate — synchronous regex check. Returns true if
 * the name looks like a product page title, news headline, marketing
 * tagline, or product description rather than a real company name. Used
 * at the PDF render layer to suppress hallucinated supplier rows.
 *
 * Loop 7 critique evidence (LOOP-7-CRITIQUE.md A12): Hedgerow shipped
 * "FR4 Sheet Manufacturer", "Liquid Cooling Unit for Battery Energy
 * Storage System (BESS) Rack", "Atmospheric Pressure Sensor", "Tower
 * makes Ramon rad-hard processor", "Microchip Radiation Hardened",
 * "Unleash Precision with RS485 Soil EC and pH Sensor" as supplier
 * names. None of those are companies.
 */
export function looksLikeHallucinatedSupplierName(name: string): {
    bad: boolean
    reason: string
} {
    if (!name || typeof name !== "string") return { bad: true, reason: "empty name" }
    const n = name.trim()
    if (n.length === 0) return { bad: true, reason: "empty name" }

    // Imperative / marketing tagline patterns ("Unleash …", "Discover …",
    // "Find your …", "Save 30% on …").
    if (/^(Unleash|Discover|Save|Find|Get|Buy|Shop|Order|Try)\b/i.test(n)) {
        return { bad: true, reason: "imperative tagline, not a company name" }
    }

    // Generic product-category strings used as a name. These typically
    // match the BOM part description verbatim ("FR4 Sheet Manufacturer",
    // "Atmospheric Pressure Sensor", "DC Distribution Board"). The
    // hallmark is title-cased common nouns + ending in a category word
    // with no proper-noun anchor.
    const productCategoryEnding =
        /\b(Manufacturer|Supplier|Wholesaler|Distributor|Reseller|Vendor|Sensor|Module|Board|Panel|Controller|Cell|Cable|Connector|Adapter|Switch|Pump|Filter|Fitting|Bracket|Plate|Housing|Enclosure|Antenna|Driver|Inverter|Converter|Rack|Frame|Hardware|Fastener|Coupling|Valve|Gauge|Meter|Cooling Unit|Storage System|Power Supply)\s*$/i
    const hasProperNounAnchor = /\b(Ltd|Limited|GmbH|SA|SAS|Inc|Corp|LLC|PLC|AG|Co\.|S\.r\.l\.|Pty)\b/i.test(n) ||
        /\b[A-Z][a-z]+(?:[-'][A-Z][a-z]+)?\s+(?:Industries|Engineering|Systems|Technologies|Components|Manufacturing|Electric|Electronics|Solutions|Sensors|Optics|Materials)\b/.test(n)
    if (productCategoryEnding.test(n) && !hasProperNounAnchor) {
        return { bad: true, reason: "name reads as a product category, not a company" }
    }

    // News-article headline pattern: "<Subject> <verb> <object>", e.g.
    // "Tower makes Ramon rad-hard processor".
    if (/^[A-Z][a-z]+\s+(makes|launches|ships|releases|unveils|announces|debuts)\s+/i.test(n)) {
        return { bad: true, reason: "looks like a news-article headline, not a company name" }
    }

    // PDF / academic-paper title leakage: "Modelling and Control of
    // Grid-Following Inverter…" (BESS p.86).
    if (/^(Modelling|Modeling|Analysis|Design|Control|Investigation|Evaluation|Comparison)\s+(of|and)\b/i.test(n)) {
        return { bad: true, reason: "looks like an academic paper title, not a company name" }
    }

    // Embedded product-spec parens: "(BESS) Rack", "(IoT)", "(LFP)" —
    // companies don't include product specs in their trading name.
    if (/\b\([A-Z]{2,5}\)\s+[A-Z][a-z]+/.test(n)) {
        return { bad: true, reason: "name contains product-spec parens, not a company name" }
    }

    // Description-style: very long names (>60 chars, multiple commas).
    if (n.length > 60 && (n.match(/,/g) ?? []).length >= 1) {
        return { bad: true, reason: "name is too long / comma-separated — looks like a description" }
    }

    return { bad: false, reason: "" }
}

/**
 * Quick URL-shape gate — runs synchronously, no I/O. Returns the first
 * failure reason if the URL matches any reject pattern.
 */
export function checkSupplierUrlShape(url: string): { ok: boolean; reason: string } {
    if (!url || typeof url !== "string") return { ok: false, reason: "URL missing" }
    let parsed: URL
    try {
        parsed = new URL(url)
    } catch {
        return { ok: false, reason: "URL doesn't parse" }
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { ok: false, reason: `URL uses non-HTTP protocol (${parsed.protocol})` }
    }
    for (const { pattern, reason } of URL_SHAPE_REJECTS) {
        if (pattern.test(url)) return { ok: false, reason }
    }
    return { ok: true, reason: "" }
}

/**
 * Full check — URL shape + HEAD request with 5s timeout. Some servers
 * reject HEAD; on 405 / 501 the function falls back to a GET with a
 * Range header so we don't pull the whole page.
 */
export async function verifySupplierUrl(
    url: string,
    timeoutMs = 5_000,
): Promise<SupplierUrlVerification> {
    const shape = checkSupplierUrlShape(url)
    if (!shape.ok) {
        return { ok: false, reason: shape.reason, status: null, finalUrl: null }
    }
    try {
        let response = await fetch(url, {
            method: "HEAD",
            redirect: "follow",
            signal: AbortSignal.timeout(timeoutMs),
            headers: { "User-Agent": "ForgeOS/1.0 supplier-verifier" },
        })
        // Some servers reject HEAD with 405 / 501 — fall back to a small GET.
        if (response.status === 405 || response.status === 501) {
            response = await fetch(url, {
                method: "GET",
                redirect: "follow",
                signal: AbortSignal.timeout(timeoutMs),
                headers: {
                    "User-Agent": "ForgeOS/1.0 supplier-verifier",
                    Range: "bytes=0-1023",
                },
            })
        }
        if (response.status >= 200 && response.status < 400) {
            // Final-URL check — some redirects land on a junk path even when
            // the original URL shape passed. Re-shape-check the final URL.
            const finalShape = checkSupplierUrlShape(response.url)
            if (!finalShape.ok) {
                return {
                    ok: false,
                    reason: `Redirect landed on ${finalShape.reason.toLowerCase()}`,
                    status: response.status,
                    finalUrl: response.url,
                }
            }
            return {
                ok: true,
                reason: "",
                status: response.status,
                finalUrl: response.url,
            }
        }
        return {
            ok: false,
            reason: `HTTP ${response.status}`,
            status: response.status,
            finalUrl: response.url,
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes("aborted") || msg.includes("timeout")) {
            return { ok: false, reason: "HEAD request timed out", status: null, finalUrl: null }
        }
        return { ok: false, reason: `Network error: ${msg.slice(0, 80)}`, status: null, finalUrl: null }
    }
}

/**
 * Verify a batch of URLs in parallel with a bounded concurrency. Used
 * by the supplier-match wiring to annotate every match in one shot.
 */
export async function verifySupplierUrls(
    urls: ReadonlyArray<string>,
    concurrency = 8,
    timeoutMs = 5_000,
): Promise<Map<string, SupplierUrlVerification>> {
    const out = new Map<string, SupplierUrlVerification>()
    for (let i = 0; i < urls.length; i += concurrency) {
        const batch = urls.slice(i, i + concurrency)
        const settled = await Promise.allSettled(
            batch.map((u) => verifySupplierUrl(u, timeoutMs)),
        )
        settled.forEach((s, idx) => {
            const u = batch[idx]
            if (s.status === "fulfilled") out.set(u, s.value)
            else
                out.set(u, {
                    ok: false,
                    reason: `Verifier threw: ${String(s.reason).slice(0, 80)}`,
                    status: null,
                    finalUrl: null,
                })
        })
    }
    return out
}
