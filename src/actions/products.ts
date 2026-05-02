"use server"

/**
 * @file products.ts — Server actions for the Product Intelligence Layer.
 *
 * @description CRUD operations for products, plus a promoteFromCadLab action
 * that creates a product from a completed CAD Lab project, seeding unit
 * economics from ai_cost_estimates.
 *
 * @security All operations require authentication and enforce foundry isolation
 * via withAuth. RLS policies provide defense-in-depth.
 *
 * @related
 * - Types: src/types/product.ts
 * - Migration: supabase/migrations/20260329100000_products.sql
 * - Page: src/app/(platform)/products/page.tsx
 */

import { withAuth } from '@/lib/server-action-utils'
import { withAIGate } from '@/lib/ai/with-ai-gate'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { isValidUUID } from '@/lib/validations'
import { classifyAIError } from '@/lib/agents/error-classification'
import { recordSpecialistCall } from '@/lib/audit/specialist-call'
import { callOpenAI } from '@/lib/cad-lab/api-helpers'
import type {
  Product,
  ProductSummary,
  CreateProductInput,
  UpdateProductInput,
  UnitEconomics,
  MarketAssessment,
  FundabilityScore,
  IterationPareto,
  ProductIteration,
  ConvergenceStatus,
  DesignBrief,
  BriefStatus,
  CreateDesignBriefInput,
  ProductSynthesis,
} from '@/types/product'

// ─── Types ──────────────────────────────────────────────────────────

type ActionResult<T> = { data: T; error?: undefined } | { data?: undefined; error: string }

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Type-bypass helper for products table (not in generated types).
 * Same pattern as knowledge vault and endorsements.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function productsTable(supabase: any) {
  return (supabase as any).from('products')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cadLabTable(supabase: any) {
  return (supabase as any).from('cad_lab_projects')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cashInTable(supabase: any) {
  return (supabase as any).from('cash_in_items')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cashOutTable(supabase: any) {
  return (supabase as any).from('cash_out_items')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function iterationsTable(supabase: any) {
  return (supabase as any).from('product_iterations')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function briefsTable(supabase: any) {
  return (supabase as any).from('design_briefs')
}

// ─── getProducts ────────────────────────────────────────────────────

/**
 * Fetches all products for the user's foundry.
 *
 * @returns ProductSummary[] with computed cogs_per_unit and gross_margin_pct
 */
export async function getProducts(): Promise<ActionResult<ProductSummary[]>> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { data, error } = await productsTable(supabase)
      .select('id, name, description, hero_image_url, lifecycle, unit_price_pence, target_monthly_units, cad_lab_project_id, unit_economics, market_assessment, fundability_score, created_at, updated_at')
      .eq('foundry_id', foundryId)
      .order('updated_at', { ascending: false })

    if (error) return { error: error.message }

    // FLOW: Fetch latest iteration for each product to get convergence status
    const productIds = (data ?? []).map((r: any) => r.id as string)
    const iterationMap: Record<string, ConvergenceStatus> = {}

    if (productIds.length > 0) {
      const { data: iterations } = await iterationsTable(supabase)
        .select('product_id, convergence_status, iteration_number')
        .eq('foundry_id', foundryId)
        .in('product_id', productIds)
        .order('iteration_number', { ascending: false })

      // INTENT: Keep only the latest iteration per product
      if (iterations) {
        for (const iter of iterations as Array<{ product_id: string; convergence_status: ConvergenceStatus; iteration_number: number }>) {
          if (!iterationMap[iter.product_id]) {
            iterationMap[iter.product_id] = iter.convergence_status
          }
        }
      }
    }

    // INTENT: Compute display fields from JSONB so the list view doesn't need to parse JSONB
    const summaries: ProductSummary[] = (data ?? []).map((row: any) => {
      const ue = row.unit_economics as UnitEconomics | null
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        hero_image_url: row.hero_image_url,
        lifecycle: row.lifecycle,
        unit_price_pence: row.unit_price_pence,
        target_monthly_units: row.target_monthly_units,
        cad_lab_project_id: row.cad_lab_project_id,
        cogs_per_unit: ue?.cogs_per_unit_pence ? ue.cogs_per_unit_pence / 100 : null,
        gross_margin_pct: ue?.gross_margin_pct ?? null,
        latest_convergence_status: iterationMap[row.id] ?? null,
        has_market_assessment: row.market_assessment != null,
        has_fundability_score: row.fundability_score != null,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }
    })

    return { data: summaries }
  })
}

// ─── getProductsWithFundability ──────────────────────────────────────

/**
 * Lightweight fetch of products that have a fundability_score.
 * Used by the Fundraise dashboard to show product readiness.
 *
 * @returns Array of { id, name, lifecycle, fundability_score } for scored products
 */
export async function getProductsWithFundability(): Promise<ActionResult<Array<{
  id: string
  name: string
  lifecycle: string
  fundability_score: FundabilityScore
}>>> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { data, error } = await productsTable(supabase)
      .select('id, name, lifecycle, fundability_score')
      .eq('foundry_id', foundryId)
      .not('fundability_score', 'is', null)
      .order('updated_at', { ascending: false })

    if (error) return { error: error.message }

    return {
      data: (data ?? []).map((row: any) => ({
        id: row.id,
        name: row.name,
        lifecycle: row.lifecycle,
        fundability_score: row.fundability_score as FundabilityScore,
      })),
    }
  })
}

// ─── getProductByCadLabProjectId ────────────────────────────────────

/**
 * Find the product linked to a given CAD Lab project, if any.
 *
 * @description Powers the reverse link from CAD Lab → Products. Returns
 * null (not an error) when no product is linked, so callers can treat
 * the reverse-link as optional UI.
 *
 * @param cadLabProjectId - CAD Lab project UUID
 * @returns `{ data: { id, name } | null }` — null means no linked product
 * @security foundry-isolated via withAuth + explicit foundry_id filter.
 *           Invalid UUID returns null (no enumeration oracle).
 */
export async function getProductByCadLabProjectId(
  cadLabProjectId: string,
): Promise<ActionResult<{ id: string; name: string; lifecycle: string } | null>> {
  return withAuth(async ({ supabase, foundryId }) => {
    // VALIDATION: silent null on bad input — caller renders nothing
    if (!cadLabProjectId || typeof cadLabProjectId !== 'string') return { data: null }
    if (!isValidUUID(cadLabProjectId)) return { data: null }

    const { data, error } = await productsTable(supabase)
      .select('id, name, lifecycle')
      .eq('cad_lab_project_id', cadLabProjectId)
      .eq('foundry_id', foundryId)
      .maybeSingle()

    if (error) {
      console.error('[getProductByCadLabProjectId] error:', error.message)
      return { error: error.message }
    }
    return {
      data: data
        ? { id: data.id as string, name: data.name as string, lifecycle: data.lifecycle as string }
        : null,
    }
  })
}

// ─── getLinkedItemsForProduct ───────────────────────────────────────

/**
 * Reverse lookup: all objectives + tasks tagged to a given product.
 *
 * @description Powers the "linked work" card on the Product Overview tab.
 * Scoped to the caller's foundry; RLS + the explicit foundry_id filter
 * are defense in depth. Returns counts + top-5 lists so the UI stays
 * fast without paginating.
 *
 * @param productId - Product UUID
 */
export async function getLinkedItemsForProduct(
  productId: string,
): Promise<ActionResult<{
  objectives: { id: string; title: string; status: string | null }[]
  tasks: { id: string; title: string; status: string | null; due_date: string | null }[]
  objectiveCount: number
  taskCount: number
}>> {
  return withAuth(async ({ supabase, foundryId }) => {
    if (!productId || typeof productId !== 'string' || !isValidUUID(productId)) {
      return { error: 'Invalid product ID' }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const objQuery = (supabase as any)
      .from('objectives')
      .select('id, title, status', { count: 'exact' })
      .eq('product_id', productId)
      .eq('foundry_id', foundryId)
      .order('updated_at', { ascending: false })
      .limit(5)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const taskQuery = (supabase as any)
      .from('tasks')
      .select('id, title, status, due_date', { count: 'exact' })
      .eq('product_id', productId)
      .eq('foundry_id', foundryId)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(5)

    const [objRes, taskRes] = await Promise.all([objQuery, taskQuery])

    if (objRes.error) {
      console.error('[getLinkedItemsForProduct] objectives query failed:', objRes.error.message)
      return { error: objRes.error.message }
    }
    if (taskRes.error) {
      console.error('[getLinkedItemsForProduct] tasks query failed:', taskRes.error.message)
      return { error: taskRes.error.message }
    }

    return {
      data: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        objectives: (objRes.data ?? []).map((o: any) => ({
          id: o.id as string,
          title: o.title as string,
          status: (o.status ?? null) as string | null,
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tasks: (taskRes.data ?? []).map((t: any) => ({
          id: t.id as string,
          title: t.title as string,
          status: (t.status ?? null) as string | null,
          due_date: (t.due_date ?? null) as string | null,
        })),
        objectiveCount: objRes.count ?? 0,
        taskCount: taskRes.count ?? 0,
      },
    }
  })
}

// ─── getProduct ─────────────────────────────────────────────────────

/**
 * Fetches a single product by ID.
 *
 * @param id - Product UUID
 * @returns Full Product object
 */
export async function getProduct(id: string): Promise<ActionResult<Product>> {
  return withAuth(async ({ supabase, foundryId }) => {
    // VALIDATION: UUID format gate — rejects malformed/malicious input before
    // the query runs. Foundry filter + RLS is defense in depth; this is the
    // first line.
    if (!id || typeof id !== 'string' || !isValidUUID(id)) {
      return { error: 'Invalid product ID' }
    }

    const { data, error } = await productsTable(supabase)
      .select('*')
      .eq('id', id)
      .eq('foundry_id', foundryId)
      .single()

    if (error) return { error: error.message }
    if (!data) return { error: 'Product not found' }

    return { data: data as Product }
  })
}

// ─── createProduct ──────────────────────────────────────────────────

/**
 * Creates a new product.
 *
 * @description If cad_lab_project_id is provided, seeds unit_economics
 * from the CAD project's ai_cost_estimates JSONB.
 *
 * @param input - CreateProductInput
 * @returns The created Product
 */
export async function createProduct(input: CreateProductInput): Promise<ActionResult<Product>> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // VALIDATION: Name is required
    if (!input.name?.trim()) return { error: 'Product name is required' }

    let unitEconomics: UnitEconomics | null = null

    // INTENT: If linking to a CAD project, seed COGS from ai_cost_estimates
    if (input.cad_lab_project_id) {
      unitEconomics = await seedUnitEconomicsFromCad(supabase, input.cad_lab_project_id, foundryId)
    }

    const { data, error } = await productsTable(supabase)
      .insert({
        foundry_id: foundryId,
        created_by: user.id,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        lifecycle: input.lifecycle || 'concept',
        cad_lab_project_id: input.cad_lab_project_id || null,
        unit_price_pence: input.unit_price_pence ?? null,
        target_monthly_units: input.target_monthly_units ?? null,
        unit_economics: unitEconomics,
      })
      .select('*')
      .single()

    if (error) return { error: error.message }

    return { data: data as Product }
  })
}

// ─── updateProduct ──────────────────────────────────────────────────

/**
 * Updates an existing product.
 *
 * @param id - Product UUID
 * @param input - Fields to update
 * @returns The updated Product
 */
export async function updateProduct(id: string, input: UpdateProductInput): Promise<ActionResult<Product>> {
  return withAuth(async ({ supabase, foundryId }) => {
    if (!id || typeof id !== 'string' || !isValidUUID(id)) {
      return { error: 'Invalid product ID' }
    }

    // VALIDATION: Prevent empty name
    if (input.name !== undefined && !input.name.trim()) {
      return { error: 'Product name cannot be empty' }
    }

    // INTENT: Only include fields that were explicitly provided
    const updates: Record<string, unknown> = {}
    if (input.name !== undefined) updates.name = input.name.trim()
    if (input.description !== undefined) updates.description = input.description?.trim() || null
    if (input.lifecycle !== undefined) updates.lifecycle = input.lifecycle
    if (input.unit_price_pence !== undefined) updates.unit_price_pence = input.unit_price_pence
    if (input.target_monthly_units !== undefined) updates.target_monthly_units = input.target_monthly_units
    if (input.hero_image_url !== undefined) updates.hero_image_url = input.hero_image_url
    if (input.market_assessment !== undefined) updates.market_assessment = input.market_assessment

    if (Object.keys(updates).length === 0) return { error: 'No fields to update' }

    const { data, error } = await productsTable(supabase)
      .update(updates)
      .eq('id', id)
      .eq('foundry_id', foundryId)
      .select('*')
      .single()

    if (error) return { error: error.message }
    if (!data) return { error: 'Product not found' }

    return { data: data as Product }
  })
}

// ─── deleteProduct ──────────────────────────────────────────────────

/**
 * Deletes a product. Cash flow items referencing it get product_id set to NULL
 * (ON DELETE SET NULL in migration).
 *
 * @param id - Product UUID
 */
export async function deleteProduct(id: string): Promise<ActionResult<{ success: true }>> {
  return withAuth(async ({ supabase, foundryId }) => {
    if (!id || typeof id !== 'string' || !isValidUUID(id)) {
      return { error: 'Invalid product ID' }
    }

    const { error } = await productsTable(supabase)
      .delete()
      .eq('id', id)
      .eq('foundry_id', foundryId)

    if (error) return { error: error.message }

    return { data: { success: true as const } }
  })
}

// ─── promoteFromCadLab ──────────────────────────────────────────────

/**
 * Creates a product from a CAD Lab project.
 *
 * @description Fetches the CAD project, extracts name/description/image,
 * sums ai_cost_estimates for COGS, sets lifecycle to 'prototyping', and
 * links the product back to the CAD project.
 *
 * @param cadLabProjectId - UUID of the CAD Lab project to promote
 * @returns The newly created Product
 */
export async function promoteFromCadLab(cadLabProjectId: string): Promise<ActionResult<Product>> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    if (!cadLabProjectId || typeof cadLabProjectId !== 'string' || !isValidUUID(cadLabProjectId)) {
      return { error: 'Invalid CAD Lab project ID' }
    }

    // SECURITY: Prevent duplicate products for the same CAD project
    const { data: existing } = await productsTable(supabase)
      .select('id, name')
      .eq('cad_lab_project_id', cadLabProjectId)
      .eq('foundry_id', foundryId)
      .maybeSingle()
    if (existing) return { error: `Product "${existing.name}" already exists for this project` }

    // FLOW: Fetch the CAD project data
    const { data: project, error: projectError } = await cadLabTable(supabase)
      .select('id, name, subject, product_overview, ai_cost_estimates, system_illustration_url, status')
      .eq('id', cadLabProjectId)
      .eq('foundry_id', foundryId)
      .single()

    if (projectError || !project) {
      return { error: 'CAD Lab project not found' }
    }

    // INTENT: Build product description from the CAD project's product_overview
    const description = project.product_overview || project.subject || null

    // INTENT: Seed unit economics from ai_cost_estimates JSONB (only if available)
    const unitEconomics = buildUnitEconomicsFromEstimates(project.ai_cost_estimates)

    // DECISION: Completed designs start as 'prototyping' (they have CAD + COGS).
    // Earlier designs start as 'concept' (idea stage, no manufacturing data yet).
    const isComplete = project.status === 'generated' || project.status === 'complete'
    const lifecycle = isComplete ? 'prototyping' : 'concept'

    const { data, error } = await productsTable(supabase)
      .insert({
        foundry_id: foundryId,
        created_by: user.id,
        name: project.name || 'Untitled Product',
        description,
        hero_image_url: project.system_illustration_url || null,
        lifecycle,
        cad_lab_project_id: cadLabProjectId,
        unit_economics: unitEconomics,
      })
      .select('*')
      .single()

    if (error) return { error: error.message }

    return { data: data as Product }
  })
}

/**
 * Auto-promotes a completed CAD Lab project to a product (fire-and-forget).
 *
 * @description Called from saveCadLabResult/saveCadLabProjectRfq when a design
 * reaches "generated" or "rfq_created" status. Idempotent — silently returns
 * if a product already exists for this project. Wraps promoteFromCadLab with
 * error absorption so the Forge save never fails because of Products.
 */
export async function autoPromoteIfComplete(
  cadLabProjectId: string,
): Promise<{ promoted: boolean; productId?: string }> {
  try {
    const result = await promoteFromCadLab(cadLabProjectId)
    if ("error" in result) {
      // Duplicate or invalid — not an error for auto-promote
      if (result.error?.includes("already exists")) return { promoted: false }
      console.warn("[Products] Auto-promote skipped:", result.error)
      return { promoted: false }
    }
    console.info("[Products] Auto-promoted CAD project to product:", {
      cadLabProjectId,
      productId: result.data?.id,
    })

    // 1.3 — Notify the founder their design landed as a Product. Fire-and-forget:
    // a notification insert failing must not roll back or retry the promotion.
    const promoted = result.data
    if (promoted) {
      const { createNotification } = await import('@/actions/notifications')
      void createNotification({
        userId: promoted.created_by,
        type: 'product_auto_promoted',
        title: `${promoted.name} is now a product`,
        message: 'Your completed Forge design has been added to Products. Set pricing, run a market assessment, and score fundability when you are ready.',
        link: `/products/${promoted.id}`,
        metadata: {
          cad_lab_project_id: cadLabProjectId,
          product_id: promoted.id,
        },
      }).catch((err) => {
        console.warn('[Products] auto-promote notification insert failed:', err)
      })
    }

    return { promoted: true, productId: result.data?.id }
  } catch (err) {
    console.error("[Products] Auto-promote failed:", err)
    return { promoted: false }
  }
}

// ─── syncProductFinancials ───────────────────────────────────────────

/**
 * Syncs product pricing/volume into Cash Burn items.
 *
 * @description Creates or updates a revenue cash-in item and a COGS
 * cash-out item for the product based on unit_price_pence,
 * target_monthly_units, and unit_economics.cogs_per_unit_pence.
 * Existing product-linked items are found by matching product_id.
 *
 * @param productId - UUID of the product to sync financials for
 * @returns Success indicator
 */
export async function syncProductFinancials(
  productId: string
): Promise<ActionResult<{ success: true }>> {
  return withAuth(async ({ supabase, foundryId, user }) => {
    if (!productId || typeof productId !== 'string') {
      return { error: 'Invalid product ID' }
    }

    // FLOW: Fetch the product to get pricing and cost data
    const { data: product, error: productError } = await productsTable(supabase)
      .select('id, name, unit_price_pence, target_monthly_units, unit_economics')
      .eq('id', productId)
      .eq('foundry_id', foundryId)
      .single()

    if (productError || !product) return { error: 'Product not found' }

    // INTENT: Both fields required to compute financials
    if (product.unit_price_pence == null || product.target_monthly_units == null) {
      return { error: 'Set unit price and target monthly units first' }
    }

    const unitPrice = Number(product.unit_price_pence)
    const monthlyUnits = Number(product.target_monthly_units)
    const monthlyRevenue = unitPrice * monthlyUnits
    const today = new Date().toISOString().split('T')[0]
    const productName = product.name || 'Untitled Product'

    // ── Upsert Revenue (Cash In) item ──────────────────────────────

    const { data: existingIn } = await cashInTable(supabase)
      .select('id')
      .eq('foundry_id', foundryId)
      .eq('product_id', productId)
      .eq('source_type', 'revenue')
      .limit(1)
      .maybeSingle()

    if (existingIn?.id) {
      const { error: inUpdateError } = await cashInTable(supabase)
        .update({ name: `${productName} Revenue`, amount: monthlyRevenue, frequency: 'monthly' })
        .eq('id', existingIn.id)
      if (inUpdateError) return { error: 'Failed to sync financial items' }
    } else {
      const { error: inInsertError } = await cashInTable(supabase)
        .insert({
          foundry_id: foundryId,
          created_by: user.id,
          name: `${productName} Revenue`,
          source_type: 'revenue',
          amount: monthlyRevenue,
          frequency: 'monthly',
          probability_pct: 100,
          effective_from: today,
          product_id: productId,
          source: 'product_sync',
        })
      if (inInsertError) return { error: 'Failed to sync financial items' }
    }

    // ── Upsert COGS (Cash Out) item ────────────────────────────────

    const ue = product.unit_economics as UnitEconomics | null
    const cogsPerUnit = ue?.cogs_per_unit_pence ?? 0

    if (cogsPerUnit > 0) {
      const monthlyCogs = cogsPerUnit * monthlyUnits

      const { data: existingOut } = await cashOutTable(supabase)
        .select('id')
        .eq('foundry_id', foundryId)
        .eq('product_id', productId)
        .eq('pnl_category', 'cogs')
        .limit(1)
        .maybeSingle()

      if (existingOut?.id) {
        const { error: outUpdateError } = await cashOutTable(supabase)
          .update({ name: `${productName} COGS`, amount: monthlyCogs, frequency: 'monthly' })
          .eq('id', existingOut.id)
        if (outUpdateError) return { error: 'Failed to sync financial items' }
      } else {
        const { error: outInsertError } = await cashOutTable(supabase)
          .insert({
            foundry_id: foundryId,
            created_by: user.id,
            name: `${productName} COGS`,
            category: 'manufacturing',
            cost_type: 'variable',
            pnl_category: 'cogs',
            amount: monthlyCogs,
            frequency: 'monthly',
            effective_from: today,
            product_id: productId,
            source: 'product_sync',
          })
        if (outInsertError) return { error: 'Failed to sync financial items' }
      }
    }

    return { data: { success: true as const } }
  })
}

// ─── generateMarketAssessment ────────────────────────────────────────

/**
 * Generates an AI-assisted market assessment for a product.
 *
 * @description Uses Claude Sonnet to research TAM/SAM/SOM, customer segments,
 * competitive landscape, pricing analysis, and risks/opportunities. All data
 * points are marked as 'ai_estimated' for the founder to validate or adjust.
 *
 * @param productId - UUID of the product to assess
 * @returns MarketAssessment with all fields set to ai_estimated validation status
 *
 * @security Gated behind AI usage limits via withAIGate('market_assessment').
 */
export async function generateMarketAssessment(
  productId: string
): Promise<ActionResult<MarketAssessment>> {
  return withAIGate('market_assessment', async ({ supabase, foundryId, user, trackUsage }) => {
    if (!productId || typeof productId !== 'string') {
      return { error: 'Invalid product ID' }
    }

    // FLOW: Fetch the product
    const { data: product, error: productError } = await productsTable(supabase)
      .select('id, name, description, lifecycle, cad_lab_project_id, unit_economics')
      .eq('id', productId)
      .eq('foundry_id', foundryId)
      .single()

    if (productError || !product) return { error: 'Product not found' }

    // FLOW: If linked to a CAD project, fetch product_overview and ai_cost_estimates
    let cadContext = ''
    if (product.cad_lab_project_id) {
      // SECURITY: Filter by foundry_id to prevent cross-tenant data access
      const { data: cadProject } = await cadLabTable(supabase)
        .select('product_overview, ai_cost_estimates')
        .eq('id', product.cad_lab_project_id)
        .eq('foundry_id', foundryId)
        .single()

      if (cadProject) {
        if (cadProject.product_overview) {
          cadContext += `\nProduct Overview (from CAD Lab):\n${cadProject.product_overview}\n`
        }
        if (cadProject.ai_cost_estimates) {
          // GOTCHA: ai_cost_estimates is Record<moduleId, T>, not an array
          const estimates = Object.values(cadProject.ai_cost_estimates as Record<string, unknown>)
          const totalCostPence = estimates.reduce((sum: number, e: unknown) => {
            const est = e as Record<string, unknown>
            return sum + (Number(est?.keyword_estimate_pence ?? est?.ai_estimate_pence ?? 0))
          }, 0)
          if (totalCostPence > 0) {
            cadContext += `\nEstimated manufacturing cost per unit: £${(totalCostPence / 100).toFixed(2)}\n`
          }
        }
      }
    }

    // FLOW: Fetch foundry context (industry, stage)
    const { data: foundry } = await (supabase as any)
      .from('foundries')
      .select('industry, stage')
      .eq('id', foundryId)
      .single()

    const foundryContext = foundry
      ? `\nFoundry Industry: ${foundry.industry || 'Not specified'}\nFoundry Stage: ${foundry.stage || 'Not specified'}\n`
      : ''

    // ── Build prompt ───────────────────────────────────────────────
    const systemPrompt = `You are Priya, Product Lead at Fractional Forge. Research this product's market and provide structured analysis. Present findings as research for the founder to validate — not as facts. Use hedging language like "based on available data" and "estimated at".

Return ONLY a valid JSON object matching this exact schema (no markdown fences, no explanation):
{
  "tam_gbp": number,
  "sam_gbp": number,
  "som_gbp": number,
  "target_customer": "string describing ideal customer",
  "customer_segments": [
    { "name": "string", "size": number, "willingness_to_pay": number }
  ],
  "competitive_landscape": [
    { "competitor": "string", "strengths": "string", "weaknesses": "string", "price_point": number }
  ],
  "pricing_analysis": {
    "recommended_price_pence": number,
    "pricing_model": "string",
    "price_range_low_pence": number,
    "price_range_high_pence": number,
    "reasoning": "string"
  },
  "market_risks": ["string"],
  "market_opportunities": ["string"]
}

Rules:
- All monetary values in GBP (tam/sam/som as whole numbers, pricing in pence)
- Provide 2-3 customer segments with estimated size (number of potential customers) and willingness to pay (pence)
- Provide 2-3 competitors with price_point in pence
- Provide exactly 3 market risks and 3 market opportunities
- Be specific and grounded — reference real market categories, not generic advice
- If manufacturing cost is known, ensure recommended_price_pence provides healthy margin`

    const userPrompt = `Assess the market for this product:

Product Name: ${product.name}
Description: ${product.description || 'No description provided'}
Current Lifecycle Stage: ${product.lifecycle}
${cadContext}${foundryContext}
Provide your structured market assessment as JSON.`

    // ── Call Claude Sonnet ──────────────────────────────────────────
    const apiKey = process.env.OPENROUTER_API_KEY?.trim()
    if (!apiKey) return { error: 'OPENROUTER_API_KEY not configured' }

    const callStartedAt = Date.now()
    try {
      const result = await callOpenAI(systemPrompt, userPrompt, "gpt-4.1-mini", 2000, 120_000)

      const text = result.text
      if (!text) return { error: 'Empty response from AI' }

      // INTENT: Track usage for billing
      await trackUsage({
        model: 'openai/gpt-4.1-mini',
        promptTokens: result.tokensIn,
        completionTokens: result.tokensOut,
      })

      // Money: write specialist_call event for ai_credits_ledger trigger.
      // Priya owns market assessment per the system prompt above.
      await recordSpecialistCall({
        foundryId,
        specialistId: 'priya',
        section: 'products',
        model: 'openai/gpt-4.1-mini',
        inputTokens: result.tokensIn,
        outputTokens: result.tokensOut,
        durationMs: Date.now() - callStartedAt,
        invokedByUserId: user.id,
        entityId: productId,
      })

      // ── Parse response ─────────────────────────────────────────
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(cleaned)
      } catch (err) {
        return { error: classifyAIError(err).message }
      }

      // INTENT: Build MarketAssessment with all fields set to ai_estimated
      const assessment: MarketAssessment = {
        tam_gbp: typeof parsed.tam_gbp === 'number' ? parsed.tam_gbp : null,
        sam_gbp: typeof parsed.sam_gbp === 'number' ? parsed.sam_gbp : null,
        som_gbp: typeof parsed.som_gbp === 'number' ? parsed.som_gbp : null,
        target_customer: typeof parsed.target_customer === 'string' ? parsed.target_customer : null,
        customer_segments: Array.isArray(parsed.customer_segments)
          ? parsed.customer_segments.map((s: Record<string, unknown>) => ({
              name: String(s.name || ''),
              size: typeof s.size === 'number' ? s.size : null,
              willingness_to_pay: typeof s.willingness_to_pay === 'number' ? s.willingness_to_pay : null,
            }))
          : [],
        competitive_landscape: Array.isArray(parsed.competitive_landscape)
          ? parsed.competitive_landscape.map((c: Record<string, unknown>) => ({
              competitor: String(c.competitor || ''),
              strengths: String(c.strengths || ''),
              weaknesses: String(c.weaknesses || ''),
              price_point: typeof c.price_point === 'number' ? c.price_point : null,
            }))
          : [],
        pricing_analysis: parsed.pricing_analysis && typeof parsed.pricing_analysis === 'object'
          ? {
              recommended_price_pence: typeof (parsed.pricing_analysis as Record<string, unknown>).recommended_price_pence === 'number'
                ? (parsed.pricing_analysis as Record<string, unknown>).recommended_price_pence as number
                : null,
              pricing_model: typeof (parsed.pricing_analysis as Record<string, unknown>).pricing_model === 'string'
                ? (parsed.pricing_analysis as Record<string, unknown>).pricing_model as string
                : null,
              price_range_low_pence: typeof (parsed.pricing_analysis as Record<string, unknown>).price_range_low_pence === 'number'
                ? (parsed.pricing_analysis as Record<string, unknown>).price_range_low_pence as number
                : null,
              price_range_high_pence: typeof (parsed.pricing_analysis as Record<string, unknown>).price_range_high_pence === 'number'
                ? (parsed.pricing_analysis as Record<string, unknown>).price_range_high_pence as number
                : null,
              reasoning: typeof (parsed.pricing_analysis as Record<string, unknown>).reasoning === 'string'
                ? (parsed.pricing_analysis as Record<string, unknown>).reasoning as string
                : null,
            }
          : null,
        market_risks: Array.isArray(parsed.market_risks)
          ? parsed.market_risks.filter((r: unknown): r is string => typeof r === 'string')
          : [],
        market_opportunities: Array.isArray(parsed.market_opportunities)
          ? parsed.market_opportunities.filter((o: unknown): o is string => typeof o === 'string')
          : [],
        validation_status: {
          tam_gbp: 'ai_estimated',
          sam_gbp: 'ai_estimated',
          som_gbp: 'ai_estimated',
          target_customer: 'ai_estimated',
          customer_segments: 'ai_estimated',
          competitive_landscape: 'ai_estimated',
          pricing_analysis: 'ai_estimated',
          market_risks: 'ai_estimated',
          market_opportunities: 'ai_estimated',
        },
        assessed_at: new Date().toISOString(),
        model_used: 'gpt-4.1-mini',
      }

      // ── Save to product ────────────────────────────────────────
      const updatePayload: Record<string, unknown> = { market_assessment: assessment }

      // INTENT: Advance lifecycle to 'researching' if still at 'concept'
      if (product.lifecycle === 'concept') {
        updatePayload.lifecycle = 'researching'
      }

      const { error: updateError } = await productsTable(supabase)
        .update(updatePayload)
        .eq('id', productId)
        .eq('foundry_id', foundryId)

      if (updateError) return { error: `Assessment generated but failed to save: ${updateError.message}` }

      return { data: assessment }
    } catch (err) {
      console.error('[generateMarketAssessment] AI call failed:', err)
      return { error: 'Market assessment failed — please try again' }
    }
  })
}

// ─── scoreFundability ────────────────────────────────────────────────

/**
 * Computes a fundability score for a product.
 *
 * @description Analyses market_assessment, unit_economics, and lifecycle to
 * generate 5 sub-scores, a weighted overall score, investor appetite label,
 * and 2-3 AI-generated improvement suggestions (via Haiku, 5s timeout).
 * Saves the result to the product's fundability_score JSONB column.
 *
 * @param productId - UUID of the product to score
 * @returns The computed FundabilityScore
 *
 * @security Uses withAIGate to enforce AI usage limits.
 */
export async function scoreFundability(
  productId: string
): Promise<ActionResult<FundabilityScore>> {
  return withAIGate('fundability_score', async ({ supabase, foundryId, trackUsage }) => {
    if (!productId || typeof productId !== 'string') {
      return { error: 'Invalid product ID' }
    }

    // SECURITY: Rate limit AI calls
    const rateLimitError = await checkRateLimit('aiAnalysis', `ai:fundability:${productId}`)
    if (rateLimitError) return { error: rateLimitError }

    // FLOW: Fetch product with market assessment and unit economics
    const { data: product, error: fetchError } = await productsTable(supabase)
      .select('*')
      .eq('id', productId)
      .eq('foundry_id', foundryId)
      .single()

    if (fetchError || !product) return { error: 'Product not found' }

    const ma = product.market_assessment as Product['market_assessment']
    const ue = product.unit_economics as UnitEconomics | null
    const lifecycle = product.lifecycle as Product['lifecycle']

    // ── Sub-score: Market Size (25%) ────────────────────────────────
    // INTENT: TAM in GBP determines market size attractiveness
    let market_size_score = 30
    const tamGbp = ma?.tam_gbp ?? 0
    if (tamGbp > 100_000_000) market_size_score = 90
    else if (tamGbp > 10_000_000) market_size_score = 70
    else if (tamGbp > 1_000_000) market_size_score = 50

    // ── Sub-score: Margin (25%) ─────────────────────────────────────
    // INTENT: Higher gross margin = more investable
    let margin_score = 20
    const grossMarginPct = ue?.gross_margin_pct ?? 0
    if (grossMarginPct > 60) margin_score = 90
    else if (grossMarginPct > 40) margin_score = 70
    else if (grossMarginPct > 20) margin_score = 50

    // ── Sub-score: Defensibility (20%) ──────────────────────────────
    // INTENT: Competitors with identified weaknesses = opportunity to differentiate
    let defensibility_score = 30
    const competitors = ma?.competitive_landscape ?? []
    const hasWeaknesses = competitors.some(c => c.weaknesses && c.weaknesses.length > 0)
    if (competitors.length > 0 && hasWeaknesses) {
      const weaknessCount = competitors.filter(c => c.weaknesses && c.weaknesses.length > 0).length
      defensibility_score = Math.min(90, 60 + (weaknessCount * 10))
    } else if (competitors.length > 0) {
      defensibility_score = 40
    }

    // ── Sub-score: Team Readiness (15%) ──────────────────────────────
    // DECISION: Hardcoded to 50 for now — Phase 5 will connect to team data
    const team_readiness_score = 50

    // ── Sub-score: Traction (15%) ────────────────────────────────────
    let traction_score = 20
    if (lifecycle === 'in_market') traction_score = 80
    else if (lifecycle === 'pre_production') traction_score = 60
    else if (lifecycle === 'prototyping') traction_score = 40

    // ── Overall weighted score ───────────────────────────────────────
    const overall = Math.round(
      market_size_score * 0.25 +
      margin_score * 0.25 +
      defensibility_score * 0.20 +
      team_readiness_score * 0.15 +
      traction_score * 0.15
    )

    // ── Investor appetite ────────────────────────────────────────────
    const investor_appetite: FundabilityScore['investor_appetite'] =
      overall > 70 ? 'strong' : overall > 45 ? 'moderate' : 'weak'

    // ── AI improvement suggestions (Haiku, 5s timeout) ───────────────
    let improvement_suggestions: FundabilityScore['improvement_suggestions'] = []
    const HAIKU_MODEL = 'gpt-4.1-mini'

    try {
      const apiKey = process.env.OPENROUTER_API_KEY?.trim()
      if (apiKey) {
        const scoresContext = JSON.stringify({
          market_size_score,
          margin_score,
          defensibility_score,
          team_readiness_score,
          traction_score,
          overall,
          product_name: product.name,
          product_description: product.description || 'No description',
          lifecycle,
        })

        const suggestionsSystem = `You are a concise investor advisor. Given a product's fundability sub-scores (0-100), suggest 2-3 specific actions to improve the overall score. Return ONLY a raw JSON array (no markdown, no code fences):
[{"action": "short imperative action", "impact_description": "1 sentence on why", "estimated_score_lift": number_1_to_20}]`

        const suggestionsPromise = callOpenAI(suggestionsSystem, `Scores: ${scoresContext}`, "gpt-4.1-mini", 512, 5_000)

        // INTENT: 5s timeout — don't let the AI delay the whole score
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000))
        const result = await Promise.race([suggestionsPromise, timeoutPromise])

        if (result && 'text' in result) {
          const raw = result.text.trim().replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```$/, '')
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) {
            improvement_suggestions = parsed.slice(0, 3).map((s: Record<string, unknown>) => ({
              action: String(s.action || ''),
              impact_description: String(s.impact_description || ''),
              estimated_score_lift: typeof s.estimated_score_lift === 'number' ? s.estimated_score_lift : 5,
            }))
          }

          // FLOW: Track AI usage for billing
          await trackUsage({
            model: 'openai/gpt-4.1-mini',
            promptTokens: result.tokensIn,
            completionTokens: result.tokensOut,
          })
        }
      }
    } catch (aiError) {
      // INTENT: AI suggestions are non-critical — score still saves without them
      console.error('[scoreFundability] AI suggestions failed:', {
        error: aiError instanceof Error ? aiError.message : 'Unknown',
      })
    }

    // ── Build and save the score ─────────────────────────────────────
    const fundabilityScore: FundabilityScore = {
      overall,
      market_size_score,
      margin_score,
      defensibility_score,
      team_readiness_score,
      traction_score,
      investor_appetite,
      improvement_suggestions,
      scored_at: new Date().toISOString(),
      model_used: HAIKU_MODEL,
    }

    const { error: updateError } = await productsTable(supabase)
      .update({ fundability_score: fundabilityScore })
      .eq('id', productId)
      .eq('foundry_id', foundryId)

    if (updateError) return { error: updateError.message }

    return { data: fundabilityScore }
  })
}

// ─── Iteration Tracking ─────────────────────────────────────────────

/**
 * Creates a new iteration for a product, computing convergence status.
 *
 * @param productId - UUID of the product
 * @param scores - Pareto scores across 4 dimensions (0-100 each)
 * @param changes - Array of changes made in this iteration
 * @param hypothesis - What we expect this iteration to achieve
 * @returns The created ProductIteration
 */
export async function createIteration(
  productId: string,
  scores: IterationPareto,
  changes: Array<{ description: string; dimension: string }>,
  hypothesis: string,
): Promise<ActionResult<ProductIteration>> {
  return withAuth(async ({ supabase, foundryId }) => {
    if (!productId || typeof productId !== 'string' || !isValidUUID(productId)) {
      return { error: 'Invalid product ID' }
    }

    // GOTCHA: The (product_id, iteration_number) unique constraint from
    // migration 20260417110000 rejects racing INSERTs. When that happens the
    // loser re-fetches and retries with a fresh MAX. Up to 3 retries before
    // we surface the error.
    const MAX_RETRIES = 3
    let lastError: string | null = null

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // FLOW: Fetch all existing iterations to determine number + convergence
      const { data: existing, error: fetchError } = await iterationsTable(supabase)
        .select('iteration_number, pareto_scores, convergence_delta')
        .eq('product_id', productId)
        .eq('foundry_id', foundryId)
        .order('iteration_number', { ascending: true })

      if (fetchError) return { error: fetchError.message }

      const iterations = (existing ?? []) as Array<{
        iteration_number: number
        pareto_scores: IterationPareto
        convergence_delta: number
      }>

      const nextNumber = iterations.length > 0
        ? Math.max(...iterations.map(i => i.iteration_number)) + 1
        : 1

      // INTENT: Compute convergence delta — difference in total Pareto score vs previous
      const currentTotal = scores.market + scores.financial + scores.fundability + scores.manufacturing
      let convergenceDelta = 0
      let convergenceStatus: ConvergenceStatus = 'initial'

      if (iterations.length > 0) {
        const prev = iterations[iterations.length - 1]
        const prevScores = prev.pareto_scores
        const prevTotal = prevScores.market + prevScores.financial + prevScores.fundability + prevScores.manufacturing
        convergenceDelta = currentTotal - prevTotal

        // INTENT: Check for convergence — 3+ iterations with small deltas
        const recentDeltas = [
          ...iterations.slice(-2).map(i => i.convergence_delta),
          convergenceDelta,
        ]
        const allSmall = recentDeltas.length >= 3 && recentDeltas.every(d => Math.abs(d) < 5)

        if (allSmall) {
          convergenceStatus = 'converged'
        } else if (convergenceDelta > 10) {
          convergenceStatus = 'improving'
        } else if (convergenceDelta >= 0) {
          convergenceStatus = 'moderate'
        } else if (convergenceDelta >= -5) {
          convergenceStatus = 'plateauing'
        } else {
          convergenceStatus = 'regressing'
        }
      }

      const { data, error } = await iterationsTable(supabase)
        .insert({
          product_id: productId,
          foundry_id: foundryId,
          iteration_number: nextNumber,
          pareto_scores: scores,
          changes_made: changes,
          hypothesis,
          convergence_delta: convergenceDelta,
          convergence_status: convergenceStatus,
        })
        .select('*')
        .single()

      if (!error && data) return { data: data as ProductIteration }

      // Unique-violation on (product_id, iteration_number) — retry.
      // Postgres error code 23505 surfaces via error.code; fall through if it's
      // any other error since those are unlikely to succeed on retry.
      const isUniqueViolation =
        (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '23505') ||
        (error?.message ?? '').includes('duplicate key value violates unique constraint')
      if (!isUniqueViolation) return { error: error?.message ?? 'Failed to create iteration' }
      lastError = error?.message ?? 'Unique violation'
    }

    return { error: lastError ?? 'Failed to create iteration after retries' }
  })
}

/**
 * Returns all iterations for a product, ordered by iteration_number ASC.
 *
 * @param productId - UUID of the product
 * @returns Array of ProductIteration
 */
export async function getIterationHistory(
  productId: string,
): Promise<ActionResult<ProductIteration[]>> {
  return withAuth(async ({ supabase, foundryId }) => {
    if (!productId || typeof productId !== 'string') return { error: 'Invalid product ID' }

    const { data, error } = await iterationsTable(supabase)
      .select('*')
      .eq('product_id', productId)
      .eq('foundry_id', foundryId)
      .order('iteration_number', { ascending: true })

    if (error) return { error: error.message }

    return { data: (data ?? []) as ProductIteration[] }
  })
}

// ─── Design Briefs ──────────────────────────────────────────────────

/**
 * Creates a new design brief for a product.
 *
 * @param productId - UUID of the product
 * @param input - Brief content and source
 * @returns The created DesignBrief
 */
export async function createDesignBrief(
  productId: string,
  input: CreateDesignBriefInput,
): Promise<ActionResult<DesignBrief>> {
  return withAuth(async ({ supabase, foundryId }) => {
    if (!productId || typeof productId !== 'string') return { error: 'Invalid product ID' }

    const { data, error } = await briefsTable(supabase)
      .insert({
        product_id: productId,
        foundry_id: foundryId,
        brief_content: input.brief_content,
        source: input.source,
      })
      .select('*')
      .single()

    if (error) return { error: error.message }

    return { data: data as DesignBrief }
  })
}

/**
 * Updates a design brief's status, review notes, or reviewer.
 *
 * @param briefId - UUID of the design brief
 * @param updates - Fields to update
 * @returns The updated DesignBrief
 */
export async function updateDesignBrief(
  briefId: string,
  updates: { status?: BriefStatus; review_notes?: string; reviewed_by?: string },
): Promise<ActionResult<DesignBrief>> {
  return withAuth(async ({ supabase, foundryId }) => {
    if (!briefId || typeof briefId !== 'string') return { error: 'Invalid brief ID' }

    const payload: Record<string, unknown> = {}
    if (updates.status !== undefined) payload.status = updates.status
    if (updates.review_notes !== undefined) payload.review_notes = updates.review_notes
    if (updates.reviewed_by !== undefined) payload.reviewed_by = updates.reviewed_by

    if (Object.keys(payload).length === 0) return { error: 'No fields to update' }

    const { data, error } = await briefsTable(supabase)
      .update(payload)
      .eq('id', briefId)
      .eq('foundry_id', foundryId)
      .select('*')
      .single()

    if (error) return { error: error.message }
    if (!data) return { error: 'Design brief not found' }

    return { data: data as DesignBrief }
  })
}

/**
 * Converts a design brief into a CAD Lab project ("Send to Forge").
 *
 * @description Fetches the brief, creates a new CAD Lab project seeded with
 * the brief's requirements, links the brief and product to the new project.
 *
 * @param briefId - UUID of the design brief
 * @returns The new CAD Lab project ID
 */
export async function convertBriefToForge(
  briefId: string,
): Promise<ActionResult<{ cadLabProjectId: string }>> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    if (!briefId || typeof briefId !== 'string') return { error: 'Invalid brief ID' }

    // FLOW: Fetch the brief
    const { data: brief, error: briefError } = await briefsTable(supabase)
      .select('*')
      .eq('id', briefId)
      .eq('foundry_id', foundryId)
      .single()

    if (briefError || !brief) return { error: 'Design brief not found' }

    // FLOW: Fetch the product name for the project title
    const { data: product, error: productError } = await productsTable(supabase)
      .select('id, name')
      .eq('id', brief.product_id)
      .eq('foundry_id', foundryId)
      .single()

    if (productError || !product) return { error: 'Product not found' }

    // FLOW: Count existing iterations for version label
    const { data: iterations } = await iterationsTable(supabase)
      .select('iteration_number')
      .eq('product_id', brief.product_id)
      .eq('foundry_id', foundryId)
      .order('iteration_number', { ascending: false })
      .limit(1)

    const versionNumber = iterations?.[0]?.iteration_number ?? 1
    const briefContent = brief.brief_content as Record<string, unknown>

    // FLOW: Create the CAD Lab project
    const keyReqs = Array.isArray(briefContent.key_requirements)
      ? (briefContent.key_requirements as string[]).join('; ')
      : ''

    // INTENT: Build a human-readable overview from brief_content fields instead of
    // storing raw JSON — the ProductOverviewCard renders this as plain text.
    const overviewParts: string[] = []
    if (briefContent.product_category) {
      overviewParts.push(`Product Category: ${briefContent.product_category}`)
    }
    if (briefContent.source_context) {
      overviewParts.push(`\n${briefContent.source_context}`)
    }
    if (Array.isArray(briefContent.key_requirements) && (briefContent.key_requirements as string[]).length > 0) {
      overviewParts.push(`\nKey Requirements:\n${(briefContent.key_requirements as string[]).map(r => `  - ${r}`).join('\n')}`)
    }
    if (Array.isArray(briefContent.design_priorities) && (briefContent.design_priorities as string[]).length > 0) {
      overviewParts.push(`\nDesign Priorities:\n${(briefContent.design_priorities as string[]).map(p => `  - ${p}`).join('\n')}`)
    }
    if (Array.isArray(briefContent.materials_guidance) && (briefContent.materials_guidance as string[]).length > 0) {
      overviewParts.push(`\nMaterials Guidance:\n${(briefContent.materials_guidance as string[]).map(m => `  - ${m}`).join('\n')}`)
    }
    if (Array.isArray(briefContent.manufacturing_constraints) && (briefContent.manufacturing_constraints as string[]).length > 0) {
      overviewParts.push(`\nManufacturing Constraints:\n${(briefContent.manufacturing_constraints as string[]).map(c => `  - ${c}`).join('\n')}`)
    }
    if (Array.isArray(briefContent.certification_requirements) && (briefContent.certification_requirements as string[]).length > 0) {
      overviewParts.push(`\nCertification Requirements:\n${(briefContent.certification_requirements as string[]).map(c => `  - ${c}`).join('\n')}`)
    }
    if (typeof briefContent.target_cost_pence === 'number') {
      overviewParts.push(`\nTarget Cost: £${((briefContent.target_cost_pence as number) / 100).toFixed(2)}`)
    }
    if (typeof briefContent.target_weight_kg === 'number') {
      overviewParts.push(`Target Weight: ${briefContent.target_weight_kg} kg`)
    }
    if (typeof briefContent.target_dimensions === 'string' && briefContent.target_dimensions) {
      overviewParts.push(`Target Dimensions: ${briefContent.target_dimensions}`)
    }
    if (Array.isArray(briefContent.competitive_benchmarks) && (briefContent.competitive_benchmarks as Array<Record<string, unknown>>).length > 0) {
      const benchmarks = briefContent.competitive_benchmarks as Array<{ product: string; price: number; key_specs: string }>
      overviewParts.push(`\nCompetitive Benchmarks:\n${benchmarks.map(b => `  - ${b.product} (£${(b.price / 100).toFixed(2)}) — ${b.key_specs}`).join('\n')}`)
    }
    const formattedOverview = overviewParts.join('\n')

    const { data: newProject, error: projectCreateError } = await cadLabTable(supabase)
      .insert({
        foundry_id: foundryId,
        created_by: user.id,
        name: `${product.name} (v${versionNumber})`,
        subject: keyReqs,
        product_overview: formattedOverview,
        // 1.4 — structural seed: CAD Lab Specify reads this to show the brief
        // fields as a structured card instead of just parsing the markdown blob.
        // Shape matches DesignBriefContent in src/types/product.ts.
        seeded_brief_content: briefContent,
      })
      .select('id')
      .single()

    if (projectCreateError || !newProject) {
      return { error: `Failed to create CAD Lab project: ${projectCreateError?.message ?? 'Unknown error'}` }
    }

    const cadLabProjectId = newProject.id as string

    // FLOW: Update the brief — mark as sent_to_forge, link to project
    const { error: briefUpdateError } = await briefsTable(supabase)
      .update({
        status: 'sent_to_forge',
        cad_lab_project_id: cadLabProjectId,
      })
      .eq('id', briefId)
      .eq('foundry_id', foundryId)

    if (briefUpdateError) {
      console.error('[convertBriefToForge] Failed to update brief:', briefUpdateError.message)
    }

    // FLOW: Update the product — link to latest CAD Lab project
    const { error: productUpdateError } = await productsTable(supabase)
      .update({ cad_lab_project_id: cadLabProjectId })
      .eq('id', brief.product_id)
      .eq('foundry_id', foundryId)

    if (productUpdateError) {
      console.error('[convertBriefToForge] Failed to update product:', productUpdateError.message)
    }

    return { data: { cadLabProjectId } }
  })
}

// ─── getDesignBriefs ────────────────────────────────────────────────

/**
 * Fetches all design briefs for a product, ordered by creation date descending.
 *
 * @param productId - UUID of the product
 * @returns Array of DesignBrief
 */
export async function getDesignBriefs(
  productId: string,
): Promise<ActionResult<DesignBrief[]>> {
  return withAuth(async ({ supabase, foundryId }) => {
    if (!productId || typeof productId !== 'string') return { error: 'Invalid product ID' }

    const { data, error } = await briefsTable(supabase)
      .select('*')
      .eq('product_id', productId)
      .eq('foundry_id', foundryId)
      .order('created_at', { ascending: false })

    if (error) return { error: error.message }

    return { data: (data ?? []) as DesignBrief[] }
  })
}

// ─── generateDesignBriefFromAssessment ──────────────────────────────

/**
 * Generates a design brief from a product's market assessment.
 *
 * @description Uses Claude Sonnet with Priya (Product Lead) + Fang (VP Manufacturing)
 * context to translate market assessment data into engineering constraints and
 * design priorities. Creates a design brief with source='market_assessment'.
 *
 * @param productId - UUID of the product (must have a market_assessment)
 * @returns The created DesignBrief
 *
 * @security Gated behind AI usage limits via withAIGate('market_assessment').
 */
export async function generateDesignBriefFromAssessment(
  productId: string,
): Promise<ActionResult<DesignBrief>> {
  return withAIGate('market_assessment', async ({ supabase, foundryId, trackUsage }) => {
    if (!productId || typeof productId !== 'string') {
      return { error: 'Invalid product ID' }
    }

    // FLOW: Fetch product with market assessment
    const { data: product, error: fetchError } = await productsTable(supabase)
      .select('id, name, description, market_assessment, lifecycle')
      .eq('id', productId)
      .eq('foundry_id', foundryId)
      .single()

    if (fetchError || !product) return { error: 'Product not found' }

    const ma = product.market_assessment as MarketAssessment | null
    if (!ma) return { error: 'No market assessment found — run market assessment first' }

    // ── Build prompt ───────────────────────────────────────────────
    const systemPrompt = `You are Priya (Product Lead) and Fang (VP Manufacturing) collaborating at Fractional Forge. Given this market assessment, produce a design brief. Be specific about engineering constraints. Consider the target customer, competitive pricing, and manufacturing feasibility.

Return ONLY a valid JSON object matching this exact schema (no markdown fences, no explanation):
{
  "product_category": "string",
  "target_cost_pence": number,
  "target_weight_kg": number,
  "target_dimensions": "string or null",
  "key_requirements": ["string array of 4-6 specific requirements"],
  "materials_guidance": ["string array of 2-4 material recommendations with reasoning"],
  "manufacturing_constraints": ["string array of 3-5 manufacturing constraints"],
  "competitive_benchmarks": [{"product": "string", "price": number_in_pence, "key_specs": "string"}],
  "design_priorities": ["string array of 3-5 design priorities ordered by importance"],
  "certification_requirements": ["string array of relevant certifications"],
  "source_context": "brief summary of how market data informed this brief"
}

Rules:
- target_cost_pence should be derived from pricing analysis minus healthy margin (aim for 40-60% gross margin)
- key_requirements should be actionable engineering requirements, not vague goals
- manufacturing_constraints should reference realistic processes for the target cost
- competitive_benchmarks should reference real competitors from the market assessment
- design_priorities should balance cost, quality, and time-to-market`

    const userPrompt = `Generate a design brief for this product based on its market assessment:

Product Name: ${product.name}
Description: ${product.description || 'No description'}

Market Assessment Data:
- TAM: ${ma.tam_gbp != null ? `£${ma.tam_gbp.toLocaleString()}` : 'Unknown'}
- SAM: ${ma.sam_gbp != null ? `£${ma.sam_gbp.toLocaleString()}` : 'Unknown'}
- SOM: ${ma.som_gbp != null ? `£${ma.som_gbp.toLocaleString()}` : 'Unknown'}
- Target Customer: ${ma.target_customer || 'Not specified'}
- Customer Segments: ${JSON.stringify(ma.customer_segments)}
- Competitive Landscape: ${JSON.stringify(ma.competitive_landscape)}
- Pricing Analysis: ${JSON.stringify(ma.pricing_analysis)}
- Market Risks: ${ma.market_risks.join('; ')}
- Market Opportunities: ${ma.market_opportunities.join('; ')}

Produce the design brief JSON.`

    // ── Call OpenAI gpt-4.1-mini ──────────────────────────────────────

    try {
      const result = await callOpenAI(systemPrompt, userPrompt, "gpt-4.1-mini", 2000, 120_000)

      const text = result.text
      if (!text) return { error: 'Empty response from AI' }

      // INTENT: Track usage for billing
      await trackUsage({
        model: 'openai/gpt-4.1-mini',
        promptTokens: result.tokensIn,
        completionTokens: result.tokensOut,
      })

      // ── Parse response ─────────────────────────────────────────
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(cleaned)
      } catch (err) {
        return { error: classifyAIError(err).message }
      }

      // INTENT: Build DesignBriefContent from parsed response
      const briefContent = {
        product_category: typeof parsed.product_category === 'string' ? parsed.product_category : undefined,
        target_cost_pence: typeof parsed.target_cost_pence === 'number' ? parsed.target_cost_pence : undefined,
        target_weight_kg: typeof parsed.target_weight_kg === 'number' ? parsed.target_weight_kg : undefined,
        target_dimensions: typeof parsed.target_dimensions === 'string' ? parsed.target_dimensions : undefined,
        key_requirements: Array.isArray(parsed.key_requirements)
          ? parsed.key_requirements.filter((r: unknown): r is string => typeof r === 'string')
          : [],
        materials_guidance: Array.isArray(parsed.materials_guidance)
          ? parsed.materials_guidance.filter((m: unknown): m is string => typeof m === 'string')
          : [],
        manufacturing_constraints: Array.isArray(parsed.manufacturing_constraints)
          ? parsed.manufacturing_constraints.filter((c: unknown): c is string => typeof c === 'string')
          : [],
        competitive_benchmarks: Array.isArray(parsed.competitive_benchmarks)
          ? parsed.competitive_benchmarks.map((b: Record<string, unknown>) => ({
              product: String(b.product || ''),
              price: typeof b.price === 'number' ? b.price : 0,
              key_specs: String(b.key_specs || ''),
            }))
          : [],
        design_priorities: Array.isArray(parsed.design_priorities)
          ? parsed.design_priorities.filter((p: unknown): p is string => typeof p === 'string')
          : [],
        certification_requirements: Array.isArray(parsed.certification_requirements)
          ? parsed.certification_requirements.filter((c: unknown): c is string => typeof c === 'string')
          : [],
        source_context: typeof parsed.source_context === 'string' ? parsed.source_context : undefined,
      }

      // ── Create the design brief ────────────────────────────────
      const { data: brief, error: briefError } = await briefsTable(supabase)
        .insert({
          product_id: productId,
          foundry_id: foundryId,
          brief_content: briefContent,
          source: 'market_assessment',
        })
        .select('*')
        .single()

      if (briefError) return { error: `Brief generated but failed to save: ${briefError.message}` }

      return { data: brief as DesignBrief }
    } catch (err) {
      console.error('[generateDesignBriefFromAssessment] AI call failed:', err)
      return { error: 'Design brief generation failed — please try again' }
    }
  })
}

// ─── generateDesignBriefFromSuggestion ───────────────────────────────

/**
 * Generates a design brief from a fundability improvement suggestion.
 *
 * @description Uses Claude Sonnet with Fang (VP Manufacturing) context to
 * translate a business improvement suggestion into engineering constraints.
 * Creates a design brief with source='fundability_suggestion'.
 *
 * @param productId - UUID of the product
 * @param suggestion - The fundability improvement suggestion to apply
 * @returns The created DesignBrief
 *
 * @security Gated behind AI usage limits via withAIGate('fundability_score').
 */
export async function generateDesignBriefFromSuggestion(
  productId: string,
  suggestion: { action: string; impact_description: string },
): Promise<ActionResult<DesignBrief>> {
  return withAIGate('fundability_score', async ({ supabase, foundryId, trackUsage }) => {
    if (!productId || typeof productId !== 'string') {
      return { error: 'Invalid product ID' }
    }
    if (!suggestion?.action?.trim()) {
      return { error: 'Suggestion action is required' }
    }

    // SECURITY: Rate limit AI calls
    const rateLimitError = await checkRateLimit('aiAnalysis', `ai:brief-from-suggestion:${productId}`)
    if (rateLimitError) return { error: rateLimitError }

    // FLOW: Fetch product with market assessment and unit economics
    const { data: product, error: fetchError } = await productsTable(supabase)
      .select('id, name, description, market_assessment, unit_economics, lifecycle, fundability_score')
      .eq('id', productId)
      .eq('foundry_id', foundryId)
      .single()

    if (fetchError || !product) return { error: 'Product not found' }

    const ma = product.market_assessment as MarketAssessment | null
    const ue = product.unit_economics as UnitEconomics | null

    // ── Build prompt ───────────────────────────────────────────────
    const systemPrompt = `You are Fang, VP of Manufacturing at Fractional Forge. You are translating a business improvement suggestion into concrete engineering constraints for a design brief. Be specific about what needs to change in the product design to achieve the business goal.

Return ONLY a valid JSON object matching this exact schema (no markdown fences, no explanation):
{
  "product_category": "string",
  "target_cost_pence": number,
  "target_weight_kg": number,
  "target_dimensions": "string or null",
  "key_requirements": ["string array of 4-6 specific engineering requirements driven by this suggestion"],
  "materials_guidance": ["string array of 2-4 material recommendations"],
  "manufacturing_constraints": ["string array of 3-5 manufacturing constraints"],
  "competitive_benchmarks": [{"product": "string", "price": number_in_pence, "key_specs": "string"}],
  "design_priorities": ["string array of 3-5 design priorities ordered by importance"],
  "certification_requirements": ["string array of relevant certifications"],
  "source_context": "explain how this fundability suggestion translates to design changes"
}

Rules:
- Focus on what needs to CHANGE in the design to achieve the suggestion's goal
- key_requirements should directly address the improvement action
- target_cost_pence should reflect realistic manufacturing cost changes
- Be concrete — avoid vague requirements like "improve quality"
- design_priorities should be ordered by impact on the fundability improvement`

    const productContext = [
      `Product Name: ${product.name}`,
      `Description: ${product.description || 'No description'}`,
      `Lifecycle: ${product.lifecycle}`,
    ]

    if (ue) {
      productContext.push(`Current COGS: ${(ue.cogs_per_unit_pence / 100).toFixed(2)} GBP`)
      if (ue.gross_margin_pct != null) productContext.push(`Current Gross Margin: ${ue.gross_margin_pct.toFixed(1)}%`)
    }

    if (ma) {
      if (ma.target_customer) productContext.push(`Target Customer: ${ma.target_customer}`)
      if (ma.pricing_analysis?.recommended_price_pence != null) {
        productContext.push(`Recommended Price: ${(ma.pricing_analysis.recommended_price_pence / 100).toFixed(2)} GBP`)
      }
      if (ma.competitive_landscape.length > 0) {
        productContext.push(`Competitors: ${ma.competitive_landscape.map(c => c.competitor).join(', ')}`)
      }
    }

    const userPrompt = `Translate this fundability improvement suggestion into a design brief:

SUGGESTION:
Action: ${suggestion.action}
Expected Impact: ${suggestion.impact_description}

CURRENT PRODUCT CONTEXT:
${productContext.join('\n')}

Generate the design brief JSON that will guide engineering changes to achieve this improvement.`

    // ── Call OpenAI gpt-4.1-mini ──────────────────────────────────────

    try {
      const result = await callOpenAI(systemPrompt, userPrompt, "gpt-4.1-mini", 2000, 120_000)

      const text = result.text
      if (!text) return { error: 'Empty response from AI' }

      // INTENT: Track usage for billing
      await trackUsage({
        model: 'openai/gpt-4.1-mini',
        promptTokens: result.tokensIn,
        completionTokens: result.tokensOut,
      })

      // ── Parse response ─────────────────────────────────────────
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(cleaned)
      } catch (err) {
        return { error: classifyAIError(err).message }
      }

      // INTENT: Build DesignBriefContent from parsed response
      const briefContent = {
        product_category: typeof parsed.product_category === 'string' ? parsed.product_category : undefined,
        target_cost_pence: typeof parsed.target_cost_pence === 'number' ? parsed.target_cost_pence : undefined,
        target_weight_kg: typeof parsed.target_weight_kg === 'number' ? parsed.target_weight_kg : undefined,
        target_dimensions: typeof parsed.target_dimensions === 'string' ? parsed.target_dimensions : undefined,
        key_requirements: Array.isArray(parsed.key_requirements)
          ? parsed.key_requirements.filter((r: unknown): r is string => typeof r === 'string')
          : [],
        materials_guidance: Array.isArray(parsed.materials_guidance)
          ? parsed.materials_guidance.filter((m: unknown): m is string => typeof m === 'string')
          : [],
        manufacturing_constraints: Array.isArray(parsed.manufacturing_constraints)
          ? parsed.manufacturing_constraints.filter((c: unknown): c is string => typeof c === 'string')
          : [],
        competitive_benchmarks: Array.isArray(parsed.competitive_benchmarks)
          ? parsed.competitive_benchmarks.map((b: Record<string, unknown>) => ({
              product: String(b.product || ''),
              price: typeof b.price === 'number' ? b.price : 0,
              key_specs: String(b.key_specs || ''),
            }))
          : [],
        design_priorities: Array.isArray(parsed.design_priorities)
          ? parsed.design_priorities.filter((p: unknown): p is string => typeof p === 'string')
          : [],
        certification_requirements: Array.isArray(parsed.certification_requirements)
          ? parsed.certification_requirements.filter((c: unknown): c is string => typeof c === 'string')
          : [],
        source_context: typeof parsed.source_context === 'string' ? parsed.source_context : `From fundability suggestion: ${suggestion.action}`,
      }

      // ── Create the design brief ────────────────────────────────
      const { data: brief, error: briefError } = await briefsTable(supabase)
        .insert({
          product_id: productId,
          foundry_id: foundryId,
          brief_content: briefContent,
          source: 'fundability_suggestion',
        })
        .select('*')
        .single()

      if (briefError) return { error: `Brief generated but failed to save: ${briefError.message}` }

      return { data: brief as DesignBrief }
    } catch (err) {
      console.error('[generateDesignBriefFromSuggestion] AI call failed:', err)
      return { error: 'Design brief generation failed — please try again' }
    }
  })
}

// ─── synthesizeProductStatus ────────────────────────────────────────

/**
 * Cross-system synthesis engine for a product.
 *
 * @description Computes Pareto scores across 4 dimensions (market, financial,
 * fundability, manufacturing) from the product's existing data, then calls
 * Claude Sonnet to classify improvements as Type A (aligned — improve multiple
 * dimensions simultaneously) vs Type B (trade-offs — require founder decision),
 * detect local optima, and recommend the single most important next action.
 *
 * Saves results to products.product_synthesis JSONB for the History tab (Prompt 8).
 *
 * @param productId - UUID of the product to synthesize
 * @returns Pareto scores, Type A/B improvements, next action, local optimum flag
 *
 * @security Gated behind AI usage limits via withAIGate('market_assessment').
 */
export async function synthesizeProductStatus(
  productId: string,
): Promise<ActionResult<ProductSynthesis>> {
  return withAIGate('market_assessment', async ({ supabase, foundryId, trackUsage }) => {
    if (!productId || typeof productId !== 'string') {
      return { error: 'Invalid product ID' }
    }

    // SECURITY: Rate limit AI calls
    const rateLimitError = await checkRateLimit('aiAnalysis', `ai:synthesis:${productId}`)
    if (rateLimitError) return { error: rateLimitError }

    // FLOW: Fetch the product with all scoring data
    const { data: product, error: fetchError } = await productsTable(supabase)
      .select('*')
      .eq('id', productId)
      .eq('foundry_id', foundryId)
      .single()

    if (fetchError || !product) return { error: 'Product not found' }

    const ma = product.market_assessment as MarketAssessment | null
    const ue = product.unit_economics as UnitEconomics | null
    const fs = product.fundability_score as FundabilityScore | null

    // ── Compute Pareto Scores ─────────────────────────────────────

    // INTENT: Market score — TAM size + SAM/SOM ratio + segments bonus
    let marketScore = 30
    const tamGbp = ma?.tam_gbp ?? 0
    if (tamGbp > 100_000_000) marketScore = 90
    else if (tamGbp > 10_000_000) marketScore = 70
    else if (tamGbp > 1_000_000) marketScore = 50
    // Bonus: SAM/SOM ratio indicates addressable precision
    if (ma?.sam_gbp && ma?.som_gbp && ma.sam_gbp > 0) {
      const somSamRatio = ma.som_gbp / ma.sam_gbp
      if (somSamRatio > 0.1) marketScore = Math.min(100, marketScore + 5)
    }
    // Bonus: has customer segments
    if (ma?.customer_segments && ma.customer_segments.length > 0) {
      marketScore = Math.min(100, marketScore + 10)
    }

    // INTENT: Financial score — gross margin + cash burn runway context
    let financialScore = 20
    const grossMarginPct = ue?.gross_margin_pct ?? 0
    if (grossMarginPct > 60) financialScore = 90
    else if (grossMarginPct > 40) financialScore = 70
    else if (grossMarginPct > 20) financialScore = 50

    // FLOW: Check cash burn runway for financial health bonus
    try {
      const { data: cashOutItems } = await cashOutTable(supabase)
        .select('amount, frequency')
        .eq('foundry_id', foundryId)

      const { data: cashInItems } = await cashInTable(supabase)
        .select('amount, frequency')
        .eq('foundry_id', foundryId)

      if (cashOutItems && cashInItems) {
        // INTENT: Simple monthly burn approximation
        const monthlyOut = (cashOutItems as Array<{ amount: number; frequency: string }>)
          .reduce((sum, item) => {
            const amt = Number(item.amount) || 0
            if (item.frequency === 'monthly') return sum + amt
            if (item.frequency === 'quarterly') return sum + amt / 3
            if (item.frequency === 'annually') return sum + amt / 12
            return sum + amt // one_time treated as single month
          }, 0)

        const monthlyIn = (cashInItems as Array<{ amount: number; frequency: string }>)
          .reduce((sum, item) => {
            const amt = Number(item.amount) || 0
            if (item.frequency === 'monthly') return sum + amt
            if (item.frequency === 'quarterly') return sum + amt / 3
            if (item.frequency === 'annually') return sum + amt / 12
            return sum + amt
          }, 0)

        const netBurn = monthlyOut - monthlyIn
        // INTENT: Positive runway (income > expenses) boosts financial score
        if (netBurn <= 0) {
          financialScore = Math.min(100, financialScore + 10)
        }
      }
    } catch {
      // INTENT: Cash burn data is supplementary — don't fail synthesis
    }

    // INTENT: Fundability score — directly from the product's fundability_score
    const fundabilityScore = fs?.overall ?? 0

    // INTENT: Manufacturing score — COGS confidence + linked CAD project
    let manufacturingScore = 20
    const cogsConfidence = ue?.cogs_confidence ?? 'low'
    if (cogsConfidence === 'high') manufacturingScore = 90
    else if (cogsConfidence === 'medium') manufacturingScore = 60
    else if (cogsConfidence === 'low') manufacturingScore = 30
    // Bonus: has linked CAD project
    if (product.cad_lab_project_id) {
      manufacturingScore = Math.min(100, manufacturingScore + 10)
    }

    const pareto: IterationPareto = {
      market: marketScore,
      financial: financialScore,
      fundability: fundabilityScore,
      manufacturing: manufacturingScore,
    }

    // ── Call OpenAI for synthesis ──────────────────────────────────

    try {

      const systemPrompt = `You are the cross-system synthesis engine for Fractional Forge, a platform helping hardware startups build, fund, and ship products. You are given a product's complete data across 4 dimensions:

1. MARKET: TAM/SAM/SOM, customer segments, competitive landscape, pricing
2. FINANCIAL: Unit economics (COGS, margins, breakeven), cash flow
3. FUNDABILITY: Investor attractiveness score (market, margin, defensibility, team, traction)
4. MANUFACTURING: Design readiness, cost confidence, CAD project status

Your job is to synthesize across these dimensions and identify:

**Type A improvements** (aligned): Actions that improve MULTIPLE dimensions simultaneously. Example: "Reduce COGS by switching to injection moulding" improves financial (margin), manufacturing (proven process), and fundability (better economics).

**Type B improvements** (trade-offs): Actions where improving one dimension hurts another, requiring a founder decision. Example: "Add premium features" improves market (differentiation) but hurts financial (higher COGS) and manufacturing (complexity).

**Local optimum detection**: The product is at a local optimum when all obvious improvements are Type B (trade-offs). This means the founder has optimised within the current strategy and needs a strategic pivot or new information to improve further.

**Next action**: The single most impactful thing the founder should do RIGHT NOW, considering where the product is in its lifecycle.

Return ONLY a valid JSON object (no markdown fences):
{
  "typeA": ["string array of 2-4 aligned improvements with brief reasoning"],
  "typeB": ["string array of 1-3 trade-off improvements with which dimensions conflict"],
  "isLocalOptimum": boolean,
  "nextAction": "single imperative sentence — the one thing to do next"
}

Rules:
- Be specific to THIS product — no generic advice
- Reference actual scores and data points in your reasoning
- Type A improvements should clearly state which dimensions benefit
- Type B improvements should clearly state the trade-off (X improves but Y suffers)
- nextAction should be immediately actionable, not strategic platitudes
- isLocalOptimum should be true ONLY if no Type A improvements exist`

      const productData = {
        name: product.name,
        description: product.description,
        lifecycle: product.lifecycle,
        pareto_scores: pareto,
        market_assessment: ma ? {
          tam_gbp: ma.tam_gbp,
          sam_gbp: ma.sam_gbp,
          som_gbp: ma.som_gbp,
          target_customer: ma.target_customer,
          segments_count: ma.customer_segments?.length ?? 0,
          competitors_count: ma.competitive_landscape?.length ?? 0,
          recommended_price_pence: ma.pricing_analysis?.recommended_price_pence,
          risks: ma.market_risks,
          opportunities: ma.market_opportunities,
        } : null,
        unit_economics: ue ? {
          cogs_per_unit_pence: ue.cogs_per_unit_pence,
          selling_price_pence: ue.selling_price_pence,
          gross_margin_pct: ue.gross_margin_pct,
          contribution_margin_pence: ue.contribution_margin_pence,
          breakeven_units: ue.breakeven_units,
          cogs_confidence: ue.cogs_confidence,
          cogs_breakdown: ue.cogs_breakdown,
        } : null,
        fundability: fs ? {
          overall: fs.overall,
          market_size_score: fs.market_size_score,
          margin_score: fs.margin_score,
          defensibility_score: fs.defensibility_score,
          team_readiness_score: fs.team_readiness_score,
          traction_score: fs.traction_score,
          investor_appetite: fs.investor_appetite,
          suggestions: fs.improvement_suggestions,
        } : null,
        has_cad_project: !!product.cad_lab_project_id,
        unit_price_pence: product.unit_price_pence,
        target_monthly_units: product.target_monthly_units,
      }

      const userPrompt = `Synthesize the status of this product and identify improvements:\n\n${JSON.stringify(productData, null, 2)}`

      // INTENT: 15s timeout — synthesis should not block the user
      const synthesisPromise = callOpenAI(systemPrompt, userPrompt, "gpt-4.1-mini", 1500, 15_000)

      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000))
      const result = await Promise.race([synthesisPromise, timeoutPromise])

      if (!result) return { error: 'Synthesis timed out — please try again' }
      if (!('text' in result)) return { error: 'Unexpected response from AI' }

      const text = result.text
      if (!text) return { error: 'Empty response from AI' }

      // FLOW: Track AI usage for billing
      await trackUsage({
        model: 'openai/gpt-4.1-mini',
        promptTokens: result.tokensIn,
        completionTokens: result.tokensOut,
      })

      // ── Parse response ─────────────────────────────────────────
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(cleaned)
      } catch {
        return { error: 'Failed to parse synthesis response' }
      }

      const synthesis: ProductSynthesis = {
        pareto,
        typeA: Array.isArray(parsed.typeA)
          ? parsed.typeA.filter((s: unknown): s is string => typeof s === 'string').slice(0, 4)
          : [],
        typeB: Array.isArray(parsed.typeB)
          ? parsed.typeB.filter((s: unknown): s is string => typeof s === 'string').slice(0, 3)
          : [],
        nextAction: typeof parsed.nextAction === 'string' ? parsed.nextAction : 'Run market assessment to establish baseline data',
        isLocalOptimum: typeof parsed.isLocalOptimum === 'boolean' ? parsed.isLocalOptimum : false,
        synthesized_at: new Date().toISOString(),
        model_used: 'gpt-4.1-mini',
      }

      // ── Save to product ────────────────────────────────────────
      const { error: updateError } = await productsTable(supabase)
        .update({ product_synthesis: synthesis })
        .eq('id', productId)
        .eq('foundry_id', foundryId)

      if (updateError) {
        console.error('[synthesizeProductStatus] Failed to save synthesis:', updateError.message)
        // INTENT: Return synthesis even if save fails — caller gets the data
      }

      return { data: synthesis }
    } catch (err) {
      console.error('[synthesizeProductStatus] AI call failed:', err)
      return { error: 'Product synthesis failed — please try again' }
    }
  })
}

// ─── generateDesignBriefFromSynthesis ─────────────────────────────────

/**
 * Generates a design brief from approved synthesis improvements.
 *
 * @description Takes an array of approved improvement strings (from Type A or
 * founder-approved Type B improvements) and generates a coherent design brief
 * incorporating all of them. Used by the "Start Next Iteration" button.
 *
 * @param productId - UUID of the product
 * @param improvements - Array of improvement action strings from synthesis
 * @returns The created DesignBrief
 *
 * @security Gated behind AI usage limits via withAIGate('market_assessment').
 */
export async function generateDesignBriefFromSynthesis(
  productId: string,
  improvements: string[],
): Promise<ActionResult<DesignBrief>> {
  return withAIGate('market_assessment', async ({ supabase, foundryId, trackUsage }) => {
    if (!productId || typeof productId !== 'string') return { error: 'Invalid product ID' }
    if (!improvements || improvements.length === 0) return { error: 'No improvements provided' }

    const rateLimitError = await checkRateLimit('aiAnalysis', `ai:brief-synth:${productId}`)
    if (rateLimitError) return { error: rateLimitError }

    // FLOW: Fetch product with all data for context
    const { data: product, error: fetchError } = await productsTable(supabase)
      .select('*')
      .eq('id', productId)
      .eq('foundry_id', foundryId)
      .single()

    if (fetchError || !product) return { error: 'Product not found' }

    // FLOW: Fetch iteration history for constraint context
    const { data: iterations } = await iterationsTable(supabase)
      .select('iteration_number, pareto_scores, changes_made, hypothesis, outcome')
      .eq('product_id', productId)
      .eq('foundry_id', foundryId)
      .order('iteration_number', { ascending: true })

    const apiKey = process.env.OPENROUTER_API_KEY?.trim()
    if (!apiKey) return { error: 'OPENROUTER_API_KEY not configured' }

    try {
      const systemPrompt = `You are Max, the CTO of Fractional Forge. You translate business improvements into engineering design briefs for hardware products.

Given a product's current data and a list of approved improvements from the synthesis engine, generate a coherent design brief that:
1. Combines all improvements into one actionable engineering brief
2. Sets realistic target cost, weight, and dimension constraints
3. Specifies materials guidance and manufacturing constraints
4. Prioritises by expected impact
5. Includes constraints from previous iterations (things that worked — don't undo them)

Return ONLY a valid JSON object (no markdown fences):
{
  "product_category": "string",
  "target_cost_pence": number or null,
  "target_weight_kg": number or null,
  "target_dimensions": "string or null",
  "key_requirements": ["string array"],
  "materials_guidance": ["string array"],
  "manufacturing_constraints": ["string array"],
  "competitive_benchmarks": [{"product": "string", "price": number, "key_specs": "string"}],
  "design_priorities": ["string array — ordered by impact"],
  "certification_requirements": ["string array"],
  "source_context": "string — brief summary of what triggered this brief"
}`

      const productContext = {
        name: product.name,
        description: product.description,
        lifecycle: product.lifecycle,
        current_cogs_pence: (product.unit_economics as UnitEconomics | null)?.cogs_per_unit_pence,
        current_margin_pct: (product.unit_economics as UnitEconomics | null)?.gross_margin_pct,
        current_price_pence: product.unit_price_pence,
        market_assessment: product.market_assessment ? {
          target_customer: (product.market_assessment as MarketAssessment).target_customer,
          recommended_price_pence: (product.market_assessment as MarketAssessment).pricing_analysis?.recommended_price_pence,
        } : null,
        iteration_history: ((iterations ?? []) as Array<Record<string, unknown>>).map((i) => ({
          number: i.iteration_number,
          changes: i.changes_made,
          hypothesis: i.hypothesis,
        })),
        approved_improvements: improvements,
      }

      const result = await Promise.race([
        callOpenAI(
          systemPrompt,
          `Generate a design brief for this product incorporating the approved improvements:\n\n${JSON.stringify(productContext, null, 2)}`,
          'gpt-4.1-mini',
          1500,
          15000,
        ),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000)),
      ])

      if (!result) return { error: 'Brief generation timed out' }
      if (!('text' in result)) return { error: 'Unexpected AI response' }

      const text = result.text
      if (!text) return { error: 'Empty AI response' }

      await trackUsage({
        model: 'openai/gpt-4.1-mini',
        promptTokens: result.tokensIn,
        completionTokens: result.tokensOut,
      })

      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      let briefContent: Record<string, unknown>
      try {
        briefContent = JSON.parse(cleaned)
      } catch {
        return { error: 'Failed to parse brief response' }
      }

      // FLOW: Save the design brief
      const { data: brief, error: insertError } = await briefsTable(supabase)
        .insert({
          product_id: productId,
          foundry_id: foundryId,
          brief_content: {
            product_category: briefContent.product_category ?? product.name,
            target_cost_pence: briefContent.target_cost_pence ?? null,
            target_weight_kg: briefContent.target_weight_kg ?? null,
            target_dimensions: briefContent.target_dimensions ?? null,
            key_requirements: Array.isArray(briefContent.key_requirements) ? briefContent.key_requirements : [],
            materials_guidance: Array.isArray(briefContent.materials_guidance) ? briefContent.materials_guidance : [],
            manufacturing_constraints: Array.isArray(briefContent.manufacturing_constraints) ? briefContent.manufacturing_constraints : [],
            competitive_benchmarks: Array.isArray(briefContent.competitive_benchmarks) ? briefContent.competitive_benchmarks : [],
            design_priorities: Array.isArray(briefContent.design_priorities) ? briefContent.design_priorities : [],
            certification_requirements: Array.isArray(briefContent.certification_requirements) ? briefContent.certification_requirements : [],
            source_context: `Next iteration brief incorporating ${improvements.length} approved improvements from synthesis`,
          },
          source: 'synthesis',
          status: 'draft',
          reviewed_by: 'max_cto',
          review_notes: typeof briefContent.source_context === 'string' ? briefContent.source_context : null,
        })
        .select('*')
        .single()

      if (insertError) return { error: insertError.message }

      return { data: brief as DesignBrief }
    } catch (err) {
      console.error('[generateDesignBriefFromSynthesis] Failed:', err)
      return { error: 'Failed to generate design brief from synthesis' }
    }
  })
}

// ─── checkForgeCompletionAndSync ──────────────────────────────────────

/**
 * Checks if a product's linked CAD Lab project has completed and syncs
 * updated COGS if the product hasn't been synced since the project completed.
 *
 * @description Called on product detail page load. If the linked Forge project
 * is complete and COGS have changed, re-seeds unit economics. This closes the
 * loop: Forge completes → COGS updated → triggers downstream re-assessment.
 *
 * @param productId - UUID of the product
 * @returns { synced: boolean, newCogs?: number } or error
 */
export async function checkForgeCompletionAndSync(
  productId: string,
): Promise<ActionResult<{ synced: boolean; newCogsPence?: number }>> {
  return withAuth(async ({ supabase, foundryId }) => {
    if (!productId || typeof productId !== 'string') return { error: 'Invalid product ID' }

    const { data: product, error: fetchError } = await productsTable(supabase)
      .select('id, cad_lab_project_id, unit_economics, updated_at')
      .eq('id', productId)
      .eq('foundry_id', foundryId)
      .single()

    if (fetchError || !product) return { error: 'Product not found' }
    if (!product.cad_lab_project_id) return { data: { synced: false } }

    // FLOW: Check if the linked CAD project has completed
    const { data: cadProject } = await cadLabTable(supabase)
      .select('id, status, ai_cost_estimates, updated_at')
      .eq('id', product.cad_lab_project_id)
      .eq('foundry_id', foundryId)
      .single()

    if (!cadProject) return { data: { synced: false } }

    // INTENT: Only sync if project is complete/generated and has cost estimates
    const isComplete = cadProject.status === 'complete' || cadProject.status === 'generated'
    if (!isComplete || !cadProject.ai_cost_estimates) return { data: { synced: false } }

    // INTENT: Only sync if CAD project was updated AFTER last product update
    // (meaning new cost data is available)
    const cadUpdated = new Date(cadProject.updated_at).getTime()
    const productUpdated = new Date(product.updated_at).getTime()
    const lastSyncedAt = (product.unit_economics as UnitEconomics | null)?.last_synced_from_cad_at
    const lastSynced = lastSyncedAt ? new Date(lastSyncedAt).getTime() : 0

    if (cadUpdated <= lastSynced) return { data: { synced: false } }

    // FLOW: Re-seed COGS from updated CAD estimates
    const newEconomics = buildUnitEconomicsFromEstimates(cadProject.ai_cost_estimates)
    if (!newEconomics) return { data: { synced: false } }

    // INTENT: Preserve existing selling price and volume data
    const existingUe = product.unit_economics as UnitEconomics | null
    if (existingUe?.selling_price_pence) {
      newEconomics.selling_price_pence = existingUe.selling_price_pence
      const margin = existingUe.selling_price_pence - newEconomics.cogs_per_unit_pence
      newEconomics.contribution_margin_pence = margin
      newEconomics.gross_margin_pct = existingUe.selling_price_pence > 0
        ? Math.round((margin / existingUe.selling_price_pence) * 1000) / 10
        : null
    }

    const { error: updateError } = await productsTable(supabase)
      .update({ unit_economics: newEconomics })
      .eq('id', productId)
      .eq('foundry_id', foundryId)

    if (updateError) return { error: updateError.message }

    return { data: { synced: true, newCogsPence: newEconomics.cogs_per_unit_pence } }
  })
}

// ─── reviewBriefFeasibility ──────────────────────────────────────────

/**
 * Max CTO feasibility review on a design brief.
 *
 * @description Calls Claude Sonnet with Max's personality to assess whether
 * a design brief is technically feasible before sending to Forge.
 *
 * @param briefId - UUID of the design brief to review
 * @returns Feasibility assessment text from Max
 */
export async function reviewBriefFeasibility(
  briefId: string,
): Promise<ActionResult<{ review: string; feasible: boolean }>> {
  return withAIGate('market_assessment', async ({ supabase, foundryId, trackUsage }) => {
    if (!briefId || typeof briefId !== 'string') return { error: 'Invalid brief ID' }

    const { data: brief, error: fetchError } = await briefsTable(supabase)
      .select('*, products:product_id(name, description, lifecycle)')
      .eq('id', briefId)
      .eq('foundry_id', foundryId)
      .single()

    if (fetchError || !brief) return { error: 'Brief not found' }

    const apiKey = process.env.OPENROUTER_API_KEY?.trim()
    if (!apiKey) return { error: 'OPENROUTER_API_KEY not configured' }

    try {
      const systemPrompt = `You are Max, CTO of Fractional Forge. You're a pragmatic engineer who's built hardware products from prototype to mass production. You review design briefs for technical feasibility.

Assess this brief honestly:
1. Are the target specs achievable?
2. Are the manufacturing constraints realistic?
3. Are there any red flags or contradictions?
4. What's the biggest risk?

Keep your review to 3-4 sentences. Be direct — founders need honesty, not encouragement. End with a clear verdict.

Return ONLY a valid JSON object (no markdown):
{"review": "your assessment text", "feasible": true/false}`

      const result = await Promise.race([
        callOpenAI(
          systemPrompt,
          `Review this design brief:\n\n${JSON.stringify(brief.brief_content, null, 2)}`,
          'gpt-4.1-mini',
          500,
          10000,
        ),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000)),
      ])

      if (!result) return { error: 'Review timed out' }
      if (!('text' in result)) return { error: 'Unexpected AI response' }

      const text = result.text
      await trackUsage({ model: 'openai/gpt-4.1-mini', promptTokens: result.tokensIn, completionTokens: result.tokensOut })

      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      try {
        const parsed = JSON.parse(cleaned)
        const review = typeof parsed.review === 'string' ? parsed.review : 'Unable to parse review'
        const feasible = typeof parsed.feasible === 'boolean' ? parsed.feasible : true

        // FLOW: Save review to the brief
        await briefsTable(supabase)
          .update({ reviewed_by: 'max_cto', review_notes: review })
          .eq('id', briefId)
          .eq('foundry_id', foundryId)

        return { data: { review, feasible } }
      } catch {
        return { data: { review: text.slice(0, 500), feasible: true } }
      }
    } catch (err) {
      console.error('[reviewBriefFeasibility] Failed:', err)
      return { error: 'Feasibility review failed' }
    }
  })
}

// ─── Internal helpers ───────────────────────────────────────────────

/**
 * Seeds unit economics from a CAD project's ai_cost_estimates.
 * Returns null if no estimates exist.
 */
async function seedUnitEconomicsFromCad(
  supabase: unknown,
  cadLabProjectId: string,
  foundryId: string,
): Promise<UnitEconomics | null> {
  // SECURITY: Filter by foundry_id to prevent cross-tenant data access
  const { data: project } = await cadLabTable(supabase)
    .select('ai_cost_estimates')
    .eq('id', cadLabProjectId)
    .eq('foundry_id', foundryId)
    .single()

  if (!project?.ai_cost_estimates) return null

  return buildUnitEconomicsFromEstimates(project.ai_cost_estimates)
}

/**
 * Builds UnitEconomics from ai_cost_estimates JSONB.
 *
 * @description ai_cost_estimates is Record<moduleId, { keyword_estimate_pence, ... }>.
 * Sums keyword_estimate_pence across all modules to get total COGS.
 *
 * GOTCHA: ai_cost_estimates is a Record<moduleId, T>, not an array.
 * Always use Object.values() to iterate.
 */
function buildUnitEconomicsFromEstimates(
  estimates: Record<string, any> | null,
): UnitEconomics | null {
  if (!estimates || typeof estimates !== 'object') return null

  const entries = Object.values(estimates)
  if (entries.length === 0) return null

  let totalCogsPence = 0
  let totalToolingPence = 0
  const breakdown: Array<{ category: string; amount_pence: number; pct: number }> = []

  for (const estimate of entries) {
    if (!estimate || typeof estimate !== 'object') continue
    // GOTCHA: keyword_estimate_pence may be the primary cost field
    const cost = estimate.keyword_estimate_pence ?? estimate.ai_estimate_pence ?? 0
    if (typeof cost === 'number' && cost > 0) {
      totalCogsPence += cost
      breakdown.push({
        category: estimate.module_name || estimate.label || 'Component',
        amount_pence: cost,
        pct: 0, // computed below
      })
    }
    // Tooling investment — one-off NRE (non-recurring engineering) costs such as
    // mould tooling, fixtures, and dies. Present per-module in ai_cost_estimates
    // as tooling_investment_pence or tooling_cost_pence. Sum across modules.
    const tooling = estimate.tooling_investment_pence ?? estimate.tooling_cost_pence ?? 0
    if (typeof tooling === 'number' && tooling > 0) {
      totalToolingPence += tooling
    }
  }

  if (totalCogsPence === 0) return null

  // Compute percentages
  for (const item of breakdown) {
    item.pct = Math.round((item.amount_pence / totalCogsPence) * 100)
  }

  return {
    cogs_per_unit_pence: totalCogsPence,
    selling_price_pence: null,
    gross_margin_pct: null,
    contribution_margin_pence: null,
    breakeven_units: null,
    tooling_investment_pence: totalToolingPence > 0 ? totalToolingPence : null,
    cogs_breakdown: breakdown,
    last_synced_from_cad_at: new Date().toISOString(),
    cogs_confidence: 'low',
  }
}
