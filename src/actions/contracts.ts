'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface ContractTemplate {
    id: string
    template_type: string
    name: string
    content: string
    variables: ContractVariable[]
    is_default: boolean
}

export interface ContractVariable {
    name: string
    type: 'text' | 'textarea' | 'number' | 'date' | 'select'
    required: boolean
    default?: string
    placeholder?: string
    options?: string[]
}

export interface OrderContract {
    id: string
    order_id: string
    template_id: string | null
    rendered_content: string
    variable_values: Record<string, string>
    buyer_signed_at: string | null
    seller_signed_at: string | null
    pdf_url: string | null
    created_at: string
}

// Get all contract templates
export async function getContractTemplates(templateType?: string) {
    const supabase = await createClient()
    
    let query = supabase
        .from('contract_templates')
        .select('*')
    
    if (templateType) {
        query = query.eq('template_type', templateType)
    }
    
    const { data, error } = await query.order('name', { ascending: true })
    
    return { templates: (data || []) as ContractTemplate[], error: error?.message || null }
}

// Get a specific template
export async function getContractTemplate(id: string) {
    const supabase = await createClient()
    
    const { data, error } = await supabase
        .from('contract_templates')
        .select('*')
        .eq('id', id)
        .single()
    
    return { template: data as ContractTemplate | null, error: error?.message || null }
}

// Generate contract from template
export async function generateContract(input: {
    templateId: string
    orderId: string
    variableValues: Record<string, string>
}) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }
    
    // Get the template
    const { data: template, error: templateError } = await supabase
        .from('contract_templates')
        .select('*')
        .eq('id', input.templateId)
        .single()
    
    if (templateError || !template) {
        return { success: false, error: 'Template not found' }
    }
    
    // Verify order access
    const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('id, buyer_id, seller_id, provider_profiles!orders_seller_id_fkey(user_id)')
        .eq('id', input.orderId)
        .single()
    
    if (orderError || !order) {
        return { success: false, error: 'Order not found' }
    }
    
    const isBuyer = order.buyer_id === user.id
    const isSeller = (order.provider_profiles as { user_id: string })?.user_id === user.id
    
    if (!isBuyer && !isSeller) {
        return { success: false, error: 'Not authorized' }
    }
    
    // Render the template with variable values
    let renderedContent = template.content
    for (const [key, value] of Object.entries(input.variableValues)) {
        renderedContent = renderedContent.replace(new RegExp(`{{${key}}}`, 'g'), value)
    }
    
    // Check if contract already exists for this order
    const { data: existingContract } = await supabase
        .from('order_contracts')
        .select('id')
        .eq('order_id', input.orderId)
        .single()
    
    if (existingContract) {
        // Update existing contract
        const { error } = await supabase
            .from('order_contracts')
            .update({
                template_id: input.templateId,
                rendered_content: renderedContent,
                variable_values: input.variableValues,
                buyer_signed_at: null,
                seller_signed_at: null
            })
            .eq('id', existingContract.id)
        
        if (error) return { success: false, error: error.message }
    } else {
        // Create new contract
        const { error } = await supabase
            .from('order_contracts')
            .insert({
                order_id: input.orderId,
                template_id: input.templateId,
                rendered_content: renderedContent,
                variable_values: input.variableValues
            })
        
        if (error) return { success: false, error: error.message }
    }
    
    revalidatePath(`/orders/${input.orderId}`)
    return { success: true, error: null }
}

// Sign a contract
export async function signContract(contractId: string) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }
    
    // Get the contract and order
    const { data: contract, error: contractError } = await supabase
        .from('order_contracts')
        .select(`
            *,
            orders!inner (
                id,
                buyer_id,
                seller_id,
                provider_profiles!orders_seller_id_fkey (user_id)
            )
        `)
        .eq('id', contractId)
        .single()
    
    if (contractError || !contract) {
        return { success: false, error: 'Contract not found' }
    }
    
    const order = contract.orders as { buyer_id: string; seller_id: string; provider_profiles: { user_id: string } }
    const isBuyer = order.buyer_id === user.id
    const isSeller = order.provider_profiles?.user_id === user.id
    
    if (!isBuyer && !isSeller) {
        return { success: false, error: 'Not authorized' }
    }
    
    const now = new Date().toISOString()
    const updates: Record<string, string> = {}
    
    if (isBuyer && !contract.buyer_signed_at) {
        updates.buyer_signed_at = now
    } else if (isSeller && !contract.seller_signed_at) {
        updates.seller_signed_at = now
    } else {
        return { success: false, error: 'Already signed' }
    }
    
    const { error } = await supabase
        .from('order_contracts')
        .update(updates)
        .eq('id', contractId)
    
    if (error) return { success: false, error: error.message }
    
    revalidatePath(`/orders/${(contract.orders as { id: string }).id}`)
    return { success: true, error: null }
}

// Get contract for an order
export async function getOrderContract(orderId: string) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { contract: null, error: 'Not authenticated' }
    
    // Verify order access
    const { data: order } = await supabase
        .from('orders')
        .select('buyer_id, provider_profiles!orders_seller_id_fkey(user_id)')
        .eq('id', orderId)
        .single()
    
    if (!order) return { contract: null, error: 'Order not found' }
    
    const isBuyer = order.buyer_id === user.id
    const isSeller = (order.provider_profiles as { user_id: string })?.user_id === user.id
    
    if (!isBuyer && !isSeller) {
        return { contract: null, error: 'Not authorized' }
    }
    
    const { data, error } = await supabase
        .from('order_contracts')
        .select('*')
        .eq('order_id', orderId)
        .single()
    
    if (error && error.code !== 'PGRST116') {
        return { contract: null, error: error.message }
    }
    
    return { contract: data as OrderContract | null, error: null }
}

// Generate SOW from proposal
export async function generateSOWFromProposal(input: {
    orderId: string
    proposal: {
        title: string
        clientName: string
        providerName: string
        projectOverview: string
        scopeOfWork: string
        deliverables: string
        startDate: string
        endDate: string
        durationWeeks: number
        milestones?: string
        engagementType: string
        rate: number
        currency: string
        ratePeriod: string
        estimatedTotal: number
        paymentTerms: string
        assumptions?: string
    }
}) {
    const supabase = await createClient()
    
    // Get SOW template
    const { data: template } = await supabase
        .from('contract_templates')
        .select('*')
        .eq('template_type', 'sow')
        .eq('is_default', true)
        .single()
    
    if (!template) {
        return { success: false, error: 'SOW template not found' }
    }
    
    // Map proposal to template variables
    const variableValues: Record<string, string> = {
        project_name: input.proposal.title,
        effective_date: new Date().toISOString().split('T')[0],
        client_name: input.proposal.clientName,
        provider_name: input.proposal.providerName,
        project_overview: input.proposal.projectOverview,
        scope_of_work: input.proposal.scopeOfWork,
        deliverables: input.proposal.deliverables,
        start_date: input.proposal.startDate,
        end_date: input.proposal.endDate,
        duration_weeks: input.proposal.durationWeeks.toString(),
        milestones: input.proposal.milestones || 'To be defined upon project commencement',
        engagement_type: input.proposal.engagementType,
        rate: input.proposal.rate.toString(),
        currency: input.proposal.currency,
        rate_period: input.proposal.ratePeriod,
        estimated_total: input.proposal.estimatedTotal.toString(),
        payment_terms: input.proposal.paymentTerms,
        assumptions: input.proposal.assumptions || 'N/A'
    }
    
    return generateContract({
        templateId: template.id,
        orderId: input.orderId,
        variableValues
    })
}

// Generate NDA
export async function generateNDA(input: {
    orderId: string
    partyAName: string
    partyBName: string
    termYears?: number
    governingJurisdiction?: string
}) {
    const supabase = await createClient()
    
    // Get NDA template
    const { data: template } = await supabase
        .from('contract_templates')
        .select('*')
        .eq('template_type', 'nda')
        .eq('is_default', true)
        .single()
    
    if (!template) {
        return { success: false, error: 'NDA template not found' }
    }
    
    const variableValues: Record<string, string> = {
        effective_date: new Date().toISOString().split('T')[0],
        party_a_name: input.partyAName,
        party_b_name: input.partyBName,
        term_years: (input.termYears || 2).toString(),
        governing_jurisdiction: input.governingJurisdiction || 'England and Wales'
    }
    
    return generateContract({
        templateId: template.id,
        orderId: input.orderId,
        variableValues
    })
}
