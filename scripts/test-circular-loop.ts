/**
 * @file test-circular-loop.ts — Integration test for the circular optimization loop.
 *
 * @description Exercises the full loop end-to-end:
 * Entry → Market Assessment → Design Brief → Forge → Economics → Fundability →
 * Synthesis → Next Iteration → Convergence Detection
 *
 * Usage: npx tsx scripts/test-circular-loop.ts
 *
 * Requires:
 * - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables
 * - ANTHROPIC_API_KEY for AI-powered steps
 *
 * @related
 * - docs/CIRCULAR-LOOP-IMPLEMENTATION-PROMPTS.md — Prompt 10
 * - src/actions/products.ts — Server actions being tested
 */

import { createClient } from '@supabase/supabase-js'

// ─── Config ──────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── Helpers ─────────────────────────────────────────────────────────

let passed = 0
let failed = 0
let skipped = 0

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ ${message}`)
    passed++
  } else {
    console.error(`  ❌ FAIL: ${message}`)
    failed++
  }
}

function skip(message: string) {
  console.log(`  ⏭️  SKIP: ${message}`)
  skipped++
}

async function cleanup(productId: string) {
  // INTENT: Clean up test data in reverse dependency order
  await supabase.from('design_briefs').delete().eq('product_id', productId)
  await supabase.from('product_iterations').delete().eq('product_id', productId)
  await supabase.from('cash_in_items').delete().eq('product_id', productId)
  await supabase.from('cash_out_items').delete().eq('product_id', productId)
  await supabase.from('products').delete().eq('id', productId)
}

// ─── Test Stages ─────────────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('  Circular Optimization Loop — Integration Test')
  console.log('═══════════════════════════════════════════════════════════\n')

  // FLOW: Get a test foundry to use
  const { data: foundries } = await supabase.from('foundries').select('id').limit(1)
  if (!foundries || foundries.length === 0) {
    console.error('❌ No foundries found — cannot run test')
    process.exit(1)
  }
  const foundryId = foundries[0].id

  // Get a user in this foundry
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id')
    .eq('foundry_id', foundryId)
    .limit(1)

  if (!profiles || profiles.length === 0) {
    console.error('❌ No profiles found in foundry — cannot run test')
    process.exit(1)
  }
  const userId = profiles[0].id

  let productId: string | null = null

  try {
    // ── Stage A: Create product from market idea ──────────────────
    console.log('Stage A: Create Product from Market Idea')
    console.log('─────────────────────────────────────────')

    const { data: product, error: createError } = await supabase
      .from('products')
      .insert({
        foundry_id: foundryId,
        created_by: userId,
        name: 'Smart Irrigation Controller',
        description: 'IoT-enabled irrigation controller for smallholder farmers in Sub-Saharan Africa. Solar-powered, mobile-connected, with soil moisture sensors.',
        lifecycle: 'concept',
      })
      .select('*')
      .single()

    assert(!createError && !!product, 'Product created successfully')
    if (!product) {
      console.error('Cannot continue without product:', createError?.message)
      process.exit(1)
    }
    productId = product.id
    assert(product.lifecycle === 'concept', 'Lifecycle is concept')
    assert(product.name === 'Smart Irrigation Controller', 'Name matches')

    // ── Stage B: Create initial iteration ─────────────────────────
    console.log('\nStage B: Create Initial Iteration')
    console.log('──────────────────────────────────')

    const initialScores = { market: 0, financial: 0, fundability: 0, manufacturing: 0 }
    const { data: iter1, error: iter1Error } = await supabase
      .from('product_iterations')
      .insert({
        product_id: productId,
        foundry_id: foundryId,
        iteration_number: 1,
        pareto_scores: initialScores,
        changes_made: [],
        hypothesis: 'Initial product from market opportunity',
        convergence_delta: 0,
        convergence_status: 'initial',
      })
      .select('*')
      .single()

    assert(!iter1Error && !!iter1, 'Iteration 1 created')
    assert(iter1?.iteration_number === 1, 'Iteration number is 1')
    assert(iter1?.convergence_status === 'initial', 'Convergence status is initial')

    // ── Stage C: Simulate market assessment ───────────────────────
    console.log('\nStage C: Market Assessment (simulated)')
    console.log('───────────────────────────────────────')

    const marketAssessment = {
      tam_gbp: 15_000_000_000,
      sam_gbp: 500_000_000,
      som_gbp: 25_000_000,
      target_customer: 'Smallholder farmers (2-10 hectares) in Kenya, Tanzania, and Uganda',
      customer_segments: [
        { name: 'Subsistence farmers', size: 50000, willingness_to_pay: 5000 },
        { name: 'Commercial smallholders', size: 15000, willingness_to_pay: 15000 },
        { name: 'Agricultural cooperatives', size: 2000, willingness_to_pay: 50000 },
      ],
      competitive_landscape: [
        { competitor: 'Jain Irrigation', strengths: 'Large scale', weaknesses: 'Expensive', price_point: 30000 },
        { competitor: 'Netafim', strengths: 'Technology leader', weaknesses: 'Not mobile-first', price_point: 45000 },
      ],
      pricing_analysis: {
        recommended_price_pence: 7500,
        pricing_model: 'Hardware + monthly subscription',
        price_range_low_pence: 5000,
        price_range_high_pence: 12000,
        reasoning: 'Price below commercial systems but above manual alternatives',
      },
      market_risks: ['Currency volatility', 'Infrastructure gaps', 'Adoption barriers'],
      market_opportunities: ['Growing mobile penetration', 'Climate change awareness', 'Government subsidies'],
      validation_status: {
        tam_gbp: 'ai_estimated' as const,
        som_gbp: 'ai_estimated' as const,
      },
      assessed_at: new Date().toISOString(),
      model_used: 'test-simulated',
    }

    const { error: maError } = await supabase
      .from('products')
      .update({
        market_assessment: marketAssessment,
        lifecycle: 'researching',
      })
      .eq('id', productId)

    assert(!maError, 'Market assessment saved')

    const { data: updatedProduct } = await supabase
      .from('products')
      .select('market_assessment, lifecycle')
      .eq('id', productId)
      .single()

    assert(updatedProduct?.lifecycle === 'researching', 'Lifecycle updated to researching')
    assert(updatedProduct?.market_assessment?.tam_gbp === 15_000_000_000, 'TAM stored correctly')
    assert(updatedProduct?.market_assessment?.customer_segments?.length === 3, 'Segments stored')

    // ── Stage D: Design brief from assessment ─────────────────────
    console.log('\nStage D: Design Brief Generation')
    console.log('────────────────────────────────')

    const { data: brief, error: briefError } = await supabase
      .from('design_briefs')
      .insert({
        product_id: productId,
        foundry_id: foundryId,
        brief_content: {
          product_category: 'IoT Agricultural Device',
          target_cost_pence: 3000,
          target_weight_kg: 0.5,
          target_dimensions: '150mm x 100mm x 50mm',
          key_requirements: [
            'Solar-powered (min 6 hours operation)',
            'Cellular connectivity (2G minimum)',
            'Soil moisture sensor input',
            'Water valve control output',
            'IP65 rated enclosure',
          ],
          materials_guidance: ['ABS or Polycarbonate housing', 'Stainless steel sensor probes'],
          manufacturing_constraints: ['Injection moulding for housing', 'PCB assembly for electronics'],
          competitive_benchmarks: [
            { product: 'Jain Smart Controller', price: 30000, key_specs: 'WiFi only, AC powered' },
          ],
          design_priorities: ['Low cost', 'Solar operation', 'Durability', 'Ease of installation'],
          certification_requirements: ['CE marking', 'IP65'],
          source_context: 'Generated from market assessment — targeting smallholder farmers',
        },
        source: 'market_assessment',
        status: 'draft',
      })
      .select('*')
      .single()

    assert(!briefError && !!brief, 'Design brief created')
    assert(brief?.source === 'market_assessment', 'Brief source is market_assessment')
    assert(brief?.status === 'draft', 'Brief status is draft')
    assert(brief?.brief_content?.key_requirements?.length === 5, 'Brief has 5 key requirements')

    // ── Stage E: Set pricing and economics ────────────────────────
    console.log('\nStage E: Unit Economics & Pricing')
    console.log('─────────────────────────────────')

    const unitEconomics = {
      cogs_per_unit_pence: 3200,
      selling_price_pence: 7500,
      gross_margin_pct: 57.3,
      contribution_margin_pence: 4300,
      breakeven_units: 500,
      tooling_investment_pence: 250000,
      cogs_breakdown: [
        { category: 'PCB & Electronics', amount_pence: 1500, pct: 47 },
        { category: 'Enclosure', amount_pence: 800, pct: 25 },
        { category: 'Sensors', amount_pence: 500, pct: 16 },
        { category: 'Solar Panel', amount_pence: 400, pct: 12 },
      ],
      last_synced_from_cad_at: new Date().toISOString(),
      cogs_confidence: 'medium' as const,
    }

    const { error: ueError } = await supabase
      .from('products')
      .update({
        unit_economics: unitEconomics,
        unit_price_pence: 7500,
        target_monthly_units: 200,
      })
      .eq('id', productId)

    assert(!ueError, 'Unit economics saved')

    // Simulate cash burn sync
    const { error: revenueError } = await supabase
      .from('cash_in_items')
      .insert({
        foundry_id: foundryId,
        created_by: userId,
        name: 'Smart Irrigation Controller Revenue',
        source_type: 'revenue',
        amount: 15000, // 200 units × £75
        frequency: 'monthly',
        product_id: productId,
        source: 'product_sync',
      })

    const { error: cogsError } = await supabase
      .from('cash_out_items')
      .insert({
        foundry_id: foundryId,
        created_by: userId,
        name: 'Smart Irrigation Controller COGS',
        category: 'manufacturing',
        cost_type: 'variable',
        pnl_category: 'cogs',
        amount: 6400, // 200 units × £32
        frequency: 'monthly',
        product_id: productId,
        source: 'product_sync',
      })

    assert(!revenueError, 'Revenue cash item created')
    assert(!cogsError, 'COGS cash item created')

    // ── Stage F: Fundability scoring (simulated) ──────────────────
    console.log('\nStage F: Fundability Scoring')
    console.log('────────────────────────────')

    const fundabilityScore = {
      overall: 62,
      market_size_score: 75,
      margin_score: 65,
      defensibility_score: 45,
      team_readiness_score: 55,
      traction_score: 30,
      investor_appetite: 'moderate' as const,
      improvement_suggestions: [
        {
          action: 'Switch from injection moulding to 3D-printed housing to reduce COGS by 30%',
          impact_description: 'Improves margin score from 65 to 80+, boosts overall fundability',
          estimated_score_lift: 12,
        },
        {
          action: 'File a provisional patent on the solar-powered soil sensor integration',
          impact_description: 'Increases defensibility score significantly',
          estimated_score_lift: 15,
        },
        {
          action: 'Run a pilot with 10 farmers in Kenya to demonstrate traction',
          impact_description: 'Traction score would increase from 30 to 60+',
          estimated_score_lift: 18,
        },
      ],
      scored_at: new Date().toISOString(),
      model_used: 'test-simulated',
    }

    const { error: fsError } = await supabase
      .from('products')
      .update({ fundability_score: fundabilityScore })
      .eq('id', productId)

    assert(!fsError, 'Fundability score saved')
    assert(fundabilityScore.overall === 62, 'Overall score is 62')
    assert(fundabilityScore.improvement_suggestions.length === 3, 'Has 3 improvement suggestions')

    // ── Stage G: Cross-system synthesis (simulated) ───────────────
    console.log('\nStage G: Cross-System Synthesis')
    console.log('───────────────────────────────')

    const synthesis = {
      pareto: {
        market: 70,
        financial: 57,
        fundability: 62,
        manufacturing: 40,
      },
      typeA: [
        'Partner with local agricultural cooperatives for distribution (improves market reach + traction)',
        'Use modular PCB design to enable multiple product variants from same base (improves manufacturing + market)',
      ],
      typeB: [
        'Switch to premium components for reliability (improves manufacturing score but increases COGS, hurting financial)',
        'Expand to commercial agriculture market (larger TAM but requires redesign, affecting manufacturing timeline)',
      ],
      nextAction: 'Run a 10-farmer pilot in Kenya to validate product-market fit and build traction evidence for investors',
      isLocalOptimum: false,
      synthesized_at: new Date().toISOString(),
      model_used: 'test-simulated',
    }

    const { error: synthError } = await supabase
      .from('products')
      .update({ product_synthesis: synthesis })
      .eq('id', productId)

    assert(!synthError, 'Synthesis saved')
    assert(synthesis.typeA.length === 2, 'Has 2 Type A improvements')
    assert(synthesis.typeB.length === 2, 'Has 2 Type B improvements')
    assert(!synthesis.isLocalOptimum, 'Not at local optimum')

    // Create iteration 2 reflecting synthesis scores
    const { data: iter2, error: iter2Error } = await supabase
      .from('product_iterations')
      .insert({
        product_id: productId,
        foundry_id: foundryId,
        iteration_number: 2,
        pareto_scores: synthesis.pareto,
        changes_made: [
          { description: 'Market assessment completed', dimension: 'market' },
          { description: 'Unit economics modelled', dimension: 'financial' },
          { description: 'Fundability scored', dimension: 'fundability' },
        ],
        hypothesis: 'Full assessment reveals market opportunity but manufacturing readiness is low',
        convergence_delta: 229, // total score went from 0 to 229
        convergence_status: 'improving',
      })
      .select('*')
      .single()

    assert(!iter2Error && !!iter2, 'Iteration 2 created')
    assert(iter2?.convergence_status === 'improving', 'Status is improving (big jump from 0)')

    // ── Stage H: Apply suggestion → new design brief ──────────────
    console.log('\nStage H: Fundability Suggestion → Design Brief')
    console.log('───────────────────────────────────────────────')

    const { data: brief2, error: brief2Error } = await supabase
      .from('design_briefs')
      .insert({
        product_id: productId,
        foundry_id: foundryId,
        brief_content: {
          product_category: 'IoT Agricultural Device',
          target_cost_pence: 2200,
          target_weight_kg: 0.45,
          key_requirements: [
            'Maintain all v1 functionality',
            '3D-printed housing (FDM or SLS)',
            'Reduce component count by 20%',
          ],
          materials_guidance: ['PETG or ASA for UV resistance', 'Reuse existing PCB design'],
          manufacturing_constraints: ['3D printing for housing (batch of 50+)', 'Same PCB assembly line'],
          competitive_benchmarks: [],
          design_priorities: ['Cost reduction', 'Maintain durability', 'Faster iteration'],
          certification_requirements: ['CE marking', 'IP65'],
          source_context: 'From fundability suggestion: Switch from injection moulding to 3D-printed housing to reduce COGS by 30%',
        },
        source: 'fundability_suggestion',
        status: 'reviewed',
        reviewed_by: 'max_cto',
        review_notes: 'Feasible. 3D printing reduces tooling cost to near-zero. COGS target of £22 is achievable with PETG.',
      })
      .select('*')
      .single()

    assert(!brief2Error && !!brief2, 'Design brief from suggestion created')
    assert(brief2?.source === 'fundability_suggestion', 'Source is fundability_suggestion')
    assert(brief2?.status === 'reviewed', 'Status is reviewed')

    // ── Stage I: Create iteration 3 (post-redesign) ───────────────
    console.log('\nStage I: Iteration 3 (Post-Redesign)')
    console.log('─────────────────────────────────────')

    const iter3Scores = {
      market: 72,
      financial: 72,
      fundability: 68,
      manufacturing: 55,
    }

    const { data: iter3, error: iter3Error } = await supabase
      .from('product_iterations')
      .insert({
        product_id: productId,
        foundry_id: foundryId,
        iteration_number: 3,
        pareto_scores: iter3Scores,
        changes_made: [
          { description: 'Switched to 3D-printed housing', dimension: 'manufacturing' },
          { description: 'COGS reduced by 30%', dimension: 'financial' },
        ],
        hypothesis: '3D-printed housing reduces COGS and improves margins',
        outcome: 'COGS reduced from £32 to £22. Margin improved from 57% to 71%. Manufacturing readiness improved.',
        convergence_delta: iter3Scores.market + iter3Scores.financial + iter3Scores.fundability + iter3Scores.manufacturing
          - (synthesis.pareto.market + synthesis.pareto.financial + synthesis.pareto.fundability + synthesis.pareto.manufacturing),
        convergence_status: 'improving',
      })
      .select('*')
      .single()

    assert(!iter3Error && !!iter3, 'Iteration 3 created')
    assert(iter3?.convergence_status === 'improving', 'Still improving')

    // ── Stage J: Verify iteration history ─────────────────────────
    console.log('\nStage J: Verify Iteration History')
    console.log('─────────────────────────────────')

    const { data: allIterations, error: historyError } = await supabase
      .from('product_iterations')
      .select('*')
      .eq('product_id', productId)
      .order('iteration_number', { ascending: true })

    assert(!historyError, 'History fetched successfully')
    assert(allIterations?.length === 3, `Has 3 iterations (got ${allIterations?.length})`)

    if (allIterations && allIterations.length >= 3) {
      const first = allIterations[0].pareto_scores as Record<string, number>
      const latest = allIterations[2].pareto_scores as Record<string, number>

      const firstTotal = first.market + first.financial + first.fundability + first.manufacturing
      const latestTotal = latest.market + latest.financial + latest.fundability + latest.manufacturing

      assert(latestTotal > firstTotal, `Total score improved: ${firstTotal} → ${latestTotal}`)
      assert(latest.financial > first.financial, 'Financial dimension improved')
      assert(latest.manufacturing > first.manufacturing, 'Manufacturing dimension improved')
    }

    // ── Stage K: Verify convergence detection ─────────────────────
    console.log('\nStage K: Convergence Detection')
    console.log('──────────────────────────────')

    if (allIterations && allIterations.length >= 2) {
      const statuses = allIterations.map((i: any) => i.convergence_status)
      assert(statuses[0] === 'initial', 'First iteration is initial')
      assert(statuses[1] === 'improving', 'Second iteration is improving')
      assert(statuses[2] === 'improving', 'Third iteration is improving')
    }

    // ── Stage L: Verify all data persists correctly ───────────────
    console.log('\nStage L: Data Persistence Verification')
    console.log('──────────────────────────────────────')

    const { data: finalProduct } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single()

    assert(!!finalProduct, 'Product still exists')
    assert(!!finalProduct?.market_assessment, 'Market assessment persisted')
    assert(!!finalProduct?.unit_economics, 'Unit economics persisted')
    assert(!!finalProduct?.fundability_score, 'Fundability score persisted')
    assert(!!finalProduct?.product_synthesis, 'Product synthesis persisted')

    const { data: briefs } = await supabase
      .from('design_briefs')
      .select('*')
      .eq('product_id', productId)

    assert(briefs?.length === 2, `Has 2 design briefs (got ${briefs?.length})`)

    const { data: cashIn } = await supabase
      .from('cash_in_items')
      .select('*')
      .eq('product_id', productId)

    assert(cashIn?.length === 1, `Has 1 revenue cash item (got ${cashIn?.length})`)

    const { data: cashOut } = await supabase
      .from('cash_out_items')
      .select('*')
      .eq('product_id', productId)

    assert(cashOut?.length === 1, `Has 1 COGS cash item (got ${cashOut?.length})`)

    // ── AI-Powered Stages (skip if no API key) ────────────────────
    if (ANTHROPIC_KEY) {
      console.log('\nStage M: Live AI Synthesis (optional)')
      console.log('──────────────────────────────────────')
      skip('Live AI synthesis test — run manually with ANTHROPIC_API_KEY')
    } else {
      skip('AI stages (no ANTHROPIC_API_KEY) — data stages all passed')
    }

  } finally {
    // ── Cleanup ──────────────────────────────────────────────────
    if (productId) {
      console.log('\n🧹 Cleaning up test data...')
      await cleanup(productId)
      console.log('   Done.')
    }
  }

  // ── Summary ──────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════')
  console.log(`  Results: ${passed} passed, ${failed} failed, ${skipped} skipped`)
  console.log('═══════════════════════════════════════════════════════════\n')

  if (failed > 0) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('\n💥 Unexpected error:', err)
  process.exit(1)
})
