/**
 * Nominatim geocoding helper.
 *
 * Calls the OpenStreetMap Nominatim API to resolve an address to lat/lng.
 * Fails silently on any error — never breaks the page.
 *
 * Caching: the caller (listing-detail page server component) must persist the
 * result back to the row via admin client so subsequent renders skip this call.
 *
 * Throttle: Nominatim requests max 1 req/sec. Since this fires once per supplier
 * ever (then cached on the row), no rate-limit gating is needed in practice.
 */

export interface GeoPoint {
  lat: number
  lon: number
}

export async function geocodeAddress(query: string): Promise<GeoPoint | null> {
  if (!query || query.trim() === '') return null

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query.trim())}&limit=1`

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'ForgeOS/1.0 (tristan@fractionalforge.com)',
        'Accept': 'application/json',
      },
      // 5-second timeout — don't block the page render
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      // 429 rate-limit or server error — fail silently
      return null
    }

    const json = await res.json() as Array<{ lat: string; lon: string }>
    if (!Array.isArray(json) || json.length === 0) return null

    const lat = parseFloat(json[0].lat)
    const lon = parseFloat(json[0].lon)
    if (isNaN(lat) || isNaN(lon)) return null

    return { lat, lon }
  } catch {
    // Network error, timeout, JSON parse error — fail silently
    return null
  }
}

/**
 * Build an OpenStreetMap embed iframe src for a given lat/lon.
 * The bbox adds a small margin so the supplier isn't right at the edge.
 */
export function buildOsmEmbedUrl(lat: number, lon: number): string {
  const margin = 0.01
  const bbox = [lon - margin, lat - margin, lon + margin, lat + margin]
    .map((v) => v.toFixed(6))
    .join('%2C')
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(6)}%2C${lon.toFixed(6)}`
}

/**
 * Build a "View on OpenStreetMap" link href for a given lat/lon.
 */
export function buildOsmViewUrl(lat: number, lon: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lon.toFixed(6)}&zoom=14`
}
