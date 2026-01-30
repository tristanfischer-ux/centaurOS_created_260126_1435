'use server'


import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface CaseStudyInput {
    title: string
    client_name?: string
    client_logo_url?: string
    client_industry?: string
    company_stage?: string
    challenge: string
    approach: string
    outcome: string
    metrics?: { label: string; value: string; change_percent?: number }[]
    testimonial_quote?: string
    testimonial_author?: string
    testimonial_role?: string
    start_date?: string
    end_date?: string
    engagement_type?: 'fractional' | 'project' | 'advisory' | 'interim'
    hours_per_week?: number
    is_featured?: boolean
    is_public?: boolean
}

export async function getCaseStudies() {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { caseStudies: [], error: 'Not authenticated' }
    
    // Get provider profile
    const { data: provider } = await supabase
        .from('provider_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single()
    
    if (!provider) return { caseStudies: [], error: 'Provider profile not found' }
    
    const { data, error } = await supabase
        .from('case_studies')
        .select('*')
        .eq('provider_id', provider.id)
        .order('is_featured', { ascending: false })
        .order('display_order', { ascending: true })
    
    return { caseStudies: data || [], error: error?.message || null }
}

export async function createCaseStudy(input: CaseStudyInput) {
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
    
    // Get max display order
    const { data: maxOrder } = await supabase
        .from('case_studies')
        .select('display_order')
        .eq('provider_id', provider.id)
        .order('display_order', { ascending: false })
        .limit(1)
        .single()
    
    const nextOrder = (maxOrder?.display_order || 0) + 1
    
    const { error } = await supabase
        .from('case_studies')
        .insert({
            provider_id: provider.id,
            ...input,
            display_order: nextOrder
        })
    
    if (error) return { success: false, error: error.message }
    
    revalidatePath('/provider-portal/case-studies')
    return { success: true, error: null }
}

export async function updateCaseStudy(id: string, input: Partial<CaseStudyInput>) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }
    
    // Verify ownership
    const { data: caseStudy } = await supabase
        .from('case_studies')
        .select('provider_id, provider_profiles!inner(user_id)')
        .eq('id', id)
        .single()
    
    if (!caseStudy || (caseStudy.provider_profiles as { user_id: string }).user_id !== user.id) {
        return { success: false, error: 'Case study not found or not authorized' }
    }
    
    const { error } = await supabase
        .from('case_studies')
        .update({
            ...input,
            updated_at: new Date().toISOString()
        })
        .eq('id', id)
    
    if (error) return { success: false, error: error.message }
    
    revalidatePath('/provider-portal/case-studies')
    return { success: true, error: null }
}

export async function deleteCaseStudy(id: string) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }
    
    // Verify ownership
    const { data: caseStudy } = await supabase
        .from('case_studies')
        .select('provider_id, provider_profiles!inner(user_id)')
        .eq('id', id)
        .single()
    
    if (!caseStudy || (caseStudy.provider_profiles as { user_id: string }).user_id !== user.id) {
        return { success: false, error: 'Case study not found or not authorized' }
    }
    
    const { error } = await supabase
        .from('case_studies')
        .delete()
        .eq('id', id)
    
    if (error) return { success: false, error: error.message }
    
    revalidatePath('/provider-portal/case-studies')
    return { success: true, error: null }
}

export async function reorderCaseStudies(orderedIds: string[]) {
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
    
    // Update display order for each case study
    for (let i = 0; i < orderedIds.length; i++) {
        await supabase
            .from('case_studies')
            .update({ display_order: i })
            .eq('id', orderedIds[i])
            .eq('provider_id', provider.id)
    }
    
    revalidatePath('/provider-portal/case-studies')
    return { success: true, error: null }
}

export async function toggleCaseStudyFeatured(id: string) {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }
    
    // Get current state
    const { data: caseStudy } = await supabase
        .from('case_studies')
        .select('is_featured, provider_profiles!inner(user_id)')
        .eq('id', id)
        .single()
    
    if (!caseStudy || (caseStudy.provider_profiles as { user_id: string }).user_id !== user.id) {
        return { success: false, error: 'Case study not found or not authorized' }
    }
    
    const { error } = await supabase
        .from('case_studies')
        .update({ is_featured: !caseStudy.is_featured })
        .eq('id', id)
    
    if (error) return { success: false, error: error.message }
    
    revalidatePath('/provider-portal/case-studies')
    return { success: true, error: null }
}
