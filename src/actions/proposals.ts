'use server'
// @ts-nocheck - Database types out of sync

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface ProposalInput {
    rfqId: string
    proposalTitle: string
    proposalSummary: string
    scopeOfWork: string
    deliverables: { title: string; description: string }[]
    timelineWeeks: number
    milestones: { title: string; description: string; amount: number; dueWeek: number }[]
    quotedPrice: number
    pricingBreakdown: { item: string; amount: number; description?: string }[]
    termsAndConditions?: string
    validUntil?: string
    attachments?: { name: string; url: string; type: string }[]
}

// Submit a detailed proposal in response to an RFQ
export async function submitProposal(input: ProposalInput) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }
    
    // Get provider profile
    const { data: provider } = await supabase
        .from('provider_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single()
    
    if (!provider) return { success: false, error: 'Provider profile not found' }
    
    // Check if already responded
    const { data: existingResponse } = await supabase
        .from('rfq_responses')
        .select('id')
        .eq('rfq_id', input.rfqId)
        .eq('provider_id', provider.id)
        .single()
    
    const proposalData = {
        rfq_id: input.rfqId,
        provider_id: provider.id,
        response_type: 'accept',
        quoted_price: input.quotedPrice,
        proposal_title: input.proposalTitle,
        proposal_summary: input.proposalSummary,
        scope_of_work: input.scopeOfWork,
        deliverables: input.deliverables,
        timeline_weeks: input.timelineWeeks,
        milestones: input.milestones,
        pricing_breakdown: input.pricingBreakdown,
        terms_and_conditions: input.termsAndConditions,
        valid_until: input.validUntil,
        attachments: input.attachments || [],
        updated_at: new Date().toISOString()
    }
    
    if (existingResponse) {
        // Update existing response
        const { error } = await supabase
            .from('rfq_responses')
            .update(proposalData)
            .eq('id', existingResponse.id)
        
        if (error) return { success: false, error: error.message }
    } else {
        // Create new response
        const { error } = await supabase
            .from('rfq_responses')
            .insert({
                ...proposalData,
                responded_at: new Date().toISOString()
            })
        
        if (error) return { success: false, error: error.message }
    }
    
    revalidatePath('/provider-portal/rfqs')
    return { success: true, error: null }
}

// Get all proposals for an RFQ (buyer view)
export async function getRFQProposals(rfqId: string) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { proposals: [], error: 'Not authenticated' }
    
    // Verify buyer owns the RFQ
    const { data: rfq } = await supabase
        .from('rfqs')
        .select('buyer_id')
        .eq('id', rfqId)
        .single()
    
    if (!rfq || rfq.buyer_id !== user.id) {
        return { proposals: [], error: 'Not authorized' }
    }
    
    const { data, error } = await supabase
        .from('rfq_responses')
        .select(`
            *,
            provider_profiles!rfq_responses_provider_id_fkey (
                id,
                headline,
                day_rate,
                currency,
                tier,
                profiles!provider_profiles_user_id_fkey (
                    full_name,
                    avatar_url
                ),
                provider_ratings (
                    average_rating,
                    total_reviews
                )
            )
        `)
        .eq('rfq_id', rfqId)
        .eq('response_type', 'accept')
        .order('buyer_shortlisted', { ascending: false })
        .order('responded_at', { ascending: true })
    
    return { proposals: data || [], error: error?.message || null }
}

// Mark a proposal as viewed
export async function markProposalViewed(proposalId: string) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }
    
    // Verify buyer owns the RFQ
    const { data: proposal } = await supabase
        .from('rfq_responses')
        .select('rfq_id, rfqs!inner(buyer_id)')
        .eq('id', proposalId)
        .single()
    
    if (!proposal || (proposal.rfqs as { buyer_id: string }).buyer_id !== user.id) {
        return { success: false, error: 'Not authorized' }
    }
    
    const { error } = await supabase
        .from('rfq_responses')
        .update({ buyer_viewed_at: new Date().toISOString() })
        .eq('id', proposalId)
    
    if (error) return { success: false, error: error.message }
    
    return { success: true, error: null }
}

// Shortlist a proposal
export async function toggleProposalShortlist(proposalId: string) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }
    
    // Verify buyer owns the RFQ and get current state
    const { data: proposal } = await supabase
        .from('rfq_responses')
        .select('buyer_shortlisted, rfq_id, rfqs!inner(buyer_id)')
        .eq('id', proposalId)
        .single()
    
    if (!proposal || (proposal.rfqs as { buyer_id: string }).buyer_id !== user.id) {
        return { success: false, error: 'Not authorized' }
    }
    
    const { error } = await supabase
        .from('rfq_responses')
        .update({ buyer_shortlisted: !proposal.buyer_shortlisted })
        .eq('id', proposalId)
    
    if (error) return { success: false, error: error.message }
    
    revalidatePath(`/rfqs/${proposal.rfq_id}`)
    return { success: true, error: null }
}

// Award proposal (convert to order)
export async function awardProposal(proposalId: string) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, orderId: null, error: 'Not authenticated' }
    
    // Get proposal details
    const { data: proposal } = await supabase
        .from('rfq_responses')
        .select(`
            *,
            rfqs!inner (
                id,
                buyer_id,
                title,
                foundry_id
            ),
            provider_profiles!rfq_responses_provider_id_fkey (
                id,
                listing_id
            )
        `)
        .eq('id', proposalId)
        .single()
    
    if (!proposal) {
        return { success: false, orderId: null, error: 'Proposal not found' }
    }
    
    const rfq = proposal.rfqs as { id: string; buyer_id: string; title: string; foundry_id: string }
    
    if (rfq.buyer_id !== user.id) {
        return { success: false, orderId: null, error: 'Not authorized' }
    }
    
    const providerProfile = proposal.provider_profiles as { id: string; listing_id: string | null }
    
    // Calculate platform fee (8%)
    const platformFee = proposal.quoted_price * 0.08
    // Calculate VAT (20%)
    const vatAmount = (proposal.quoted_price + platformFee) * 0.20
    const totalAmount = proposal.quoted_price + platformFee + vatAmount
    
    // Create order from proposal
    const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
            buyer_id: user.id,
            seller_id: providerProfile.id,
            listing_id: providerProfile.listing_id,
            order_type: 'service',
            total_amount: totalAmount,
            platform_fee: platformFee,
            vat_amount: vatAmount,
            currency: 'GBP',
            status: 'pending',
            escrow_status: 'pending',
            objective_id: null,
            business_function_id: null
        })
        .select()
        .single()
    
    if (orderError) {
        return { success: false, orderId: null, error: orderError.message }
    }
    
    // Create milestones from proposal if available
    if (proposal.milestones && Array.isArray(proposal.milestones)) {
        const milestones = (proposal.milestones as { title: string; description: string; amount: number; dueWeek: number }[]).map((m, i) => ({
            order_id: order.id,
            title: m.title,
            description: m.description,
            amount: m.amount,
            due_date: new Date(Date.now() + m.dueWeek * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            status: 'pending'
        }))
        
        await supabase.from('order_milestones').insert(milestones)
    }
    
    // Update RFQ as awarded
    await supabase
        .from('rfqs')
        .update({
            status: 'Awarded',
            awarded_to: providerProfile.id
        })
        .eq('id', rfq.id)
    
    revalidatePath('/rfqs')
    revalidatePath('/orders')
    return { success: true, orderId: order.id, error: null }
}

// Get provider's proposal for an RFQ
export async function getMyProposal(rfqId: string) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { proposal: null, error: 'Not authenticated' }
    
    // Get provider profile
    const { data: provider } = await supabase
        .from('provider_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single()
    
    if (!provider) return { proposal: null, error: 'Provider profile not found' }
    
    const { data, error } = await supabase
        .from('rfq_responses')
        .select('*')
        .eq('rfq_id', rfqId)
        .eq('provider_id', provider.id)
        .single()
    
    if (error && error.code !== 'PGRST116') {
        return { proposal: null, error: error.message }
    }
    
    return { proposal: data, error: null }
}
