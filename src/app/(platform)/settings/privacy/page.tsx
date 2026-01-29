/**
 * Privacy Settings Page
 * User privacy settings and GDPR data request management
 */

import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { PrivacySettings } from "@/components/gdpr"
import { Loader2 } from "lucide-react"

export const metadata = {
  title: "Privacy Settings - CentaurOS",
  description: "Manage your privacy settings and data requests",
}

// Type helper for untyped tables
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedClient = any

async function getInitialData() {
  const supabase = (await createClient()) as UntypedClient

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Get user's data requests
  const { data: requests } = await supabase
    .from("data_requests")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  return {
    requests: requests || [],
  }
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
}

async function PrivacySettingsContent() {
  const { requests } = await getInitialData()

  return <PrivacySettings initialRequests={requests} />
}

export default function PrivacySettingsPage() {
  return (
    <div className="container max-w-4xl py-8">
      <Suspense fallback={<LoadingState />}>
        <PrivacySettingsContent />
      </Suspense>
    </div>
  )
}
