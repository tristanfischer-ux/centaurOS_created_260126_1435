import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { redirect } from 'next/navigation'

export default async function SettingsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()

    return (
        <div className="space-y-6">
            <div className="pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3 mb-1">
                    <div className="h-8 w-1 bg-orange-600 rounded-full shadow-[0_0_8px_rgba(234,88,12,0.6)]" />
                    <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">Settings</h1>
                </div>
                <p className="text-muted-foreground mt-1 text-sm font-medium pl-4">Configure your profile and preferences</p>
            </div>

            <Card className="bg-background border-slate-100 shadow-[0_2px_15px_rgba(0,0,0,0.03)]">
                <CardHeader>
                    <CardTitle>Profile Configuration</CardTitle>
                    <CardDescription>Manage your persona and foundry settings.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Full Name</Label>
                            <div className="p-2 bg-muted rounded border border-slate-200">{profile?.full_name}</div>
                        </div>
                        <div>
                            <Label>Email</Label>
                            <div className="p-2 bg-muted rounded border border-slate-200">{profile?.email}</div>
                        </div>
                        <div>
                            <Label>Role</Label>
                            <div className="p-2 bg-muted rounded border border-slate-200 font-mono text-amber-600">{profile?.role}</div>
                        </div>
                        <div>
                            <Label>Foundry ID</Label>
                            <div className="p-2 bg-muted rounded border border-slate-200 text-xs font-mono">{profile?.foundry_id}</div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-red-100 bg-red-50/50">
                <CardHeader>
                    <CardTitle className="text-red-900">Sign Out</CardTitle>
                    <CardDescription className="text-red-700">
                        Securely sign out of your account on this device. You will need to sign in again to access the platform.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form action={async () => {
                        'use server'
                        const supabase = await createClient()
                        await supabase.auth.signOut()
                        redirect('/login')
                    }}>
                        <Button variant="destructive" className="w-full h-12 text-lg font-semibold">
                            Sign Out
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
