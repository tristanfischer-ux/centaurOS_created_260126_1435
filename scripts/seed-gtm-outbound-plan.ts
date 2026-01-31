/**
 * Seed Script: Multi-Channel Cold Outbound GTM Plan
 * 
 * This script creates an objective with 30+ detailed tasks for implementing
 * a LinkedIn + Email + Twitter cold outbound strategy for Centaur Dynamics.
 * 
 * Run with: npx ts-node scripts/seed-gtm-outbound-plan.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Error: Missing credentials in .env.local')
    console.error('Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Helper to add days to a date
function addDays(date: Date, days: number): Date {
    const result = new Date(date)
    result.setDate(result.getDate() + days)
    return result
}

// Helper to format date as ISO string
function toISO(date: Date): string {
    return date.toISOString()
}

interface TaskData {
    title: string
    description: string
    start_date: string
    end_date: string
    risk_level: 'Low' | 'Medium' | 'High'
}

async function seedGTMPlan() {
    console.log('🚀 Starting Multi-Channel Cold Outbound GTM Plan seed...\n')

    // 1. Get the founder's profile (first Founder role in the system)
    const { data: founderProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id, foundry_id, full_name')
        .eq('role', 'Founder')
        .limit(1)
        .single()

    if (profileError || !founderProfile) {
        console.error('❌ Could not find a Founder profile. Make sure you have logged in at least once.')
        console.error('Error:', profileError)
        process.exit(1)
    }

    console.log(`✅ Found Founder: ${founderProfile.full_name}`)
    console.log(`   Foundry ID: ${founderProfile.foundry_id}\n`)

    const foundryId = founderProfile.foundry_id
    const creatorId = founderProfile.id

    if (!foundryId) {
        console.error('❌ Founder has no foundry_id. Please complete onboarding first.')
        process.exit(1)
    }

    // 2. Create the Objective
    const objectiveDescription = `## Multi-Channel Cold Outbound GTM Strategy

A systematic approach to acquiring Centaur Dynamics' first customers through coordinated LinkedIn, Email, and Twitter outreach.

### Target: 
- **Month 1:** 10 discovery calls, 3-5 pilot users
- **Month 2:** 30-50 calls, 10+ pilots  
- **Month 3:** 50+ calls, $1,000+ MRR

### Budget: ~$500/month
- LinkedIn Sales Navigator: $99/month
- Email tools (Apollo + Instantly): $150/month
- LinkedIn automation (Expandi): $99/month
- Extra domains: $30/month

### Primary ICP:
- Creative agency founders (10-50 employees)
- Fractional executives (CFO/CMO/CTO practices)
- Tech startup ops leaders (Series A-C)

### Key Messaging Angles:
1. "Centaur Teams" - Human + AI collaboration beats either alone
2. Speed - Built in 3 days, AI agents complete in minutes
3. Anti-Upwork - System for getting things done, not just talent`

    const { data: objective, error: objectiveError } = await supabase
        .from('objectives')
        .insert({
            title: '🎯 Multi-Channel Cold Outbound GTM Campaign',
            description: objectiveDescription,
            creator_id: creatorId,
            foundry_id: foundryId
        })
        .select()
        .single()

    if (objectiveError || !objective) {
        console.error('❌ Failed to create objective:', objectiveError)
        process.exit(1)
    }

    console.log(`✅ Created Objective: "${objective.title}"`)
    console.log(`   ID: ${objective.id}\n`)

    // 3. Define all tasks with dates
    // Base date: Today
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const tasks: TaskData[] = [
        // ========================================
        // WEEK 1: INFRASTRUCTURE SETUP (Days 1-7)
        // ========================================
        {
            title: '🔧 Set up LinkedIn Sales Navigator account',
            description: `Sign up for LinkedIn Sales Navigator ($99/month).

**Steps:**
1. Go to linkedin.com/sales/signup
2. Choose Professional tier ($99/month)
3. Complete payment
4. Set up search preferences

**Acceptance Criteria:**
- [ ] Account active and paid
- [ ] Able to run advanced searches
- [ ] InMail credits visible`,
            start_date: toISO(today),
            end_date: toISO(addDays(today, 1)),
            risk_level: 'Low'
        },
        {
            title: '🎯 Create ICP search lists in Sales Navigator',
            description: `Build targeted lead lists for our three ICPs.

**List 1: Creative Agency Founders**
- Title: Founder, CEO, Managing Director
- Industry: Marketing, Design, Advertising
- Company size: 11-50 employees
- Keywords: "agency", "creative", "digital"
- Geography: UK, EU (start)

**List 2: Fractional Executives**
- Title: Fractional CFO, Fractional CMO, Fractional CTO
- Company size: 1-10 employees
- Keywords: "fractional", "interim", "advisor"

**List 3: Tech Startup Ops**
- Title: Head of Operations, COO, VP Operations
- Industry: Technology, Software
- Company size: 51-200
- Funding: Series A, Series B

**Acceptance Criteria:**
- [ ] 3 saved searches created
- [ ] Each list has 500+ prospects
- [ ] Lists exported for reference`,
            start_date: toISO(addDays(today, 1)),
            end_date: toISO(addDays(today, 2)),
            risk_level: 'Medium'
        },
        {
            title: '📧 Buy 3 email domains for cold outreach',
            description: `Purchase secondary domains for email warming and sending.

**Domains to buy:**
1. centaurdynamics.io
2. centaurdynamics.co  
3. trycentaur.com (or similar)

**Where to buy:**
- Namecheap or Cloudflare (cheapest)
- ~$10-15 per domain

**After purchase:**
- Point MX records to Google Workspace
- Set up SPF, DKIM, DMARC records

**Acceptance Criteria:**
- [ ] 3 domains purchased
- [ ] DNS configured for email
- [ ] MX records pointing to sending service`,
            start_date: toISO(addDays(today, 1)),
            end_date: toISO(addDays(today, 2)),
            risk_level: 'Low'
        },
        {
            title: '📬 Set up email infrastructure (Apollo + Instantly)',
            description: `Configure email finding and sending tools.

**Apollo.io Setup ($99/month):**
1. Sign up at apollo.io
2. Connect LinkedIn (for enrichment)
3. Upload ICP criteria
4. Verify email accuracy settings

**Instantly.ai Setup ($37-97/month):**
1. Sign up at instantly.ai
2. Connect email accounts (3 per domain = 9 total)
3. Enable email warming (2-week warmup)
4. Set daily sending limits (20/account initially)

**Email Account Structure:**
- tristan@centaurdynamics.io
- hello@centaurdynamics.io
- team@centaurdynamics.io
- (repeat for .co and trycentaur.com)

**Acceptance Criteria:**
- [ ] Apollo account active with credits
- [ ] 9 email accounts created
- [ ] All accounts in warming mode
- [ ] SPF/DKIM/DMARC passing`,
            start_date: toISO(addDays(today, 2)),
            end_date: toISO(addDays(today, 4)),
            risk_level: 'Medium'
        },
        {
            title: '✍️ Write LinkedIn connection request templates',
            description: `Create 5 personalized connection request templates (no pitch).

**Template 1: Agency Founder**
"Hey {First Name} - saw your work at {Company}. Running a {size}-person agency sounds intense. Would love to connect."

**Template 2: AI Interest Signal**
"Hi {First Name} - noticed your post about [AI/automation]. Building something in this space. Would love to connect and hear your thoughts."

**Template 3: Growth Signal**
"Hey {First Name} - congrats on {Company}'s growth! Managing a team of {size} is no small feat. Would love to connect."

**Template 4: Mutual Connection**
"Hi {First Name} - saw we're both connected to {Mutual}. Your work at {Company} caught my eye. Would love to connect."

**Template 5: Content Engagement**
"Hey {First Name} - loved your take on {topic from their post}. Would love to connect and continue the conversation."

**Acceptance Criteria:**
- [ ] 5 templates written
- [ ] Each <300 characters
- [ ] No sales pitch in any
- [ ] Personalization tags identified`,
            start_date: toISO(addDays(today, 3)),
            end_date: toISO(addDays(today, 4)),
            risk_level: 'Low'
        },
        {
            title: '✍️ Write LinkedIn message sequence (post-connect)',
            description: `Create 4-message sequence for after connection acceptance.

**Message 1 (Day 1 after accept): Value-First**
"Thanks for connecting, {First Name}! Quick question - how are you handling the balance between using AI tools and managing your human team? We're building something in this space and I'm genuinely curious how {industry} leaders think about it."

**Message 2 (Day 3): Content Share**
"Been thinking about your earlier answer. We just wrote up a framework for how {industry} teams are building 'centaur teams' (human + AI hybrids). Happy to share if useful - no pitch, just curious what you think."

**Message 3 (Day 5): Soft CTA**
"Would you be open to a 15-min call? I'd love to show you what we're building and get your brutally honest feedback. Even if it's not for you, your perspective would be incredibly valuable."

**Message 4 (Day 8): Last Follow-up**
"Last follow-up from me! If the timing isn't right, totally understand. Here's a quick resource on centaur teams either way: [link]. Always happy to chat in future."

**Acceptance Criteria:**
- [ ] 4 messages written
- [ ] Each has personalization tags
- [ ] Sequence flows naturally
- [ ] No hard selling`,
            start_date: toISO(addDays(today, 4)),
            end_date: toISO(addDays(today, 5)),
            risk_level: 'Low'
        },
        {
            title: '✍️ Write cold email sequence (3 emails)',
            description: `Create 3-email cold outreach sequence.

**Email 1 (Day 0): Problem-Focused**
Subject: Quick question about {Company} team

Hi {First Name},

I noticed {Company} has grown to {X} people - congrats. Quick question: how are you handling the hybrid team challenge? (mixing full-time, contractors, and AI tools)

We're building something specifically for this and I'm doing customer discovery. Would love 15 mins of your time.

Best,
Tristan

**Email 2 (Day 3): Value-Add**
Subject: Re: Quick question about {Company} team

Thought you might find this useful - we put together a breakdown of how agencies are structuring "centaur teams" (human + AI working together).

[Link to resource]

No strings attached. Let me know if it resonates.

Tristan

**Email 3 (Day 6): Soft CTA**
Subject: Re: Quick question about {Company} team

Last follow-up - would 15 mins next week work to show you what we're building?

Even if it's not relevant, I'd value your perspective. We're early and your feedback would genuinely help.

[Calendar link]

Tristan

**Acceptance Criteria:**
- [ ] 3 emails written
- [ ] Personalization variables identified
- [ ] Subject lines tested for opens
- [ ] CTA is clear but soft`,
            start_date: toISO(addDays(today, 4)),
            end_date: toISO(addDays(today, 5)),
            risk_level: 'Low'
        },
        {
            title: '📱 Set up Twitter/X content calendar',
            description: `Create 2-week content calendar for Twitter presence.

**Content Pillars:**
1. "Centaur Teams" education (40%)
2. AI agent case studies (20%)
3. Agency/consulting tips (20%)
4. Building in public (20%)

**Week 1 Posts:**
- Mon: Thread on "What is a centaur team?"
- Tue: Quick tip on AI-human collaboration
- Wed: Behind-the-scenes building CentaurOS
- Thu: Industry observation/hot take
- Fri: Question to audience + engagement
- Sat: Retweet/quote relevant content
- Sun: Week recap or reflection

**Week 2 Posts:**
- Similar rotation with new content

**Posting Times:**
- 9am UK (US waking up, EU mid-morning)
- 3pm UK (US lunch, EU afternoon)

**Acceptance Criteria:**
- [ ] 14 posts drafted
- [ ] Scheduled in Buffer/Typefully
- [ ] Hashtags researched
- [ ] Engagement prompts included`,
            start_date: toISO(addDays(today, 5)),
            end_date: toISO(addDays(today, 7)),
            risk_level: 'Low'
        },
        {
            title: '📄 Create "Centaur Team Framework" lead magnet',
            description: `Design a PDF/Notion doc to use as value-add in outreach.

**Document Outline:**
1. What is a Centaur Team? (definition + chess analogy)
2. The 3 Layers of a Centaur Team
   - Human strategists (20% effort, 80% impact)
   - AI agents (80% execution, 20% oversight)
   - Hybrid workflows (how they connect)
3. 5 Signs Your Team Needs to Go Centaur
4. Implementation Roadmap (30-60-90 days)
5. Case Study (hypothetical but realistic)
6. Tools to Get Started (mention CentaurOS subtly)

**Design:**
- Clean, minimal design
- Use brand colors (International Orange, Electric Blue)
- Include diagrams
- 5-7 pages max

**Acceptance Criteria:**
- [ ] Document written
- [ ] Designed in Figma/Canva
- [ ] PDF exported
- [ ] Hosted on website or Notion`,
            start_date: toISO(addDays(today, 5)),
            end_date: toISO(addDays(today, 7)),
            risk_level: 'Medium'
        },

        // ========================================
        // WEEK 2: MANUAL OUTREACH PHASE (Days 8-14)
        // ========================================
        {
            title: '🔗 Send 20 LinkedIn connections/day (Week 2)',
            description: `Begin manual LinkedIn outreach - 20 connections per day.

**Daily Process:**
1. Open Sales Navigator saved list
2. Review each profile before connecting
3. Personalize connection note (reference post/company/mutual)
4. Track in spreadsheet: Name, Company, Date Sent

**Target: 100 connections by end of week**

**Personalization Checklist:**
- [ ] Mentioned something specific from their profile
- [ ] Referenced their company or role
- [ ] No pitch in the message
- [ ] Under 300 characters

**Tracking Spreadsheet Columns:**
- Name | Company | Title | Date Sent | Accepted? | Message Sent? | Call Booked?

**Acceptance Criteria:**
- [ ] 100 connection requests sent
- [ ] All tracked in spreadsheet
- [ ] 25%+ acceptance rate target`,
            start_date: toISO(addDays(today, 7)),
            end_date: toISO(addDays(today, 14)),
            risk_level: 'Low'
        },
        {
            title: '💬 Send follow-up messages to accepted connections',
            description: `Message everyone who accepted connections.

**Process:**
1. Check accepted connections daily
2. Send Message 1 within 24 hours of acceptance
3. Log in tracking spreadsheet
4. Set reminder for Message 2 (Day 3)

**Response Handling:**
- Positive response → Book call immediately
- Question → Answer helpfully, then ask for call
- Negative → Thank them, don't push
- No response → Continue sequence

**Acceptance Criteria:**
- [ ] All accepted connections messaged
- [ ] Responses logged and categorized
- [ ] Call booking link ready (Calendly/Cal.com)`,
            start_date: toISO(addDays(today, 8)),
            end_date: toISO(addDays(today, 14)),
            risk_level: 'Low'
        },
        {
            title: '🐦 Engage with 30 target prospects on Twitter daily',
            description: `Build presence by engaging before DM-ing.

**Daily Engagement Process:**
1. Search for ICP job titles + keywords
2. Like 10 relevant tweets from prospects
3. Reply thoughtfully to 10 tweets (add value, not pitch)
4. Quote tweet 5 interesting takes
5. Follow 5 new target accounts

**Engagement Quality Rules:**
- Replies must add value (insight, question, support)
- No "great post!" or generic comments
- Reference their specific point
- Be genuinely helpful

**Tracking:**
- Log engaged accounts
- Note which ones engage back
- After 3+ interactions, consider DM

**Acceptance Criteria:**
- [ ] 30 engagements/day for 7 days
- [ ] Engagement log maintained
- [ ] 5-10 warm prospects identified for DM`,
            start_date: toISO(addDays(today, 7)),
            end_date: toISO(addDays(today, 14)),
            risk_level: 'Low'
        },
        {
            title: '📊 Set up outreach tracking dashboard',
            description: `Create a simple dashboard to track all outreach metrics.

**Metrics to Track:**

LinkedIn:
- Connections sent / accepted (rate %)
- Messages sent / replied (rate %)
- Calls booked

Email:
- Emails sent / delivered (rate %)
- Opens / open rate %
- Replies / reply rate %
- Calls booked

Twitter:
- Followers gained
- Engagement rate
- DMs sent / replied
- Calls booked

**Tool Options:**
- Simple: Google Sheets with formulas
- Better: Notion database with views
- Advanced: Connect to actual tools via API

**Acceptance Criteria:**
- [ ] Dashboard created
- [ ] All channels tracked
- [ ] Updated daily
- [ ] Week-over-week comparison visible`,
            start_date: toISO(addDays(today, 7)),
            end_date: toISO(addDays(today, 9)),
            risk_level: 'Low'
        },
        {
            title: '📞 Book first 3-5 discovery calls',
            description: `Convert outreach responses into actual calls.

**Call Booking Process:**
1. When prospect shows interest, send calendar link
2. Use Cal.com or Calendly (15-min discovery)
3. Send confirmation with agenda
4. Prepare personalized notes before call

**Pre-Call Prep:**
- Review their LinkedIn/Twitter
- Note their company size, challenges
- Prepare 3 tailored questions
- Have demo ready

**Discovery Call Agenda (15 min):**
- 2 min: Intro + rapport
- 5 min: Their challenges with team/AI
- 5 min: Show CentaurOS briefly
- 3 min: Gauge interest, next steps

**Acceptance Criteria:**
- [ ] 3-5 calls booked
- [ ] Calendar + confirmation flow working
- [ ] Pre-call notes for each
- [ ] Demo environment ready`,
            start_date: toISO(addDays(today, 10)),
            end_date: toISO(addDays(today, 14)),
            risk_level: 'Medium'
        },

        // ========================================
        // WEEK 3-4: SCALE MANUAL + TEST AUTOMATION (Days 15-28)
        // ========================================
        {
            title: '📈 Analyze Week 2 outreach results',
            description: `Review what's working and what's not.

**Analysis Questions:**
1. Which ICP responded best?
2. Which message got highest reply rate?
3. What objections came up?
4. Where did prospects drop off?

**Metrics to Review:**
- LinkedIn: Connection rate by ICP, reply rate by message
- Twitter: Best performing content, engagement by ICP
- Calls: Show rate, conversion to interest

**Optimize Based on Data:**
- Double down on winning ICP
- A/B test messages that underperformed
- Refine targeting criteria
- Update lead magnet if needed

**Acceptance Criteria:**
- [ ] Week 2 metrics compiled
- [ ] Top/bottom performers identified
- [ ] 3 optimizations documented
- [ ] Week 3 plan adjusted`,
            start_date: toISO(addDays(today, 14)),
            end_date: toISO(addDays(today, 15)),
            risk_level: 'Low'
        },
        {
            title: '🤖 Set up LinkedIn automation (Expandi)',
            description: `Configure LinkedIn automation for scale.

**Expandi Setup ($99/month):**
1. Sign up at expandi.io
2. Connect LinkedIn account (use dedicated browser profile)
3. Import lead lists from Sales Navigator
4. Set up connection + message sequences

**Campaign Structure:**
- Campaign 1: Agency Founders (ICP 1)
- Campaign 2: Fractional Execs (ICP 2)
- Campaign 3: Startup Ops (ICP 3)

**Safety Settings:**
- Max 50-75 connections/day
- Max 50 messages/day
- Random delays between actions
- Mimic human behavior patterns

**Sequence in Expandi:**
1. View profile (Day 0)
2. Send connection (Day 1)
3. If accepted → Message 1 (Day 2)
4. If no reply → Message 2 (Day 5)
5. If no reply → Message 3 (Day 8)

**Acceptance Criteria:**
- [ ] Expandi connected safely
- [ ] 3 campaigns created
- [ ] Sequences loaded
- [ ] Daily limits set conservatively`,
            start_date: toISO(addDays(today, 15)),
            end_date: toISO(addDays(today, 18)),
            risk_level: 'High'
        },
        {
            title: '📧 Launch first automated email campaign',
            description: `Start automated email outreach via Instantly.

**Pre-Launch Checklist:**
- [ ] Email accounts warmed (2+ weeks)
- [ ] Deliverability test passed (mail-tester.com)
- [ ] Sequences loaded in Instantly
- [ ] Lead list uploaded and verified

**Campaign Settings:**
- Start slow: 20 emails/day per account
- Send window: 9am-5pm recipient time
- Days: Monday-Friday only
- Exclude weekends

**Lead List Requirements:**
- Verified emails only (Apollo verification)
- Company size match ICP
- Recent activity signals (hiring, funding, etc.)

**Monitoring:**
- Check bounce rate daily (<3% target)
- Monitor spam complaints
- Pause if deliverability drops

**Acceptance Criteria:**
- [ ] First 500 emails queued
- [ ] Sending at 20/day/account pace
- [ ] Open rate >40%
- [ ] Reply rate >5%`,
            start_date: toISO(addDays(today, 18)),
            end_date: toISO(addDays(today, 21)),
            risk_level: 'Medium'
        },
        {
            title: '🎯 Refine ICP based on first 10 calls',
            description: `After 10 discovery calls, refine target customer profile.

**Questions to Answer:**
1. Who was most excited about the product?
2. Who had budget and authority?
3. What specific pain points resonated?
4. Who said "this is exactly what I need"?

**Refinement Process:**
1. Score all 10 calls (1-5 on fit)
2. Identify patterns in top scores
3. Create "ideal customer" composite
4. Update targeting criteria

**Updated ICP Document:**
- Job title(s)
- Company size
- Industry
- Specific signals (hiring, AI interest, growth)
- Disqualification criteria

**Acceptance Criteria:**
- [ ] All 10 calls scored
- [ ] Patterns documented
- [ ] Updated ICP written
- [ ] Sales Navigator searches updated`,
            start_date: toISO(addDays(today, 21)),
            end_date: toISO(addDays(today, 23)),
            risk_level: 'Medium'
        },
        {
            title: '📝 Create case study from first pilot user',
            description: `Document the first successful user as social proof.

**Case Study Structure:**
1. **Company Background** (2-3 sentences)
2. **The Challenge** (What problem they faced)
3. **The Solution** (How CentaurOS helped)
4. **The Results** (Specific metrics if possible)
5. **Quote** (Direct testimonial)

**Getting Permission:**
1. Ask pilot user for feedback call
2. During call, ask if can share their story
3. Get written approval
4. Offer to anonymize if preferred

**Distribution:**
- Add to website
- Use in email sequences
- Share on LinkedIn
- Include in lead magnet

**Acceptance Criteria:**
- [ ] Case study written
- [ ] User approved
- [ ] Published on website
- [ ] Added to outreach materials`,
            start_date: toISO(addDays(today, 23)),
            end_date: toISO(addDays(today, 28)),
            risk_level: 'Medium'
        },
        {
            title: '📊 Week 4 metrics review + Month 2 planning',
            description: `Comprehensive review of Month 1 outreach.

**Metrics Summary:**
- Total LinkedIn connections sent: ___
- Connection acceptance rate: ___%
- Total messages sent: ___
- Reply rate: ___%
- Total emails sent: ___
- Email reply rate: ___%
- Discovery calls completed: ___
- Pilot users signed: ___

**CAC Calculation:**
- Total spend: $___
- Calls booked: ___
- Cost per call: $___
- Pilots signed: ___
- Cost per pilot: $___

**Month 2 Targets:**
Based on learnings, set realistic targets:
- Outreach volume increase: ___%
- Target calls: ___
- Target pilots: ___
- Target paying customers: ___

**Acceptance Criteria:**
- [ ] All metrics compiled
- [ ] CAC calculated
- [ ] Month 2 targets set
- [ ] Budget adjusted if needed`,
            start_date: toISO(addDays(today, 26)),
            end_date: toISO(addDays(today, 28)),
            risk_level: 'Low'
        },

        // ========================================
        // MONTH 2: SCALE WITH AUTOMATION (Days 29-60)
        // ========================================
        {
            title: '🚀 Scale LinkedIn automation to 75 connections/day',
            description: `Increase LinkedIn outreach volume safely.

**Scaling Process:**
1. Review account health (no warnings)
2. Gradually increase limits (+10/day per week)
3. Monitor acceptance rates
4. Watch for any LinkedIn warnings

**Weekly Scaling Schedule:**
- Week 5: 50 connections/day
- Week 6: 60 connections/day
- Week 7: 75 connections/day
- Week 8: Hold at 75, optimize

**Quality Checks:**
- Acceptance rate staying >25%
- Reply rate staying >10%
- No increase in "not interested" responses

**Acceptance Criteria:**
- [ ] Reached 75/day safely
- [ ] No account warnings
- [ ] Metrics stable or improving`,
            start_date: toISO(addDays(today, 28)),
            end_date: toISO(addDays(today, 56)),
            risk_level: 'High'
        },
        {
            title: '📧 Scale email to 100-150 sends/day',
            description: `Increase email outreach volume.

**Scaling Process:**
1. Add more email accounts if needed
2. Increase per-account limits gradually
3. Monitor deliverability closely
4. Rotate domains to prevent burnout

**Volume Targets:**
- Week 5: 50 emails/day
- Week 6: 75 emails/day
- Week 7: 100 emails/day
- Week 8: 150 emails/day

**Health Metrics:**
- Bounce rate <3%
- Spam complaint rate <0.1%
- Open rate >35%
- Reply rate >3%

**Acceptance Criteria:**
- [ ] Reached 150/day volume
- [ ] Deliverability maintained
- [ ] Reply quality still high`,
            start_date: toISO(addDays(today, 28)),
            end_date: toISO(addDays(today, 56)),
            risk_level: 'Medium'
        },
        {
            title: '🎯 A/B test 3 new message variations',
            description: `Test new messaging to improve response rates.

**Test Variables:**
1. **Subject lines** (email)
   - A: Question-based "Quick question about {Company}"
   - B: Value-based "Framework for {Company}'s team"
   - C: Curiosity "Noticed something about {Company}"

2. **Opening lines** (LinkedIn + email)
   - A: Compliment-first
   - B: Question-first
   - C: Observation-first

3. **CTAs**
   - A: "15 min call?"
   - B: "Quick chat?"
   - C: "Would love your feedback"

**Test Structure:**
- Split audience 50/50
- Run for 200+ sends each
- Measure: open rate, reply rate, positive reply rate

**Acceptance Criteria:**
- [ ] 3 A/B tests run
- [ ] Statistical significance reached
- [ ] Winning variations identified
- [ ] Templates updated`,
            start_date: toISO(addDays(today, 35)),
            end_date: toISO(addDays(today, 49)),
            risk_level: 'Low'
        },
        {
            title: '📞 Conduct 30+ discovery calls',
            description: `Execute high volume of discovery calls.

**Call Targets:**
- Week 5-6: 10 calls
- Week 7-8: 20 calls
- Total Month 2: 30+ calls

**Call Quality Checklist:**
- [ ] Personalized prep done
- [ ] Demo environment ready
- [ ] Questions tailored to their company
- [ ] Clear next steps proposed

**Post-Call Process:**
1. Send summary email within 24 hours
2. Add to CRM/tracking
3. Schedule follow-up if interested
4. Log objections/feedback

**Call Outcomes to Track:**
- Strong interest → Propose pilot
- Moderate interest → Nurture
- Not a fit → Learn why
- No-show → Reschedule once

**Acceptance Criteria:**
- [ ] 30+ calls completed
- [ ] All logged in tracking
- [ ] Conversion patterns identified
- [ ] 10+ moving to pilot`,
            start_date: toISO(addDays(today, 28)),
            end_date: toISO(addDays(today, 56)),
            risk_level: 'Medium'
        },
        {
            title: '🤝 Convert 10 discovery calls to pilot users',
            description: `Turn interested prospects into active pilot users.

**Pilot Offer:**
- 2-week free pilot of CentaurOS
- Full access to all features
- Direct Slack/email support from founder
- Feedback session at end

**Pilot Onboarding:**
1. Create their foundry account
2. 30-min onboarding call
3. Help create first objective + tasks
4. Introduce Ghost Agents
5. Check in at Day 3, Day 7, Day 14

**Success Criteria for Pilots:**
- Created at least 1 objective
- Assigned at least 5 tasks
- Used at least 1 AI feature
- Gave feedback in closing call

**Acceptance Criteria:**
- [ ] 10 pilots started
- [ ] All onboarded properly
- [ ] Day 3 and Day 7 check-ins done
- [ ] 7+ completing full 2 weeks`,
            start_date: toISO(addDays(today, 35)),
            end_date: toISO(addDays(today, 56)),
            risk_level: 'High'
        },

        // ========================================
        // MONTH 3: OPTIMIZE + FIRST REVENUE (Days 61-90)
        // ========================================
        {
            title: '💰 Convert 3-5 pilot users to paying customers',
            description: `Close first revenue from pilot conversions.

**Conversion Conversation:**
1. End-of-pilot feedback call
2. Ask what they'd miss without CentaurOS
3. Present pricing (if ready)
4. Handle objections
5. Close or set follow-up

**Pricing Options:**
- Starter: $49/seat/month
- Growth: $99/seat/month
- Custom: Enterprise pricing

**Objection Handling:**
- "Too expensive" → Show ROI, offer discount
- "Need more time" → Extend pilot 1 week
- "Need to check with team" → Schedule follow-up
- "Not the right time" → Nurture, check back in 30 days

**Acceptance Criteria:**
- [ ] All pilots have closing call
- [ ] 3-5 convert to paid
- [ ] First MRR achieved: $___
- [ ] Payment processing working`,
            start_date: toISO(addDays(today, 56)),
            end_date: toISO(addDays(today, 75)),
            risk_level: 'High'
        },
        {
            title: '📈 Reach $1,000 MRR milestone',
            description: `Hit first significant revenue milestone.

**MRR Calculation:**
- Customer 1: $__ x __ seats = $__/month
- Customer 2: $__ x __ seats = $__/month
- Customer 3: $__ x __ seats = $__/month
- Total MRR: $___

**If Behind Target:**
- Accelerate outreach volume
- Offer limited-time discount
- Add urgency (price increase coming)
- Ask for referrals from pilots

**If Ahead of Target:**
- Document what's working
- Prepare to scale
- Consider hiring help

**Acceptance Criteria:**
- [ ] $1,000+ MRR achieved
- [ ] All customers onboarded
- [ ] Payment recurring properly
- [ ] Churn risk assessed`,
            start_date: toISO(addDays(today, 60)),
            end_date: toISO(addDays(today, 90)),
            risk_level: 'High'
        },
        {
            title: '📊 Create Month 3 comprehensive report',
            description: `Full analysis of 90-day outbound campaign.

**Report Sections:**

1. **Executive Summary**
   - Total spend: $___
   - Total revenue: $___
   - ROI: ___%
   - Key learnings

2. **Channel Performance**
   - LinkedIn: connections, replies, calls, customers
   - Email: sent, opens, replies, calls, customers
   - Twitter: followers, engagement, DMs, customers

3. **Customer Acquisition Cost (CAC)**
   - Total spend / customers = CAC
   - By channel breakdown

4. **Conversion Funnel**
   - Outreach → Reply: ___%
   - Reply → Call: ___%
   - Call → Pilot: ___%
   - Pilot → Paid: ___%

5. **Recommendations**
   - What to scale
   - What to stop
   - New experiments to try

**Acceptance Criteria:**
- [ ] Full report written
- [ ] All metrics accurate
- [ ] Recommendations actionable
- [ ] Shared with stakeholders`,
            start_date: toISO(addDays(today, 85)),
            end_date: toISO(addDays(today, 90)),
            risk_level: 'Low'
        },
        {
            title: '🔄 Build repeatable outbound playbook',
            description: `Document everything that worked into a repeatable system.

**Playbook Contents:**

1. **ICP Definition** (final, validated)
2. **Lead Sourcing Process**
3. **Winning Message Templates**
4. **Optimal Sequence Timing**
5. **Tool Stack + Settings**
6. **Metrics + Benchmarks**
7. **Common Objections + Responses**
8. **Onboarding Process**
9. **Conversion Tactics**

**Purpose:**
- Enable founder to run consistently
- Document for future team members
- Create basis for scaling

**Acceptance Criteria:**
- [ ] Complete playbook written
- [ ] All templates included
- [ ] Metrics benchmarks set
- [ ] Ready to hand off`,
            start_date: toISO(addDays(today, 85)),
            end_date: toISO(addDays(today, 90)),
            risk_level: 'Low'
        }
    ]

    // 4. Insert all tasks
    console.log(`📝 Creating ${tasks.length} tasks...\n`)

    const tasksToInsert = tasks.map(task => ({
        title: task.title,
        description: task.description,
        objective_id: objective.id,
        creator_id: creatorId,
        foundry_id: foundryId,
        status: 'Pending' as const,
        assignee_id: creatorId, // Assign to founder
        start_date: task.start_date,
        end_date: task.end_date,
        risk_level: task.risk_level
    }))

    // Insert in chunks to avoid timeout
    const chunkSize = 10
    let insertedCount = 0

    for (let i = 0; i < tasksToInsert.length; i += chunkSize) {
        const chunk = tasksToInsert.slice(i, i + chunkSize)
        const { error: insertError } = await supabase.from('tasks').insert(chunk)
        
        if (insertError) {
            console.error(`❌ Failed to insert tasks ${i}-${i + chunk.length}:`, insertError)
        } else {
            insertedCount += chunk.length
            process.stdout.write(`  ✓ Inserted ${insertedCount}/${tasks.length} tasks\r`)
        }
    }

    console.log(`\n\n✅ Successfully created:`)
    console.log(`   - 1 Objective: "${objective.title}"`)
    console.log(`   - ${insertedCount} Tasks with dates from ${today.toDateString()} to ${addDays(today, 90).toDateString()}`)
    console.log(`\n🎯 View your GTM plan at: /objectives or /tasks`)
    console.log(`📅 View timeline at: /timeline\n`)
}

seedGTMPlan().catch(console.error)
