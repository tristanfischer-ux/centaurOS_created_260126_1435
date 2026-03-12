import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { AccountDangerZone } from "@/components/settings/account-danger-zone"

/**
 * Account Settings Page
 *
 * @description Self-service account deletion for UK-GDPR compliance.
 * Lets authenticated users permanently delete their account.
 */
export default async function AccountSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", user.id)
    .single()

  const displayEmail = profile?.email || user.email || ""

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Account</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account settings and data.
        </p>
      </div>

      <AccountDangerZone userEmail={displayEmail} />
    </div>
  )
}
