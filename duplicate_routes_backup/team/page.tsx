import { createClient } from '@/lib/supabase/server'
import { AddMemberDialog } from './add-member-dialog'
import { Avatar, AvatarFallback } from "@/components/ui/avatar" // Need to install avatar and select
import { Badge } from "@/components/ui/badge" // Need to install badge
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default async function TeamPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return <div className="p-8 text-red-500">Unauthenticated. Please login.</div>
    }

    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })

    if (error) {
        return <div className="text-red-500">Error loading team</div>
    }

    const executives = profiles?.filter(p => p.role === 'Executive') || []
    const apprentices = profiles?.filter(p => p.role === 'Apprentice') || []

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Foundry Roster</h1>
                    <p className="text-gray-400">Manage your Executives and Apprentices.</p>
                </div>
                <AddMemberDialog />
            </div>

            {/* Executives Section */}
            <section className="space-y-4">
                <h2 className="text-xl font-semibold text-amber-600 uppercase tracking-wider border-b border-slate-200 pb-2">
                    Executives (Assessors)
                </h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {executives.map(member => (
                        <Card key={member.id} className="bg-white border-slate-200 shadow-sm">
                            <CardHeader className="flex flex-row items-center gap-4 pb-2">
                                <Avatar className="h-12 w-12 border-2 border-amber-500">
                                    <AvatarFallback className="bg-amber-100 text-amber-700 font-bold">
                                        {member.full_name?.substring(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <div>
                                    <CardTitle className="text-lg text-slate-900">{member.full_name}</CardTitle>
                                    <Badge variant="outline" className="text-amber-600 border-amber-200 text-[10px] mt-1 bg-amber-50">
                                        Executive
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="text-sm text-slate-500">
                                <p>ID: {member.id.substring(0, 8)}...</p>
                            </CardContent>
                        </Card>
                    ))}
                    {executives.length === 0 && (
                        <div className="col-span-full py-8 text-center text-gray-500 italic">No executives listed.</div>
                    )}
                </div>
            </section>

            {/* Apprentices Section */}
            <section className="space-y-4">
                <h2 className="text-xl font-semibold text-blue-600 uppercase tracking-wider border-b border-slate-200 pb-2">
                    Apprentices (Executors)
                </h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {apprentices.map(member => (
                        <Card key={member.id} className="bg-white border-slate-200 shadow-sm">
                            <CardHeader className="flex flex-row items-center gap-4 pb-2">
                                <Avatar className="h-10 w-10 border border-slate-200">
                                    <AvatarFallback className="bg-slate-100 text-slate-500">
                                        {member.full_name?.substring(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <div>
                                    <CardTitle className="text-md text-slate-900">{member.full_name}</CardTitle>
                                    <Badge variant="secondary" className="bg-slate-100 text-slate-600 hover:bg-slate-200 text-[10px] mt-1">
                                        Apprentice
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="text-sm text-slate-500">
                                <p>ID: {member.id.substring(0, 8)}...</p>
                            </CardContent>
                        </Card>
                    ))}
                    {apprentices.length === 0 && (
                        <div className="col-span-full py-8 text-center text-gray-500 italic">No apprentices listed.</div>
                    )}
                </div>
            </section>
        </div>
    )
}
