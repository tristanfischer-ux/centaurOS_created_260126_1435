'use client'

import { useState } from "react"
import { MarketplaceListing } from "@/actions/marketplace"
import { contactExpert } from "@/actions/messaging"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { safeParseAttributes } from "@/lib/marketplace-utils"
import { getCategoryBadgeClasses, type MarketplaceCategory } from "@/lib/marketplace-colors"
import { hasValue, coalesceFilled, sanitiseStringArray } from "@/lib/has-value"
import { buildOsmEmbedUrl, buildOsmViewUrl } from "@/lib/geocoding"
import {
    MapPin,
    Timer,
    Package,
    Users,
    Calendar,
    MessageSquare,
    Loader2,
    ExternalLink,
    Globe,
    ChevronRight,
    FileText,
} from "lucide-react"
import Link from "next/link"
import { VerificationBadge } from "@/components/marketplace/VerificationBadge"
import type { PortfolioItem, Certification, ProviderBadge } from "@/actions/trust-signals"
import type { RatingsSummary, ProviderRating } from "@/actions/ratings"
import type { PublicExecutive } from "@/actions/listing-executives"
import { toast } from "sonner"

// ── Types ────────────────────────────────────────────────────────────────────

interface TrustSignalsData {
    portfolio: PortfolioItem[]
    certifications: Certification[]
    badges: ProviderBadge[]
}

interface RatingsData {
    summary: RatingsSummary | null
    reviews: ProviderRating[]
    error: string | null
}

export interface ListingPage {
    url: string
    page_text: string
}

interface MarketplaceListingDetailProps {
    listing: MarketplaceListing
    trustSignals?: TrustSignalsData | null
    ratings?: RatingsData | null
    executives?: PublicExecutive[]
    pages?: ListingPage[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Capitalise the first letter of a string. */
function capitalise(s: string): string {
    if (!s) return s
    return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Render a string array as chip pills, or null if empty. */
function ChipList({ items, className }: { items: unknown; className?: string }) {
    const arr = sanitiseStringArray(items)
    const valid = arr.filter((s) => hasValue(s))
    if (valid.length === 0) return null
    return (
        <div className={cn("flex flex-wrap gap-1.5", className)}>
            {valid.map((s, i) => (
                <span
                    key={i}
                    className="text-[11px] px-2.5 py-0.5 rounded-full bg-muted text-foreground"
                >
                    {s}
                </span>
            ))}
        </div>
    )
}

/** Section header with mono eyebrow + thin divider below. */
function SectionHeader({ label }: { label: string }) {
    return (
        <>
            <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                {label}
            </h2>
            <div className="border-t border-border/40" />
        </>
    )
}

/** A single field row: label + value. Renders nothing if value has no content. */
function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-0.5 py-2 border-b border-border/30 last:border-0">
            <dt className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {label}
            </dt>
            <dd>{children}</dd>
        </div>
    )
}

/**
 * Truncate plain text at the last word boundary before `maxLen` chars,
 * appending "…" if truncated. Collapses multiple whitespace / newlines.
 */
function truncateAtWord(text: string, maxLen: number): string {
    // Collapse consecutive whitespace/newlines to a single space
    const clean = text.replace(/\s+/g, ' ').trim()
    if (clean.length <= maxLen) return clean
    const cut = clean.slice(0, maxLen)
    const lastSpace = cut.lastIndexOf(' ')
    return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + '…'
}

// ── Main component ────────────────────────────────────────────────────────────

export function MarketplaceListingDetail({
    listing,
    trustSignals,
    ratings,
    executives = [],
    pages = [],
}: MarketplaceListingDetailProps) {
    const attrs = safeParseAttributes(listing.attributes)
    const category = listing.category
    const [isContacting, setIsContacting] = useState(false)

    const handleContact = async () => {
        const providerId = attrs.provider_id as string
        if (!providerId) {
            toast.error('Unable to contact this provider')
            return
        }
        setIsContacting(true)
        try {
            const result = await contactExpert(providerId, listing.id)
            if (result.success) {
                toast.success('Conversation started! Check the Messages sidebar.')
            } else {
                toast.error(result.error || 'Failed to start conversation')
            }
        } catch {
            toast.error('Failed to contact expert')
        } finally {
            setIsContacting(false)
        }
    }

    return (
        <div className="space-y-6">
            {/* Breadcrumb */}
            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Link href="/today" className="hover:text-foreground transition-colors">Home</Link>
                <ChevronRight className="h-3 w-3" />
                <Link href="/marketplace" className="hover:text-foreground transition-colors">Suppliers</Link>
                <ChevronRight className="h-3 w-3" />
                <span className="text-foreground font-medium truncate max-w-[280px]">{listing.title}</span>
            </nav>

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-2">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3 mb-1">
                        <div className="h-8 w-1 bg-international-orange rounded-full shadow-[0_0_8px_rgba(234,88,12,0.6)]" />
                        <Badge
                            variant="secondary"
                            className={cn(
                                "uppercase text-[10px] tracking-wider font-semibold",
                                getCategoryBadgeClasses(category as MarketplaceCategory)
                            )}
                        >
                            {listing.subcategory}
                        </Badge>
                        <VerificationBadge tier={listing.verification_tier} size="md" showLabel />
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight mt-1">
                        {listing.title}
                    </h1>
                </div>

                {/* CTA buttons */}
                <div className="flex items-center gap-2 flex-shrink-0">
                    {attrs.provider_id ? (
                        <Button
                            variant="secondary"
                            onClick={handleContact}
                            disabled={isContacting}
                        >
                            {isContacting ? (
                                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Connecting...</>
                            ) : (
                                <><MessageSquare className="h-4 w-4 mr-2" />Send Enquiry</>
                            )}
                        </Button>
                    ) : hasValue(listing.website_url) ? (
                        <Button variant="secondary" asChild>
                            <a href={String(listing.website_url)} target="_blank" rel="noopener noreferrer">
                                <Globe className="h-4 w-4 mr-2" />
                                Visit Website
                            </a>
                        </Button>
                    ) : null}
                </div>
            </div>

            {/* ── Section 1: What they make ─────────────────────────────────── */}
            <WhatTheyMakeSection listing={listing} attrs={attrs} />

            {/* ── Section 2: Manufacturing specifics ───────────────────────── */}
            <ManufacturingSpecificsSection listing={listing} attrs={attrs} />

            {/* ── Section 3: Project fit and trust ─────────────────────────── */}
            <ProjectFitAndTrustSection listing={listing} attrs={attrs} />

            {/* ── Section 4: Company background ────────────────────────────── */}
            <CompanyBackgroundSection listing={listing} attrs={attrs} />

            {/* Fractional executives (People listings only) */}
            {executives.length > 0 && <ExecutivesDisplay executives={executives} />}

            {/* ── Section 5: From their website ────────────────────────────── */}
            <WebsiteExcerptsSection pages={pages} />

            {/* ── Section 6: Engage ─────────────────────────────────────────── */}
            <EngageSection listing={listing} attrs={attrs} onContact={handleContact} isContacting={isContacting} />
        </div>
    )
}

// ── Section 1: What they make ─────────────────────────────────────────────────

function WhatTheyMakeSection({
    listing,
    attrs,
}: {
    listing: MarketplaceListing
    attrs: Record<string, unknown>
}) {
    const capSummary = attrs.capability_summary ?? listing.description
    const processCaps = Array.isArray(listing.process_capabilities) && listing.process_capabilities.length > 0
        ? listing.process_capabilities
        : []

    // coalesceFilled: prefer column-level if it has real entries; fall back to attrs
    const products = coalesceFilled(listing.products as unknown, attrs.products)
    const specialties = coalesceFilled(listing.specialties as unknown, attrs.specialties)

    // New: primary_capabilities from attrs.marketplace_tags
    const marketplaceTags = (attrs.marketplace_tags ?? {}) as Record<string, unknown>
    const primaryCaps = sanitiseStringArray(marketplaceTags.primary_capabilities)
    const searchKeywords = sanitiseStringArray(attrs.search_keywords)

    // New: key differentiator from competitive_positioning
    const competitivePos = (attrs.competitive_positioning ?? {}) as Record<string, unknown>
    const keyDifferentiator = competitivePos.key_differentiator

    const hasAnything =
        hasValue(capSummary) ||
        (processCaps.length > 0) ||
        hasValue(products) ||
        hasValue(specialties) ||
        hasValue(listing.subcategory) ||
        primaryCaps.length > 0 ||
        hasValue(keyDifferentiator)

    if (!hasAnything) return null

    return (
        <section className="space-y-4">
            <SectionHeader label="What they make" />
            <div className="space-y-4">
                {/* Capability summary paragraph */}
                {hasValue(capSummary) && (
                    <p className="text-sm leading-relaxed text-foreground">
                        {String(capSummary)}
                    </p>
                )}

                {/* Key differentiator — one-line pull quote */}
                {hasValue(keyDifferentiator) && (
                    <p className="text-sm text-muted-foreground italic border-l-2 border-international-orange/40 pl-3">
                        {String(keyDifferentiator)}
                    </p>
                )}

                {/* Process capabilities */}
                {processCaps.length > 0 && (() => {
                    const chips = processCaps.map((c, i) => {
                        const name = typeof c === 'string' ? c : (c as { process_name?: string })?.process_name
                        if (!hasValue(name)) return null
                        return (
                            <span key={i} className="text-[11px] px-2.5 py-0.5 rounded-full bg-muted text-foreground">
                                {name}
                            </span>
                        )
                    }).filter(Boolean)
                    if (chips.length === 0) return null
                    return (
                        <div>
                            <p className="text-xs text-muted-foreground mb-2">Processes</p>
                            <div className="flex flex-wrap gap-1.5">{chips}</div>
                        </div>
                    )
                })()}

                {/* Primary capabilities from attrs.marketplace_tags — deduplicated against process_capabilities */}
                {primaryCaps.length > 0 && (() => {
                    // Build a set of existing process names for dedup
                    const existingProcesses = new Set(
                        processCaps
                            .map((c) => typeof c === 'string' ? c : (c as { process_name?: string })?.process_name ?? '')
                            .map((s) => s.toLowerCase())
                    )
                    const deduped = primaryCaps.filter((s) => !existingProcesses.has(s.toLowerCase()))
                    if (deduped.length === 0) return null
                    return (
                        <div>
                            <p className="text-xs text-muted-foreground mb-2">Primary capabilities</p>
                            <div className="flex flex-wrap gap-1.5">
                                {deduped.map((s, i) => (
                                    <span key={i} className="text-[11px] px-2.5 py-0.5 rounded-full bg-muted text-foreground">
                                        {s}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )
                })()}

                {/* Products */}
                {hasValue(products) && (
                    <div>
                        <p className="text-xs text-muted-foreground mb-2">Products</p>
                        <ChipList items={products} />
                    </div>
                )}

                {/* Specialties */}
                {hasValue(specialties) && (
                    <div>
                        <p className="text-xs text-muted-foreground mb-2">Specialties</p>
                        <ChipList items={specialties} />
                    </div>
                )}

                {/* Subcategory as a contextual tag */}
                {hasValue(listing.subcategory) && (
                    <div>
                        <p className="text-xs text-muted-foreground mb-2">Sector</p>
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full border border-border text-muted-foreground">
                            {listing.subcategory}
                        </span>
                    </div>
                )}

                {/* Search keywords — discoverable-as row */}
                {searchKeywords.length > 0 && (
                    <div>
                        <p className="text-xs text-muted-foreground mb-2">Discoverable as</p>
                        <div className="flex flex-wrap gap-1">
                            {searchKeywords.map((kw, i) => (
                                <span
                                    key={i}
                                    className="text-[10px] px-2 py-0.5 rounded-full bg-background border border-border/50 text-muted-foreground"
                                >
                                    {kw}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </section>
    )
}

// ── Section 2: Manufacturing specifics ───────────────────────────────────────

function ManufacturingSpecificsSection({
    listing,
    attrs,
}: {
    listing: MarketplaceListing
    attrs: Record<string, unknown>
}) {
    // coalesceFilled fixes the empty-array shadowing bug
    const materials = coalesceFilled(listing.materials as unknown, attrs.materials)
    const industries = coalesceFilled(listing.industries as unknown, attrs.industries)
    const equipment = coalesceFilled(listing.key_equipment as unknown, attrs.key_equipment)

    // New fields from attrs.marketplace_tags + attrs.competitive_positioning
    const marketplaceTags = (attrs.marketplace_tags ?? {}) as Record<string, unknown>
    const competitivePos = (attrs.competitive_positioning ?? {}) as Record<string, unknown>

    const materialsExpertise = sanitiseStringArray(marketplaceTags.materials_expertise)
    const batchSize = competitivePos.batch_size ?? marketplaceTags.batch_size

    // Production type — split on '|' into chips
    const productionTypeRaw = competitivePos.production_type
    const productionTypeChips: string[] = hasValue(productionTypeRaw)
        ? String(productionTypeRaw).split('|').map((s) => s.trim()).filter((s) => hasValue(s))
        : []

    const hasAnything =
        hasValue(materials) ||
        hasValue(industries) ||
        hasValue(equipment) ||
        materialsExpertise.length > 0 ||
        hasValue(batchSize) ||
        productionTypeChips.length > 0

    if (!hasAnything) return null

    return (
        <section className="space-y-4">
            <SectionHeader label="Manufacturing specifics" />
            <div className="space-y-4">
                {hasValue(materials) && (
                    <div>
                        <p className="text-xs text-muted-foreground mb-2">Materials</p>
                        <ChipList items={materials} />
                    </div>
                )}

                {/* Materials expertise — separate from raw materials list */}
                {materialsExpertise.length > 0 && (
                    <div>
                        <p className="text-xs text-muted-foreground mb-2">Materials expertise</p>
                        <div className="flex flex-wrap gap-1.5">
                            {materialsExpertise.map((s, i) => (
                                <span key={i} className="text-[11px] px-2.5 py-0.5 rounded-full bg-muted text-foreground">
                                    {s}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {hasValue(industries) && (
                    <div>
                        <p className="text-xs text-muted-foreground mb-2">Industries served</p>
                        <ChipList items={industries} />
                    </div>
                )}
                {hasValue(equipment) && (
                    <div>
                        <p className="text-xs text-muted-foreground mb-2">Key equipment</p>
                        <ChipList items={equipment} />
                    </div>
                )}

                {/* Batch size */}
                {hasValue(batchSize) && (
                    <div>
                        <p className="text-xs text-muted-foreground mb-2">Batch size</p>
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-muted text-foreground">
                            {String(batchSize)}
                        </span>
                    </div>
                )}

                {/* Production type — chips split on '|' */}
                {productionTypeChips.length > 0 && (
                    <div>
                        <p className="text-xs text-muted-foreground mb-2">Production type</p>
                        <div className="flex flex-wrap gap-1.5">
                            {productionTypeChips.map((s, i) => (
                                <span key={i} className="text-[11px] px-2.5 py-0.5 rounded-full bg-muted text-foreground capitalize">
                                    {s.replace(/_/g, ' ')}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </section>
    )
}

// ── Section 3: Project fit and trust ─────────────────────────────────────────

function ProjectFitAndTrustSection({
    listing,
    attrs,
}: {
    listing: MarketplaceListing
    attrs: Record<string, unknown>
}) {
    const leadTime = coalesceFilled(listing.lead_time as unknown, attrs.lead_time)
    const minOrder = coalesceFilled(listing.minimum_order as unknown, attrs.minimum_order)
    const finHealth = coalesceFilled(listing.financial_health as unknown, attrs.financial_health)
    const prodCapacity = coalesceFilled(listing.production_capacity as unknown, attrs.production_capacity)
    const qualitySystems = coalesceFilled(listing.quality_systems as unknown, attrs.quality_systems)

    // Certifications — always sanitise to handle the malformed ISO cert shape
    const certRaw = coalesceFilled(listing.certifications as unknown, attrs.certifications)
    const certifications = sanitiseStringArray(certRaw)

    const securityClrRaw = coalesceFilled(listing.security_clearances as unknown, attrs.security_clearances)
    const securityClearances = sanitiseStringArray(securityClrRaw)

    const dqs = listing.data_quality_score
    const iso14001 = listing.iso_14001
    const carbonDisclosed = listing.carbon_disclosed
    const verTier = listing.verification_tier

    // New: market_segment, technical_level, pricing_tier from attrs.competitive_positioning
    const competitivePos = (attrs.competitive_positioning ?? {}) as Record<string, unknown>
    const marketSegment = competitivePos.market_segment
    const technicalLevel = competitivePos.technical_level
    const pricingTier = competitivePos.pricing_tier

    const hasAnything =
        hasValue(leadTime) || hasValue(minOrder) || hasValue(finHealth) ||
        hasValue(prodCapacity) || certifications.length > 0 || hasValue(qualitySystems) ||
        (dqs != null) || (iso14001 === true) || (carbonDisclosed === true) ||
        securityClearances.length > 0 || hasValue(verTier) ||
        hasValue(marketSegment) || hasValue(technicalLevel) ||
        (hasValue(pricingTier) && String(pricingTier).toLowerCase() !== 'unknown')

    if (!hasAnything) return null

    const healthColour = (h: string) => {
        const lower = h.toLowerCase()
        if (lower === 'good') return 'text-success'
        if (lower === 'at-risk' || lower === 'caution') return 'text-warning'
        if (lower === 'insolvent' || lower === 'risk') return 'text-destructive'
        return 'text-foreground'
    }

    return (
        <section className="space-y-4">
            <SectionHeader label="Project fit and trust" />
            <dl className="space-y-0">
                {hasValue(leadTime) && (
                    <FieldRow label="Lead time">
                        <span className="text-sm text-foreground flex items-center gap-1.5">
                            <Timer className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            {String(leadTime)}
                        </span>
                    </FieldRow>
                )}
                {hasValue(minOrder) && (
                    <FieldRow label="Minimum order">
                        <span className="text-sm text-foreground flex items-center gap-1.5">
                            <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            {String(minOrder)}
                        </span>
                    </FieldRow>
                )}
                {hasValue(finHealth) && (
                    <FieldRow label="Financial health">
                        <span className={cn("text-sm font-medium capitalize", healthColour(String(finHealth)))}>
                            {String(finHealth)}
                        </span>
                    </FieldRow>
                )}
                {hasValue(prodCapacity) && (
                    <FieldRow label="Production capacity">
                        <span className="text-sm text-foreground">{String(prodCapacity)}</span>
                    </FieldRow>
                )}
                {certifications.length > 0 && (
                    <FieldRow label="Certifications">
                        <ChipList items={certifications} />
                    </FieldRow>
                )}
                {hasValue(verTier) && (
                    <FieldRow label="Verification">
                        <span className="text-sm text-foreground capitalize">{verTier}</span>
                    </FieldRow>
                )}
                {hasValue(qualitySystems) && (
                    <FieldRow label="Quality systems">
                        <span className="text-sm text-foreground">{String(qualitySystems)}</span>
                    </FieldRow>
                )}
                {dqs != null && (
                    <FieldRow label="Data quality score">
                        <span className={cn(
                            "text-sm font-semibold tabular-nums",
                            dqs >= 80 ? 'text-success' : dqs >= 50 ? 'text-warning' : 'text-destructive'
                        )}>
                            {dqs} / 100
                        </span>
                    </FieldRow>
                )}
                {securityClearances.length > 0 && (
                    <FieldRow label="Security clearances">
                        <ChipList items={securityClearances} />
                    </FieldRow>
                )}

                {/* Market segment */}
                {hasValue(marketSegment) && (
                    <FieldRow label="Market segment">
                        <span className="text-sm text-foreground capitalize">
                            {capitalise(String(marketSegment).replace(/_/g, ' '))}
                        </span>
                    </FieldRow>
                )}

                {/* Technical level */}
                {hasValue(technicalLevel) && (
                    <FieldRow label="Technical level">
                        <span className="text-sm text-foreground capitalize">
                            {capitalise(String(technicalLevel).replace(/_/g, ' '))}
                        </span>
                    </FieldRow>
                )}

                {/* Pricing tier — only if not "unknown" */}
                {hasValue(pricingTier) && String(pricingTier).toLowerCase() !== 'unknown' && (
                    <FieldRow label="Pricing tier">
                        <span className="text-sm text-foreground capitalize">
                            {capitalise(String(pricingTier).replace(/_/g, ' '))}
                        </span>
                    </FieldRow>
                )}

                {/* Sustainability flags — only shown when true */}
                {(iso14001 === true || carbonDisclosed === true) && (
                    <FieldRow label="Sustainability">
                        <div className="flex flex-wrap gap-2">
                            {iso14001 === true && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success font-medium">
                                    ISO 14001
                                </span>
                            )}
                            {carbonDisclosed === true && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-success/10 text-success font-medium">
                                    Carbon disclosed
                                </span>
                            )}
                        </div>
                    </FieldRow>
                )}
            </dl>
        </section>
    )
}

// ── Section 4: Company background ────────────────────────────────────────────

function CompanyBackgroundSection({
    listing,
    attrs,
}: {
    listing: MarketplaceListing
    attrs: Record<string, unknown>
}) {
    const city = coalesceFilled(listing.city as unknown, attrs.city)
    const country = coalesceFilled(listing.country as unknown, attrs.country)
    const address = coalesceFilled(listing.address as unknown, attrs.address, attrs.ch_registered_address)

    // attrs.location — use if richer than city+country (i.e. contains a street-level component)
    const attrsLocation = attrs.location

    const companySize = coalesceFilled(listing.company_size as unknown, attrs.company_size)
    const employeeCountExact = coalesceFilled(listing.employee_count_exact as unknown, attrs.employee_count_exact)
    const foundedYear = coalesceFilled(listing.founded_year as unknown, attrs.founded_year, attrs.year_founded)
    const keyPeopleRaw = coalesceFilled(listing.key_people as unknown, attrs.key_people)

    // attrs.employees band — shown only when no exact count and no company_size
    const employeesBand = attrs.employees

    const directors = Array.isArray(attrs.ch_directors) ? attrs.ch_directors : []
    const pscs = Array.isArray(attrs.ch_psc) ? attrs.ch_psc : []
    const sicCodes = Array.isArray(attrs.ch_sic_codes) ? attrs.ch_sic_codes : []
    const chNumber = attrs.ch_company_number
    const chStatus = attrs.ch_company_status
    const chType = attrs.ch_company_type

    const locationStr = [city, country].filter((v) => hasValue(v)).map(String).join(', ')

    // Use attrs.location if it's richer (contains a digit or is longer than city+country)
    const attrsLocationStr = hasValue(attrsLocation) ? String(attrsLocation) : ''
    const useAttrsLocation =
        attrsLocationStr.length > 0 &&
        (attrsLocationStr.length > locationStr.length + 5 || /\d/.test(attrsLocationStr))

    const displayLocation = useAttrsLocation ? attrsLocationStr : locationStr

    const keyPeople = Array.isArray(keyPeopleRaw) ? keyPeopleRaw : []

    const hasAnything =
        hasValue(displayLocation) || hasValue(address) ||
        hasValue(companySize) || hasValue(employeeCountExact) ||
        (!hasValue(employeeCountExact) && !hasValue(companySize) && hasValue(employeesBand)) ||
        hasValue(foundedYear) || keyPeople.length > 0 ||
        directors.length > 0 || pscs.length > 0 || sicCodes.length > 0 ||
        hasValue(chNumber) || hasValue(chStatus) || hasValue(chType)

    if (!hasAnything) return null

    return (
        <section className="space-y-4">
            <SectionHeader label="Company background" />
            <dl className="space-y-0">
                {hasValue(displayLocation) && (
                    <FieldRow label="Location">
                        <span className="text-sm text-foreground flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            {displayLocation}
                        </span>
                    </FieldRow>
                )}
                {hasValue(address) && (() => {
                    const addrStr = String(address)
                    // Suppress the address if it's just a city/country variant (no street
                    // number or road name) and we already have a city+country location string.
                    const isStreetLevel = /\d/.test(addrStr) || addrStr.length > 50
                    if (!isStreetLevel && hasValue(displayLocation)) return null
                    return (
                        <FieldRow label={hasValue(displayLocation) ? "Registered address" : "Address"}>
                            <span className="text-sm text-foreground">{addrStr}</span>
                        </FieldRow>
                    )
                })()}
                {hasValue(employeeCountExact) && (
                    <FieldRow label="Employees">
                        <span className="text-sm text-foreground flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            {Number(employeeCountExact).toLocaleString()}
                        </span>
                    </FieldRow>
                )}
                {!hasValue(employeeCountExact) && hasValue(companySize) && (
                    <FieldRow label="Company size">
                        <span className="text-sm text-foreground flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            {String(companySize)}
                        </span>
                    </FieldRow>
                )}
                {/* attrs.employees band — only when no exact count and no company_size */}
                {!hasValue(employeeCountExact) && !hasValue(companySize) && hasValue(employeesBand) && (
                    <FieldRow label="Company size">
                        <span className="text-sm text-foreground flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            {String(employeesBand)} employees
                        </span>
                    </FieldRow>
                )}
                {hasValue(foundedYear) && (
                    <FieldRow label="Founded">
                        <span className="text-sm text-foreground flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            {String(foundedYear)}
                            <span className="text-xs text-muted-foreground">
                                ({new Date().getFullYear() - Number(foundedYear)} years)
                            </span>
                        </span>
                    </FieldRow>
                )}
                {hasValue(chStatus) && (
                    <FieldRow label="Companies House status">
                        <span className={cn(
                            "text-xs px-2 py-0.5 rounded-full font-medium capitalize",
                            String(chStatus) === 'active' ? 'bg-success/10 text-success'
                                : String(chStatus) === 'dissolved' ? 'bg-destructive/10 text-destructive'
                                : 'bg-muted text-muted-foreground'
                        )}>
                            {String(chStatus)}
                        </span>
                    </FieldRow>
                )}
                {hasValue(chNumber) && (
                    <FieldRow label="Companies House number">
                        <span className="text-sm text-foreground font-mono">{String(chNumber)}</span>
                    </FieldRow>
                )}
                {hasValue(chType) && (
                    <FieldRow label="Companies House type">
                        <span className="text-sm text-foreground capitalize">{String(chType)}</span>
                    </FieldRow>
                )}

                {/* Key people */}
                {keyPeople.length > 0 && (
                    <FieldRow label="Key people">
                        <div className="space-y-1">
                            {(keyPeople as Array<{ name?: string; role?: string; title?: string }>).map((p, i) => {
                                if (!hasValue(p?.name)) return null
                                return (
                                    <div key={i} className="text-sm">
                                        <strong className="text-foreground">{p.name}</strong>
                                        {hasValue(p.role || p.title) && (
                                            <span className="text-muted-foreground"> — {p.role || p.title}</span>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </FieldRow>
                )}

                {/* CH Directors */}
                {directors.length > 0 && (
                    <FieldRow label="Directors">
                        <div className="space-y-1">
                            {(directors as Array<{ name?: string; appointed_on?: string }>).map((d, i) => {
                                if (!hasValue(d?.name)) return null
                                return (
                                    <div key={i} className="flex items-center justify-between text-sm">
                                        <span className="text-foreground font-medium">{d.name}</span>
                                        {hasValue(d.appointed_on) && (
                                            <span className="text-xs text-muted-foreground">
                                                Appointed {new Date(d.appointed_on!).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                                            </span>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </FieldRow>
                )}

                {/* PSC */}
                {pscs.length > 0 && (
                    <FieldRow label="Persons of significant control">
                        <div className="space-y-1">
                            {(pscs as Array<{ name?: string; natures_of_control?: string[] }>).map((p, i) => {
                                if (!hasValue(p?.name)) return null
                                return (
                                    <div key={i} className="text-sm">
                                        <span className="text-foreground font-medium">{p.name}</span>
                                        {p.natures_of_control && p.natures_of_control.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-0.5">
                                                {p.natures_of_control.map((n, j) => (
                                                    <Badge key={j} variant="secondary" className="text-[10px]">
                                                        {n.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                                                    </Badge>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </FieldRow>
                )}

                {/* SIC codes */}
                {sicCodes.length > 0 && (
                    <FieldRow label="SIC codes">
                        <div className="flex flex-wrap gap-1.5">
                            {(sicCodes as string[]).map((code, i) => (
                                <Badge key={i} variant="secondary" className="text-xs font-mono">{code}</Badge>
                            ))}
                        </div>
                    </FieldRow>
                )}
            </dl>
        </section>
    )
}

// ── Section 5: From their website ────────────────────────────────────────────

function WebsiteExcerptsSection({ pages }: { pages: ListingPage[] }) {
    if (!pages || pages.length === 0) return null

    // Pick the 2 longest page_text rows
    const sorted = [...pages]
        .filter((p) => p.page_text && p.page_text.trim().length > 50)
        .sort((a, b) => b.page_text.length - a.page_text.length)
        .slice(0, 2)

    if (sorted.length === 0) return null

    return (
        <section className="space-y-4">
            <SectionHeader label="From their website" />
            <div className="space-y-3">
                {sorted.map((page, i) => {
                    let hostname = ''
                    try {
                        hostname = new URL(page.url).hostname.replace(/^www\./, '')
                    } catch {
                        hostname = page.url
                    }
                    const excerpt = truncateAtWord(page.page_text, 400)
                    return (
                        <Card key={i} className="bg-muted/30">
                            <CardContent className="pt-4 pb-4 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                        <span className="text-xs font-medium text-muted-foreground truncate">
                                            Excerpt from {hostname}
                                        </span>
                                    </div>
                                    <a
                                        href={page.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[10px] text-international-orange hover:underline inline-flex items-center gap-0.5 flex-shrink-0"
                                    >
                                        View source
                                        <ExternalLink className="h-2.5 w-2.5" />
                                    </a>
                                </div>
                                <p className="text-sm text-foreground/80 leading-relaxed">
                                    {excerpt}
                                </p>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>
        </section>
    )
}

// ── Section 6: Engage ─────────────────────────────────────────────────────────

function EngageSection({
    listing,
    attrs,
    onContact,
    isContacting,
}: {
    listing: MarketplaceListing
    attrs: Record<string, unknown>
    onContact: () => void
    isContacting: boolean
}) {
    const websiteUrl = coalesceFilled(listing.website_url as unknown, attrs.website_url)
    const linkedinUrl = attrs.linkedin_url ?? attrs.contact_linkedin

    // Map — only shown if geocoding succeeded
    const lat = listing.latitude
    const lon = listing.longitude
    const hasMap = lat != null && lon != null

    const hasAnything =
        hasValue(websiteUrl) || hasValue(linkedinUrl) ||
        hasValue(listing.contact_email) || hasValue(attrs.contact_email) ||
        hasValue(attrs.provider_id) || hasMap

    if (!hasAnything) return null

    return (
        <section className="space-y-4">
            <SectionHeader label="Engage" />
            <div className="space-y-4">
                {/* Primary CTAs */}
                <div className="flex flex-wrap gap-3">
                    {hasValue(attrs.provider_id) && (
                        <Button variant="secondary" onClick={onContact} disabled={isContacting}>
                            {isContacting ? (
                                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Connecting...</>
                            ) : (
                                <><MessageSquare className="h-4 w-4 mr-2" />Send Enquiry</>
                            )}
                        </Button>
                    )}
                    {hasValue(websiteUrl) && (
                        <Button variant="outline" asChild>
                            <a href={String(websiteUrl)} target="_blank" rel="noopener noreferrer">
                                <Globe className="h-4 w-4 mr-2" />
                                Visit website
                                <ExternalLink className="h-3 w-3 ml-1.5 opacity-60" />
                            </a>
                        </Button>
                    )}
                    {hasValue(linkedinUrl) && (
                        <Button variant="outline" asChild>
                            <a href={String(linkedinUrl)} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4 mr-2" />
                                LinkedIn profile
                            </a>
                        </Button>
                    )}
                </div>

                {/* Map — only rendered when geocoding succeeded */}
                {hasMap && (
                    <div className="space-y-1.5">
                        <iframe
                            src={buildOsmEmbedUrl(lat!, lon!)}
                            width="100%"
                            height={320}
                            style={{ border: 0, borderRadius: 8 }}
                            loading="lazy"
                            title={`${listing.title} location`}
                        />
                        <div className="flex items-center justify-between text-xs text-muted-foreground px-0.5">
                            <span>
                                © <a
                                    href="https://www.openstreetmap.org/copyright"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline hover:text-foreground"
                                >
                                    OpenStreetMap contributors
                                </a>
                            </span>
                            <a
                                href={buildOsmViewUrl(lat!, lon!)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-foreground underline inline-flex items-center gap-1"
                            >
                                View on OpenStreetMap
                                <ExternalLink className="h-3 w-3" />
                            </a>
                        </div>
                    </div>
                )}
            </div>
        </section>
    )
}

// ── Executives Display (People listings) ─────────────────────────────────────

const AVAILABILITY_LABELS: Record<string, string> = {
    full_time: 'Full-Time',
    part_time: 'Part-Time',
    advisory: 'Advisory',
    project_based: 'Project-Based',
}

const CURRENCY_SYMBOLS: Record<string, string> = {
    GBP: '£',
    USD: '$',
    EUR: '€',
}

function formatDayRate(rate: number, currency: string | null): string {
    const symbol = CURRENCY_SYMBOLS[currency ?? 'GBP'] ?? currency ?? '£'
    return `${symbol}${rate.toLocaleString()}/day`
}

function ExecutivesDisplay({ executives }: { executives: PublicExecutive[] }) {
    return (
        <Card>
            <CardContent className="pt-4 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                    <Users className="h-5 w-5 text-international-orange" />
                    <h2 className="text-base font-semibold text-foreground">Fractional Executives</h2>
                </div>
                {executives.map((exec) => (
                    <div key={exec.id} className="rounded-lg bg-muted/40 p-4">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-foreground">{exec.full_name}</span>
                            {exec.title && (
                                <span className="text-sm text-muted-foreground">&middot; {exec.title}</span>
                            )}
                            <Badge variant="secondary" className="text-xs">
                                {AVAILABILITY_LABELS[exec.availability] ?? exec.availability}
                            </Badge>
                            {exec.day_rate != null && (
                                <span className="text-sm font-medium text-international-orange">
                                    {formatDayRate(exec.day_rate, exec.currency)}
                                </span>
                            )}
                        </div>
                        {exec.bio && (
                            <p className="text-sm text-muted-foreground mt-1">{exec.bio}</p>
                        )}
                        {exec.specializations && exec.specializations.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                                {exec.specializations.map((s) => (
                                    <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                                ))}
                            </div>
                        )}
                        {exec.linkedin_url && (
                            <a
                                href={exec.linkedin_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-international-orange hover:underline inline-flex items-center gap-1 mt-2"
                            >
                                <ExternalLink className="h-3 w-3" />
                                LinkedIn Profile
                            </a>
                        )}
                    </div>
                ))}
            </CardContent>
        </Card>
    )
}
