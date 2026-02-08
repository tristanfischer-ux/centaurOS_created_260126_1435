import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getUserSubscription } from '@/lib/billing/subscriptions'
import { PlanPickerClient } from './plan-picker-client'

/**
 * Subscription Plan Selection Page
 *
 * @description Displays available subscription plans and allows users to
 * subscribe or change their plan. Uses existing subscription checkout flow.
 *
 * @security Requires authenticated user
 */
export default async function PlansPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { subscription } = await getUserSubscription(user.id)

  return (
    <PlanPickerClient
      currentTier={subscription?.tier || 'free'}
      currentStatus={subscription?.status}
    />
  )
}
