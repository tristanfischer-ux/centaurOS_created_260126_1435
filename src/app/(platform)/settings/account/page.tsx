import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { AccountDangerZone } from "@/components/settings/account-danger-zone"
import { ChangePasswordCard } from "@/components/settings/change-password-card"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Mail } from "lucide-react"

/**
 * Account Settings Page
 *
 * @description Account-level settings: email on file, change password,
 * and account deletion. All GDPR-compliant, no data shared across foundries.
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
          Your email address and password.
        </p>
      </div>

      {/* Email on file */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Email address</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-foreground font-medium">{displayEmail}</p>
          <p className="text-xs text-muted-foreground mt-1">
            To change your email address, contact hello@fractionalforge.com from your current address.
          </p>
        </CardContent>
      </Card>

      {/* Change password */}
      <ChangePasswordCard userEmail={displayEmail} />

      {/* Delete account */}
      <AccountDangerZone userEmail={displayEmail} />
    </div>
  )
}
