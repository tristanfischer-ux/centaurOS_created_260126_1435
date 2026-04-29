/**
 * @file standards-validator.ts — Regulatory standards cross-reference validation.
 *
 * @description Council fixes C1 + C5 (GPT-5.5 + Mistral + Kimi, critical):
 *   C1: Chase can hallucinate or cite withdrawn/superseded regulatory standards.
 *   C5: Missing regulatory domains — electromagnetic compatibility, restriction of
 *       hazardous substances, waste electrical equipment, machinery safety, food contact.
 *
 * This module runs AFTER Chase assembles standards and BEFORE the triage assigns
 * statuses. It cross-references each standard against:
 *   1. A known-superseded map (old standard → replacement)
 *   2. A mandatory domain checklist per product class
 *   3. Version/year/edition completeness
 *
 * @related
 *   - regulatory-triage.ts    — calls validateStandards() before assigning statuses
 *   - run-chase-research.ts   — triggers triage after extraction
 *   - export-project-pdf.tsx  — renders warnings from validation
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export interface StandardInput {
    id: string
    name: string
}

export interface SupersededEntry {
    oldStandard: string
    replacement: string
    reason: string
}

export interface MissingDomain {
    domain: string
    mandatoryStandards: string[]
    reason: string
}

export interface StandardsValidationResult {
    superseded: SupersededEntry[]
    missingDomains: MissingDomain[]
    unversioned: string[]
    valid: string[]
    warnings: string[]
}

// ─── Known superseded standards ────────────────────────────────────────────

const KNOWN_SUPERSEDED: Array<{
    pattern: RegExp
    replacement: string
    reason: string
}> = [
    {
        pattern: /EN\s*60950[\s-]*1/i,
        replacement: "EN 62368-1 (Information technology equipment — Safety)",
        reason: "EN 60950-1 was withdrawn in 2020 and replaced by EN 62368-1",
    },
    {
        pattern: /IEC\s*61508[\s:]*2000/i,
        replacement: "IEC 61508:2010 (Functional safety of electrical/electronic systems)",
        reason: "IEC 61508:2000 was superseded by the 2010 edition",
    },
    {
        pattern: /EN\s*50438/i,
        replacement: "EN 50549-1/2 (Requirements for generating plants to be connected to distribution/transmission networks)",
        reason: "EN 50438 was withdrawn and replaced by the EN 50549 series",
    },
    {
        pattern: /BS\s*7671[\s:]*2008/i,
        replacement: "BS 7671:2018+A2:2022 (Requirements for Electrical Installations)",
        reason: "BS 7671:2008 was superseded; current edition is 2018+A2:2022 (18th Edition)",
    },
    {
        pattern: /IEC\s*62133[\s:]*2002/i,
        replacement: "IEC 62133-2:2017 (Secondary lithium cells and batteries for use in portable applications — Safety)",
        reason: "IEC 62133:2002 was superseded by the 2017 edition split into Part 1 (nickel) and Part 2 (lithium)",
    },
    {
        pattern: /Machinery\s*Directive\s*98\/37/i,
        replacement: "Directive 2006/42/EC (Machinery Directive, current)",
        reason: "Machinery Directive 98/37/EC was repealed and replaced by 2006/42/EC",
    },
    {
        pattern: /Low\s*Voltage\s*Directive\s*73\/23/i,
        replacement: "Directive 2014/35/EU (Low Voltage Directive, current)",
        reason: "Directive 73/23/EEC was repealed and replaced by 2014/35/EU",
    },
    {
        pattern: /EMC\s*Directive\s*89\/336/i,
        replacement: "Directive 2014/30/EU (Electromagnetic Compatibility Directive, current)",
        reason: "Directive 89/336/EEC was repealed and replaced by 2014/30/EU",
    },
    {
        pattern: /RoHS\s*Directive\s*2002\/95/i,
        replacement: "Directive 2011/65/EU (Restriction of Hazardous Substances Directive, recast)",
        reason: "RoHS Directive 2002/95/EC was recast as 2011/65/EU",
    },
    {
        pattern: /ATEX\s*Directive\s*94\/9/i,
        replacement: "Directive 2014/34/EU (ATEX Equipment Directive, current)",
        reason: "ATEX Directive 94/9/EC was repealed and replaced by 2014/34/EU",
    },
]

// ─── Mandatory domain checklist ────────────────────────────────────────────

type ProductDomain =
    | "electronics"
    | "battery-energy-storage"
    | "machinery"
    | "food-contact"
    | "wireless"
    | "consumer-electrical"
    | "pressurised-equipment"

interface DomainChecklist {
    domain: ProductDomain
    label: string
    mandatoryStandards: string[]
    productKeywords: string[]
}

const DOMAIN_CHECKLISTS: DomainChecklist[] = [
    {
        domain: "electronics",
        label: "Electromagnetic compatibility and hazardous substance restriction",
        mandatoryStandards: [
            "EN 55032 (Electromagnetic compatibility of multimedia equipment — Emission requirements)",
            "EN 55035 (Electromagnetic compatibility of multimedia equipment — Immunity requirements)",
            "Directive 2011/65/EU (Restriction of Hazardous Substances)",
            "Regulation (EC) No 1907/2006 (Registration, Evaluation, Authorisation and Restriction of Chemicals)",
            "Directive 2012/19/EU (Waste Electrical and Electronic Equipment)",
        ],
        productKeywords: [
            "electronics", "electronic", "circuit", "pcb", "microcontroller",
            "sensor", "camera", "led", "display", "processor", "iot",
            "connected", "smart", "edge", "compute", "wireless",
        ],
    },
    {
        domain: "battery-energy-storage",
        label: "Battery and energy storage safety",
        mandatoryStandards: [
            "IEC 62619 (Secondary lithium cells and batteries for industrial applications — Safety)",
            "UN 38.3 (Transport of dangerous goods — Lithium batteries)",
            "NFPA 855 (Standard for the Installation of Stationary Energy Storage Systems)",
        ],
        productKeywords: [
            "battery", "bess", "energy storage", "lithium", "li-ion",
            "cell", "pack", "kwh", "mwh", "charge", "discharge",
            "inverter", "bms", "battery management",
        ],
    },
    {
        domain: "machinery",
        label: "Machinery safety",
        mandatoryStandards: [
            "Directive 2006/42/EC (Machinery Directive)",
        ],
        productKeywords: [
            "machinery", "machine", "conveyor", "actuator", "motor",
            "pump", "compressor", "press", "crane", "hoist", "robot",
            "automated", "assembly line", "production line",
        ],
    },
    {
        domain: "food-contact",
        label: "Food contact materials",
        mandatoryStandards: [
            "Regulation (EC) No 1935/2004 (Materials and articles intended to come into contact with food)",
        ],
        productKeywords: [
            "food", "agricultural", "farming", "horticulture", "irrigation",
            "vertical farm", "leafy green", "crop", "growing", "nutrient",
            "hydroponic", "aquaponic",
        ],
    },
    {
        domain: "wireless",
        label: "Radio equipment",
        mandatoryStandards: [
            "Directive 2014/53/EU (Radio Equipment Directive)",
        ],
        productKeywords: [
            "wireless", "wifi", "bluetooth", "rf", "radio", "antenna",
            "cellular", "lora", "zigbee", "5g", "4g", "lte", "gsm",
            "nfc", "uwb", "satellite",
        ],
    },
    {
        domain: "consumer-electrical",
        label: "Electrical safety (consumer products)",
        mandatoryStandards: [
            "Directive 2014/35/EU (Low Voltage Directive)",
            "Directive 2014/30/EU (Electromagnetic Compatibility Directive)",
        ],
        productKeywords: [
            "consumer", "household", "domestic", "appliance", "charger",
            "power supply", "adapter", "mains", "240v", "230v", "120v",
        ],
    },
    {
        domain: "pressurised-equipment",
        label: "Pressure equipment",
        mandatoryStandards: [
            "Directive 2014/68/EU (Pressure Equipment Directive)",
        ],
        productKeywords: [
            "pressure vessel", "boiler", "autoclave", "bar", "mpa",
            "pressurised", "pressurized", "hydraulic", "pneumatic",
            "compressed gas", "hydrogen", "tank", "reverse osmosis",
            "membrane", "desalination",
        ],
    },
]

// ─── Version/year detection ────────────────────────────────────────────────

const YEAR_PATTERN = /(?:19|20)\d{2}/
const VERSION_PATTERN = /:\s*(?:19|20)\d{2}|edition\s+\d|version\s+\d|v\d/i

function hasVersionOrYear(standardName: string): boolean {
    return YEAR_PATTERN.test(standardName) || VERSION_PATTERN.test(standardName)
}

// ─── Core validator ────────────────────────────────────────────────────────

/**
 * Validate a list of standards identified by Chase against:
 *   1. Known superseded standards (flag with replacement)
 *   2. Mandatory domain checklist for the product class (flag missing domains)
 *   3. Version/year completeness (flag unversioned standards)
 *
 * @param standards    Standards extracted by Chase (id + name).
 * @param productClass Free-text product class or brief subject for domain matching.
 */
export function validateStandards(
    standards: StandardInput[],
    productClass: string,
): StandardsValidationResult {
    const superseded: SupersededEntry[] = []
    const unversioned: string[] = []
    const valid: string[] = []
    const warnings: string[] = []
    const lowerProductClass = productClass.toLowerCase()

    // 1. Check each standard against superseded list and version completeness
    for (const std of standards) {
        const combined = `${std.id} ${std.name}`
        let isSuperseded = false

        for (const rule of KNOWN_SUPERSEDED) {
            if (rule.pattern.test(combined)) {
                superseded.push({
                    oldStandard: combined.trim(),
                    replacement: rule.replacement,
                    reason: rule.reason,
                })
                isSuperseded = true
                break
            }
        }

        if (!isSuperseded) {
            if (!hasVersionOrYear(combined)) {
                unversioned.push(combined.trim())
            } else {
                valid.push(combined.trim())
            }
        }
    }

    // 2. Check mandatory domain checklist
    const applicableDomains = DOMAIN_CHECKLISTS.filter((checklist) =>
        checklist.productKeywords.some((kw) => lowerProductClass.includes(kw)),
    )

    const standardsText = standards
        .map((s) => `${s.id} ${s.name}`.toLowerCase())
        .join(" | ")

    const missingDomains: MissingDomain[] = []

    for (const domain of applicableDomains) {
        const coveredStandards = domain.mandatoryStandards.filter((mandatory) => {
            const mandatoryLower = mandatory.toLowerCase()
            // Extract key identifiers from the mandatory standard string
            const keyTerms = mandatoryLower
                .replace(/\(.*?\)/g, "")
                .split(/[\s/,]+/)
                .filter((t) => t.length > 2)

            // Check if any of the identified standards match
            return keyTerms.some((term) => standardsText.includes(term))
        })

        const uncoveredStandards = domain.mandatoryStandards.filter(
            (m) => !coveredStandards.includes(m),
        )

        if (uncoveredStandards.length > 0) {
            missingDomains.push({
                domain: domain.label,
                mandatoryStandards: uncoveredStandards,
                reason: `Product matches ${domain.domain} domain but these mandatory standards are not in the compliance matrix`,
            })
        }
    }

    // 3. Build warnings
    if (superseded.length > 0) {
        warnings.push(
            `${superseded.length} standard${superseded.length > 1 ? "s" : ""} cited may be withdrawn or superseded. Check current editions before relying on compliance assessments.`,
        )
    }

    if (missingDomains.length > 0) {
        const domains = missingDomains.map((d) => d.domain).join(", ")
        warnings.push(
            `Potentially missing regulatory domains: ${domains}. Review the mandatory standards for these domains.`,
        )
    }

    if (unversioned.length > 0) {
        warnings.push(
            `${unversioned.length} standard${unversioned.length > 1 ? "s" : ""} cited without a version, year, or edition number. Compliance requires citing a specific edition.`,
        )
    }

    return { superseded, missingDomains, unversioned, valid, warnings }
}

/**
 * Format validation warnings for PDF display.
 */
export function formatStandardsWarnings(
    result: StandardsValidationResult,
): string[] {
    const output: string[] = []

    for (const entry of result.superseded) {
        output.push(
            `⚠ ${entry.oldStandard} — ${entry.reason}. Current replacement: ${entry.replacement}.`,
        )
    }

    for (const domain of result.missingDomains) {
        output.push(
            `⚠ Missing ${domain.domain} standards: ${domain.mandatoryStandards.join("; ")}. ${domain.reason}.`,
        )
    }

    for (const std of result.unversioned) {
        output.push(
            `ℹ ${std} — no version or year cited. Confirm the applicable edition.`,
        )
    }

    return output
}
