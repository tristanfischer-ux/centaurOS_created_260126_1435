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
import type {
  Product,
  ProductSummary,
  CreateProductInput,
  UpdateProductInput,
  UnitEconomics,
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

// ─── getProducts ────────────────────────────────────────────────────

/**
 * Fetches all products for the user's foundry.
 *
 * @returns ProductSummary[] with computed cogs_per_unit and gross_margin_pct
 */
export async function getProducts(): Promise<ActionResult<ProductSummary[]>> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { data, error } = await productsTable(supabase)
      .select('id, name, description, hero_image_url, lifecycle, unit_price_pence, target_monthly_units, cad_lab_project_id, unit_economics, created_at, updated_at')
      .eq('foundry_id', foundryId)
      .order('updated_at', { ascending: false })

    if (error) return { error: error.message }

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
        created_at: row.created_at,
        updated_at: row.updated_at,
      }
    })

    return { data: summaries }
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
    // VALIDATION: Basic UUID format check
    if (!id || typeof id !== 'string') return { error: 'Invalid product ID' }

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
      unitEconomics = await seedUnitEconomicsFromCad(supabase, input.cad_lab_project_id)
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
    if (!id || typeof id !== 'string') return { error: 'Invalid product ID' }

    // INTENT: Only include fields that were explicitly provided
    const updates: Record<string, unknown> = {}
    if (input.name !== undefined) updates.name = input.name.trim()
    if (input.description !== undefined) updates.description = input.description?.trim() || null
    if (input.lifecycle !== undefined) updates.lifecycle = input.lifecycle
    if (input.unit_price_pence !== undefined) updates.unit_price_pence = input.unit_price_pence
    if (input.target_monthly_units !== undefined) updates.target_monthly_units = input.target_monthly_units
    if (input.hero_image_url !== undefined) updates.hero_image_url = input.hero_image_url

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
    if (!id || typeof id !== 'string') return { error: 'Invalid product ID' }

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
    if (!cadLabProjectId || typeof cadLabProjectId !== 'string') {
      return { error: 'Invalid CAD Lab project ID' }
    }

    // FLOW: Fetch the CAD project data
    const { data: project, error: projectError } = await cadLabTable(supabase)
      .select('id, name, subject, product_overview, ai_cost_estimates, system_illustration_url')
      .eq('id', cadLabProjectId)
      .eq('foundry_id', foundryId)
      .single()

    if (projectError || !project) {
      return { error: 'CAD Lab project not found' }
    }

    // INTENT: Build product description from the CAD project's product_overview
    const description = project.product_overview || project.subject || null

    // INTENT: Seed unit economics from ai_cost_estimates JSONB
    const unitEconomics = buildUnitEconomicsFromEstimates(project.ai_cost_estimates)

    const { data, error } = await productsTable(supabase)
      .insert({
        foundry_id: foundryId,
        created_by: user.id,
        name: project.name || 'Untitled Product',
        description,
        hero_image_url: project.system_illustration_url || null,
        lifecycle: 'prototyping',
        cad_lab_project_id: cadLabProjectId,
        unit_economics: unitEconomics,
      })
      .select('*')
      .single()

    if (error) return { error: error.message }

    return { data: data as Product }
  })
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
  return withAuth(async ({ supabase, foundryId }) => {
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
      await cashInTable(supabase)
        .update({ name: `${productName} Revenue`, amount: monthlyRevenue, frequency: 'monthly' })
        .eq('id', existingIn.id)
    } else {
      await cashInTable(supabase)
        .insert({
          foundry_id: foundryId,
          name: `${productName} Revenue`,
          source_type: 'revenue',
          amount: monthlyRevenue,
          frequency: 'monthly',
          probability_pct: 100,
          effective_from: today,
          product_id: productId,
        })
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
        await cashOutTable(supabase)
          .update({ name: `${productName} COGS`, amount: monthlyCogs, frequency: 'monthly' })
          .eq('id', existingOut.id)
      } else {
        await cashOutTable(supabase)
          .insert({
            foundry_id: foundryId,
            name: `${productName} COGS`,
            category: 'manufacturing',
            cost_type: 'variable',
            pnl_category: 'cogs',
            amount: monthlyCogs,
            frequency: 'monthly',
            effective_from: today,
            product_id: productId,
          })
      }
    }

    return { data: { success: true as const } }
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
): Promise<UnitEconomics | null> {
  const { data: project } = await cadLabTable(supabase)
    .select('ai_cost_estimates')
    .eq('id', cadLabProjectId)
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
    tooling_investment_pence: null,
    cogs_breakdown: breakdown,
    last_synced_from_cad_at: new Date().toISOString(),
    cogs_confidence: 'low',
  }
}
