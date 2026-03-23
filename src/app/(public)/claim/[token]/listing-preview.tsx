'use client'

/**
 * @file listing-preview.tsx — Displays listing data on the claim landing page.
 * Shows the "curiosity payoff" — what we have on the company.
 */

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    MapPin,
    Calendar,
    Users,
    Globe,
    ChevronDown,
    ChevronUp,
    Wrench,
} from 'lucide-react'
import type { ListingPreview as ListingPreviewType } from '@/actions/listing-claims'

/** Mask email for display: j***@example.com */
function maskEmail(email: string): string {
    const [local, domain] = email.split('@')
    if (!domain) return '***'
    return `${local.slice(0, 1)}***@${domain}`
}

interface ListingPreviewProps {
    preview: ListingPreviewType
}

export function ListingPreview({ preview }: ListingPreviewProps) {
    const [descExpanded, setDescExpanded] = useState(false)

    const description = preview.description ?? ''
    const isLongDesc = description.length > 300
    const displayDesc = isLongDesc && !descExpanded
        ? description.slice(0, 300) + '…'
        : description

    const specialties = asStringArray(preview.specialties)
    const certifications = asStringArray(preview.certifications)
    const materials = asStringArray(preview.materials)
    const equipment = asStringArray(preview.key_equipment)
    const industries = asStringArray(preview.industries)
    const products = asStringArray(preview.products)
    const capabilities = asObjectArray(preview.process_capabilities)

    const locationParts = [preview.city, preview.country].filter(Boolean)
    const location = locationParts.length > 0 ? locationParts.join(', ') : null

    return (
        <section className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold text-foreground">
                    Here&rsquo;s what we have on {preview.title}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Sent to {maskEmail(preview.email)}
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">{preview.title}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                        {preview.subcategory}
                    </p>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Description */}
                    {description && (
                        <div>
                            <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                                {displayDesc}
                            </p>
                            {isLongDesc && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setDescExpanded(!descExpanded)}
                                    className="mt-1 h-auto p-0 text-muted-foreground hover:text-foreground"
                                >
                                    {descExpanded ? (
                                        <>Show less <ChevronUp className="h-3 w-3 ml-1" /></>
                                    ) : (
                                        <>Read more <ChevronDown className="h-3 w-3 ml-1" /></>
                                    )}
                                </Button>
                            )}
                        </div>
                    )}

                    {/* Specialties */}
                    {specialties.length > 0 && (
                        <PillSection label="Specialties" items={specialties} variant="outline" />
                    )}

                    {/* Certifications */}
                    {certifications.length > 0 && (
                        <PillSection label="Certifications" items={certifications} variant="success" />
                    )}

                    {/* Materials */}
                    {materials.length > 0 && (
                        <PillSection label="Materials" items={materials} variant="secondary" />
                    )}

                    {/* Equipment */}
                    {equipment.length > 0 && (
                        <PillSection label="Key Equipment" items={equipment} variant="secondary" />
                    )}

                    {/* Industries */}
                    {industries.length > 0 && (
                        <PillSection label="Industries" items={industries} variant="info" />
                    )}

                    {/* Products */}
                    {products.length > 0 && (
                        <PillSection label="Products" items={products} variant="outline" />
                    )}

                    {/* Company facts — 2x2 grid */}
                    {(location || preview.founded_year || preview.company_size || preview.website_url) && (
                        <div>
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                                Company Facts
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {location && (
                                    <FactItem icon={MapPin} label="Location" value={location} />
                                )}
                                {preview.founded_year && (
                                    <FactItem icon={Calendar} label="Founded" value={String(preview.founded_year)} />
                                )}
                                {preview.company_size && (
                                    <FactItem
                                        icon={Users}
                                        label="Size"
                                        value={preview.employee_count_exact
                                            ? `${preview.employee_count_exact} employees`
                                            : preview.company_size
                                        }
                                    />
                                )}
                                {preview.website_url && (
                                    <FactItem
                                        icon={Globe}
                                        label="Website"
                                        value={preview.website_url.replace(/^https?:\/\//, '')}
                                        href={preview.website_url.startsWith('http') ? preview.website_url : `https://${preview.website_url}`}
                                    />
                                )}
                            </div>
                        </div>
                    )}

                    {/* Process capabilities */}
                    {capabilities.length > 0 && (
                        <div>
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                                Process Capabilities
                            </h4>
                            <div className="space-y-2">
                                {capabilities.map((cap, i) => (
                                    <div
                                        key={i}
                                        className="flex items-start gap-2 text-sm text-foreground"
                                    >
                                        <Wrench className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                                        <span>{formatCapability(cap)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Additional details */}
                    {(preview.production_capacity || preview.lead_time || preview.quality_systems) && (
                        <div>
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                                Production Details
                            </h4>
                            <div className="space-y-1 text-sm">
                                {preview.production_capacity && (
                                    <p><span className="text-muted-foreground">Capacity:</span> {preview.production_capacity}</p>
                                )}
                                {preview.lead_time && (
                                    <p><span className="text-muted-foreground">Lead Time:</span> {preview.lead_time}</p>
                                )}
                                {preview.quality_systems && (
                                    <p><span className="text-muted-foreground">Quality:</span> {preview.quality_systems}</p>
                                )}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </section>
    )
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function PillSection({
    label,
    items,
    variant,
}: {
    label: string
    items: string[]
    variant: 'outline' | 'success' | 'secondary' | 'info'
}) {
    return (
        <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {label}
            </h4>
            <div className="flex flex-wrap gap-1.5">
                {items.map((item) => (
                    <Badge key={item} variant={variant} size="sm">
                        {item}
                    </Badge>
                ))}
            </div>
        </div>
    )
}

function FactItem({
    icon: Icon,
    label,
    value,
    href,
}: {
    icon: React.ComponentType<{ className?: string }>
    label: string
    value: string
    href?: string
}) {
    return (
        <div className="flex items-start gap-2 text-sm">
            <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                {href ? (
                    <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-international-orange hover:underline break-all"
                    >
                        {value}
                    </a>
                ) : (
                    <p className="text-foreground">{value}</p>
                )}
            </div>
        </div>
    )
}

/** Safely coerce JSONB arrays to string[] */
function asStringArray(val: unknown): string[] {
    if (!Array.isArray(val)) return []
    return val.filter((v): v is string => typeof v === 'string')
}

/** Safely coerce JSONB arrays to object[] */
function asObjectArray(val: unknown): Record<string, unknown>[] {
    if (!Array.isArray(val)) return []
    return val.filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
}

/** Format a process capability object into a readable string */
function formatCapability(cap: Record<string, unknown>): string {
    const name = cap.process || cap.name || cap.type || ''
    const details: string[] = []
    if (cap.tolerances) details.push(`Tolerances: ${cap.tolerances}`)
    if (cap.materials) {
        const mats = Array.isArray(cap.materials) ? cap.materials.join(', ') : String(cap.materials)
        details.push(`Materials: ${mats}`)
    }
    if (details.length > 0) return `${name} — ${details.join('; ')}`
    return String(name)
}
