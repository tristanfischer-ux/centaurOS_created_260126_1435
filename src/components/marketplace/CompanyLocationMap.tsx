'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { MapPin } from 'lucide-react'
import { extractPostcode } from '@/lib/postcode-utils'

interface CompanyLocationMapProps {
    address: string
}

interface GeoResult {
    lat: number
    lng: number
    postcode: string
}

/** Geocode a UK postcode via postcodes.io (free, no key needed) */
async function geocodePostcode(postcode: string): Promise<GeoResult | null> {
    try {
        const res = await fetch(
            `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`
        )
        if (!res.ok) return null
        const data = await res.json()
        if (data.status !== 200 || !data.result) return null
        return {
            lat: data.result.latitude,
            lng: data.result.longitude,
            postcode: data.result.postcode,
        }
    } catch {
        return null
    }
}

/** Inner map component — only rendered client-side via dynamic import */
function MapInner({ lat, lng, postcode }: GeoResult) {
    const [leafletReady, setLeafletReady] = useState(false)
    const [LeafletComponents, setLeafletComponents] = useState<{
        MapContainer: typeof import('react-leaflet').MapContainer
        TileLayer: typeof import('react-leaflet').TileLayer
        Marker: typeof import('react-leaflet').Marker
        Popup: typeof import('react-leaflet').Popup
    } | null>(null)

    useEffect(() => {
        // Dynamic import to avoid SSR issues with Leaflet
        Promise.all([
            import('leaflet'),
            import('react-leaflet'),
            import('leaflet/dist/leaflet.css'),
        ]).then(([L, RL]) => {
            // Fix default marker icons (Leaflet + webpack issue)
            delete (L.Icon.Default.prototype as Record<string, unknown>)._getIconUrl
            L.Icon.Default.mergeOptions({
                iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
                iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
            })
            setLeafletComponents({
                MapContainer: RL.MapContainer,
                TileLayer: RL.TileLayer,
                Marker: RL.Marker,
                Popup: RL.Popup,
            })
            setLeafletReady(true)
        })
    }, [])

    if (!leafletReady || !LeafletComponents) {
        return (
            <div className="h-[200px] rounded-lg bg-muted animate-pulse flex items-center justify-center">
                <MapPin className="h-6 w-6 text-muted-foreground" />
            </div>
        )
    }

    const { MapContainer, TileLayer, Marker, Popup } = LeafletComponents

    return (
        <MapContainer
            center={[lat, lng]}
            zoom={13}
            scrollWheelZoom={false}
            className="h-[200px] rounded-lg z-0"
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker position={[lat, lng]}>
                <Popup>{postcode}</Popup>
            </Marker>
        </MapContainer>
    )
}

export function CompanyLocationMap({ address }: CompanyLocationMapProps) {
    const [geo, setGeo] = useState<GeoResult | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const postcode = extractPostcode(address)
        if (!postcode) {
            setLoading(false)
            return
        }
        geocodePostcode(postcode).then((result) => {
            setGeo(result)
            setLoading(false)
        })
    }, [address])

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <h3 className="font-semibold text-foreground flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        Location
                    </h3>
                </CardHeader>
                <CardContent>
                    <div className="h-[200px] rounded-lg bg-muted animate-pulse" />
                </CardContent>
            </Card>
        )
    }

    if (!geo) return null

    return (
        <Card>
            <CardHeader>
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Location
                </h3>
            </CardHeader>
            <CardContent>
                <MapInner lat={geo.lat} lng={geo.lng} postcode={geo.postcode} />
            </CardContent>
        </Card>
    )
}
