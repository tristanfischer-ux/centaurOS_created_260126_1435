import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BillingPageClient } from './billing-client'

/**
 * Billing Settings Page
 *
 * @description Server component that fetches user auth and renders the billing
 * management client. Assembles existing billing components (subscription status,
 * payment methods, account balance, payout preferences) into a single page.
 *
 * @security Requires authenticated user. Redirects to /login if not authenticated.
 */
export default async function BillingSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Check if user is a provider (for payout preferences section)
  const { data: provider } = await supabase
    .from('provider_profiles')
    .select('id, stripe_account_id')
    .eq('user_id', user.id)
    .single()

  const isProvider = !!provider

  return (
    <BillingPageClient
      userId={user.id}
      isProvider={isProvider}
    />
  )
}
