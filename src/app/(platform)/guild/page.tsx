import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MapPin, Lock } from "lucide-react"

export default async function GuildPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Get User Profile for Role and Location
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    const isExecutive = profile?.role === 'Executive'

    // Fetch Events (Mocking logic needed for "Geotargeting" since we don't have real geo-distance in Postgres extension enabled yet, just string match for MVP)
    let query = supabase.from('guild_events').select('*').order('event_date', { ascending: true })

    // Tiered Networking: Hide exec only events from apprentices
    if (!isExecutive) {
        query = query.eq('is_executive_only', false)
    }

    const { data: events, error } = await query

    if (error) return <div className="text-red-500">Error loading events.</div>

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">The Guild</h1>
                    <p className="text-muted-foreground">Offline-to-Online (O2O) network and events.</p>
                </div>
                {/* Geotargeting Mock Indicator */}
                <div className="text-xs text-amber-600 border border-amber-200 bg-amber-50 px-3 py-1 rounded-full">
                    📍 Showing events near you
                </div>
            </div>

            <div className="grid gap-6">
                {(events || []).length === 0 ? (
                    <div className="py-12 text-center border-2 border-dashed border-foundry-800 rounded-lg text-gray-500">
                        No upcoming events visible to your tier.
                    </div>
                ) : (
                    (events || []).map(event => (
                        <Card key={event.id} className="bg-white border-slate-200 flex flex-col md:flex-row overflow-hidden shadow-sm">
                            <div className="bg-slate-50 p-6 flex flex-col items-center justify-center min-w-[150px] border-r border-slate-200">
                                <span className="text-2xl font-bold text-slate-900">
                                    {new Date(event.event_date).getDate()}
                                </span>
                                <span className="text-sm text-slate-500 uppercase">
                                    {new Date(event.event_date).toLocaleString('default', { month: 'short' })}
                                </span>
                            </div>
                            <div className="flex-1 p-6">
                                <div className="flex justify-between items-start mb-2">
                                    <Badge variant="outline" className="border-slate-200 text-slate-500">
                                        <MapPin className="mr-1 h-3 w-3" /> {event.location_geo || "TBD"}
                                    </Badge>
                                    {event.is_executive_only && (
                                        <Badge className="bg-amber-100 text-amber-700 border border-amber-200 ml-2 shadow-none">
                                            <Lock className="mr-1 h-3 w-3" /> Executive Only
                                        </Badge>
                                    )}
                                </div>
                                <h3 className="text-xl font-semibold text-slate-900 mb-2">{event.title}</h3>
                                <p className="text-slate-500 text-sm mb-4">{event.description}</p>
                                <Button size="sm" className="bg-slate-900 hover:bg-slate-800 text-white">
                                    RSVP
                                </Button>
                            </div>
                        </Card>
                    ))
                )}
            </div>
        </div>
    )
}
