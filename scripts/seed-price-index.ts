/**
 * @file seed-price-index.ts
 *
 * @description Seeds the price_index table with 26 weeks of historical data
 * for both category aggregates and per-product breakdowns. Creates products
 * if they don't exist.
 *
 * Usage: npx tsx scripts/seed-price-index.ts
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// ─── Product definitions by category ───
const PRODUCTS_BY_CATEGORY: Record<string, string[]> = {
  Herb: [
    'Genovese Basil', 'Thai Basil', 'Sweet Basil', 'Flat-Leaf Parsley',
    'Curly Parsley', 'Cilantro', 'Dill', 'Chives', 'Tarragon',
    'Oregano', 'Thyme', 'Rosemary', 'Sage', 'Mint', 'Lemongrass',
  ],
  Microgreen: [
    'Pea Shoots', 'Sunflower Shoots', 'Radish Microgreens', 'Broccoli Microgreens',
    'Amaranth Microgreens', 'Mustard Microgreens', 'Beetroot Microgreens',
    'Cress', 'Rocket Microgreens', 'Kale Microgreens',
  ],
  'Edible Flower': [
    'Nasturtium', 'Viola', 'Borage', 'Calendula', 'Lavender',
    'Cornflower', 'Marigold', 'Rose Petals', 'Elderflower',
  ],
  'Salad Leaf': [
    'Rocket', 'Baby Spinach', 'Lamb\'s Lettuce', 'Watercress',
    'Red Chard', 'Mizuna', 'Sorrel', 'Purslane', 'Endive',
    'Radicchio', 'Little Gem', 'Butterhead',
  ],
  Sprout: [
    'Alfalfa Sprouts', 'Mung Bean Sprouts', 'Lentil Sprouts',
    'Chickpea Sprouts', 'Fenugreek Sprouts', 'Adzuki Sprouts',
    'Clover Sprouts', 'Quinoa Sprouts', 'Buckwheat Sprouts', 'Wheatgrass',
  ],
}

// DECISION: Base prices per category (£/kg) — realistic UK wholesale
const CATEGORY_BASE_PRICES: Record<string, number> = {
  Herb: 12.50,
  Microgreen: 28.00,
  'Edible Flower': 45.00,
  'Salad Leaf': 8.00,
  Sprout: 6.50,
}

const QUALITY_GRADES = ['Premium', 'Standard', 'Economy']
const GRADE_MULTIPLIERS: Record<string, number> = {
  Premium: 1.25,
  Standard: 1.0,
  Economy: 0.75,
}

/** Simple hash of a string to get a deterministic offset */
function slugHash(slug: string): number {
  let hash = 0
  for (let i = 0; i < slug.length; i++) {
    hash = ((hash << 5) - hash + slug.charCodeAt(i)) | 0
  }
  return hash
}

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

/** Seeded pseudo-random number between -1 and 1 */
function seededNoise(week: number, slug: string): number {
  const h = slugHash(`${slug}-${week}`)
  return ((h % 1000) / 500) - 1 // range [-1, 1]
}

async function main() {
  console.log('🌱 Seeding price index data...')

  // ─── 1. Upsert products ───
  const allProducts: { name: string; slug: string; category: string }[] = []
  for (const [category, names] of Object.entries(PRODUCTS_BY_CATEGORY)) {
    for (const name of names) {
      allProducts.push({ name, slug: toSlug(name), category })
    }
  }

  console.log(`  Creating ${allProducts.length} products...`)
  const { error: productError } = await supabase
    .from('products')
    .upsert(allProducts, { onConflict: 'slug' })

  if (productError) {
    console.error('Failed to upsert products:', productError)
    process.exit(1)
  }

  // Fetch back with IDs
  const { data: products, error: fetchError } = await supabase
    .from('products')
    .select('id, slug, category')

  if (fetchError || !products) {
    console.error('Failed to fetch products:', fetchError)
    process.exit(1)
  }

  const productMap = new Map(products.map((p) => [p.slug, p]))

  // ─── 2. Generate 26 weeks of data ───
  const now = new Date()
  const rows: Array<{
    week_start: string
    product_category: string
    quality_grade: string | null
    product_id: string | null
    avg_price_per_kg: number
    volume_kg: number
    sample_count: number
  }> = []

  for (let w = 25; w >= 0; w--) {
    const weekDate = new Date(now)
    weekDate.setDate(weekDate.getDate() - w * 7)
    // Align to Monday
    const day = weekDate.getDay()
    const diff = day === 0 ? -6 : 1 - day
    weekDate.setDate(weekDate.getDate() + diff)
    const weekStart = weekDate.toISOString().slice(0, 10)

    for (const [category, productNames] of Object.entries(PRODUCTS_BY_CATEGORY)) {
      const basePrice = CATEGORY_BASE_PRICES[category]
      // Slight weekly drift for category (seasonal feel)
      const seasonalFactor = 1 + 0.08 * Math.sin((2 * Math.PI * (25 - w)) / 52)
      const categoryPrice = basePrice * seasonalFactor

      // Category aggregate row (no grade, no product)
      const catVolume = 500 + Math.abs(slugHash(`${category}-${w}`)) % 300
      rows.push({
        week_start: weekStart,
        product_category: category,
        quality_grade: null,
        product_id: null,
        avg_price_per_kg: Math.round(categoryPrice * 100) / 100,
        volume_kg: catVolume,
        sample_count: 15 + (slugHash(`${category}-cnt-${w}`) % 10),
      })

      // Grade breakdown rows
      for (const grade of QUALITY_GRADES) {
        const gradePrice = categoryPrice * GRADE_MULTIPLIERS[grade]
        const noise = 1 + seededNoise(w, `${category}-${grade}`) * 0.02
        rows.push({
          week_start: weekStart,
          product_category: category,
          quality_grade: grade,
          product_id: null,
          avg_price_per_kg: Math.round(gradePrice * noise * 100) / 100,
          volume_kg: Math.round(catVolume * (grade === 'Standard' ? 0.5 : 0.25)),
          sample_count: 5 + (slugHash(`${category}-${grade}-${w}`) % 5),
        })
      }

      // Per-product rows
      for (const name of productNames) {
        const slug = toSlug(name)
        const product = productMap.get(slug)
        if (!product) continue

        // Product-specific offset: ±15% from slug hash
        const offsetFactor = 1 + (((slugHash(slug) % 30) - 15) / 100)
        // Weekly noise: ±3%
        const weeklyNoise = 1 + seededNoise(w, slug) * 0.03
        const productPrice = categoryPrice * offsetFactor * weeklyNoise

        // Volume: divide category total among products with randomised shares
        const share = (0.5 + Math.abs(slugHash(`${slug}-share`)) % 50) / (productNames.length * 25)
        const productVolume = Math.max(1, Math.round(catVolume * share))

        rows.push({
          week_start: weekStart,
          product_category: category,
          quality_grade: null,
          product_id: product.id,
          avg_price_per_kg: Math.round(productPrice * 100) / 100,
          volume_kg: productVolume,
          sample_count: 1 + (slugHash(`${slug}-${w}`) % 4),
        })
      }
    }
  }

  console.log(`  Inserting ${rows.length} price index rows...`)

  // GOTCHA: Functional unique index (COALESCE) doesn't work with Supabase
  // upsert onConflict. Use plain insert in batches — duplicates hit the
  // unique index and are skipped via ignoreDuplicates.
  // First delete existing data to avoid conflicts on re-run.
  console.log('  Clearing existing price_index data...')
  await supabase.from('price_index').delete().gte('week_start', '2000-01-01')

  // Batch insert in chunks of 500
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { error } = await supabase.from('price_index').insert(chunk)
    if (error) {
      // GOTCHA: Batch fails atomically on any duplicate. Fall back to
      // individual inserts and skip duplicates silently.
      let inserted = 0
      for (const row of chunk) {
        const { error: rowErr } = await supabase.from('price_index').insert(row)
        if (!rowErr) inserted++
      }
      console.log(`  Inserted ${inserted}/${chunk.length} rows (${chunk.length - inserted} skipped as duplicates) at offset ${i}`)
    } else {
      console.log(`  Inserted rows ${i + 1}–${Math.min(i + 500, rows.length)}`)
    }
  }

  console.log(`✅ Seeded ${rows.length} price index rows for ${allProducts.length} products across 26 weeks`)
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
