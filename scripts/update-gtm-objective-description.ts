/**
 * Update GTM Outbound Objective with Short + Extended Description
 * 
 * Run with: npx ts-node scripts/update-gtm-objective-description.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Error: Missing credentials in .env.local')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Short description (shown in lists)
const shortDescription = `Acquire Centaur Dynamics' first 10+ customers and reach $1,000 MRR through systematic LinkedIn + Email + Twitter cold outreach over 90 days.`

// Extended description (full context)
const extendedDescription = `## Overview

This objective implements a multi-channel cold outbound go-to-market strategy based on the "LinkedIn + Email + Twitter = $100M Cold Outbound" framework. The goal is to acquire our first paying customers systematically rather than relying on slow content marketing or expensive paid ads.

## Why This Approach

| Acquisition Method | Cost | Time to First Customer | Scalability |
|--------------------|------|------------------------|-------------|
| **Cold Outbound** | ~$500/month | 2-4 weeks | High |
| Paid Ads (Google/LinkedIn) | $5k+/month | 2-4 weeks | Medium |
| Content Marketing | Minimal | 12-18 months | High |
| Referrals | Free | Unpredictable | Low |

Cold outbound gives us the fastest, most predictable path to first customers while maintaining capital efficiency.

---

## Target ICP (Ideal Customer Profile)

### Tier 1: Creative Agency Founders (Highest Priority)
- **Company Size:** 10-50 employees
- **Role:** Founder, CEO, Managing Director
- **Industry:** Marketing, Design, Content, Digital agencies
- **Signals:** Posts about AI, uses freelancers, hiring
- **Why:** They understand the contractor/team management pain and are early adopters of new tools

### Tier 2: Fractional Executives
- **Company Size:** 1-10 people (their firm)
- **Role:** Fractional CFO, CMO, CTO
- **Why:** Manage multiple client engagements, need AI augmentation

### Tier 3: Tech Startup Ops Leaders
- **Company Size:** 50-200 employees
- **Role:** Head of Operations, VP Ops, COO
- **Funding Stage:** Series A-C
- **Why:** Scaling operations, open to new tools

---

## Channel Strategy

### LinkedIn (Primary - 50% of effort)
- **Tool Stack:** Sales Navigator ($99/mo) + Expandi ($99/mo)
- **Volume:** 50-75 connections/day, 50 messages/day
- **Approach:** Value-first, no pitch in connection request
- **Sequence:** View profile → Connect → 4-message nurture sequence → Call booking

### Email (Secondary - 30% of effort)
- **Tool Stack:** Apollo.io ($99/mo) + Instantly ($97/mo)
- **Volume:** 100-150 emails/day across 9 sending accounts
- **Domains:** 3 secondary domains (warmed for 2 weeks)
- **Sequence:** 3-email sequence over 6 days

### Twitter/X (Amplification - 20% of effort)
- **Purpose:** Build presence, warm up prospects before DM
- **Volume:** 2 posts/day, 30 engagements/day
- **Approach:** Engage with target ICP content before outreach

---

## Key Messaging Angles

### 1. The "Centaur" Story
> "In chess, centaur teams (human + AI) beat both pure humans AND pure AI. We're building the operating system for centaur teams in business."

### 2. The Speed Angle
> "We built CentaurOS in 3 days. Our AI agents can complete tasks in minutes. What would your team accomplish with that kind of speed?"

### 3. The Agency Pain Point
> "Every agency I talk to has the same problem: too many tools, too many freelancers, too many Slack threads. What if there was one place where your human team and AI agents worked together?"

### 4. The Anti-Upwork Angle
> "Upwork gives you talent. We give you a system where that talent (human or AI) actually gets things done without you micromanaging."

---

## Success Metrics

### Month 1 Targets
| Metric | Target |
|--------|--------|
| LinkedIn connections sent | 400+ |
| Emails sent | 1,000+ |
| Discovery calls booked | 10+ |
| Pilot users started | 3-5 |

### Month 2 Targets
| Metric | Target |
|--------|--------|
| Outreach volume | 5,000+ |
| Discovery calls | 30+ |
| Pilot users | 10+ |
| Paying customers | 1-2 |

### Month 3 Targets (Final)
| Metric | Target |
|--------|--------|
| Total outreach | 10,000+ |
| Discovery calls | 50+ |
| Paying customers | 5+ |
| MRR | $1,000+ |

---

## Budget Breakdown

| Tool | Monthly Cost |
|------|--------------|
| LinkedIn Sales Navigator | $99 |
| Expandi (LinkedIn automation) | $99 |
| Apollo.io (email finding) | $99 |
| Instantly (email sending) | $97 |
| Extra domains (3) | $10 |
| **Total** | **~$404/month** |

This is 10x cheaper than paid ads and provides 10x more reach.

---

## Key Principles

1. **Personalization > Volume** - A personalized message outperforms 10 generic ones
2. **Value First** - Lead with insight, not pitch
3. **Multi-Touch** - Average B2B sale needs 8+ touchpoints
4. **Test & Iterate** - A/B test everything, double down on winners
5. **Track Everything** - Can't improve what you don't measure

---

## Resources

- **Lead Magnet:** "Centaur Team Framework" PDF
- **Calendly Link:** For booking discovery calls
- **Tracking Sheet:** Google Sheets dashboard for all metrics
- **Message Templates:** See task descriptions for exact scripts

---

## What Success Looks Like

By the end of this 90-day objective:
- ✅ 5+ paying customers acquired
- ✅ $1,000+ MRR established
- ✅ Repeatable outbound playbook documented
- ✅ CAC validated and optimized
- ✅ Foundation for scaling to $10k+ MRR
`

async function updateObjective() {
    console.log('🔄 Updating GTM Outbound Objective...\n')

    // Find the GTM objective
    const { data: objectives, error: findError } = await supabase
        .from('objectives')
        .select('id, title')
        .ilike('title', '%Multi-Channel Cold Outbound%')
        .limit(1)

    if (findError || !objectives || objectives.length === 0) {
        console.error('❌ Could not find GTM objective:', findError)
        process.exit(1)
    }

    const objective = objectives[0]
    console.log(`✅ Found objective: "${objective.title}"`)
    console.log(`   ID: ${objective.id}\n`)

    // Update with both descriptions
    const { error: updateError } = await supabase
        .from('objectives')
        .update({
            description: shortDescription,
            extended_description: extendedDescription
        })
        .eq('id', objective.id)

    if (updateError) {
        console.error('❌ Failed to update objective:', updateError)
        process.exit(1)
    }

    console.log('✅ Successfully updated objective with:')
    console.log(`   - Short description (${shortDescription.length} chars)`)
    console.log(`   - Extended description (${extendedDescription.length} chars)`)
    console.log(`\n🎯 View updated objective at: /objectives/${objective.id}`)
}

updateObjective().catch(console.error)
