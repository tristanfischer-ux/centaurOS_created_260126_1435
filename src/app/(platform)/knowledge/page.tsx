import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProfileSetupRequired } from '@/components/ProfileSetupRequired'
import { KnowledgeVaultView } from './knowledge-vault-view'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Knowledge | ForgeOS',
  description: 'Your organizational knowledge vault — everything your AI team has learned',
}

export const dynamic = 'force-dynamic'

/**
 * Knowledge Vault page — the organizational second brain.
 *
 * @description Displays the foundry's accumulated knowledge from specialist
 * conversations. Notes are organized by domain, filterable by type and specialist,
 * and searchable. Users can browse, pin, verify, and curate knowledge.
 *
 * @security Authenticates user and scopes all data to their foundry.
 */
export default async function KnowledgePage(): Promise<React.ReactNode> {
  // AUTH: Verify user session
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // AUTH: Resolve foundry context
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
