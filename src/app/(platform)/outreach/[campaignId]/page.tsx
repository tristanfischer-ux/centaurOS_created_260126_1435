import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { ProfileSetupRequired } from '@/components/ProfileSetupRequired'
import { CampaignDetail } from './campaign-detail'
import type { Metadata } from 'next'
import type { Campaign, Contact, OutreachEmail, OutreachKBEntry } from '@/types/outreach'

export const revalidate = 30

export async function generateMetadata(
    { params }: { params: Promise<{ campaignId: string }> }
): Promise<Metadata> {
    return {
        title: 'Campaign | ForgeOS',
        description: 'Manage contacts and email sequences for this outreach campaign',
    }
}

/**
 * Campaign detail page — contacts, emails, and settings.
 *
 * @security Authenticates user and scopes all data to their foundry.
 */
export default async function CampaignPage({
    params,
}: {
    params: Promise<{ campaignId: string }>
}): Promise<React.ReactNode> {
    const { campaignId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('id, foundry_id, role')
        .eq('id', user.id)
        .single()

    if (!profile?.foundry_id) {
        return <ProfileSetupRequired userRole={profile?.role} />
    }

    const foundryId = profile.foundry_id

    // FLOW: Fetch campaign, contacts, emails, and KB in parallel
    const [campaignRes, contactsRes, emailsRes, kbRes] = await Promise.all([
        supabase
            .from('outreach_campaigns')
            .select('*')
            .eq('id', campaignId)
            .eq('foundry_id', foundryId)
            .single(),
        supabase
            .from('outreach_contacts')
            .select('*')
            .eq('campaign_id', campaignId)
            .eq('foundry_id', foundryId)
            .order('score', { ascending: false }),
        supabase
            .from('outreach_emails')
            .select('*')
            .eq('campaign_id', campaignId)
            .eq('foundry_id', foundryId)
            .order('contact_id')
            .order('sequence_position', { ascending: true }),
        supabase
            .from('outreach_knowledge_base')
            .select('*')
            .eq('foundry_id', foundryId)
            .order('updated_at', { ascending: false }),
    ])

    if (campaignRes.error || !campaignRes.data) {
        notFound()
    }

    const campaign: Campaign = {
        ...campaignRes.data,
        value_props: campaignRes.data.value_props as string[],
        case_studies: campaignRes.data.case_studies as string[],
        metadata: campaignRes.data.metadata as Record<string, unknown>,
    }

    const contacts: Contact[] = (contactsRes.data || []).map(c => ({
        ...c,
        tech_stack: c.tech_stack as string[],
        signals: c.signals as string[],
        pain_points: c.pain_points as string[],
    }))

    const emails: OutreachEmail[] = (emailsRes.data || []).map(e => ({
        ...e,
        subject_variants: e.subject_variants as string[],
        personalization_data: e.personalization_data as Record<string, unknown>,
        qa_report: e.qa_report as Record<string, unknown> | null,
    }))

    const knowledgeBase: OutreachKBEntry[] = (kbRes.data || []).map(kb => ({
        ...kb,
        tags: kb.tags as string[],
    }))

    return (
        <CampaignDetail
            campaign={campaign}
            initialContacts={contacts}
            initialEmails={emails}
            initialKnowledgeBase={knowledgeBase}
            foundryId={foundryId}
            userId={user.id}
        />
    )
}
