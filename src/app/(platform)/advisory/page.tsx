import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdvisoryView } from './advisory-view'

// Revalidate every 60 seconds
export const revalidate = 60

export default async function AdvisoryPage() {
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
    const foundryId = currentUserProfile?.foundry_id

    // Fetch questions - for now return mock data since table doesn't exist yet
    // In production, this would query the advisory_questions table
    const questions = getMockQuestions()

    // Get members for the foundry (for mentions, etc.)
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
        <AdvisoryView
            questions={questions}
            members={members}
            currentUserId={user.id}
            currentUserRole={currentUserRole}
            foundryId={foundryId}
        />
    )
}

// Mock data for development - replace with real database queries
function getMockQuestions() {
    return [
        {
            id: "1",
            title: "What are the key financial metrics I should track for my SaaS startup?",
            body: "I'm running a B2B SaaS startup and want to understand which financial metrics are most important for tracking health and growth.",
            category: "Finance",
            visibility: "public" as const,
            created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
            asker: {
                id: "user-1",
                full_name: "Alex Chen",
            },
            ai_answer: "For a B2B SaaS startup, the most critical financial metrics to track include: Monthly Recurring Revenue (MRR), Annual Recurring Revenue (ARR), Customer Acquisition Cost (CAC), Lifetime Value (LTV), Churn Rate, and the LTV:CAC ratio which should ideally be 3:1 or higher...",
            verification_status: "verified" as const,
            upvotes: 24,
            answers_count: 3,
            views: 156,
        },
        {
            id: "2",
            title: "How should I structure equity distribution among co-founders?",
            body: "We're a team of 3 co-founders starting a tech company. One is technical, one handles business, and one is part-time. How do we fairly split equity?",
            category: "Legal",
            visibility: "foundry" as const,
            created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
            asker: {
                id: "user-2",
                full_name: "Sarah Johnson",
            },
            ai_answer: "Equity distribution among co-founders should consider several factors: time commitment, capital contribution, idea origination, relevant expertise, and opportunity cost. A common approach is to use a dynamic equity split or vesting schedule...",
            verification_status: "endorsed" as const,
            upvotes: 18,
            answers_count: 5,
            views: 89,
        },
        {
            id: "3",
            title: "Best practices for enterprise sales cycle management?",
            body: "We're selling to enterprise clients with 6-12 month sales cycles. What are the best practices for managing these long cycles effectively?",
            category: "Sales",
            visibility: "public" as const,
            created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
            asker: {
                id: "user-3",
                full_name: "Michael Park",
            },
            ai_answer: "Managing enterprise sales cycles requires a structured approach: implement a multi-threaded engagement strategy, establish clear milestones and decision criteria, maintain regular touchpoints, and leverage champions within the organization...",
            verification_status: "unverified" as const,
            upvotes: 12,
            answers_count: 2,
            views: 67,
        },
        {
            id: "4",
            title: "What hiring strategies work best for early-stage startups?",
            body: "We need to make our first 5 hires but have limited budget and brand recognition. How do we attract top talent?",
            category: "HR",
            visibility: "public" as const,
            created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
            asker: {
                id: "user-4",
                full_name: "Emma Williams",
            },
            ai_answer: "Early-stage hiring success depends on leveraging your unique advantages: offer meaningful equity, emphasize impact and learning opportunities, tap into your network for referrals, and be transparent about both challenges and opportunities...",
            verification_status: "verified" as const,
            upvotes: 31,
            answers_count: 8,
            views: 234,
        },
        {
            id: "5",
            title: "How to implement OKRs effectively in a small team?",
            body: "I've read about OKRs but struggling to implement them in our 10-person startup. They seem designed for larger companies.",
            category: "Operations",
            visibility: "foundry" as const,
            created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
            asker: {
                id: "user-5",
                full_name: "David Kim",
            },
            ai_answer: "OKRs can be highly effective for small teams when adapted appropriately. Start with company-level OKRs, limit to 3-5 objectives per quarter, keep key results measurable but not overly complex, and conduct lightweight weekly check-ins...",
            verification_status: "endorsed" as const,
            upvotes: 15,
            answers_count: 4,
            views: 112,
        },
    ]
}
