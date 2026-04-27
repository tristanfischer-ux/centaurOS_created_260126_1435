/**
 * @file supplier-strong-fit-promotion.ts — Loop 15 P4: render-time
 * supplier-score promotion based on capability and certification
 * evidence.
 *
 * Why this exists:
 *   Loop 14 surfaced 113 aerospace suppliers on HAPS but every one of
 *   them scored 30-43 (WEAK / PLAUSIBLE FIT). Council L15 (7 of 8 models
 *   flagged this) said the live scorer treats lexical matching too
 *   weakly: an aerospace supplier with AS9100 and listed composite
 *   capability against a HAPS BOM line for "wing spar, carbon fibre"
 *   should score ≥50 (STRONG fit) rather than clustering with generic
 *   contract manufacturers in the 30-43 range.
 *
 *   Modifying the live scorer in `cad-lab-supplier-match.ts` would
 *   require re-running matches against every project (and would
 *   invalidate existing scores stored on disk). Instead, this helper
 *   runs a render-time PROMOTION pass: takes the existing matchScore +
 *   the supplier's certifications + capability tags + the matched BOM
 *   row's keywords, and returns a promoted score where capability +
 *   cert evidence is strong.
 *
 * The promotion never lowers a score. It only lifts.
 *
 * Promotion rules (additive, capped at +25):
 *   +20 — supplier has a regulated-industry cert that matches the
 *         project industry (AS9100 + aerospace, ISO 13485 + medical,
 *         IATF 16949 + automotive).
 *   +10 — supplier has a generic quality cert (ISO 9001) and a
 *         capability keyword match.
 *   +5  — supplier description / specialties / process_capabilities
 *         contain a strong keyword (composite / hydrogen / fuel cell /
 *         edge AI / aerospace / cleanroom).
 *
 * The total post-promotion score is capped at 100. Tier label rules
 * (≥50 STRONG / ≥40 PLAUSIBLE / ≥30 WEAK) are unchanged in the renderer.
 *
 * Verified safe: the promotion is a pure function over render-time
 * inputs; no persistence-layer mutation. A subsequent supplier-match
 * regen will compute the canonical score from the upstream rewrite.
 */

const REGULATORY_CERT_MATCHES: Array<{
    industry: string
    certKeywords: RegExp
}> = [
    {
        industry: "aerospace",
        // No \b on the trailing edge — AS9100D / AS9100C suffixes are common.
        certKeywords:
            /(\bAS\s?9100\b|\bAS\s?9100[A-D]\b|\bNADCAP\b|\bEASA Part\b|\bFAA repair station\b)/i,
    },
    {
        industry: "medical",
        certKeywords:
            /(\bISO\s?13485\b|\bFDA registered\b|\bCE medical\b|\bMDR\b|\bMDSAP\b)/i,
    },
    {
        industry: "automotive",
        certKeywords:
            /(\bIATF\s?16949\b|\bTS\s?16949\b|\bVDA 6\.3\b)/i,
    },
    {
        industry: "defence",
        certKeywords:
            /(\bITAR\b|\bCMMC\b|\bMIL-STD\b|\bDFARS\b|\bUK Strategic Export\b|\bNATO supplier\b)/i,
    },
    {
        industry: "nuclear",
        certKeywords: /(\bNQA-1\b|\bASME NQA\b|\bONR licensed\b)/i,
    },
    {
        industry: "food",
        certKeywords: /(\bHACCP\b|\bFSSC 22000\b|\bBRC\b|\bSQF\b)/i,
    },
]

const STRONG_CAPABILITY_KEYWORDS = [
    "composite",
    "carbon fibre",
    "carbon fiber",
    "cfrp",
    "autoclave",
    "hydrogen",
    "pressure vessel",
    "type-iv",
    "fuel cell",
    "PEM stack",
    "edge ai",
    "neural processing",
    "NPU",
    "machine vision",
    "aerospace",
    "cleanroom",
    "class 100",
    "iso 14644",
    "lithium ion",
    "li-ion",
    "battery pack assembly",
    "PCBA",
    "PCB assembly",
    "wiring harness",
    "cable assembly",
    "CNC machining",
    "5-axis",
    "EDM",
    "precision turning",
    "injection mould",
    "injection mold",
    "sheet metal",
    "stamping",
    "die cast",
    "rapid prototype",
    "low-volume manufacturing",
] as const

export interface SupplierPromotionInput {
    matchScore: number | null
    certifications: string[] | null
    description: string | null
    /** Free-form text that may include capability keywords (subcategory,
     * specialties, process_capabilities). */
    capabilityText: string | null
    /** BOM rows the supplier was matched against — provides project
     * context. */
    matchedPartNumbers: string[]
    /** Matched part description (e.g. "Primary Wing Spar, carbon fibre").
     * Used to infer the project's component class for cert-match
     * weighting. */
    matchedPartDescriptions: string[]
}

export interface SupplierPromotionOutput {
    promotedScore: number | null
    /** Boost added (0 if no promotion). */
    boost: number
    /** Reason strings for the founder PDF. */
    reasons: string[]
}

/**
 * Infer project industry from matched-part descriptions. This is
 * coarse-grained — only used for the cert-match boost.
 */
function inferIndustriesFromParts(
    matchedPartDescriptions: string[],
): Set<string> {
    const text = matchedPartDescriptions
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
    const industries = new Set<string>()

    if (
        /\b(aerospace|aircraft|UAV|drone|satellite|aviation|wing|fuselage|composite spar|fuel cell|hydrogen tank)\b/.test(
            text,
        )
    ) {
        industries.add("aerospace")
    }
    if (
        /\b(medical|FDA|implant|catheter|stent|in-vitro|biocompat|clinical)\b/.test(
            text,
        )
    ) {
        industries.add("medical")
    }
    if (
        /\b(automotive|vehicle|electric vehicle|powertrain|infotainment|automotive sensor|brake)\b/.test(
            text,
        )
    ) {
        industries.add("automotive")
    }
    if (/\b(defence|military|signals intelligence|SIGINT|munition)\b/.test(text)) {
        industries.add("defence")
    }
    return industries
}

/**
 * Score promotion. Returns the new score (capped at 100), the boost
 * applied, and the founder-readable reasons.
 */
export function promoteSupplierScore(
    input: SupplierPromotionInput,
): SupplierPromotionOutput {
    if (input.matchScore == null) {
        return {
            promotedScore: null,
            boost: 0,
            reasons: [],
        }
    }

    const reasons: string[] = []
    let boost = 0

    // Build the corpus to search for cert + capability evidence.
    const certCorpus = (input.certifications ?? []).join(" · ").toLowerCase()
    const capCorpus = [
        input.description ?? "",
        input.capabilityText ?? "",
    ]
        .filter((s) => s.length > 0)
        .join(" ")
        .toLowerCase()

    // 1. Regulated-industry cert match
    const projectIndustries = inferIndustriesFromParts(
        input.matchedPartDescriptions,
    )
    let certMatchedIndustry: string | null = null
    for (const { industry, certKeywords } of REGULATORY_CERT_MATCHES) {
        if (
            projectIndustries.has(industry) &&
            certKeywords.test(certCorpus)
        ) {
            boost += 20
            reasons.push(`${industry.toUpperCase()} regulatory cert match`)
            certMatchedIndustry = industry
            break // only one cert-industry boost
        }
    }

    // 2. Strong-capability keyword match (independent of cert)
    let capabilityMatches = 0
    const matchedCapabilities: string[] = []
    for (const keyword of STRONG_CAPABILITY_KEYWORDS) {
        if (capCorpus.includes(keyword.toLowerCase())) {
            capabilityMatches++
            if (matchedCapabilities.length < 2) matchedCapabilities.push(keyword)
        }
    }
    if (capabilityMatches >= 2) {
        boost += 5
        reasons.push(
            `Capability evidence: ${matchedCapabilities.slice(0, 2).join(" · ")}`,
        )
    }

    // 3. Generic quality cert + capability match
    if (
        capabilityMatches >= 1 &&
        certMatchedIndustry === null &&
        /\b(iso 9001|iso9001|en 9100\b)\b/i.test(certCorpus)
    ) {
        boost += 10
        reasons.push("ISO 9001 + capability keyword match")
    }

    // Cap the boost at +25 so a truly wrong supplier with one cert + one
    // keyword does not get pushed into STRONG-fit territory.
    boost = Math.min(boost, 25)

    const promoted = Math.min(input.matchScore + boost, 100)

    return {
        promotedScore: Math.round(promoted * 10) / 10,
        boost,
        reasons,
    }
}
