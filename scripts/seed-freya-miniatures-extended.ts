/**
 * @file seed-freya-miniatures-extended.ts
 *
 * @description Extends the Freya Miniatures demo with lived-in data:
 * profile depth, task/objective comments, knowledge vault, task history,
 * standups, foundry function coverage, and a blueprint.
 *
 * @usage npx tsx scripts/seed-freya-miniatures-extended.ts
 *
 * Run AFTER seed-freya-miniatures.ts. Safe to re-run (uses insert checks).
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { v4 as uuidv4 } from 'uuid'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase env vars in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const FOUNDRY_ID = 'freya-miniatures'

// ─── Known IDs (from DB after first seed run) ─────────────────────────────────
const FREYA_ID = 'a7a29faa-716f-44d8-8472-bed291931803'
const MARCUS_ID = 'a93adddd-0dae-4986-9587-6350c83579a9'
const ISLA_ID = 'f02b6e3e-9c8e-4e18-972c-c66f93478dcc'

// Non-strategic objective IDs
const OBJ = {
  resin: 'c8eaff0b-8faf-47cc-95a0-fe0c7d7e297e',
  printProfiles: 'f24778d8-4707-45df-821b-7e18702f7bd0',
  hardware: 'ab0c8de7-1981-4cb8-9c2c-cea9b2d7f731',
  discord: '7a7bb016-74a1-40ab-924b-46e8208ea53a',
  kickstarter: '27ddf943-b2f9-43a0-9960-d34b06703afa',
  batch: '69cc858f-3f65-423a-acc3-6675d17353da',
  subscription: 'd52fd838-0b38-4740-964f-60d0de5a5853',
  marketplace: 'b95a4f9c-2508-4afe-9732-e5d21546f8f2',
  conventions: '08ee03f2-5904-4d8c-9738-2db9735f5349',
  gw: '08bf549d-0eee-4442-accb-fb5228de0182',
}

// Task IDs
const TASK = {
  fep: '2f35d340-6230-4857-9cc6-f67c96adcb52',
  loadTest: '249faa0a-d92a-4b6b-a840-44d7a568cb1d',
  kssCopy: '95a774e9-8966-45cf-8b8b-b71a3fd24362',
  kssVideo: 'bb1792d0-e290-496f-9ebe-315f8666178a',
  emailWaitlist: '0a6853e2-4bcd-4c5e-b5f1-d60d8baa04b4',
  cm: 'be01812b-da77-49b0-851c-073d241f643a',
  qc: '73276b3d-1ead-4280-8b61-412869e78df2',
  subTiers: 'ad9db55e-dc97-46e2-a746-45768f25e1e6',
  stripe: '455e2619-f314-4064-be36-2642a3576888',
  cad: '82d011b0-36dd-46a3-ae59-325a0993b0f0',
}

// Business function IDs (from system seed data)
const BF = {
  hardware: '9afe8e2d-32eb-4601-a98c-81d48b7d2f91',
  productMgmt: 'dea0b463-1f30-4eae-b486-91e95cdf30c1',
  supplyChain: 'ec70990e-52aa-4819-a5a1-bad9e20c6732',
  manufacturing: 'b1d1c0b9-4b00-46a2-bafa-929352a05747',
  brandStrategy: '6d63a621-6e13-49fe-b501-c824a42ba08c',
  financialPlanning: '7af7e3bb-2869-4c90-b430-bc8fa93f5bca',
  contractMgmt: 'f3ee77bd-8b90-4b3a-ad30-6a950cb2c894',
  community: '7a136d07-86bd-449d-a5eb-c38bb483a8e8',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns an ISO date string N days in the past */
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  console.log('\n🌱 Extending Freya Miniatures demo data...\n')

  // ── 1. Profile Depth ──────────────────────────────────────────────────────
  console.log('👤 Step 1: Profile Depth')

  const profileUpdates = [
    {
      id: FREYA_ID,
      skills: ['Product Strategy', 'Hardware Design', 'Resin Chemistry', 'Kickstarter Campaigns', 'Community Building'],
      expertise_areas: ['3D Printing', 'Additive Manufacturing', 'Tabletop Gaming', 'Consumer Hardware'],
      industries: ['Manufacturing', 'Consumer Electronics', 'Gaming'],
      professional_background: {
        summary:
          'Former product designer at Games Workshop (7 years) where Freya led the development of official painting and basing product lines. Left to found Freya Miniatures Ltd after identifying a gap in the resin printing market for hobbyist-first hardware. Previously built and sold a Kickstarter-funded terrain accessories business (MiniScape, 2019–2022).',
        previous_companies: 'Games Workshop, MiniScape (Founder)',
        education: 'BSc Product Design Engineering, University of Bristol (2013)',
      },
    },
    {
      id: MARCUS_ID,
      skills: ['Mechanical Engineering', 'CAD (Fusion 360)', 'Resin Chemistry', 'Firmware Development', 'DFM'],
      expertise_areas: ['Additive Manufacturing', 'Photopolymer Resins', 'UV Curing Systems', 'Embedded Systems'],
      industries: ['Manufacturing', 'Aerospace', 'Medical Devices'],
      professional_background: {
        summary:
          'Mechanical engineer with 8 years in additive manufacturing hardware. Most recently Principal Engineer at Formlabs, where Marcus led the Form 4 resin delivery system. Specialises in high-precision UV-resin systems, FEP film optics, and embedded motor control firmware.',
        previous_companies: 'Formlabs, Renishaw, Dyson',
        education: 'MEng Mechanical Engineering, University of Bath (2016)',
      },
    },
    {
      id: ISLA_ID,
      skills: ['Content Creation', 'Social Media Management', 'Community Moderation', 'Email Marketing', 'Video Production'],
      expertise_areas: ['Tabletop Gaming', 'Miniature Painting', 'Creator Communities', 'Discord Management'],
      industries: ['Gaming', 'Consumer Electronics', 'Media & Entertainment'],
      professional_background: {
        summary:
          'Content creator and community manager with 50k YouTube subscribers focused on Warhammer 40K painting tutorials. Joined Freya Miniatures as a founding apprentice to build the community from the ground up. Brings a direct line to the target customer — she is the target customer.',
        previous_companies: 'Self-employed (YouTube/Patreon)',
        education: 'BA Media Production, Falmouth University (2023)',
      },
    },
  ]

  for (const update of profileUpdates) {
    const { error } = await supabase.from('profiles').update(update).eq('id', update.id)
    if (error) {
      console.error(`   ❌ Profile update failed for ${update.id}: ${error.message}`)
    } else {
      console.log(`   ✅ Updated profile: ${update.id}`)
    }
  }

  // ── 2. Task Comments ──────────────────────────────────────────────────────
  console.log('\n💬 Step 2: Task Comments')

  const { count: existingComments } = await supabase
    .from('task_comments')
    .select('*', { count: 'exact', head: true })
    .eq('foundry_id', FOUNDRY_ID)

  if (existingComments && existingComments > 0) {
    console.log(`   ↳ Task comments already exist (${existingComments}), skipping`)
  } else {
    const taskComments = [
      {
        task_id: TASK.cad,
        user_id: MARCUS_ID,
        content: "Finished the gusset redesign on the z-axis carriage. Moved the motor mount 8mm forward to clear the UV shield — should fix the resonance issue we saw at 0.02mm layers. Uploading the STEP file now.",
        created_at: daysAgo(18),
      },
      {
        task_id: TASK.cad,
        user_id: FREYA_ID,
        content: "Great, can you do a quick print test before we send to the CM? I want to see the layer adhesion on the new design before we commit. Targeting the weekend.",
        created_at: daysAgo(17),
      },
      {
        task_id: TASK.cad,
        user_id: MARCUS_ID,
        content: "Ran 3 test prints overnight. Layer adhesion is solid — no delamination up to 75mm/min lift speed. One minor issue: the FEP film tensioner is slightly asymmetric and causing uneven peel force. I'll fix in v2.2 but it's not a blocker for CM review.",
        created_at: daysAgo(15),
      },
      {
        task_id: TASK.fep,
        user_id: MARCUS_ID,
        content: "Samples arrived from Dongguan Plastics, Fluortek, and a new supplier out of Germany — Chem-Foil GmbH. Initial visual check: the Chem-Foil has significantly better optical clarity. Will run transmittance tests tomorrow.",
        created_at: daysAgo(12),
      },
      {
        task_id: TASK.fep,
        user_id: FREYA_ID,
        content: "Good — if Chem-Foil stacks up on transmittance, can you check their MOQ and lead time? We need at least 500 sheets for the first production run.",
        created_at: daysAgo(11),
      },
      {
        task_id: TASK.kssCopy,
        user_id: FREYA_ID,
        content: "First draft of the campaign page is done in Notion. Main sections: hero, problem statement, ForgePrint Pro features, resin details, reward tiers, team section, FAQ. Still need to nail the headline. Current options: (1) 'The printer built for your hobby, not an engineering lab' (2) 'Print miniatures, not compromises'. Thoughts @Isla?",
        created_at: daysAgo(9),
      },
      {
        task_id: TASK.kssCopy,
        user_id: ISLA_ID,
        content: "Option 2 is stronger — it's punchy and speaks directly to the frustration. I'd tweak it slightly: 'Print miniatures. Not compromises.' The full stop adds weight. Also the FAQ section needs a question about resin safety — it comes up constantly in our Discord already.",
        created_at: daysAgo(8),
      },
      {
        task_id: TASK.kssCopy,
        user_id: FREYA_ID,
        content: "Love it — going with 'Print miniatures. Not compromises.' Updated the FAQ with 3 safety questions including storage, disposal, and skin contact. Also added a question on shipping to EU post-Brexit. Sending to a copywriter contact for a polish pass.",
        created_at: daysAgo(7),
      },
      {
        task_id: TASK.emailWaitlist,
        user_id: ISLA_ID,
        content: "Waitlist signup page is live at freyaminiatures.com/launch. Sharing on my YouTube community tab this weekend — should get a decent spike from my subscribers. Also posted in 3 relevant subreddits (r/PrintedMinis, r/Warhammer, r/3Dprinting). First 48 hours: 312 signups.",
        created_at: daysAgo(14),
      },
      {
        task_id: TASK.emailWaitlist,
        user_id: FREYA_ID,
        content: "312 in 48 hours is a great start! The Reddit posts are performing better than expected. Let's set a target of 500 by end of next week — can you post in the tabletop_rpg and DnD subreddits too? Those communities overlap a lot with our target buyer.",
        created_at: daysAgo(13),
      },
      {
        task_id: TASK.subTiers,
        user_id: FREYA_ID,
        content: "Working through the margin model. At £14.99/month for 500ml, our COGS lands at about £6.80 (resin + packaging + postage), giving 55% gross margin. That's workable but tight. Might need to look at a slight price increase for the Pro tier (2L) to cross-subsidise Hobbyist.",
        created_at: daysAgo(6),
      },
      {
        task_id: TASK.subTiers,
        user_id: MARCUS_ID,
        content: "Worth checking what Ameralabs and Siraya Tech charge per litre wholesale. If we can negotiate better bulk rates, we might get COGS down to £5.50 which changes the maths significantly. I can reach out to our contacts this week.",
        created_at: daysAgo(5),
      },
    ]

    const { error } = await supabase.from('task_comments').insert(
      taskComments.map((c) => ({ ...c, foundry_id: FOUNDRY_ID }))
    )
    if (error) {
      console.error(`   ❌ Task comments failed: ${error.message}`)
    } else {
      console.log(`   ✅ ${taskComments.length} task comments created`)
    }
  }

  // ── 3. Objective Comments ─────────────────────────────────────────────────
  console.log('\n💬 Step 3: Objective Comments')

  const { count: existingObjComments } = await supabase
    .from('objective_comments')
    .select('*', { count: 'exact', head: true })
    .eq('foundry_id', FOUNDRY_ID)

  if (existingObjComments && existingObjComments > 0) {
    console.log(`   ↳ Objective comments already exist (${existingObjComments}), skipping`)
  } else {
    const objectiveComments = [
      {
        objective_id: OBJ.hardware,
        user_id: FREYA_ID,
        content: "Big milestone this week — Marcus signed off on the v2.1 chassis. We're 90% of the way to sending final files to the CM. The last open item is the FEP tensioner asymmetry but Marcus says it's not a blocker. On track for end of next month.",
        created_at: daysAgo(14),
      },
      {
        objective_id: OBJ.resin,
        user_id: MARCUS_ID,
        content: "ForgeFlex v3 is performing better than expected on the detail test. Printed a 25mm scale elf ranger and the facial detail is sharper than anything I've seen from consumer resins. The toxicology report comes back next week — if it passes we're ready to proceed to production formulation.",
        created_at: daysAgo(10),
      },
      {
        objective_id: OBJ.discord,
        user_id: ISLA_ID,
        content: "We hit 200 Discord members! The #print-showcase channel is taking off — people are posting their prints and tagging us. Getting a lot of great organic content we can reuse. Running our first community poll tomorrow on which miniature range people most want a print profile for (spoiler: everyone wants Space Marines).",
        created_at: daysAgo(8),
      },
      {
        objective_id: OBJ.kickstarter,
        user_id: FREYA_ID,
        content: "Finalised the reward tiers: Hobbyist (£199 — printer only), Studio (£249 — printer + 3 months resin), Pro (£349 — printer + 6 months resin + early access to profiles). The Kickstarter launch is now locked in for 8 weeks from now. Everything hinges on getting the campaign video done this month.",
        created_at: daysAgo(6),
      },
      {
        objective_id: OBJ.gw,
        user_id: FREYA_ID,
        content: "Initial contact email sent to GW's licensing team on Monday. Marcus helped me draft a one-page technical brief showing our print resolution vs other consumer printers. Hoping for a response within 2 weeks. A GW partnership would be transformational — it's worth putting serious time into this.",
        created_at: daysAgo(4),
      },
    ]

    const { error } = await supabase.from('objective_comments').insert(
      objectiveComments.map((c) => ({ ...c, foundry_id: FOUNDRY_ID }))
    )
    if (error) {
      console.error(`   ❌ Objective comments failed: ${error.message}`)
    } else {
      console.log(`   ✅ ${objectiveComments.length} objective comments created`)
    }
  }

  // ── 4. Knowledge Domains & Notes ──────────────────────────────────────────
  console.log('\n📚 Step 4: Knowledge Vault')

  const { count: existingDomains } = await supabase
    .from('knowledge_domains')
    .select('*', { count: 'exact', head: true })
    .eq('foundry_id', FOUNDRY_ID)

  if (existingDomains && existingDomains > 0) {
    console.log(`   ↳ Knowledge domains already exist, skipping`)
  } else {
    const domains = [
      { id: uuidv4(), name: 'Product & Hardware', slug: 'product-hardware', description: 'Printer design, resin chemistry, firmware, and manufacturing decisions.', icon: 'cpu', sort_order: 1 },
      { id: uuidv4(), name: 'Market & Competitors', slug: 'market-competitors', description: 'Market research, competitor analysis, and customer insights.', icon: 'bar-chart', sort_order: 2 },
      { id: uuidv4(), name: 'Community & Marketing', slug: 'community-marketing', description: 'Community building, content strategy, and growth learnings.', icon: 'users', sort_order: 3 },
      { id: uuidv4(), name: 'Operations & Suppliers', slug: 'operations-suppliers', description: 'Supplier relationships, manufacturing ops, and logistics.', icon: 'truck', sort_order: 4 },
    ]

    const { error: domainError } = await supabase.from('knowledge_domains').insert(
      domains.map((d) => ({ ...d, foundry_id: FOUNDRY_ID }))
    )

    if (domainError) {
      console.error(`   ❌ Knowledge domains failed: ${domainError.message}`)
      return
    }
    console.log(`   ✅ ${domains.length} knowledge domains created`)

    const [prodDomain, marketDomain, communityDomain, opsDomain] = domains

    const notes = [
      // Product & Hardware
      {
        domain_id: prodDomain.id,
        title: 'Sub-20 micron XY resolution achieved on v2.1 chassis',
        description: 'ForgePrint Pro v2.1 test prints confirming best-in-class resolution.',
        content: 'Test prints on the v2.1 chassis have consistently achieved 18-micron XY resolution across 50 test models. Key factors: Chem-Foil FEP film (superior optical clarity vs Fluortek), custom UV array uniformity calibration, and revised carriage geometry reducing Z-axis wobble by 40% vs v1.0. This positions ForgePrint Pro ahead of the Phrozen Sonic Mega 8K and Elegoo Saturn 4 on resolution spec.',
        note_type: 'fact',
        tags: ['hardware', 'print-quality', 'milestone'],
        is_pinned: true,
        is_verified: true,
        confidence: 0.95,
        source_specialist: 'Marcus Chen',
      },
      {
        domain_id: prodDomain.id,
        title: 'Decision: Use Chem-Foil GmbH FEP over Dongguan Plastics',
        description: 'FEP film supplier decision with rationale.',
        content: 'After testing 3 suppliers (Dongguan Plastics, Fluortek, Chem-Foil GmbH), we are proceeding with Chem-Foil for the production run. Reasons: (1) 12% higher light transmittance (96.2% vs 85.1%) meaning better UV exposure and sharper detail. (2) More consistent thickness tolerance (±1.5 micron vs ±5 micron). (3) EU-based supply chain reduces lead time risk post-Brexit. Downside: 18% higher per-sheet cost (£3.20 vs £2.71), but acceptable given quality premium.',
        note_type: 'decision',
        tags: ['hardware', 'suppliers', 'fep', 'decision'],
        is_pinned: false,
        is_verified: true,
        confidence: 0.98,
        source_specialist: 'Marcus Chen',
      },
      {
        domain_id: prodDomain.id,
        title: 'ForgeFlex v3 resin passes 28mm detail benchmark',
        description: 'Resin formula v3 test results at 28mm scale.',
        content: 'Printed 20 models at 28mm scale with ForgeFlex v3 using 0.025mm layer height. Results: faces show individual lash lines, chainmail rings are distinct and not merged, text at 1.5pt size is readable. No warping observed up to 80mm tall models. Cure inhibition test: 4-hour exposure to 365nm ambient light shows no surface tackiness after 2 hours in daylight. Toxicology report pending — COSHH assessment submitted to Toxicol Ltd.',
        note_type: 'observation',
        tags: ['resin', 'forgeflex', 'testing', 'quality'],
        is_pinned: true,
        is_verified: false,
        confidence: 0.88,
        source_specialist: 'Marcus Chen',
      },
      // Market & Competitors
      {
        domain_id: marketDomain.id,
        title: 'Key insight: 68% of hobbyist printers are used exclusively for miniatures',
        description: 'Market research finding on miniature-specific printer usage.',
        content: 'Survey of 450 respondents across our Discord waitlist and r/PrintedMinis: 68% said they bought their resin printer primarily or exclusively for miniatures/tabletop gaming. Yet 0 of the top-5 consumer resin printer brands mention miniatures in their marketing. This confirms the white space: the miniature community is a large, underserved segment with no purpose-built product. Elegoo, Phrozen, and Anycubic are all industrial/general purpose manufacturers that tolerate hobby use rather than designing for it.',
        note_type: 'insight',
        tags: ['market-research', 'competitive-positioning', 'customer-insight'],
        is_pinned: true,
        is_verified: true,
        confidence: 0.85,
        source_specialist: 'Freya Foster',
      },
      {
        domain_id: marketDomain.id,
        title: 'Elegoo Saturn 4 Ultra analysis — closest direct competitor',
        description: 'Detailed competitive teardown of Elegoo Saturn 4 Ultra.',
        content: 'The Elegoo Saturn 4 Ultra (£349 launch price, 12K mono LCD) is our closest competitor on spec. Key weaknesses: (1) No miniature-specific slicing software — users must rely on Chitubox or Lychee. (2) No community print profiles in-box. (3) Resin is generic photopolymer, not optimised for fine detail. (4) Zero community presence — no Discord, no tutorials. Our differentiation is not on hardware spec (we are comparable) but on the entire ecosystem around it: MiniSlice Pro slicer, print profile library, community, and resin subscription.',
        note_type: 'insight',
        tags: ['competitors', 'elegoo', 'competitive-intelligence'],
        is_pinned: false,
        is_verified: true,
        confidence: 0.9,
        source_specialist: 'Freya Foster',
      },
      {
        domain_id: marketDomain.id,
        title: "Customer preference: print profiles are the #1 requested feature",
        description: 'Top feature request from waitlist survey.',
        content: 'Waitlist survey (n=312): Asked "What single feature would most improve your printing experience?" Results: Print profiles for specific miniature ranges (41%), Better slicer software (28%), Higher resolution (17%), Better resin (14%). The print profile finding is the strongest signal we have — customers want to just hit print, not calibrate. This validates our approach of shipping with 50+ profiles and prioritising the profile library as a core product feature, not an afterthought.',
        note_type: 'fact',
        tags: ['customer-insight', 'product-validation', 'print-profiles'],
        is_pinned: true,
        is_verified: true,
        confidence: 0.92,
        source_specialist: 'Isla Thornton',
      },
      // Community & Marketing
      {
        domain_id: communityDomain.id,
        title: 'Lesson: Reddit posts in r/PrintedMinis convert 3x better than r/3Dprinting',
        description: 'Marketing channel performance data from waitlist campaign.',
        content: 'Waitlist campaign results by channel (week 1): r/PrintedMinis: 187 signups from 1 post (conversion: 8.4%), r/3Dprinting: 63 signups from 1 post (conversion: 2.1%), r/Warhammer: 42 signups from 1 post (conversion: 1.8%), YouTube community post: 312 signups (conversion: 0.6% of total subscribers). Clear lesson: hyper-targeted tabletop communities convert dramatically better than general 3D printing. Implication: focus future paid and organic distribution on miniature-specific channels, not general 3D printing spaces.',
        note_type: 'lesson',
        tags: ['marketing', 'distribution', 'reddit', 'conversion'],
        is_pinned: false,
        is_verified: true,
        confidence: 0.95,
        source_specialist: 'Isla Thornton',
      },
      {
        domain_id: communityDomain.id,
        title: 'Community naming: members prefer "Freya\'s Forge" over "ForgePrint Community"',
        description: 'Community name decision from Discord poll.',
        content: 'Discord poll (n=147): "What should we call the Freya Miniatures community?" Options: Freya\'s Forge (52%), ForgePrint Community (23%), The Resin Guild (18%), Other (7%). Decided to proceed with "Freya\'s Forge" — it\'s personal, memorable, and builds on Freya\'s identity as a founder. Also aligns well with the broader ForgeOS platform theme.',
        note_type: 'decision',
        tags: ['community', 'branding', 'discord'],
        is_pinned: false,
        is_verified: true,
        confidence: 0.97,
        source_specialist: 'Isla Thornton',
      },
      {
        domain_id: communityDomain.id,
        title: 'Content that drives the most Discord joins: before/after print quality comparisons',
        description: 'Top-performing content format for community growth.',
        content: 'Analysis of Discord invite link tracking over 3 weeks: Before/after print quality posts (ForgePrint Pro vs competitor) drive 4.2x more Discord joins than any other content type. Tutorial videos drive the most YouTube views but relatively fewer community joins. Recommendation: prioritise before/after comparison content for growth, reserve tutorials for retention and authority-building.',
        note_type: 'observation',
        tags: ['content-marketing', 'growth', 'community'],
        is_pinned: false,
        is_verified: false,
        confidence: 0.8,
        source_specialist: 'Isla Thornton',
      },
      // Operations & Suppliers
      {
        domain_id: opsDomain.id,
        title: 'CM shortlist: 3 manufacturers in contention for first production run',
        description: 'Contract manufacturer evaluation summary.',
        content: 'After initial RFQ to 7 manufacturers, shortlisted to 3 for detailed negotiation: (1) Shenzhen FutureTech Mfg — Strong optics and mechanical track record, 12-week lead time, £820 unit cost at 100 units. (2) PCB Hero Dongguan — Lower cost (£710/unit) but weaker QC documentation and limited English-language support. (3) Zhongshan ElecPro — Best QC documentation, ISO 9001 certified, £880/unit but 16-week lead time. Recommendation: FutureTech for first run (cost/quality/lead time balance), with ElecPro as backup if Kickstarter exceeds 200 units.',
        note_type: 'insight',
        tags: ['manufacturing', 'supply-chain', 'cm-selection'],
        is_pinned: true,
        is_verified: true,
        confidence: 0.85,
        source_specialist: 'Freya Foster',
      },
      {
        domain_id: opsDomain.id,
        title: 'Resin raw material costs: ForgeFlex v3 BOM breakdown',
        description: 'Cost breakdown for ForgeFlex v3 resin formula.',
        content: 'ForgeFlex v3 per-litre COGS: Oligomer blend (Changsha Luyu Chemical) £2.10, Reactive diluents £0.85, Photoinitiator (Irgacure 819) £0.40, Pigment dispersion £0.15, Stabilisers & inhibitors £0.12, Mixing & bottling labour £0.45, Packaging £0.38. Total COGS per litre: £4.45. At £12.99 per 500ml retail price, gross margin is 68.6%. This is ahead of the 60% target. Note: costs assume >500L/month volume pricing — smaller batches will see ~15% COGS increase.',
        note_type: 'fact',
        tags: ['resin', 'cogs', 'financials', 'forgeflex'],
        is_pinned: false,
        is_verified: true,
        confidence: 0.92,
        source_specialist: 'Marcus Chen',
      },
      {
        domain_id: opsDomain.id,
        title: 'Decision: Fulfil resin subscriptions in-house for first 12 months',
        description: 'Fulfilment strategy decision for subscription service.',
        content: 'Evaluated 3PLs vs in-house fulfilment for resin subscriptions. Decision: fulfil in-house from a Bristol unit for the first 12 months. Reasons: (1) Under 200 subscribers, 3PL economics do not work (minimum fees eat margin). (2) In-house allows direct quality control on packaging and labelling. (3) DPD Business Account gives competitive UK/EU rates at low volumes. Trigger to switch to 3PL: 200+ active subscribers or if average order size drops below 500ml. Reviewed with accountant — home units not viable for chemical storage; exploring short-term Bristol unit (6–9 months at £450/month).',
        note_type: 'decision',
        tags: ['operations', 'fulfilment', 'subscription', 'logistics'],
        is_pinned: false,
        is_verified: true,
        confidence: 0.93,
        source_specialist: 'Freya Foster',
      },
    ]

    const { error: notesError } = await supabase.from('knowledge_notes').insert(
      notes.map((n) => ({ ...n, foundry_id: FOUNDRY_ID }))
    )

    if (notesError) {
      console.error(`   ❌ Knowledge notes failed: ${notesError.message}`)
    } else {
      console.log(`   ✅ ${notes.length} knowledge notes created`)
    }

    // Update domain note counts
    for (const domain of domains) {
      const count = notes.filter((n) => n.domain_id === domain.id).length
      await supabase.from('knowledge_domains').update({ note_count: count }).eq('id', domain.id)
    }
    console.log('   ✅ Domain note counts updated')
  }

  // ── 5. Task History ───────────────────────────────────────────────────────
  console.log('\n📊 Step 5: Task History')

  const { count: existingHistory } = await supabase
    .from('task_history')
    .select('*', { count: 'exact', head: true })
    .in('task_id', Object.values(TASK))

  if (existingHistory && existingHistory > 0) {
    console.log(`   ↳ Task history already exists (${existingHistory}), skipping`)
  } else {
    const historyEntries = [
      // FEP task — completed
      { task_id: TASK.fep, user_id: MARCUS_ID, action_type: 'CREATED', changes: {}, created_at: daysAgo(20) },
      { task_id: TASK.fep, user_id: MARCUS_ID, action_type: 'STATUS_CHANGE', changes: { status: { old: 'Pending', new: 'Accepted' } }, created_at: daysAgo(18) },
      { task_id: TASK.fep, user_id: MARCUS_ID, action_type: 'COMPLETED', changes: { status: { old: 'Accepted', new: 'Completed' }, progress: { old: 0, new: 100 } }, created_at: daysAgo(12) },
      // CAD task — in progress
      { task_id: TASK.cad, user_id: MARCUS_ID, action_type: 'CREATED', changes: {}, created_at: daysAgo(21) },
      { task_id: TASK.cad, user_id: MARCUS_ID, action_type: 'STATUS_CHANGE', changes: { status: { old: 'Pending', new: 'Accepted' } }, created_at: daysAgo(19) },
      { task_id: TASK.cad, user_id: MARCUS_ID, action_type: 'UPDATED', changes: { progress: { old: 0, new: 50 } }, created_at: daysAgo(16) },
      { task_id: TASK.cad, user_id: MARCUS_ID, action_type: 'UPDATED', changes: { progress: { old: 50, new: 75 } }, created_at: daysAgo(13) },
      // Email waitlist — in progress
      { task_id: TASK.emailWaitlist, user_id: ISLA_ID, action_type: 'CREATED', changes: {}, created_at: daysAgo(15) },
      { task_id: TASK.emailWaitlist, user_id: ISLA_ID, action_type: 'STATUS_CHANGE', changes: { status: { old: 'Pending', new: 'Accepted' } }, created_at: daysAgo(14) },
      { task_id: TASK.emailWaitlist, user_id: ISLA_ID, action_type: 'UPDATED', changes: { progress: { old: 0, new: 20 } }, created_at: daysAgo(13) },
      // Kickstarter copy — started
      { task_id: TASK.kssCopy, user_id: FREYA_ID, action_type: 'CREATED', changes: {}, created_at: daysAgo(10) },
      { task_id: TASK.kssCopy, user_id: FREYA_ID, action_type: 'UPDATED', changes: { progress: { old: 0, new: 15 } }, created_at: daysAgo(9) },
      // Subscription tiers — started
      { task_id: TASK.subTiers, user_id: FREYA_ID, action_type: 'CREATED', changes: {}, created_at: daysAgo(8) },
      { task_id: TASK.subTiers, user_id: FREYA_ID, action_type: 'UPDATED', changes: { progress: { old: 0, new: 30 } }, created_at: daysAgo(6) },
      // GW partnership task
      { task_id: TASK.cm, user_id: FREYA_ID, action_type: 'CREATED', changes: {}, created_at: daysAgo(5) },
    ]

    const { error: historyError } = await supabase.from('task_history').insert(historyEntries)
    if (historyError) {
      console.error(`   ❌ Task history failed: ${historyError.message}`)
    } else {
      console.log(`   ✅ ${historyEntries.length} task history entries created`)
    }
  }

  // ── 6. Standups ───────────────────────────────────────────────────────────
  console.log('\n☀️  Step 6: Standups')

  const { count: existingStandups } = await supabase
    .from('standups')
    .select('*', { count: 'exact', head: true })
    .eq('foundry_id', FOUNDRY_ID)

  if (existingStandups && existingStandups > 0) {
    console.log(`   ↳ Standups already exist, skipping`)
  } else {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yDate = yesterday.toISOString().split('T')[0]

    const twoDaysAgo = new Date()
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
    const tdaDate = twoDaysAgo.toISOString().split('T')[0]

    const standups = [
      {
        user_id: FREYA_ID,
        foundry_id: FOUNDRY_ID,
        standup_date: yDate,
        completed: 'Finalised Kickstarter reward tier pricing model. Sent GW licensing intro email with one-page technical brief. Reviewed Marcus\'s v2.1 chassis changes — approved for CM submission.',
        planned: 'Submit CAD files to FutureTech CM for review. Brief the copywriter on the Kickstarter campaign. Review toxicology report draft from Toxicol Ltd.',
        blockers: 'Waiting on GW licensing team to respond to intro email — need a contact name and timeline before we can move forward on the partnership objective. Without this, the partnership track is blocked.',
        blocker_tags: ['partnerships', 'gw-licensing'],
        blocker_severity: 'medium',
        needs_help: false,
      },
      {
        user_id: MARCUS_ID,
        foundry_id: FOUNDRY_ID,
        standup_date: yDate,
        completed: 'Completed load test on v2.1 chassis. Updated CAD files with FEP tensioner fix. Sent resin sample to Toxicol Ltd for COSHH assessment.',
        planned: 'Prepare CM submission pack (STEP files, BOM, assembly drawings). Run overnight print test with Chem-Foil FEP vs Fluortek comparison. Draft FEP procurement spec.',
        blockers: null,
        blocker_tags: [],
        blocker_severity: null,
        needs_help: false,
      },
      {
        user_id: ISLA_ID,
        foundry_id: FOUNDRY_ID,
        standup_date: tdaDate,
        completed: 'Discord hit 200 members. Ran community poll on print profile preferences (Space Marines won by a landslide). Posted waitlist CTA in r/DnD and r/tabletop_rpg — another 87 signups.',
        planned: 'Film first YouTube tutorial using ForgePrint Pro prototype. Edit and schedule 3 short-form clips for TikTok/Reels. Brief Freya on Kickstarter video shot list.',
        blockers: 'Still waiting for the printer prototype to be available for filming — Marcus has it for load testing. Need to coordinate a filming window this week or the YouTube tutorial timeline slips by 2 weeks.',
        blocker_tags: ['content-creation', 'prototype-access'],
        blocker_severity: 'medium',
        needs_help: true,
      },
    ]

    const { error: standupError } = await supabase.from('standups').insert(standups)
    if (standupError) {
      console.error(`   ❌ Standups failed: ${standupError.message}`)
    } else {
      console.log(`   ✅ ${standups.length} standups created`)
    }
  }

  // ── 7. Foundry Function Coverage ──────────────────────────────────────────
  console.log('\n🏢 Step 7: Function Coverage')

  const { count: existingCoverage } = await supabase
    .from('foundry_function_coverage')
    .select('*', { count: 'exact', head: true })
    .eq('foundry_id', FOUNDRY_ID)

  if (existingCoverage && existingCoverage > 0) {
    console.log(`   ↳ Function coverage already exists, skipping`)
  } else {
    const coverage = [
      {
        foundry_id: FOUNDRY_ID,
        function_id: BF.hardware,
        coverage_status: 'covered',
        covered_by: 'Marcus Chen (Head of Product Engineering)',
        notes: 'Full hardware and manufacturing coverage — CAD, DFM, CM liaison.',
        assessed_by: FREYA_ID,
      },
      {
        foundry_id: FOUNDRY_ID,
        function_id: BF.productMgmt,
        coverage_status: 'covered',
        covered_by: 'Freya Foster (Founder)',
        notes: 'Freya owns product roadmap, user research, and prioritisation.',
        assessed_by: FREYA_ID,
      },
      {
        foundry_id: FOUNDRY_ID,
        function_id: BF.community,
        coverage_status: 'covered',
        covered_by: 'Isla Thornton (Community & Marketing Apprentice)',
        notes: 'Discord, YouTube, social media, and community events.',
        assessed_by: FREYA_ID,
      },
      {
        foundry_id: FOUNDRY_ID,
        function_id: BF.supplyChain,
        coverage_status: 'partial',
        covered_by: 'Marcus Chen (partial) / Freya Foster (partial)',
        notes: 'Marcus manages CM relationships; Freya handles resin supplier negotiations. No dedicated SCM resource.',
        assessed_by: FREYA_ID,
      },
      {
        foundry_id: FOUNDRY_ID,
        function_id: BF.manufacturing,
        coverage_status: 'partial',
        covered_by: 'Marcus Chen',
        notes: 'Marcus has strong DFM knowledge but we\'re pre-production. Full coverage needed once first batch is underway.',
        assessed_by: FREYA_ID,
      },
      {
        foundry_id: FOUNDRY_ID,
        function_id: BF.brandStrategy,
        coverage_status: 'gap',
        covered_by: null,
        notes: 'No dedicated brand strategy resource. Freya and Isla handling reactively. High-priority hire/fractional need.',
        assessed_by: FREYA_ID,
      },
      {
        foundry_id: FOUNDRY_ID,
        function_id: BF.financialPlanning,
        coverage_status: 'gap',
        covered_by: null,
        notes: 'Using a part-time bookkeeper (2 days/month) but no FP&A or financial modelling capability. Will need fractional CFO before Kickstarter closes.',
        assessed_by: FREYA_ID,
      },
      {
        foundry_id: FOUNDRY_ID,
        function_id: BF.contractMgmt,
        coverage_status: 'gap',
        covered_by: null,
        notes: 'Using a solicitor on retainer for ad-hoc contract review. No proactive contract management or IP strategy. Risk area given Games Workshop partnership ambitions.',
        assessed_by: FREYA_ID,
      },
    ]

    const { error: coverageError } = await supabase.from('foundry_function_coverage').insert(coverage)
    if (coverageError) {
      console.error(`   ❌ Function coverage failed: ${coverageError.message}`)
    } else {
      console.log(`   ✅ ${coverage.length} function coverage entries created`)
    }
  }

  // ── 8. Blueprint ──────────────────────────────────────────────────────────
  console.log('\n🏗️  Step 8: Blueprint')

  const { count: existingBlueprints } = await supabase
    .from('blueprints')
    .select('*', { count: 'exact', head: true })
    .eq('foundry_id', FOUNDRY_ID)

  if (existingBlueprints && existingBlueprints > 0) {
    console.log(`   ↳ Blueprint already exists, skipping`)
  } else {
    const { error: blueprintError } = await supabase.from('blueprints').insert({
      foundry_id: FOUNDRY_ID,
      name: 'ForgePrint Pro — Go to Market',
      description: 'End-to-end blueprint for launching the ForgePrint Pro printer: from hardware sign-off through Kickstarter campaign, first production batch, and post-launch community operations.',
      project_type: 'product',
      project_stage: 'prototype',
      status: 'active',
      coverage_score: 62.5,
      critical_gaps: 3,
      total_domains: 8,
      covered_domains: 5,
      created_by: FREYA_ID,
    })

    if (blueprintError) {
      console.error(`   ❌ Blueprint failed: ${blueprintError.message}`)
    } else {
      console.log('   ✅ Blueprint created')
    }
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log('\n🎉 Extended seed complete!\n')
  console.log('━'.repeat(60))
  console.log('Added:')
  console.log('  ✅ Profile depth (skills, background, expertise) for all 3 users')
  console.log('  ✅ 12 task comments (realistic team discussions)')
  console.log('  ✅ 5 objective comments (progress updates)')
  console.log('  ✅ 4 knowledge domains + 12 knowledge notes')
  console.log('  ✅ 15 task history entries')
  console.log('  ✅ 3 standups (with 2 blocker items)')
  console.log('  ✅ 8 foundry function coverage entries (3 covered, 2 partial, 3 gaps)')
  console.log('  ✅ 1 blueprint (ForgePrint Pro Go to Market)')
  console.log('━'.repeat(60))
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
