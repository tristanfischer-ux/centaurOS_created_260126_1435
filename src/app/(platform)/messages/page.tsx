import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { MessagesPageClient } from "./messages-page-client"

export default async function MessagesPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect("/login")
    }

    return <MessagesPageClient userId={user.id} />
}
