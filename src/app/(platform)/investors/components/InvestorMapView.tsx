/**
 * @file InvestorMapView.tsx
 *
 * @description Leaflet map of UK investor firms. City-level clustering using
 * hardcoded coordinates for top 15 UK cities (avoids 780+ geocode API calls).
 * Markers colored by firm type. Click marker → popup with firm details.
 */

'use client'

import { useMemo, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'
import type { InvestorFirm } from '@/actions/investors'

// Dynamic import to avoid SSR issues with Leaflet
// GOTCHA: Must provide loading fallback — if mounted=true but chunk hasn't loaded yet, renders null
const MapContainer = dynamic(
  () => import('react-leaflet').then(m => m.MapContainer),
  { ssr: false, loading: () => <Skeleton className="h-[500px] w-full rounded-xl" /> }
)
const TileLayer = dynamic(
  () => import('react-leaflet').then(m => m.TileLayer),
  { ssr: false }
)
const CircleMarker = dynamic(
  () => import('react-leaflet').then(m => m.CircleMarker),
  { ssr: false }
)
const Popup = dynamic(
  () => import('react-leaflet').then(m => m.Popup),
  { ssr: false }
)

// ---------------------------------------------------------------------------
// City coordinates (hardcoded to avoid API calls)
// ---------------------------------------------------------------------------

const CITY_COORDS: Record<string, [number, number]> = {
  london: [51.5074, -0.1278],
  edinburgh: [55.9533, -3.1883],
  manchester: [53.4808, -2.2426],
  cambridge: [52.2053, 0.1218],
  bristol: [51.4545, -2.5879],
  oxford: [51.7520, -1.2577],
  birmingham: [52.4862, -1.8904],
  leeds: [53.8008, -1.5491],
  glasgow: [55.8642, -4.2518],
  cardiff: [51.4816, -3.1791],
  belfast: [54.5973, -5.9301],
  nottingham: [52.9548, -1.1581],
  brighton: [50.8225, -0.1372],
  reading: [51.4543, -0.9781],
  bath: [51.3811, -2.3590],
}

// Firm type → color
const TYPE_COLORS: Record<string, string> = {
  VC: '#ff4500',        // international orange
  PE: '#3b82f6',        // electric blue
  Growth: '#22c55e',    // green
  'Growth Equity': '#22c55e',
  'Family Office': '#8b5cf6', // purple
  CVC: '#f59e0b',       // amber
  Accelerator: '#ec4899', // pink
}

function getCityKey(hqCity: string | undefined): string | null {
  if (!hqCity) return null
  const lower = hqCity.toLowerCase().trim()
  // Try exact match first
  if (CITY_COORDS[lower]) return lower
  // Try partial match (e.g. "London, UK" → "london")
  for (const city of Object.keys(CITY_COORDS)) {
    if (lower.includes(city)) return city
  }
  return null
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface InvestorMapViewProps {
  firms: InvestorFirm[]
}

export function InvestorMapView({ firms }: InvestorMapViewProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // Load Leaflet CSS
    if (typeof window !== 'undefined' && !document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }
    setMounted(true)
  }, [])

  // Group firms by city
  const cityGroups = useMemo(() => {
    const groups: Record<string, { coords: [number, number]; firms: InvestorFirm[] }> = {}
    for (const firm of firms) {
      const cityKey = getCityKey(firm.attributes.hq_city)
      if (!cityKey) continue
      if (!groups[cityKey]) {
        groups[cityKey] = { coords: CITY_COORDS[cityKey], firms: [] }
      }
      groups[cityKey].firms.push(firm)
    }
    return groups
  }, [firms])

  if (!mounted) {
    return <Skeleton className="h-[500px] w-full rounded-xl" />
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden h-[500px]">
      <MapContainer
        center={[54.0, -2.0]}
        zoom={6}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {Object.entries(cityGroups).map(([city, { coords, firms: cityFirms }]) => {
          // Dominant firm type for color
          const typeCounts: Record<string, number> = {}
          for (const f of cityFirms) {
            const t = f.attributes.firm_type ?? 'Other'
            typeCounts[t] = (typeCounts[t] ?? 0) + 1
          }
          const dominantType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'VC'
          const color = TYPE_COLORS[dominantType] ?? '#6b7280'

          return (
            <CircleMarker
              key={city}
              center={coords}
              radius={Math.min(30, 8 + cityFirms.length * 2)}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: 0.6,
                weight: 2,
              }}
            >
              <Popup>
                <div className="text-xs space-y-1 max-w-[200px]">
                  <p className="font-semibold text-sm capitalize">{city} ({cityFirms.length})</p>
                  {cityFirms.slice(0, 5).map(f => (
                    <p key={f.id}>
                      <a href={`/investors/${f.id}`} className="text-international-orange hover:underline">
                        {f.title}
                      </a>
                      {f.attributes.fund_size_gbp != null && (
                        <span className="text-muted-foreground"> — £{(f.attributes.fund_size_gbp / 1e6).toFixed(0)}M</span>
                      )}
                    </p>
                  ))}
                  {cityFirms.length > 5 && (
                    <p className="text-muted-foreground">+{cityFirms.length - 5} more</p>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          )
        })}
      </MapContainer>
    </div>
  )
}
