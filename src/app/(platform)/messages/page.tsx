import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { MessagesPageClient } from "./messages-page-client"

export default async function MessagesPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    // Get user's profile with foundry_id
    const { data: profile } = await supabase
        .from('profiles')
        .select('foundry_id')
        .eq('id', user.id)
        .single()

    // Get team members for @mentions (from same foundry)
    let members: { id: string; full_name: string; email: string }[] = []
    if (profile?.foundry_id) {
        const { data: teamMembers } = await supabase
            .from('profiles')
            .select('id, full_name, email')
            .eq('foundry_id', profile.foundry_id)
            .neq('id', user.id)
            .limit(100)
        
        members = teamMembers?.map(m => ({
            id: m.id,
            full_name: m.full_name || '',
            email: m.email || ''
        })) || []
    }

    return (
        <MessagesPageClient 
            userId={user.id} 
            foundryId={profile?.foundry_id || undefined}
            members={members}
        />
    )
}
