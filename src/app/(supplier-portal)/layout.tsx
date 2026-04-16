import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

// DECISION 2026-04-16: founder-first architecture. /supplier-portal is being
// decommissioned. Phase 3 rehomes these pages inside the main platform sidebar
// under a "Supplier Portal" section visible only to users who have opted in.
// Until then, any visit to /supplier-portal/* redirects to /today. Old supplier
// accounts (account_type='supplier') have all been flipped to team_builder.
export default async function SupplierPortalLayout() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect("/login")
  }
  redirect("/today")
}
