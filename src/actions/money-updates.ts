'use server'

/**
 * Money Updates server actions — investor_update + recipients.
 *
 * V1 scope: list/draft/save updates + per-recipient list. Send wiring is
 * stubbed — flipping state to 'sent' updates sent_at. Real Gmail/Resend
 * integration ships in a follow-up.
 */

import { revalidatePath } from 'next/cache'
import { withAuth } from '@/lib/server-action-utils'

export type InvestorUpdateRow = {
  id: string
  round_id: string | null
  month_label: string
  subject: string
  body_html: string
  body_sections: Record<string, unknown>
  headline_quote: string | null
  state: 'draft' | 'scheduled' | 'sent' | 'cancelled'
  scheduled_for: string | null
  sent_at: string | null
  aggregate_delivered: number
  aggregate_opened: number
  aggregate_replied: number
  aggregate_bounced: number
  created_at: string
}

export type InvestorUpdateRecipientRow = {
  id: string
  email: string
  name: string | null
  pipeline_state_id: string | null
  stage_at_send: string | null
  delivered_at: string | null
  opened_count: number
  opened_first_at: string | null
  clicked_count: number
  replied_at: string | null
  bounced_at: string | null
}

export type DraftUpdateInput = {
  month_label: string
  subject: string
  body_html?: string
  body_sections?: Record<string, unknown>
  headline_quote?: string | null
  round_id?: string | null
}

function asSections(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function isUpdateState(s: string): s is InvestorUpdateRow['state'] {
  return s === 'draft' || s === 'scheduled' || s === 'sent' || s === 'cancelled'
}

export async function listInvestorUpdates(): Promise<
  { updates: InvestorUpdateRow[] } | { error: string }
> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { data, error } = await supabase
      .from('investor_update')
      .select(
        'id, round_id, month_label, subject, body_html, body_sections, headline_quote, state, scheduled_for, sent_at, aggregate_delivered, aggregate_opened, aggregate_replied, aggregate_bounced, created_at',
      )
      .eq('foundry_id', foundryId)
      .order('created_at', { ascending: false })

    if (error) return { error: error.message }

    const updates: InvestorUpdateRow[] = (data ?? []).map((u) => ({
      id: u.id,
      round_id: u.round_id,
      month_label: u.month_label,
      subject: u.subject,
      body_html: u.body_html,
      body_sections: asSections(u.body_sections),
      headline_quote: u.headline_quote,
      state: isUpdateState(u.state) ? u.state : 'draft',
      scheduled_for: u.scheduled_for,
      sent_at: u.sent_at,
      aggregate_delivered: u.aggregate_delivered,
      aggregate_opened: u.aggregate_opened,
      aggregate_replied: u.aggregate_replied,
      aggregate_bounced: u.aggregate_bounced,
      created_at: u.created_at,
    }))

    return { updates }
  })
}

export async function getInvestorUpdate(
  id: string,
): Promise<
  { update: InvestorUpdateRow; recipients: InvestorUpdateRecipientRow[] } | { error: string }
> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { data: u, error } = await supabase
      .from('investor_update')
      .select(
        'id, round_id, month_label, subject, body_html, body_sections, headline_quote, state, scheduled_for, sent_at, aggregate_delivered, aggregate_opened, aggregate_replied, aggregate_bounced, created_at, foundry_id',
      )
      .eq('id', id)
      .maybeSingle()
    if (error) return { error: error.message }
    if (!u || u.foundry_id !== foundryId) return { error: 'Update not found' }

    const { data: recipientsRows } = await supabase
      .from('investor_update_recipient')
      .select(
        'id, email, name, pipeline_state_id, stage_at_send, delivered_at, opened_count, opened_first_at, clicked_count, replied_at, bounced_at',
      )
      .eq('update_id', id)
      .eq('foundry_id', foundryId)
      .order('email', { ascending: true })

    const update: InvestorUpdateRow = {
      id: u.id,
      round_id: u.round_id,
      month_label: u.month_label,
      subject: u.subject,
      body_html: u.body_html,
      body_sections: asSections(u.body_sections),
      headline_quote: u.headline_quote,
      state: isUpdateState(u.state) ? u.state : 'draft',
      scheduled_for: u.scheduled_for,
      sent_at: u.sent_at,
      aggregate_delivered: u.aggregate_delivered,
      aggregate_opened: u.aggregate_opened,
      aggregate_replied: u.aggregate_replied,
      aggregate_bounced: u.aggregate_bounced,
      created_at: u.created_at,
    }

    return { update, recipients: (recipientsRows ?? []) as InvestorUpdateRecipientRow[] }
  })
}

export async function draftInvestorUpdate(
  input: DraftUpdateInput,
): Promise<{ id: string } | { error: string }> {
  return withAuth(async ({ supabase, foundryId, user }) => {
    if (!input.month_label?.trim()) return { error: 'Month label is required' }
    if (!input.subject?.trim()) return { error: 'Subject is required' }

    const { data, error } = await supabase
      .from('investor_update')
      .insert({
        foundry_id: foundryId,
        round_id: input.round_id ?? null,
        month_label: input.month_label.trim(),
        subject: input.subject.trim(),
        body_html: input.body_html ?? '',
        body_sections: input.body_sections ?? {},
        headline_quote: input.headline_quote ?? null,
        state: 'draft',
        sent_by_user_id: user.id,
      })
      .select('id')
      .single()
    if (error || !data) return { error: error?.message ?? 'Insert failed' }
    revalidatePath('/money/raise/update')
    return { id: data.id }
  })
}

export async function updateInvestorUpdate(
  id: string,
  input: Partial<DraftUpdateInput>,
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    const update: Record<string, unknown> = {}
    if (input.subject !== undefined) update.subject = input.subject
    if (input.month_label !== undefined) update.month_label = input.month_label
    if (input.body_html !== undefined) update.body_html = input.body_html
    if (input.body_sections !== undefined) update.body_sections = input.body_sections
    if (input.headline_quote !== undefined) update.headline_quote = input.headline_quote
    if (input.round_id !== undefined) update.round_id = input.round_id

    const { error } = await supabase
      .from('investor_update')
      .update(update)
      .eq('id', id)
      .eq('foundry_id', foundryId)
    if (error) return { error: error.message }
    revalidatePath('/money/raise/update')
    revalidatePath(`/money/raise/update/${id}`)
    return { success: true as const }
  })
}

export async function markUpdateSent(
  id: string,
): Promise<{ success: true } | { error: string }> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { error } = await supabase
      .from('investor_update')
      .update({ state: 'sent', sent_at: new Date().toISOString() })
      .eq('id', id)
      .eq('foundry_id', foundryId)
    if (error) return { error: error.message }
    revalidatePath('/money/raise/update')
    revalidatePath(`/money/raise/update/${id}`)
    return { success: true as const }
  })
}
