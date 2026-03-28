import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProfileSetupRequired } from '@/components/ProfileSetupRequired'
import { KnowledgeVaultView } from './knowledge-vault-view'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Knowledge | ForgeOS',
  description: 'Your team\'s collective intelligence — the more you add, the smarter your specialists become',
}

export const revalidate = 30

/**
 * Knowledge Vault page — the organizational second brain.
 *
 * @description Displays the foundry's accumulated knowledge from specialist
 * conversations and uploaded documents. Notes are organized by domain,
 * filterable by type and specialist, and searchable. The vault feeds into
 * every specialist's context — more knowledge = better advice.
 *
 * @security Authenticates user and scopes all data to their foundry.
 */
export default async function KnowledgePage(): Promise<React.ReactNode> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, foundry_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.foundry_id) {
    return <ProfileSetupRequired userRole={profile?.role} />
  }

  return (
    <KnowledgeVaultView
      foundryId={profile.foundry_id}
      userId={user.id}
      userRole={profile.role ?? 'Apprentice'}
    />
  )
}
