'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'
import type {
  Blueprint,
  BlueprintTemplate,
  KnowledgeDomain,
  DomainCoverage,
  DomainCoverageWithDetails,
  Expertise,
  Supplier,
  BlueprintSupplier,
  BlueprintMilestone,
  BlueprintHistoryEntry,
  BlueprintSummary,
  DomainTreeNode,
  CreateBlueprintInput,
  UpdateBlueprintInput,
  UpdateCoverageInput,
  AddExpertiseInput,
  AddSupplierInput,
  CreateMilestoneInput,
  CoverageStatus,
  NextAction,
  AssessmentQuestion,
  AssessmentAnswer,
  DomainCategory,
} from '@/types/blueprints'

// ============================================================================
// BLUEPRINT TEMPLATES
// ============================================================================

export async function getBlueprintTemplates(): Promise<{ 
  data: BlueprintTemplate[] | null
  error: string | null 
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('blueprint_templates')
    .select('*')
    .or('is_system_template.eq.true,created_by.eq.' + (await supabase.auth.getUser()).data.user?.id)
    .order('use_count', { ascending: false })

  if (error) {
    console.error('Error fetching blueprint templates:', error)
    return { data: null, error: sanitizeErrorMessage(error) }
  }

  return { data: data as BlueprintTemplate[], error: null }
}

export async function getBlueprintTemplate(templateId: string): Promise<{
  data: BlueprintTemplate | null
  error: string | null
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('blueprint_templates')
    .select('*')
    .eq('id', templateId)
    .single()

  if (error) {
    console.error('Error fetching blueprint template:', error)
    return { data: null, error: sanitizeErrorMessage(error) }
  }

  return { data: data as BlueprintTemplate, error: null }
}

// ============================================================================
// KNOWLEDGE DOMAINS
// ============================================================================

export async function getTemplateDomains(templateId: string): Promise<{
  data: KnowledgeDomain[] | null
  error: string | null
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('knowledge_domains')
    .select('*')
    .eq('template_id', templateId)
    .order('depth')
    .order('display_order')

  if (error) {
    console.error('Error fetching template domains:', error)
    return { data: null, error: sanitizeErrorMessage(error) }
  }

  return { data: data as unknown as KnowledgeDomain[], error: null }
}

export async function getDomainTree(templateId: string): Promise<{
  data: DomainTreeNode[] | null
  error: string | null
}> {
  const { data: domains, error } = await getTemplateDomains(templateId)

  if (error || !domains) {
    return { data: null, error }
  }

  // Build tree structure
  const domainMap = new Map<string, DomainTreeNode>()
  const rootNodes: DomainTreeNode[] = []

  // First pass: create all nodes
  for (const domain of domains) {
    domainMap.set(domain.id, {
      ...domain,
      children: [],
      path: domain.name,
    })
  }

  // Second pass: build hierarchy
  for (const domain of domains) {
    const node = domainMap.get(domain.id)!
    if (domain.parent_id) {
      const parent = domainMap.get(domain.parent_id)
      if (parent) {
        parent.children.push(node)
        node.path = `${parent.path} > ${node.name}`
      } else {
        rootNodes.push(node)
      }
    } else {
      rootNodes.push(node)
    }
  }

  return { data: rootNodes, error: null }
}

// ============================================================================
// BLUEPRINTS
// ============================================================================

export async function getBlueprints(): Promise<{
  data: Blueprint[] | null
  error: string | null
}> {
  const supabase = await createClient()
  const foundryId = await getFoundryIdCached()

  if (!foundryId) {
    return { data: null, error: 'No foundry context' }
  }

  const { data, error } = await supabase
    .from('blueprints')
    .select(`
      *,
      template:blueprint_templates(id, name, icon, product_category)
    `)
    .eq('foundry_id', foundryId)
    .neq('status', 'archived')
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('Error fetching blueprints:', error)
    return { data: null, error: sanitizeErrorMessage(error) }
  }

  return { data: data as Blueprint[], error: null }
}

export async function getBlueprint(blueprintId: string): Promise<{
  data: Blueprint | null
  error: string | null
}> {
  const supabase = await createClient()
  
  // SECURITY: Get user's foundry for isolation check
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { data: null, error: 'No foundry context' }
  }

  const { data, error } = await supabase
    .from('blueprints')
    .select(`
      *,
      template:blueprint_templates(*)
    `)
    .eq('id', blueprintId)
    .single()

  if (error) {
    console.error('Error fetching blueprint:', error)
    return { data: null, error: sanitizeErrorMessage(error) }
  }

  // SECURITY: Verify blueprint belongs to user's foundry
  if (data && data.foundry_id !== foundryId) {
    return { data: null, error: 'Blueprint not found' }
  }

  return { data: data as Blueprint, error: null }
}

export async function createBlueprint(input: CreateBlueprintInput): Promise<{
  data: Blueprint | null
  error: string | null
}> {
  const supabase = await createClient()
  const foundryId = await getFoundryIdCached()
  const user = (await supabase.auth.getUser()).data.user

  if (!foundryId) {
    return { data: null, error: 'No foundry context' }
  }

  // If using a template, use the clone function
  if (input.template_id) {
    const { data: blueprintId, error } = await supabase
      .rpc('clone_blueprint_from_template', {
        p_template_id: input.template_id,
        p_foundry_id: foundryId,
        p_name: input.name,
        p_description: input.description || null,
        p_created_by: user?.id || null,
      })

    if (error) {
      console.error('Error creating blueprint from template:', error)
      return { data: null, error: sanitizeErrorMessage(error) }
    }

    // Fetch the created blueprint
    const { data: blueprint } = await getBlueprint(blueprintId)
    
    revalidatePath('/blueprints')
    return { data: blueprint, error: null }
  }

  // Create blank blueprint
  const { data, error } = await supabase
    .from('blueprints')
    .insert({
      foundry_id: foundryId,
      name: input.name,
      description: input.description,
      project_type: input.project_type || 'product',
      project_stage: input.project_stage || 'concept',
      created_by: user?.id,
      ai_generated_context: input.ai_description 
        ? { original_description: input.ai_description }
        : {},
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating blueprint:', error)
    return { data: null, error: sanitizeErrorMessage(error) }
  }

  revalidatePath('/blueprints')
  return { data: data as Blueprint, error: null }
}

export async function updateBlueprint(
  blueprintId: string,
  input: UpdateBlueprintInput
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  
  // SECURITY: Get user's foundry for isolation check
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { error: 'No foundry context' }
  }

  // SECURITY: Verify blueprint belongs to user's foundry before update
  const { data: blueprint } = await supabase
    .from('blueprints')
    .select('foundry_id')
    .eq('id', blueprintId)
    .single()
  
  if (!blueprint || blueprint.foundry_id !== foundryId) {
    return { error: 'Blueprint not found' }
  }

  const { error } = await supabase
    .from('blueprints')
    .update({
      ...input,
      updated_at: new Date().toISOString(),
    })
    .eq('id', blueprintId)

  if (error) {
    console.error('Error updating blueprint:', error)
    return { error: sanitizeErrorMessage(error) }
  }

  revalidatePath('/blueprints')
  revalidatePath(`/blueprints/${blueprintId}`)
  return { error: null }
}

export async function deleteBlueprint(blueprintId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  
  // SECURITY: Get user's foundry for isolation check
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { error: 'No foundry context' }
  }

  // SECURITY: Verify blueprint belongs to user's foundry before delete
  const { data: blueprint } = await supabase
    .from('blueprints')
    .select('foundry_id')
    .eq('id', blueprintId)
    .single()
  
  if (!blueprint || blueprint.foundry_id !== foundryId) {
    return { error: 'Blueprint not found' }
  }

  const { error } = await supabase
    .from('blueprints')
    .delete()
    .eq('id', blueprintId)

  if (error) {
    console.error('Error deleting blueprint:', error)
    return { error: sanitizeErrorMessage(error) }
  }

  revalidatePath('/blueprints')
  return { error: null }
}

export async function archiveBlueprint(blueprintId: string): Promise<{ error: string | null }> {
  return updateBlueprint(blueprintId, { status: 'archived' })
}

// ============================================================================
// DOMAIN COVERAGE
// ============================================================================

export async function getBlueprintCoverage(blueprintId: string): Promise<{
  data: DomainCoverage[] | null
  error: string | null
}> {
  const supabase = await createClient()
  
  // SECURITY: Verify blueprint belongs to user's foundry
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { data: null, error: 'No foundry context' }
  }

  // First verify the blueprint belongs to this foundry
  const { data: blueprint } = await supabase
    .from('blueprints')
    .select('foundry_id')
    .eq('id', blueprintId)
    .single()
  
  if (!blueprint || blueprint.foundry_id !== foundryId) {
    return { data: null, error: 'Blueprint not found' }
  }

  const { data, error } = await supabase
    .from('blueprint_domain_coverage')
    .select(`
      *,
      domain:knowledge_domains(*),
      expertise:blueprint_expertise(
        *,
        profile:profiles(id, full_name, avatar_url, role)
      )
    `)
    .eq('blueprint_id', blueprintId)

  if (error) {
    console.error('Error fetching blueprint coverage:', error)
    return { data: null, error: sanitizeErrorMessage(error) }
  }

  return { data: data as unknown as DomainCoverageWithDetails[], error: null }
}

export async function updateDomainCoverage(
  coverageId: string,
  input: UpdateCoverageInput
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  
  // SECURITY: Verify coverage belongs to user's foundry via blueprint
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { error: 'No foundry context' }
  }

  const { data: coverage } = await supabase
    .from('blueprint_domain_coverage')
    .select('blueprint:blueprints(foundry_id)')
    .eq('id', coverageId)
    .single()
  
  if (!coverage?.blueprint || (coverage.blueprint as { foundry_id: string }).foundry_id !== foundryId) {
    return { error: 'Coverage not found' }
  }

  const { error } = await supabase
    .from('blueprint_domain_coverage')
    .update({
      status: input.status,
      notes: input.notes,
      blockers: input.blockers || [],
      updated_at: new Date().toISOString(),
    })
    .eq('id', coverageId)

  if (error) {
    console.error('Error updating domain coverage:', error)
    return { error: sanitizeErrorMessage(error) }
  }

  revalidatePath('/blueprints')
  return { error: null }
}

export async function batchUpdateCoverage(
  updates: { coverage_id: string; status: CoverageStatus; notes?: string }[]
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  
  // SECURITY: Verify all coverages belong to user's foundry
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { error: 'No foundry context' }
  }

  for (const update of updates) {
    // Verify each coverage belongs to this foundry
    const { data: coverage } = await supabase
      .from('blueprint_domain_coverage')
      .select('blueprint:blueprints(foundry_id)')
      .eq('id', update.coverage_id)
      .single()
    
    if (!coverage?.blueprint || (coverage.blueprint as { foundry_id: string }).foundry_id !== foundryId) {
      return { error: 'Coverage not found or unauthorized' }
    }

    const { error } = await supabase
      .from('blueprint_domain_coverage')
      .update({
        status: update.status,
        notes: update.notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', update.coverage_id)

    if (error) {
      console.error('Error in batch update:', error)
      return { error: sanitizeErrorMessage(error) }
    }
  }

  revalidatePath('/blueprints')
  return { error: null }
}

// ============================================================================
// EXPERTISE
// ============================================================================

export async function addExpertise(input: AddExpertiseInput): Promise<{
  data: Expertise | null
  error: string | null
}> {
  const supabase = await createClient()
  
  // SECURITY: Verify coverage belongs to user's foundry
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { data: null, error: 'No foundry context' }
  }

  const { data: coverage } = await supabase
    .from('blueprint_domain_coverage')
    .select('blueprint:blueprints(foundry_id)')
    .eq('id', input.coverage_id)
    .single()
  
  if (!coverage?.blueprint || (coverage.blueprint as { foundry_id: string }).foundry_id !== foundryId) {
    return { data: null, error: 'Coverage not found' }
  }

  const { data, error } = await supabase
    .from('blueprint_expertise')
    .insert({
      coverage_id: input.coverage_id,
      person_type: input.person_type,
      profile_id: input.profile_id,
      marketplace_listing_id: input.marketplace_listing_id,
      external_contact: input.external_contact,
      expertise_level: input.expertise_level,
      confidence: input.confidence,
      specific_skills: input.specific_skills || [],
      availability: input.availability,
      notes: input.notes,
    })
    .select()
    .single()

  if (error) {
    console.error('Error adding expertise:', error)
    return { data: null, error: sanitizeErrorMessage(error) }
  }

  revalidatePath('/blueprints')
  return { data: data as unknown as Expertise, error: null }
}

export async function removeExpertise(expertiseId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  
  // SECURITY: Verify expertise belongs to user's foundry via coverage->blueprint
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { error: 'No foundry context' }
  }

  const { data: expertise } = await supabase
    .from('blueprint_expertise')
    .select('coverage:blueprint_domain_coverage(blueprint:blueprints(foundry_id))')
    .eq('id', expertiseId)
    .single()
  
  const blueprintFoundryId = (expertise?.coverage as { blueprint?: { foundry_id: string } })?.blueprint?.foundry_id
  if (!blueprintFoundryId || blueprintFoundryId !== foundryId) {
    return { error: 'Expertise not found' }
  }

  const { error } = await supabase
    .from('blueprint_expertise')
    .delete()
    .eq('id', expertiseId)

  if (error) {
    console.error('Error removing expertise:', error)
    return { error: sanitizeErrorMessage(error) }
  }

  revalidatePath('/blueprints')
  return { error: null }
}

// ============================================================================
// SUPPLIERS
// ============================================================================

export async function getSuppliers(filters?: {
  type?: string
  categories?: string[]
  search?: string
}): Promise<{
  data: Supplier[] | null
  error: string | null
}> {
  const supabase = await createClient()

  let query = supabase
    .from('suppliers')
    .select('*')
    .order('community_rating', { ascending: false, nullsFirst: false })

  if (filters?.type) {
    query = query.eq('supplier_type', filters.type)
  }

  if (filters?.categories && filters.categories.length > 0) {
    query = query.overlaps('domain_categories', filters.categories)
  }

  if (filters?.search) {
    query = query.or(`name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`)
  }

  const { data, error } = await query.limit(50)

  if (error) {
    console.error('Error fetching suppliers:', error)
    return { data: null, error: sanitizeErrorMessage(error) }
  }

  return { data: data as Supplier[], error: null }
}

export async function getBlueprintSuppliers(blueprintId: string): Promise<{
  data: BlueprintSupplier[] | null
  error: string | null
}> {
  const supabase = await createClient()
  
  // SECURITY: Verify blueprint belongs to user's foundry
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { data: null, error: 'No foundry context' }
  }

  const { data: blueprint } = await supabase
    .from('blueprints')
    .select('foundry_id')
    .eq('id', blueprintId)
    .single()
  
  if (!blueprint || blueprint.foundry_id !== foundryId) {
    return { data: null, error: 'Blueprint not found' }
  }

  const { data, error } = await supabase
    .from('blueprint_suppliers')
    .select(`
      *,
      supplier:suppliers(*)
    `)
    .eq('blueprint_id', blueprintId)

  if (error) {
    console.error('Error fetching blueprint suppliers:', error)
    return { data: null, error: sanitizeErrorMessage(error) }
  }

  return { data: data as unknown as BlueprintSupplier[], error: null }
}

export async function addBlueprintSupplier(input: AddSupplierInput): Promise<{
  data: BlueprintSupplier | null
  error: string | null
}> {
  const supabase = await createClient()
  
  // SECURITY: Verify blueprint belongs to user's foundry
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { data: null, error: 'No foundry context' }
  }

  const { data: blueprint } = await supabase
    .from('blueprints')
    .select('foundry_id')
    .eq('id', input.blueprint_id)
    .single()
  
  if (!blueprint || blueprint.foundry_id !== foundryId) {
    return { data: null, error: 'Blueprint not found' }
  }

  const { data, error } = await supabase
    .from('blueprint_suppliers')
    .insert({
      blueprint_id: input.blueprint_id,
      supplier_id: input.supplier_id,
      role: input.role,
      status: input.status || 'evaluating',
      domain_categories: input.domain_categories || [],
      notes: input.notes,
    })
    .select(`
      *,
      supplier:suppliers(*)
    `)
    .single()

  if (error) {
    console.error('Error adding blueprint supplier:', error)
    return { data: null, error: sanitizeErrorMessage(error) }
  }

  revalidatePath('/blueprints')
  return { data: data as unknown as BlueprintSupplier, error: null }
}

export async function removeBlueprintSupplier(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  
  // SECURITY: Verify supplier record belongs to user's foundry via blueprint
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { error: 'No foundry context' }
  }

  const { data: supplierRecord } = await supabase
    .from('blueprint_suppliers')
    .select('blueprint:blueprints(foundry_id)')
    .eq('id', id)
    .single()
  
  const blueprintFoundryId = (supplierRecord?.blueprint as { foundry_id?: string })?.foundry_id
  if (!blueprintFoundryId || blueprintFoundryId !== foundryId) {
    return { error: 'Supplier not found' }
  }

  const { error } = await supabase
    .from('blueprint_suppliers')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error removing blueprint supplier:', error)
    return { error: sanitizeErrorMessage(error) }
  }

  revalidatePath('/blueprints')
  return { error: null }
}

// ============================================================================
// MILESTONES
// ============================================================================

export async function getBlueprintMilestones(blueprintId: string): Promise<{
  data: BlueprintMilestone[] | null
  error: string | null
}> {
  const supabase = await createClient()
  
  // SECURITY: Verify blueprint belongs to user's foundry
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { data: null, error: 'No foundry context' }
  }

  const { data: blueprint } = await supabase
    .from('blueprints')
    .select('foundry_id')
    .eq('id', blueprintId)
    .single()
  
  if (!blueprint || blueprint.foundry_id !== foundryId) {
    return { data: null, error: 'Blueprint not found' }
  }

  const { data, error } = await supabase
    .from('blueprint_milestones')
    .select('*')
    .eq('blueprint_id', blueprintId)
    .order('display_order')

  if (error) {
    console.error('Error fetching blueprint milestones:', error)
    return { data: null, error: sanitizeErrorMessage(error) }
  }

  return { data: data as BlueprintMilestone[], error: null }
}

export async function createMilestone(input: CreateMilestoneInput): Promise<{
  data: BlueprintMilestone | null
  error: string | null
}> {
  const supabase = await createClient()
  
  // SECURITY: Verify blueprint belongs to user's foundry
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { data: null, error: 'No foundry context' }
  }

  const { data: blueprint } = await supabase
    .from('blueprints')
    .select('foundry_id')
    .eq('id', input.blueprint_id)
    .single()
  
  if (!blueprint || blueprint.foundry_id !== foundryId) {
    return { data: null, error: 'Blueprint not found' }
  }

  const { data, error } = await supabase
    .from('blueprint_milestones')
    .insert({
      blueprint_id: input.blueprint_id,
      name: input.name,
      description: input.description,
      target_date: input.target_date,
      required_domain_ids: input.required_domain_ids || [],
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating milestone:', error)
    return { data: null, error: sanitizeErrorMessage(error) }
  }

  revalidatePath('/blueprints')
  return { data: data as BlueprintMilestone, error: null }
}

export async function updateMilestoneStatus(
  milestoneId: string,
  status: 'upcoming' | 'in_progress' | 'complete' | 'blocked'
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  
  // SECURITY: Verify milestone belongs to user's foundry via blueprint
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { error: 'No foundry context' }
  }

  const { data: milestone } = await supabase
    .from('blueprint_milestones')
    .select('blueprint:blueprints(foundry_id)')
    .eq('id', milestoneId)
    .single()
  
  const blueprintFoundryId = (milestone?.blueprint as { foundry_id?: string })?.foundry_id
  if (!blueprintFoundryId || blueprintFoundryId !== foundryId) {
    return { error: 'Milestone not found' }
  }

  const { error } = await supabase
    .from('blueprint_milestones')
    .update({
      status,
      completed_at: status === 'complete' ? new Date().toISOString() : null,
    })
    .eq('id', milestoneId)

  if (error) {
    console.error('Error updating milestone status:', error)
    return { error: sanitizeErrorMessage(error) }
  }

  revalidatePath('/blueprints')
  return { error: null }
}

// ============================================================================
// SUMMARY & METRICS
// ============================================================================

export async function getBlueprintSummary(blueprintId: string): Promise<{
  data: BlueprintSummary | null
  error: string | null
}> {
  const { data: coverage, error } = await getBlueprintCoverage(blueprintId)

  if (error || !coverage) {
    return { data: null, error }
  }

  // Calculate summary
  const total = coverage.length
  const covered = coverage.filter(c => c.status === 'covered').length
  const partial = coverage.filter(c => c.status === 'partial').length
  const gaps = coverage.filter(c => c.status === 'gap').length
  const notNeeded = coverage.filter(c => c.status === 'not_needed').length
  const criticalGaps = coverage.filter(c => c.status === 'gap' && c.is_critical).length

  const applicableTotal = total - notNeeded
  const coveragePercentage = applicableTotal > 0
    ? Math.round(((covered + partial * 0.5) / applicableTotal) * 100)
    : 100

  // Group by category
  const categoryMap = new Map<DomainCategory, DomainCoverage[]>()
  for (const item of coverage) {
    const cat = (item as DomainCoverageWithDetails).domain?.category as DomainCategory
    if (cat) {
      if (!categoryMap.has(cat)) {
        categoryMap.set(cat, [])
      }
      categoryMap.get(cat)!.push(item)
    }
  }

  const byCategory = Array.from(categoryMap.entries()).map(([category, items]) => ({
    category,
    total: items.length,
    covered: items.filter(i => i.status === 'covered').length,
    gaps: items.filter(i => i.status === 'gap').length,
    coverage_percentage: Math.round(
      (items.filter(i => i.status === 'covered' || i.status === 'partial').length / items.length) * 100
    ),
  }))

  return {
    data: {
      total_domains: total,
      covered,
      partial,
      gaps,
      not_needed: notNeeded,
      coverage_percentage: coveragePercentage,
      critical_gaps: criticalGaps,
      by_category: byCategory,
    },
    error: null,
  }
}

// ============================================================================
// NEXT ACTION (UX FOCUSED)
// ============================================================================

export async function getNextAction(blueprintId: string): Promise<{
  data: NextAction | null
  error: string | null
}> {
  const { data: coverage, error } = await getBlueprintCoverage(blueprintId)

  if (error || !coverage) {
    return { data: null, error }
  }

  // Find the most critical gap
  const criticalGaps = coverage.filter(
    c => c.status === 'gap' && c.is_critical
  ) as DomainCoverageWithDetails[]

  const regularGaps = coverage.filter(
    c => c.status === 'gap' && !c.is_critical
  ) as DomainCoverageWithDetails[]

  const gapToAddress = criticalGaps[0] || regularGaps[0]

  if (!gapToAddress) {
    // No gaps! Return a celebration
    return {
      data: {
        type: 'update',
        priority: 'low',
        title: 'All domains covered!',
        description: 'Great job! Your blueprint has no gaps. Consider reviewing partial coverage areas.',
        actions: [
          { label: 'Review Partial Coverage', action: 'review_partial', url: `/blueprints/${blueprintId}?filter=partial` },
        ],
      },
      error: null,
    }
  }

  const domain = gapToAddress.domain!

  return {
    data: {
      type: 'gap',
      priority: gapToAddress.is_critical ? 'critical' : 'high',
      title: domain.name,
      description: domain.description || `You need expertise in ${domain.name} to proceed.`,
      domain: gapToAddress,
      actions: [
        { label: 'Find Expert', action: 'marketplace', url: `/marketplace?category=${domain.marketplace_categories?.[0] || 'People'}` },
        { label: 'Ask Advisory', action: 'advisory', url: `/advisory/new?topic=${encodeURIComponent(domain.name)}` },
        { label: 'I\'ll Handle This', action: 'self_assign' },
      ],
    },
    error: null,
  }
}

// ============================================================================
// GUIDED ASSESSMENT
// ============================================================================

export async function getAssessmentQuestions(
  blueprintId: string,
  options?: { criticalOnly?: boolean; limit?: number }
): Promise<{
  data: AssessmentQuestion[] | null
  error: string | null
}> {
  const { data: coverage, error } = await getBlueprintCoverage(blueprintId)

  if (error || !coverage) {
    return { data: null, error }
  }

  // Filter to gaps only
  let gaps = (coverage as DomainCoverageWithDetails[]).filter(c => c.status === 'gap')

  // Optionally filter to critical only
  if (options?.criticalOnly) {
    gaps = gaps.filter(c => c.is_critical)
  }

  // Build questions from domains
  const questions: AssessmentQuestion[] = gaps.map(gap => {
    const domain = gap.domain!
    const firstQuestion = domain.key_questions?.[0]

    return {
      domain_id: domain.id,
      domain_name: domain.name,
      domain_path: gap.domain_path || domain.name,
      category: domain.category,
      question: firstQuestion?.question || `Do you have expertise in ${domain.name}?`,
      context: firstQuestion?.context || domain.description || undefined,
      is_critical: gap.is_critical,
    }
  })

  // Sort: critical first, then by category
  questions.sort((a, b) => {
    if (a.is_critical !== b.is_critical) return a.is_critical ? -1 : 1
    return (a.category || '').localeCompare(b.category || '')
  })

  // Apply limit
  const limited = options?.limit ? questions.slice(0, options.limit) : questions

  return { data: limited, error: null }
}

export async function saveAssessmentAnswers(
  blueprintId: string,
  answers: AssessmentAnswer[]
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser()).data.user

  // Get coverage records for this blueprint
  const { data: coverage } = await getBlueprintCoverage(blueprintId)
  if (!coverage) {
    return { error: 'Could not fetch coverage' }
  }

  // Create a map of domain_id to coverage_id
  const coverageMap = new Map<string, string>()
  for (const c of coverage) {
    coverageMap.set(c.domain_id, c.id)
  }

  // Process each answer
  for (const answer of answers) {
    const coverageId = coverageMap.get(answer.domain_id)
    if (!coverageId) continue

    // Update coverage status
    const { error: coverageError } = await supabase
      .from('blueprint_domain_coverage')
      .update({
        status: answer.status,
        notes: answer.notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', coverageId)

    if (coverageError) {
      console.error('Error updating coverage:', coverageError)
      continue
    }

    // If covered by someone, add expertise
    if (answer.covered_by && (answer.status === 'covered' || answer.status === 'partial')) {
      await supabase.from('blueprint_expertise').insert({
        coverage_id: coverageId,
        person_type: answer.covered_by.type,
        profile_id: answer.covered_by.profile_id,
        external_contact: !answer.covered_by.profile_id
          ? { name: answer.covered_by.name }
          : null,
        expertise_level: answer.status === 'covered' ? 'expert' : 'competent',
        verification_status: 'claimed',
      })
    }
  }

  // Log history
  await supabase.from('blueprint_history').insert({
    blueprint_id: blueprintId,
    action: 'assessment_completed',
    details: { answers_count: answers.length },
    user_id: user?.id,
  })

  revalidatePath('/blueprints')
  revalidatePath(`/blueprints/${blueprintId}`)
  return { error: null }
}

// ============================================================================
// HISTORY
// ============================================================================

export async function getBlueprintHistory(blueprintId: string): Promise<{
  data: BlueprintHistoryEntry[] | null
  error: string | null
}> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('blueprint_history')
    .select(`
      *,
      user:profiles(id, full_name, avatar_url)
    `)
    .eq('blueprint_id', blueprintId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('Error fetching blueprint history:', error)
    return { data: null, error: sanitizeErrorMessage(error) }
  }

  return { data: data as BlueprintHistoryEntry[], error: null }
}

// ============================================================================
// TEAM EXPERTISE
// ============================================================================

export async function getTeamExpertise(): Promise<{
  data: {
    profile_id: string
    profile_name: string
    avatar_url: string | null
    domains: {
      domain_id: string
      domain_name: string
      expertise_level: string
      blueprint_name: string
    }[]
  }[] | null
  error: string | null
}> {
  const supabase = await createClient()
  const foundryId = await getFoundryIdCached()

  if (!foundryId) {
    return { data: null, error: 'No foundry context' }
  }

  // Get all expertise records for this foundry's blueprints with team members
  const { data, error } = await supabase
    .from('blueprint_expertise')
    .select(`
      *,
      profile:profiles(id, full_name, avatar_url),
      coverage:blueprint_domain_coverage(
        domain_name,
        domain:knowledge_domains(id, name),
        blueprint:blueprints(id, name, foundry_id)
      )
    `)
    .eq('person_type', 'team')
    .not('profile_id', 'is', null)

  if (error) {
    console.error('Error fetching team expertise:', error)
    return { data: null, error: sanitizeErrorMessage(error) }
  }

  // Filter to current foundry and group by profile
  const profileMap = new Map<string, {
    profile_id: string
    profile_name: string
    avatar_url: string | null
    domains: {
      domain_id: string
      domain_name: string
      expertise_level: string
      blueprint_name: string
    }[]
  }>()

  for (const item of data || []) {
    const coverage = item.coverage as any
    if (coverage?.blueprint?.foundry_id !== foundryId) continue

    const profile = item.profile as any
    if (!profile) continue

    if (!profileMap.has(profile.id)) {
      profileMap.set(profile.id, {
        profile_id: profile.id,
        profile_name: profile.full_name || 'Unknown',
        avatar_url: profile.avatar_url,
        domains: [],
      })
    }

    profileMap.get(profile.id)!.domains.push({
      domain_id: coverage.domain?.id || '',
      domain_name: coverage.domain_name || coverage.domain?.name || 'Unknown',
      expertise_level: item.expertise_level || 'competent',
      blueprint_name: coverage.blueprint?.name || 'Unknown',
    })
  }

  return { data: Array.from(profileMap.values()), error: null }
}
