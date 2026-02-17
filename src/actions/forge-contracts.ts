'use server'

/**
 * @file forge-contracts.ts — Server actions for Forge procurement documents
 *
 * @description CRUD operations for forge_contracts table. Generates RFQ packs,
 * SOWs, NDAs, and other procurement documents from Forge project data.
 * Documents are rendered from contract_templates with variables populated
 * from the XRay spec.
 *
 * @security All operations require authentication and foundry membership
 * @audit Document generation and status changes logged via RLS + timestamps
 *
 * @related
 * - Migration: supabase/migrations/20260211230000_forge_contracts.sql
 * - Templates: supabase/migrations/20260130300000_executive_journey_features.sql
 * - UI: src/app/(platform)/the-forge/components/contracting-dashboard.tsx
 */

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ─── Types ───────────────────────────────────────────────────────────

export type ForgeDocumentType = 'rfq_pack' | 'sow' | 'nda' | 'ip_assignment' | 'fractional_engagement'
export type ForgeContractStatus = 'draft' | 'final' | 'signed'

export interface ForgeContract {
  id: string
  xray_scan_id: string
  foundry_id: string
  template_id: string | null
  document_type: ForgeDocumentType
  module_id: string | null
  supplier_name: string | null
  rendered_content: string
  variable_values: Record<string, string>
  status: ForgeContractStatus
  created_by: string
  created_at: string
  updated_at: string
}

interface ModuleData {
  id: string
  name: string
  purpose: string
  keyParts: string[]
  requirements: { leadWeeks: number; notes: string }
  supplier?: string
  estCost?: number
}

interface RfqPackInput {
  scanId: string
  foundryId: string
  projectName: string
  processClass?: string
  modules: ModuleData[]
  buyerName?: string
  submissionDeadline?: string
  specialTerms?: string
}

interface ContractInput {
  scanId: string
  foundryId: string
  templateType: string
  moduleId?: string
  supplierName: string
  projectName: string
  processClass?: string
  modules: ModuleData[]
  buyerName?: string
}

// ─── Fetch contracts for a scan ──────────────────────────────────────

/**
 * Loads all forge contracts for a given scan.
 *
 * @param scanId - The xray_scan_id to load contracts for
 * @returns Array of forge contracts or error
 *
 * @security Relies on RLS for foundry isolation
 */
export async function getForgeContractsAction(
  scanId: string,
): Promise<{ contracts: ForgeContract[] } | { error: string }> {
  const supabase = await createClient()

  // AUTH: Verify authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('forge_contracts')
    .select('*')
    .eq('xray_scan_id', scanId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[ForgeContracts] Failed to load contracts:', { scanId, error: error.message })
    return { error: error.message }
  }

  return { contracts: (data ?? []) as unknown as ForgeContract[] }
}

// ─── Generate RFQ Pack ───────────────────────────────────────────────

/**
 * Generates an RFQ pack document from Forge project data.
 *
 * @description Creates a comprehensive RFQ document containing project overview,
 * module breakdown, requirements, and supplier information. Stored in
 * forge_contracts for audit trail.
 *
 * @param input - Project data for RFQ generation
 * @returns The created contract or error
 *
 * @security Requires authenticated user with foundry membership
 * @audit Creates forge_contracts row with full variable values
 */
export async function generateRfqPackAction(
  input: RfqPackInput,
): Promise<{ contract: ForgeContract } | { error: string }> {
  const supabase = await createClient()

  // AUTH: Verify authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // VALIDATION: Require at least one module
  if (input.modules.length === 0) return { error: 'No modules to generate RFQ for' }

  // Build the RFQ document
  const totalCost = input.modules.reduce((sum, m) => sum + (m.estCost ?? 0), 0)
  const criticalPath = Math.max(...input.modules.map((m) => m.requirements.leadWeeks), 0)
  const today = new Date().toISOString().split('T')[0]

  const moduleLines = input.modules.map((m, i) => {
    const supplierLine = m.supplier ? `  Preferred Supplier: ${m.supplier}` : '  Preferred Supplier: TBD'
    const costLine = m.estCost ? `  Estimated Cost: £${Math.round(m.estCost).toLocaleString()}` : '  Estimated Cost: TBD'
    return [
      `${i + 1}. ${m.name}`,
      `  Purpose: ${m.purpose}`,
      `  Key Components: ${m.keyParts.slice(0, 5).join(', ')}`,
      `  Lead Time: ${m.requirements.leadWeeks} weeks`,
      `  Notes: ${m.requirements.notes}`,
      supplierLine,
      costLine,
    ].join('\n')
  }).join('\n\n')

  const supplierSummary = input.modules
    .filter((m) => m.supplier)
    .map((m) => `- ${m.name}: ${m.supplier}`)
    .join('\n') || '  No suppliers assigned yet.'

  const renderedContent = [
    'REQUEST FOR QUOTATION',
    '═'.repeat(40),
    '',
    `Project: ${input.projectName}`,
    `Date: ${today}`,
    input.processClass ? `Process Class: ${input.processClass}` : '',
    input.buyerName ? `Buyer: ${input.buyerName}` : '',
    input.submissionDeadline ? `Submission Deadline: ${input.submissionDeadline}` : '',
    '',
    '─'.repeat(40),
    '',
    '1. PROJECT OVERVIEW',
    '',
    `This RFQ covers the procurement of ${input.modules.length} modules for the "${input.projectName}" project.`,
    totalCost > 0 ? `Estimated project budget: £${Math.round(totalCost).toLocaleString()}` : '',
    criticalPath > 0 ? `Critical path lead time: ${criticalPath} weeks` : '',
    '',
    '2. MODULE BREAKDOWN',
    '',
    moduleLines,
    '',
    '3. PREFERRED SUPPLIERS',
    '',
    supplierSummary,
    '',
    '4. SUBMISSION REQUIREMENTS',
    '',
    '- Itemized pricing per module',
    '- Lead time confirmation',
    '- Quality certifications',
    '- Minimum order quantities (if applicable)',
    '- Payment terms',
    input.specialTerms ? `\n5. SPECIAL TERMS\n\n${input.specialTerms}` : '',
    '',
    '─'.repeat(40),
    `Generated by ForgeOS on ${today}`,
  ].filter(Boolean).join('\n')

  const variableValues: Record<string, string> = {
    project_name: input.projectName,
    date: today,
    process_class: input.processClass ?? '',
    buyer_name: input.buyerName ?? '',
    submission_deadline: input.submissionDeadline ?? '',
    special_terms: input.specialTerms ?? '',
    module_count: input.modules.length.toString(),
    total_cost: totalCost.toString(),
    critical_path_weeks: criticalPath.toString(),
  }

  // Check for existing RFQ pack — upsert (replace draft)
  const { data: existing } = await supabase
    .from('forge_contracts')
    .select('id')
    .eq('xray_scan_id', input.scanId)
    .eq('document_type', 'rfq_pack')
    .eq('status', 'draft')
    .maybeSingle()

  let result
  if (existing) {
    const { data, error } = await supabase
      .from('forge_contracts')
      .update({
        rendered_content: renderedContent,
        variable_values: variableValues,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) {
      console.error('[ForgeContracts] Failed to update RFQ pack:', { scanId: input.scanId, error: error.message })
      return { error: error.message }
    }
    result = data
  } else {
    const { data, error } = await supabase
      .from('forge_contracts')
      .insert({
        xray_scan_id: input.scanId,
        foundry_id: input.foundryId,
        document_type: 'rfq_pack',
        rendered_content: renderedContent,
        variable_values: variableValues,
        status: 'draft',
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error('[ForgeContracts] Failed to create RFQ pack:', { scanId: input.scanId, error: error.message })
      return { error: error.message }
    }
    result = data
  }

  revalidatePath("/the-forge/cad-lab")
  return { contract: result as unknown as ForgeContract }
}

// ─── Generate Contract from Template ─────────────────────────────────

/**
 * Generates a contract document (SOW, NDA, etc.) from a template,
 * pre-filled with Forge project data.
 *
 * @param input - Template type, module, supplier, and project data
 * @returns The created contract or error
 *
 * @security Requires authenticated user with foundry membership
 * @audit Creates forge_contracts row linked to template
 */
export async function generateForgeContractAction(
  input: ContractInput,
): Promise<{ contract: ForgeContract } | { error: string }> {
  const supabase = await createClient()

  // AUTH: Verify authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Load the template
  const { data: template, error: templateError } = await supabase
    .from('contract_templates')
    .select('*')
    .eq('template_type', input.templateType)
    .eq('is_default', true)
    .single()

  if (templateError || !template) {
    console.error('[ForgeContracts] Template not found:', { type: input.templateType, error: templateError?.message })
    return { error: `Template "${input.templateType}" not found` }
  }

  // Build variable values from Forge project data
  const today = new Date().toISOString().split('T')[0]
  const targetModule = input.moduleId
    ? input.modules.find((m) => m.id === input.moduleId)
    : undefined

  // Compute scope from modules
  const scopeOfWork = targetModule
    ? `Supply and delivery of ${targetModule.name}: ${targetModule.purpose}\n\nKey components: ${targetModule.keyParts.join(', ')}`
    : input.modules.map((m) => `- ${m.name}: ${m.purpose}`).join('\n')

  const totalCost = targetModule?.estCost
    ?? input.modules.reduce((sum, m) => sum + (m.estCost ?? 0), 0)
  const leadWeeks = targetModule?.requirements.leadWeeks
    ?? Math.max(...input.modules.map((m) => m.requirements.leadWeeks), 0)

  const deliverables = targetModule
    ? targetModule.keyParts.map((p) => `- ${p}`).join('\n')
    : input.modules.map((m) => `- ${m.name} assembly (complete)`).join('\n')

  const variableValues: Record<string, string> = {
    // Common fields
    effective_date: today,
    project_name: input.projectName,
    // SOW fields
    client_name: input.buyerName ?? 'TBD',
    provider_name: input.supplierName,
    project_overview: `${input.projectName}${input.processClass ? ` — Process class: ${input.processClass}` : ''}`,
    scope_of_work: scopeOfWork,
    deliverables: deliverables,
    start_date: 'TBD',
    end_date: 'TBD',
    duration_weeks: leadWeeks.toString(),
    milestones: 'To be defined upon project commencement',
    engagement_type: 'Project',
    rate: totalCost.toString(),
    currency: 'GBP',
    rate_period: 'project',
    estimated_total: totalCost.toString(),
    payment_terms: '50% upon order, 50% upon delivery and acceptance',
    assumptions: targetModule?.requirements.notes ?? 'N/A',
    // NDA fields
    party_a_name: input.buyerName ?? 'TBD',
    party_b_name: input.supplierName,
    term_years: '2',
    governing_jurisdiction: 'England and Wales',
    // IP Assignment fields
    assignor_name: input.supplierName,
    assignee_name: input.buyerName ?? 'TBD',
    services_agreement_date: today,
  }

  // Render the template
  let renderedContent = template.content as string
  for (const [key, value] of Object.entries(variableValues)) {
    renderedContent = renderedContent.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
  }

  // Map template_type to document_type
  const documentType = input.templateType as ForgeDocumentType

  // Insert the contract
  const { data, error } = await supabase
    .from('forge_contracts')
    .insert({
      xray_scan_id: input.scanId,
      foundry_id: input.foundryId,
      template_id: template.id,
      document_type: documentType,
      module_id: input.moduleId ?? null,
      supplier_name: input.supplierName,
      rendered_content: renderedContent,
      variable_values: variableValues,
      status: 'draft',
      created_by: user.id,
    })
    .select()
    .single()

  if (error) {
    console.error('[ForgeContracts] Failed to generate contract:', {
      scanId: input.scanId,
      type: input.templateType,
      error: error.message,
    })
    return { error: error.message }
  }

  revalidatePath("/the-forge/cad-lab")
  return { contract: data as unknown as ForgeContract }
}

// ─── Update contract status ──────────────────────────────────────────

/**
 * Updates a forge contract's status (draft -> final -> signed).
 *
 * @param contractId - The contract to update
 * @param status - New status
 * @returns Success or error
 *
 * @security Relies on RLS for foundry isolation
 */
export async function updateForgeContractStatusAction(
  contractId: string,
  status: ForgeContractStatus,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()

  // AUTH: Verify authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('forge_contracts')
    .update({ status })
    .eq('id', contractId)

  if (error) {
    console.error('[ForgeContracts] Failed to update status:', { contractId, status, error: error.message })
    return { error: error.message }
  }

  return { success: true }
}

// ─── Delete contract ─────────────────────────────────────────────────

/**
 * Deletes a forge contract document.
 *
 * @param contractId - The contract to delete
 * @returns Success or error
 *
 * @security Relies on RLS for foundry isolation
 */
export async function deleteForgeContractAction(
  contractId: string,
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()

  // AUTH: Verify authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('forge_contracts')
    .delete()
    .eq('id', contractId)

  if (error) {
    console.error('[ForgeContracts] Failed to delete contract:', { contractId, error: error.message })
    return { error: error.message }
  }

  return { success: true }
}
