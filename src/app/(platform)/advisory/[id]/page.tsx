import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { QuestionDetailView } from './question-detail-view'

// Revalidate every 30 seconds
export const revalidate = 30

interface Props {
    params: Promise<{ id: string }>
}

export default async function QuestionDetailPage({ params }: Props) {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Get current user profile
    const { data: currentUserProfile } = await supabase
        .from('profiles')
        .select('id, foundry_id, role')
        .eq('id', user.id)
        .single()

    const currentUserRole = currentUserProfile?.role

    // Fetch question - for now return mock data since table doesn't exist yet
    // In production, this would query the advisory_questions table
    const question = getMockQuestionById(id)

    if (!question) {
        notFound()
    }

    // Get members for mentions
    const { data: membersData } = await supabase
        .from('profiles')
        .select('id, full_name, role, email')

    const members = (membersData || []).map(p => ({
        id: p.id,
        full_name: p.full_name || 'Unknown',
        role: p.role,
        email: p.email
    }))

    return (
        <QuestionDetailView
            question={question}
            members={members}
            currentUserId={user.id}
            currentUserRole={currentUserRole}
        />
    )
}

// Mock data for development - replace with real database queries
function getMockQuestionById(id: string) {
    const questions = {
        "1": {
            id: "1",
            title: "What are the key financial metrics I should track for my SaaS startup?",
            body: `I'm running a B2B SaaS startup and want to understand which financial metrics are most important for tracking health and growth.

We're currently at about $50K MRR and growing ~15% month over month. I want to make sure we're tracking the right things as we prepare for Series A conversations.

Specifically interested in:
- Which metrics do investors care most about?
- How should we benchmark against industry standards?
- What tools/dashboards do you recommend for tracking?`,
            category: "Finance",
            visibility: "public" as const,
            created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            asker: {
                id: "user-1",
                full_name: "Alex Chen",
                role: "Founder"
            },
            verification_status: "verified" as const,
            upvotes: 24,
            answers_count: 3,
            views: 156,
            answers: [
                {
                    id: "answer-1",
                    content: `For a B2B SaaS startup at your stage, here are the critical financial metrics to track:

**Core Revenue Metrics:**
1. **Monthly Recurring Revenue (MRR)** - Your baseline metric. Track net new MRR, expansion MRR, and churned MRR separately.
2. **Annual Recurring Revenue (ARR)** - MRR × 12. This is what investors typically reference.
3. **Net Revenue Retention (NRR)** - Should be >100%, ideally >120% for best-in-class B2B SaaS.

**Unit Economics:**
4. **Customer Acquisition Cost (CAC)** - Include all sales & marketing costs divided by new customers.
5. **Lifetime Value (LTV)** - (ARPU × Gross Margin) / Monthly Churn Rate
6. **LTV:CAC Ratio** - Target 3:1 or higher. Below 3:1 may indicate unsustainable growth.
7. **CAC Payback Period** - Months to recover acquisition cost. Under 12 months is good.

**Growth & Efficiency:**
8. **Month-over-Month Growth Rate** - Your 15% is excellent for this stage.
9. **Burn Multiple** - Net Burn / Net New ARR. Under 2x is efficient.
10. **Rule of 40** - Growth Rate + Profit Margin should exceed 40%.

**For Series A preparation specifically:**
- Investors will scrutinize your cohort retention curves
- Show progression of NRR over time
- Demonstrate improving unit economics as you scale

**Recommended Tools:**
- ChartMogul or Baremetrics for subscription analytics
- Stripe Sigma for payment data
- Build a custom dashboard in Metabase or Looker for combined view`,
                    is_ai_generated: true,
                    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000 + 5 * 60 * 1000).toISOString(),
                    verification_status: "verified" as const,
                    verification_note: "Comprehensive and accurate overview of SaaS metrics. The LTV:CAC and NRR benchmarks align with current market expectations for Series A companies.",
                    verified_by: {
                        id: "verifier-1",
                        full_name: "Sarah Martinez"
                    },
                    verified_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
                    upvotes: 18,
                    downvotes: 1,
                    user_vote: null,
                    author: {
                        id: "ai",
                        full_name: "AI Assistant",
                        role: "AI_Agent"
                    },
                    comments: [
                        {
                            id: "comment-1",
                            content: "Great breakdown! I'd also add Magic Number (Net New ARR / S&M Spend) as a metric VCs increasingly ask about.",
                            created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
                            user: {
                                id: "user-5",
                                full_name: "David Kim",
                                role: "Executive"
                            }
                        }
                    ]
                },
                {
                    id: "answer-2",
                    content: `I'll add a practical perspective from my experience raising Series A last year.

The metrics the AI outlined are spot-on, but here's what actually came up most in investor conversations:

1. **Cohort Analysis** - Show how different customer cohorts retain and expand over time. Monthly cohorts for at least 12 months.

2. **Gross Margin** - Make sure you're accounting for customer success and support costs properly. Target >70%.

3. **Logo vs Revenue Churn** - Track both. Revenue churn should be lower than logo churn if you're doing expansion right.

4. **Sales Efficiency** - How much ARR does each sales rep produce? What's the ramp time for new reps?

One thing that helped us: create a "metrics Bible" document that defines exactly how you calculate each metric. Investors appreciate consistency and transparency.`,
                    is_ai_generated: false,
                    created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
                    verification_status: "endorsed" as const,
                    upvotes: 12,
                    downvotes: 0,
                    user_vote: null,
                    author: {
                        id: "user-6",
                        full_name: "Jennifer Wu",
                        role: "Founder"
                    },
                    comments: []
                }
            ]
        },
        "2": {
            id: "2",
            title: "How should I structure equity distribution among co-founders?",
            body: "We're a team of 3 co-founders starting a tech company. One is technical, one handles business, and one is part-time. How do we fairly split equity?",
            category: "Legal",
            visibility: "foundry" as const,
            created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            asker: {
                id: "user-2",
                full_name: "Sarah Johnson",
                role: "Founder"
            },
            verification_status: "endorsed" as const,
            upvotes: 18,
            answers_count: 5,
            views: 89,
            answers: [
                {
                    id: "answer-3",
                    content: `Equity distribution among co-founders should consider several key factors. Here's a framework to guide your decision:

**Key Factors to Consider:**

1. **Time Commitment**
   - Full-time founders typically receive more equity
   - Part-time commitment (your third co-founder) should be reflected proportionally
   - Consider using a "full-time equivalent" calculation

2. **Role Criticality**
   - Is the technical or business role more critical at this stage?
   - Who has skills that are harder to replace?

3. **Idea Origination**
   - Did one person bring the core idea and initial validation?
   - Be careful not to over-weight this—execution matters more

4. **Experience & Network**
   - Relevant domain expertise
   - Investor relationships
   - Key customer connections

5. **Capital Contribution**
   - Cash invested should be handled separately from sweat equity
   - Consider convertible notes for cash contributions

**Recommended Approach:**

For your situation (2 full-time, 1 part-time), a common structure might be:
- Technical Co-founder: 35-40%
- Business Co-founder: 35-40%
- Part-time Co-founder: 15-25%

**Critical: Use Vesting**
- Standard 4-year vesting with 1-year cliff
- All founders should vest, including the one with the idea
- This protects everyone if someone leaves early

**Dynamic Equity Alternative:**
Consider the Slicing Pie model for early stage—contributions are tracked and equity is calculated dynamically until a triggering event.`,
                    is_ai_generated: true,
                    created_at: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(),
                    verification_status: "endorsed" as const,
                    upvotes: 14,
                    downvotes: 2,
                    user_vote: null,
                    author: {
                        id: "ai",
                        full_name: "AI Assistant",
                        role: "AI_Agent"
                    },
                    comments: []
                }
            ]
        }
    }

    return questions[id as keyof typeof questions] || null
}
