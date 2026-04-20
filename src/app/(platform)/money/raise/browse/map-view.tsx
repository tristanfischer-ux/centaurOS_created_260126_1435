'use client'

/**
 * @file map-view.tsx
 *
 * Geographic view for /money/raise/browse — plots investor firms on a world
 * map keyed by `country_iso`. Pins cluster at country-centroid level (we
 * don't have HQ-city coords for the full non-UK directory, so country
 * centroids are the honest granularity here).
 *
 * Adapted from `src/app/(platform)/investors/components/InvestorMapView.tsx`
 * which used UK-city coords; this cut drops city-level precision in favour
 * of country coverage because /money/raise/browse shows global investors.
 */

import Link from 'next/link'
import { Component, useEffect, useMemo, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'
import type { ScoredListingRow } from '@/lib/money/match-types'

// Dynamic import to avoid SSR issues with Leaflet.
const MapContainer = dynamic(
  () => import('react-leaflet').then((m) => m.MapContainer),
  { ssr: false, loading: () => <Skeleton className="h-[560px] w-full rounded-xl" /> },
)
const TileLayer = dynamic(() => import('react-leaflet').then((m) => m.TileLayer), {
  ssr: false,
})
const CircleMarker = dynamic(
  () => import('react-leaflet').then((m) => m.CircleMarker),
  { ssr: false },
)
const Popup = dynamic(() => import('react-leaflet').then((m) => m.Popup), { ssr: false })

// ---------------------------------------------------------------------------
// Error boundary — CDN / chunk failures don't blow up the whole page.
// ---------------------------------------------------------------------------

interface MapErrorBoundaryState {
  hasError: boolean
}

class MapErrorBoundary extends Component<{ children: ReactNode }, MapErrorBoundaryState> {
  state: MapErrorBoundaryState = { hasError: false }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error: Error) {
    console.error('[MoneyRaiseMapView] Leaflet error:', error)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-[560px] w-full items-center justify-center rounded-xl border border-border">
          <p className="text-sm text-muted-foreground">
            Map failed to load. Try refreshing the page.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}

// ---------------------------------------------------------------------------
// Country-centroid coords (ISO-2 → [lat, lng]). Top ~50 markets covering the
// vast majority of the marketplace_listings country_iso values we see.
// ---------------------------------------------------------------------------

const COUNTRY_COORDS: Record<string, { lat: number; lng: number; label: string }> = {
  GB: { lat: 54.0, lng: -2.0, label: 'United Kingdom' },
  US: { lat: 39.5, lng: -98.35, label: 'United States' },
  CA: { lat: 56.13, lng: -106.35, label: 'Canada' },
  IE: { lat: 53.41, lng: -8.24, label: 'Ireland' },
  FR: { lat: 46.6, lng: 2.2, label: 'France' },
  DE: { lat: 51.17, lng: 10.45, label: 'Germany' },
  NL: { lat: 52.13, lng: 5.29, label: 'Netherlands' },
  BE: { lat: 50.5, lng: 4.47, label: 'Belgium' },
  LU: { lat: 49.82, lng: 6.13, label: 'Luxembourg' },
  CH: { lat: 46.82, lng: 8.23, label: 'Switzerland' },
  AT: { lat: 47.52, lng: 14.55, label: 'Austria' },
  ES: { lat: 40.46, lng: -3.75, label: 'Spain' },
  PT: { lat: 39.4, lng: -8.22, label: 'Portugal' },
  IT: { lat: 41.87, lng: 12.57, label: 'Italy' },
  SE: { lat: 60.13, lng: 18.64, label: 'Sweden' },
  NO: { lat: 60.47, lng: 8.47, label: 'Norway' },
  DK: { lat: 56.27, lng: 9.5, label: 'Denmark' },
  FI: { lat: 61.92, lng: 25.75, label: 'Finland' },
  IS: { lat: 64.96, lng: -19.02, label: 'Iceland' },
  PL: { lat: 51.92, lng: 19.15, label: 'Poland' },
  CZ: { lat: 49.82, lng: 15.47, label: 'Czech Republic' },
  SK: { lat: 48.67, lng: 19.7, label: 'Slovakia' },
  HU: { lat: 47.16, lng: 19.5, label: 'Hungary' },
  RO: { lat: 45.94, lng: 24.97, label: 'Romania' },
  BG: { lat: 42.73, lng: 25.49, label: 'Bulgaria' },
  GR: { lat: 39.07, lng: 21.82, label: 'Greece' },
  TR: { lat: 38.96, lng: 35.24, label: 'Turkey' },
  IL: { lat: 31.05, lng: 34.85, label: 'Israel' },
  AE: { lat: 23.42, lng: 53.85, label: 'United Arab Emirates' },
  SA: { lat: 23.89, lng: 45.08, label: 'Saudi Arabia' },
  QA: { lat: 25.35, lng: 51.18, label: 'Qatar' },
  EG: { lat: 26.82, lng: 30.8, label: 'Egypt' },
  ZA: { lat: -30.56, lng: 22.94, label: 'South Africa' },
  NG: { lat: 9.08, lng: 8.68, label: 'Nigeria' },
  KE: { lat: -0.02, lng: 37.91, label: 'Kenya' },
  IN: { lat: 20.59, lng: 78.96, label: 'India' },
  CN: { lat: 35.86, lng: 104.2, label: 'China' },
  HK: { lat: 22.32, lng: 114.17, label: 'Hong Kong' },
  SG: { lat: 1.35, lng: 103.82, label: 'Singapore' },
  JP: { lat: 36.2, lng: 138.25, label: 'Japan' },
  KR: { lat: 35.91, lng: 127.77, label: 'South Korea' },
  TW: { lat: 23.7, lng: 120.96, label: 'Taiwan' },
  AU: { lat: -25.27, lng: 133.78, label: 'Australia' },
  NZ: { lat: -40.9, lng: 174.89, label: 'New Zealand' },
  BR: { lat: -14.24, lng: -51.93, label: 'Brazil' },
  MX: { lat: 23.63, lng: -102.55, label: 'Mexico' },
  AR: { lat: -38.42, lng: -63.62, label: 'Argentina' },
  CL: { lat: -35.68, lng: -71.54, label: 'Chile' },
  CO: { lat: 4.57, lng: -74.3, label: 'Colombia' },
  EE: { lat: 58.6, lng: 25.01, label: 'Estonia' },
}

function scaleRadius(count: number): number {
  // Log-ish scaling so 1 firm is visible and 500 firms doesn't dwarf the map.
  return Math.min(32, 6 + Math.round(Math.log2(count + 1) * 5))
}

// ---------------------------------------------------------------------------
// Leaflet CSS — SRI-hashed with fallback.
// ---------------------------------------------------------------------------

const LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
const LEAFLET_CSS_INTEGRITY = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type CountryGroup = {
  iso: string
  label: string
  coords: { lat: number; lng: number }
  rows: ScoredListingRow[]
}

type CountryGroupUnknown = {
  iso: string
  label: string
  rows: ScoredListingRow[]
}

export function InvestorMapView({ results }: { results: ScoredListingRow[] }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && !document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = LEAFLET_CSS_URL
      link.integrity = LEAFLET_CSS_INTEGRITY
      link.crossOrigin = 'anonymous'
      link.onerror = () => {
        console.warn('[MoneyRaiseMapView] Leaflet CSS SRI failed, retrying without integrity')
        link.remove()
        const fallback = document.createElement('link')
        fallback.rel = 'stylesheet'
        fallback.href = LEAFLET_CSS_URL
        document.head.appendChild(fallback)
      }
      document.head.appendChild(link)
    }
    setMounted(true)
  }, [])

  const { known, unknown } = useMemo(() => {
    const knownMap = new Map<string, CountryGroup>()
    const unknownMap = new Map<string, CountryGroupUnknown>()
    for (const row of results) {
      const iso = (row.country_iso ?? '').toUpperCase()
      if (iso && COUNTRY_COORDS[iso]) {
        const entry = knownMap.get(iso)
        if (entry) {
          entry.rows.push(row)
        } else {
          const meta = COUNTRY_COORDS[iso]
          knownMap.set(iso, {
            iso,
            label: meta.label,
            coords: { lat: meta.lat, lng: meta.lng },
            rows: [row],
          })
        }
      } else {
        const key = iso || (row.country ?? 'Unknown')
        const entry = unknownMap.get(key)
        if (entry) {
          entry.rows.push(row)
        } else {
          unknownMap.set(key, { iso: key, label: key, rows: [row] })
        }
      }
    }
    return {
      known: Array.from(knownMap.values()),
      unknown: Array.from(unknownMap.values()),
    }
  }, [results])

  if (!mounted) {
    return <Skeleton className="h-[560px] w-full rounded-xl" />
  }

  return (
    <div className="space-y-3">
      <MapErrorBoundary>
        <div className="h-[560px] w-full overflow-hidden rounded-xl border border-border">
          <MapContainer
            center={[25, 10]}
            zoom={2}
            minZoom={2}
            worldCopyJump
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {known.map((group) => (
              <CircleMarker
                key={group.iso}
                center={[group.coords.lat, group.coords.lng]}
                radius={scaleRadius(group.rows.length)}
                pathOptions={{
                  color: '#ff4500',
                  fillColor: '#ff4500',
                  fillOpacity: 0.55,
                  weight: 2,
                }}
              >
                <Popup>
                  <div className="max-w-[220px] space-y-1 text-xs">
                    <p className="text-sm font-semibold">
                      {group.label} ({group.rows.length})
                    </p>
                    {group.rows.slice(0, 6).map((r) => (
                      <p key={r.id}>
                        <Link
                          href={`/money/raise/investor/${r.id}`}
                          className="text-international-orange hover:underline"
                        >
                          {r.title ?? 'Unnamed investor'}
                        </Link>
                        {r.subcategory && (
                          <span className="text-muted-foreground"> — {r.subcategory}</span>
                        )}
                      </p>
                    ))}
                    {group.rows.length > 6 && (
                      <p className="text-muted-foreground">
                        +{group.rows.length - 6} more
                      </p>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      </MapErrorBoundary>
      {unknown.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {unknown.reduce((n, g) => n + g.rows.length, 0).toLocaleString()} firms have no
          country coordinates and aren&rsquo;t plotted. Switch to the grid or table view to
          see them.
        </p>
      )}
    </div>
  )
}
