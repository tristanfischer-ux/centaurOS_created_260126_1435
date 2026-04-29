/**
 * @file suppliers/[id]/page.tsx
 *
 * @description Detail page for a single supplier from the marketplace.
 * Two-column layout: main content on the left, sidebar on the right.
 * Shows all supplier attributes: certifications, materials, equipment, capabilities, location, etc.
 * EXCLUDES private_synthesis (M&A intelligence).
 *
 * Revalidates every 60 seconds (ISR).
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { getSupplierById } from '@/actions/suppliers'
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Factory,
  Globe,
  MapPin,
  Shield,
  Users,
  Wrench,
} from 'lucide-react'

export const revalidate = 60

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureProtocol(url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  // SECURITY: Block non-http(s) schemes (javascript:, data:, etc.)
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return ''
  return `https://${url}`
}

function getCategoryColor(category: string): string {
  switch (category?.toLowerCase()) {
    case 'products':
      return 'bg-info/10'
    case 'services':
      return 'bg-success/10'
    case 'people':
      return 'bg-warning/10'
    case 'ai':
      return 'bg-international-orange/10'
    default:
      return 'bg-muted'
  }
}

function arrayToList(
  data: unknown,
  defaultValue: string[] = []
): string[] {
  if (!data) return defaultValue
  if (Array.isArray(data)) return data.filter((x) => typeof x === 'string')
  if (typeof data === 'string') return [data]
  return defaultValue
}

/**
 * Extracts people/leadership data from various formats:
 * - string[] (ch_directors legacy): ["John Smith", "Jane Doe"]
 * - object[] (key_people from Nightshift): [{name: "John", title: "CEO"}, ...]
 * Returns a normalized array of {name, title?} objects.
 */
function extractPeople(data: unknown): Array<{ name: string; title?: string }> {
  if (!data) return []
  if (!Array.isArray(data)) return []

  return data
    .map((item) => {
      if (typeof item === 'string') return { name: item }
      if (typeof item === 'object' && item !== null) {
        const obj = item as Record<string, unknown>
        const name = (obj.name as string) || (obj.full_name as string) || ''
        if (!name) return null
        const title = (obj.title as string) || (obj.role as string) || undefined
        return { name, title }
      }
      return null
    })
    .filter((x): x is { name: string; title?: string } => x !== null && x.name.length > 0)
}

function objectToEntries(data: unknown): Array<[string, unknown]> {
  if (!data || typeof data !== 'object') return []
  if (Array.isArray(data)) return []
  return Object.entries(data)
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function SupplierDetailPage({ params }: PageProps) {
  const { id } = await params
  const supplier = await getSupplierById(id)

  if (!supplier) {
    notFound()
  }

  const attrs = supplier.attributes as Record<string, unknown> | undefined || {}

  // DECISION: Field names vary by data source. Nightshift push (script 35) writes
  // top-level columns (merged into attrs by mapToSupplierCard). Companies House
  // enrichment writes ch_directors. Synthesis pipeline writes capability_summary.
  // We use fallback chains to handle all variants.
  const website = (attrs.website_url as string) || ''
  const country = (attrs.country as string) || ''
  const city = (attrs.city as string) || ''
  const hqLocation = city && country ? `${city}, ${country}` : (attrs.hq_location as string) || city || country || ''
  const yearFounded = (attrs.year_founded as number) || (attrs.founded_year as number) || null
  const employeeCount = (attrs.employee_count as number | string) || (attrs.company_size as string) || null
  const verificationStatus = (attrs.verification_status as string) || (attrs.enrichment_quality as string) || 'unverified'
  const dataQualityScore = (attrs.data_quality_score as number) || (attrs.relevance_score as number) || null

  // DECISION: key_people comes from Nightshift verification (script 35), key_contacts
  // from synthesis attrs, ch_directors from Companies House enrichment, directors as legacy fallback.
  // These can be string[] or object[] — extractPeople normalizes both formats.
  const leadership = extractPeople(attrs.key_people).length > 0
    ? extractPeople(attrs.key_people)
    : extractPeople(attrs.key_contacts).length > 0
      ? extractPeople(attrs.key_contacts)
      : extractPeople(attrs.ch_directors).length > 0
        ? extractPeople(attrs.ch_directors)
        : extractPeople(attrs.directors)

  // INTENT: Use capability_summary (synthesis) > public_synthesis (legacy) > description (raw)
  const aboutText = (attrs.capability_summary as string) || (attrs.public_synthesis as string) || supplier.description || ''

  // Extract list-type attributes (merged from top-level columns by mapToSupplierCard)
  const certifications = arrayToList(attrs.certifications)
  const industries = arrayToList(attrs.industries).length > 0
    ? arrayToList(attrs.industries)
    : arrayToList(attrs.industries_served)
  const materials = arrayToList(attrs.materials)
  const equipment = arrayToList(attrs.key_equipment)

  // INTENT: process_capabilities is a structured object from LLM extraction
  const processCapabilities = objectToEntries(attrs.process_capabilities)

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Back button */}
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/suppliers/search">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to suppliers
          </Link>
        </Button>
      </div>

      {/* Header */}
      <div className="space-y-3">
        <h1 className="text-3xl font-bold text-foreground">{supplier.name}</h1>

        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className={getCategoryColor(supplier.category)}>
            {supplier.category}
          </Badge>
          {supplier.subcategory && (
            <Badge variant="outline">{supplier.subcategory}</Badge>
          )}
          {supplier.is_verified && (
            <div className="flex items-center gap-1 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" />
              Verified
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* Single-column layout — Tristan 2026-04-28: NO multi-column grids,
          NO sidebar. All sections stack vertically full-width. */}
      <div className="space-y-6">
          {/* About section */}
          {aboutText && (
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-international-orange" />
                  About
                </h2>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {aboutText}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Certifications */}
          {certifications.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Shield className="h-5 w-5 text-international-orange" />
                  Certifications
                </h2>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {certifications.map((cert) => (
                    <Badge key={cert} variant="secondary">
                      {cert}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Industries Served */}
          {industries.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Factory className="h-5 w-5 text-international-orange" />
                  Industries Served
                </h2>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {industries.map((industry) => (
                    <Badge key={industry} variant="outline">
                      {industry}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Materials */}
          {materials.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Wrench className="h-5 w-5 text-international-orange" />
                  Materials
                </h2>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {materials.map((material) => (
                    <Badge key={material} variant="outline">
                      {material}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Key Equipment */}
          {equipment.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Factory className="h-5 w-5 text-international-orange" />
                  Key Equipment
                </h2>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {equipment.map((item) => (
                    <Badge key={item} variant="secondary">
                      {item}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Process Capabilities */}
          {processCapabilities.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Wrench className="h-5 w-5 text-international-orange" />
                  Process Capabilities
                </h2>
              </CardHeader>
              <CardContent className="space-y-4">
                {processCapabilities.map(([key, value]) => (
                  <div key={key}>
                    <h3 className="text-sm font-medium text-foreground capitalize">
                      {key.replace(/_/g, ' ')}
                    </h3>
                    {Array.isArray(value) ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {value.map((item, idx) => (
                          <Badge key={idx} variant="outline">
                            {String(item)}
                          </Badge>
                        ))}
                      </div>
                    ) : typeof value === 'object' ? (
                      <pre className="mt-2 text-xs text-muted-foreground bg-muted p-3 rounded overflow-auto max-h-40">
                        {JSON.stringify(value, null, 2)}
                      </pre>
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {String(value)}
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Leadership */}
          {leadership.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Users className="h-5 w-5 text-international-orange" />
                  Leadership
                </h2>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {leadership.map((person, idx) => (
                    <div
                      key={idx}
                      className="border-b border-border last:border-b-0 pb-2 last:pb-0"
                    >
                      <p className="text-sm font-medium text-foreground">{person.name}</p>
                      {person.title && (
                        <p className="text-xs text-muted-foreground">{person.title}</p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Company Details — moved from sidebar into single-column flow */}
          {(hqLocation || country || yearFounded || employeeCount) && (
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold text-foreground">Company Details</h2>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* DECISION: Show combined location when city+country available,
                    otherwise show country alone. Avoids redundant display. */}
                {hqLocation && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                      Location
                    </p>
                    <p className="mt-1 text-sm text-foreground flex items-center gap-1">
                      <MapPin className="h-4 w-4 text-international-orange flex-shrink-0" />
                      {hqLocation}
                    </p>
                  </div>
                )}

                {!hqLocation && country && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                      Country
                    </p>
                    <p className="mt-1 text-sm text-foreground flex items-center gap-1">
                      <Globe className="h-4 w-4 text-international-orange flex-shrink-0" />
                      {country}
                    </p>
                  </div>
                )}

                {yearFounded && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                      Founded
                    </p>
                    <p className="mt-1 text-sm text-foreground flex items-center gap-1">
                      <Calendar className="h-4 w-4 text-international-orange flex-shrink-0" />
                      {yearFounded}
                    </p>
                  </div>
                )}

                {employeeCount && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                      Employees
                    </p>
                    <p className="mt-1 text-sm text-foreground flex items-center gap-1">
                      <Users className="h-4 w-4 text-international-orange flex-shrink-0" />
                      {employeeCount}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Website Link — moved from sidebar into single-column flow */}
          {website && (
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold text-foreground">Links</h2>
              </CardHeader>
              <CardContent>
                <a
                  href={ensureProtocol(website)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-international-orange hover:underline"
                >
                  <Globe className="h-4 w-4 shrink-0" />
                  Visit Website
                </a>
              </CardContent>
            </Card>
          )}

          {/* Data Quality — moved from sidebar into single-column flow */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-foreground">Data Quality</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              {dataQualityScore !== null && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                      Quality Score
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {dataQualityScore.toFixed(1)}/10
                    </p>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-success"
                      style={{ width: `${(dataQualityScore / 10) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {verificationStatus && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                    Verification Status
                  </p>
                  <Badge
                    variant={verificationStatus === 'verified' ? 'secondary' : 'outline'}
                    className="mt-2"
                  >
                    {verificationStatus}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>
      </div>
    </div>
  )
}
