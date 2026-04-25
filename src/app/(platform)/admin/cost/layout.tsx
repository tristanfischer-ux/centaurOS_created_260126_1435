import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Admin cost dashboard layout — Tristan-only gate.
 *
 * @description The cost dashboard reads cross-foundry data (every LLM call
 * across the whole platform) so the gate is intentionally narrower than the
 * sibling /admin/waitlist page (which is Founder/Executive). Anyone who is
 * not Tristan is redirected to /today.
 *
 * The (platform) layout has already guaranteed `user` is non-null by the
 * time we reach this code. We re-fetch the user only to read the email,
 * which the cached layout data does not expose.
 *
 * @audit Tier -1 cost-logging dashboard. Cross-foundry read access. Never
 * surface this layout's children to a non-Tristan account.
 */
const TRISTAN_EMAIL = 'tristan.fischer@gmail.com'

export default async function AdminCostLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // SECURITY: Defence-in-depth even though the platform shell already
  // guarantees auth — fail closed if that contract ever changes.
  if (!user) {
    redirect('/login')
  }

  // SECURITY: Hard email allow-list. profiles.role does not have an `admin`
  // value today (existing /admin/waitlist uses Founder/Executive, which is
  // too broad for cross-foundry cost data), so we gate by email until a
  // dedicated role lands.
  if (user.email !== TRISTAN_EMAIL) {
    redirect('/investors')
  }

  return <>{children}</>
}
