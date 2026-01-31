/**
 * Seed Pitch Prep Providers
 * Run with: npx tsx scripts/seed-pitch-prep-providers.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const pitchPrepProviders = [
  {
    category: 'Services',
    subcategory: 'Pitch Prep',
    title: 'Deck Doctor',
    description: "Expert pitch deck design and narrative development. We've helped 50+ startups raise £100M+.",
    attributes: {
      service: 'Pitch Deck Design',
      rate: '£2,500-£5,000',
      deliverables: ['Investor Deck', 'One-Pager', 'Financial Model Review'],
      turnaround: '5-7 days'
    },
    is_verified: true
  },
  {
    category: 'Services',
    subcategory: 'Pitch Prep',
    title: 'Founder Coaching Co',
    description: 'One-on-one pitch coaching with ex-VCs. Practice sessions, Q&A prep, and live feedback.',
    attributes: {
      service: 'Pitch Coaching',
      rate: '£500/session',
      deliverables: ['3x Practice Sessions', 'Q&A Preparation', 'Video Review'],
      turnaround: '1-2 weeks'
    },
    is_verified: true
  },
  {
    category: 'Services',
    subcategory: 'Pitch Prep',
    title: 'Story Capital',
    description: 'Narrative strategy for deep tech founders. We translate complex tech into investor-friendly stories.',
    attributes: {
      service: 'Narrative Development',
      rate: '£3,000-£8,000',
      deliverables: ['Investment Thesis', 'Market Story', 'Competitive Positioning'],
      focus: ['Deep Tech', 'Hardware', 'Climate']
    },
    is_verified: true
  },
  {
    category: 'Services',
    subcategory: 'Pitch Prep',
    title: 'Financial Model Factory',
    description: 'Investor-grade financial models for hardware and SaaS companies. Built by ex-investment bankers.',
    attributes: {
      service: 'Financial Modeling',
      rate: '£1,500-£4,000',
      deliverables: ['3-Statement Model', 'Unit Economics', 'Scenario Analysis'],
      turnaround: '7-10 days'
    },
    is_verified: true
  },
  {
    category: 'Services',
    subcategory: 'Pitch Prep',
    title: 'Due Diligence Ready',
    description: 'Comprehensive data room preparation and due diligence document assembly.',
    attributes: {
      service: 'Data Room Setup',
      rate: '£2,000-£3,500',
      deliverables: ['Virtual Data Room', 'Document Checklist', 'Cap Table Clean-up'],
      turnaround: '2-3 weeks'
    },
    is_verified: true
  }
]

async function main() {
  console.log('Seeding Pitch Prep providers...')

  // Check if providers already exist
  const { data: existing, error: checkError } = await supabase
    .from('marketplace_listings')
    .select('title')
    .eq('subcategory', 'Pitch Prep')

  if (checkError) {
    console.error('Error checking existing providers:', checkError)
    process.exit(1)
  }

  if (existing && existing.length > 0) {
    console.log(`Found ${existing.length} existing Pitch Prep providers:`)
    existing.forEach(p => console.log(`  - ${p.title}`))
    console.log('\nSkipping seed to avoid duplicates.')
    return
  }

  // Insert providers
  const { data, error } = await supabase
    .from('marketplace_listings')
    .insert(pitchPrepProviders)
    .select()

  if (error) {
    console.error('Error seeding providers:', error)
    process.exit(1)
  }

  console.log(`Successfully added ${data.length} Pitch Prep providers:`)
  data.forEach(p => console.log(`  - ${p.title}`))
}

main()
