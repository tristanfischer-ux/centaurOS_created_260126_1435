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
    if (!id || typeof id !== 'string') return { error: 'Invalid product ID' }

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

    // SECURITY: Prevent duplicate products for the same CAD project
    const { data: existing } = await productsTable(supabase)
      .select('id, name')
      .eq('cad_lab_project_id', cadLabProjectId)
      .eq('foundry_id', foundryId)
      .maybeSingle()
    if (existing) return { error: `Product "${existing.name}" already exists for this project` }

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
      const { error: inUpdateError } = await cashInTable(supabase)
        .update({ name: `${productName} Revenue`, amount: monthlyRevenue, frequency: 'monthly' })
        .eq('id', existingIn.id)
      if (inUpdateError) return { error: 'Failed to sync financial items' }
    } else {
      const { error: inInsertError } = await cashInTable(supabase)
        .insert({
          foundry_id: foundryId,
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
  return withAIGate('market_assessment', async ({ supabase, foundryId, trackUsage }) => {
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
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
    if (!apiKey) return { error: 'ANTHROPIC_API_KEY not configured' }

    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default
      const client = new Anthropic({ apiKey })

      const response = await client.messages.create({
        model: 'claude-sonnet-4-6-20250514',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      })

      const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
      if (!text) return { error: 'Empty response from AI' }

      // INTENT: Track usage for billing
      await trackUsage({
        model: 'claude-sonnet-4-6-20250514',
        promptTokens: response.usage?.input_tokens,
        completionTokens: response.usage?.output_tokens,
      })

      // ── Parse response ─────────────────────────────────────────
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(cleaned)
      } catch {
        return { error: 'Failed to parse AI response as JSON' }
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
        model_used: 'claude-sonnet-4-6-20250514',
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
    const HAIKU_MODEL = 'claude-3-5-haiku-latest'

    try {
      const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
      if (apiKey) {
        const Anthropic = (await import('@anthropic-ai/sdk')).default
        const client = new Anthropic({ apiKey })

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

        const suggestionsPromise = client.messages.create({
          model: HAIKU_MODEL,
          max_tokens: 512,
          system: `You are a concise investor advisor. Given a product's fundability sub-scores (0-100), suggest 2-3 specific actions to improve the overall score. Return ONLY a raw JSON array (no markdown, no code fences):
[{"action": "short imperative action", "impact_description": "1 sentence on why", "estimated_score_lift": number_1_to_20}]`,
          messages: [
            { role: 'user', content: `Scores: ${scoresContext}` },
          ],
        })

        // INTENT: 5s timeout — don't let Haiku delay the whole score
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000))
        const result = await Promise.race([suggestionsPromise, timeoutPromise])

        if (result && 'content' in result) {
          const textBlock = result.content.find((b: { type: string }) => b.type === 'text')
          if (textBlock && textBlock.type === 'text') {
            const raw = textBlock.text.trim().replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```$/, '')
            const parsed = JSON.parse(raw)
            if (Array.isArray(parsed)) {
              improvement_suggestions = parsed.slice(0, 3).map((s: Record<string, unknown>) => ({
                action: String(s.action || ''),
                impact_description: String(s.impact_description || ''),
                estimated_score_lift: typeof s.estimated_score_lift === 'number' ? s.estimated_score_lift : 5,
              }))
            }
          }

          // FLOW: Track AI usage for billing
          const usage = result.usage
          await trackUsage({
            model: HAIKU_MODEL,
            promptTokens: usage?.input_tokens,
            completionTokens: usage?.output_tokens,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function iterationsTable(supabase: any) {
  return (supabase as any).from('product_iterations')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function briefsTable(supabase: any) {
  return (supabase as any).from('design_briefs')
}

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
    if (!productId || typeof productId !== 'string') return { error: 'Invalid product ID' }

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

    if (error) return { error: error.message }

    return { data: data as ProductIteration }
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

    const { data: newProject, error: projectCreateError } = await cadLabTable(supabase)
      .insert({
        foundry_id: foundryId,
        created_by: user.id,
        name: `${product.name} (v${versionNumber})`,
        subject: keyReqs,
        product_overview: JSON.stringify(briefContent),
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

    // ── Call Claude Sonnet ──────────────────────────────────────────
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
    if (!apiKey) return { error: 'ANTHROPIC_API_KEY not configured' }

    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default
      const client = new Anthropic({ apiKey })

      const response = await client.messages.create({
        model: 'claude-sonnet-4-6-20250514',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      })

      const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
      if (!text) return { error: 'Empty response from AI' }

      // INTENT: Track usage for billing
      await trackUsage({
        model: 'claude-sonnet-4-6-20250514',
        promptTokens: response.usage?.input_tokens,
        completionTokens: response.usage?.output_tokens,
      })

      // ── Parse response ─────────────────────────────────────────
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(cleaned)
      } catch {
        return { error: 'Failed to parse AI response as JSON' }
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

    // ── Call Claude Sonnet ──────────────────────────────────────────
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
    if (!apiKey) return { error: 'ANTHROPIC_API_KEY not configured' }

    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default
      const client = new Anthropic({ apiKey })

      const response = await client.messages.create({
        model: 'claude-sonnet-4-6-20250514',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      })

      const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
      if (!text) return { error: 'Empty response from AI' }

      // INTENT: Track usage for billing
      await trackUsage({
        model: 'claude-sonnet-4-6-20250514',
        promptTokens: response.usage?.input_tokens,
        completionTokens: response.usage?.output_tokens,
      })

      // ── Parse response ─────────────────────────────────────────
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(cleaned)
      } catch {
        return { error: 'Failed to parse AI response as JSON' }
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
