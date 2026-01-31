'use server'


import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { generateAdvisoryAnswer } from './generate-advisory-answer'

// Types
export interface AdvisoryQuestion {
    id: string
    foundry_id: string
    asked_by: string | null
    title: string
    body: string
    category: string | null
    tags: string[]
    visibility: 'foundry' | 'network'
    status: 'open' | 'answered' | 'verified' | 'closed'
    view_count: number
    created_at: string
    updated_at: string
    author?: {
        id: string
        full_name: string | null
        role: string | null
    }
    answer_count?: number
}

export interface AdvisoryAnswer {
    id: string
    question_id: string
    author_id: string | null
    author_type: 'ai' | 'human'
    body: string
    is_accepted: boolean
    verification_status: 'unverified' | 'endorsed' | 'verified' | 'disputed'
    verified_by: string | null
    verified_at: string | null
    upvotes: number
    marketplace_suggestions: MarketplaceSuggestion[] | null
    created_at: string
    updated_at: string
    author?: {
        id: string
        full_name: string | null
        role: string | null
    }
    verifier?: {
        id: string
        full_name: string | null
    }
}

export interface AdvisoryComment {
    id: string
    answer_id: string
    author_id: string | null
    body: string
    created_at: string
    author?: {
        id: string
        full_name: string | null
        role: string | null
    }
}

interface MarketplaceSuggestion {
    category: string
    subcategory?: string
    search_term: string
}

// ==========================================
// QUESTIONS
// ==========================================

/**
 * Create a new advisory question
 */
export async function createAdvisoryQuestion(data: {
    title: string
    body: string
    category?: string
    visibility?: 'foundry' | 'network'
    getAiAnswer?: boolean
}): Promise<{ data: AdvisoryQuestion | null; error: string | null; aiAnswerId?: string }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { data: null, error: 'Not authenticated' }

        const foundryId = await getFoundryIdCached()
        if (!foundryId) return { data: null, error: 'No foundry context' }

        // Create the question
        const { data: question, error } = await supabase
            .from('advisory_questions')
            .insert({
                foundry_id: foundryId,
                asked_by: user.id,
                title: data.title.trim(),
                body: data.body.trim(),
                category: data.category?.toLowerCase() || null,
                visibility: data.visibility || 'foundry',
                status: 'open'
            })
            .select()
            .single()

        if (error) {
            console.error('Error creating advisory question:', error)
            return { data: null, error: error.message }
        }

        let aiAnswerId: string | undefined

        // Generate AI answer if requested
        if (data.getAiAnswer) {
            const aiResult = await generateAdvisoryAnswer({
                question_title: data.title,
                question_body: data.body,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                category: data.category as any
            })

            if (aiResult.result && !aiResult.error) {
                const { data: aiAnswer } = await supabase
                    .from('advisory_answers')
                    .insert({
                        question_id: question.id,
                        author_id: null, // AI has no author_id
                        author_type: 'ai',
                        body: aiResult.result.answer,
                        verification_status: aiResult.result.needs_expert_review ? 'unverified' : 'endorsed',
                        marketplace_suggestions: aiResult.result.marketplace_suggestions || []
                    })
                    .select('id')
                    .single()

                if (aiAnswer) {
                    aiAnswerId = aiAnswer.id
                }
            }
        }

        revalidatePath('/advisory')
        return { 
            data: {
                ...question,
                tags: question.tags || []
            } as AdvisoryQuestion, 
            error: null,
            aiAnswerId
        }
    } catch (err) {
        console.error('Failed to create advisory question:', err)
        return { data: null, error: 'Failed to create question' }
    }
}

/**
 * Get advisory questions with optional filters
 */
export async function getAdvisoryQuestions(options?: {
    category?: string
    status?: string
    visibility?: 'foundry' | 'network' | 'all'
    limit?: number
    offset?: number
}): Promise<{ data: AdvisoryQuestion[]; error: string | null; total: number }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { data: [], error: 'Not authenticated', total: 0 }

        const foundryId = await getFoundryIdCached()

        let query = supabase
            .from('advisory_questions')
            .select(`
                *,
                author:profiles!advisory_questions_asked_by_fkey(id, full_name, role),
                answers:advisory_answers(count)
            `, { count: 'exact' })
            .order('created_at', { ascending: false })

        if (options?.category) {
            query = query.eq('category', options.category.toLowerCase())
        }

        if (options?.status) {
            query = query.eq('status', options.status)
        }

        // Visibility filter - RLS handles access control
        if (options?.visibility === 'foundry' && foundryId) {
            query = query.eq('foundry_id', foundryId)
        }

        if (options?.limit) {
            query = query.limit(options.limit)
        }

        if (options?.offset) {
            query = query.range(options.offset, options.offset + (options.limit || 10) - 1)
        }

        const { data, error, count } = await query

        if (error) {
            console.error('Error fetching advisory questions:', error)
            return { data: [], error: error.message, total: 0 }
        }

        return {
            data: (data || []).map(q => ({
                ...q,
                tags: q.tags || [],
                answer_count: q.answers?.[0]?.count || 0
            })) as AdvisoryQuestion[],
            error: null,
            total: count || 0
        }
    } catch (err) {
        console.error('Failed to fetch advisory questions:', err)
        return { data: [], error: 'Failed to fetch questions', total: 0 }
    }
}

/**
 * Get a single advisory question by ID
 */
export async function getAdvisoryQuestion(questionId: string): Promise<{ data: AdvisoryQuestion | null; error: string | null }> {
    try {
        const supabase = await createClient()

        // Increment view count using RPC
        await supabase.rpc('increment_question_views', { p_question_id: questionId })

        const { data, error } = await supabase
            .from('advisory_questions')
            .select(`
                *,
                author:profiles!advisory_questions_asked_by_fkey(id, full_name, role)
            `)
            .eq('id', questionId)
            .single()

        if (error) {
            console.error('Error fetching advisory question:', error)
            return { data: null, error: error.message }
        }

        return {
            data: {
                ...data,
                tags: data.tags || []
            } as AdvisoryQuestion,
            error: null
        }
    } catch (err) {
        console.error('Failed to fetch advisory question:', err)
        return { data: null, error: 'Failed to fetch question' }
    }
}

/**
 * Update an advisory question
 */
export async function updateAdvisoryQuestion(
    questionId: string,
    data: {
        title?: string
        body?: string
        category?: string
        status?: string
    }
): Promise<{ success: boolean; error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Not authenticated' }

        // SECURITY: Verify ownership before allowing update
        const { data: question, error: fetchError } = await supabase
            .from('advisory_questions')
            .select('asked_by')
            .eq('id', questionId)
            .single()

        if (fetchError || !question) {
            return { success: false, error: 'Question not found' }
        }

        if (question.asked_by !== user.id) {
            return { success: false, error: 'Not authorized to modify this question' }
        }

        const { error } = await supabase
            .from('advisory_questions')
            .update({
                ...(data.title && { title: data.title.trim() }),
                ...(data.body && { body: data.body.trim() }),
                ...(data.category && { category: data.category.toLowerCase() }),
                ...(data.status && { status: data.status })
            })
            .eq('id', questionId)

        if (error) {
            console.error('Error updating advisory question:', error)
            return { success: false, error: 'Failed to update question' }
        }

        revalidatePath('/advisory')
        return { success: true, error: null }
    } catch (err) {
        console.error('Failed to update advisory question:', err)
        return { success: false, error: 'Failed to update question' }
    }
}

/**
 * Delete an advisory question
 */
export async function deleteAdvisoryQuestion(questionId: string): Promise<{ success: boolean; error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Not authenticated' }

        // SECURITY: Verify ownership before allowing delete
        const { data: question, error: fetchError } = await supabase
            .from('advisory_questions')
            .select('asked_by')
            .eq('id', questionId)
            .single()

        if (fetchError || !question) {
            return { success: false, error: 'Question not found' }
        }

        if (question.asked_by !== user.id) {
            return { success: false, error: 'Not authorized to delete this question' }
        }

        const { error } = await supabase
            .from('advisory_questions')
            .delete()
            .eq('id', questionId)

        if (error) {
            console.error('Error deleting advisory question:', error)
            return { success: false, error: 'Failed to delete question' }
        }

        revalidatePath('/advisory')
        return { success: true, error: null }
    } catch (err) {
        console.error('Failed to delete advisory question:', err)
        return { success: false, error: 'Failed to delete question' }
    }
}

// ==========================================
// ANSWERS
// ==========================================

/**
 * Create an answer to a question
 */
export async function createAdvisoryAnswer(data: {
    questionId: string
    body: string
    authorType?: 'ai' | 'human'
    marketplaceSuggestions?: MarketplaceSuggestion[]
}): Promise<{ data: AdvisoryAnswer | null; error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { data: null, error: 'Not authenticated' }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: answer, error } = await (supabase as any)
            .from('advisory_answers')
            .insert({
                question_id: data.questionId,
                author_id: user.id,
                author_type: data.authorType || 'human',
                body: data.body.trim(),
                marketplace_suggestions: data.marketplaceSuggestions || []
            })
            .select()
            .single()

        if (error) {
            console.error('Error creating advisory answer:', error)
            return { data: null, error: error.message }
        }

        revalidatePath('/advisory')
        return { data: answer as AdvisoryAnswer, error: null }
    } catch (err) {
        console.error('Failed to create advisory answer:', err)
        return { data: null, error: 'Failed to create answer' }
    }
}

/**
 * Get answers for a question
 */
export async function getAdvisoryAnswers(questionId: string): Promise<{ data: AdvisoryAnswer[]; error: string | null }> {
    try {
        const supabase = await createClient()

        const { data, error } = await supabase
            .from('advisory_answers')
            .select(`
                *,
                author:profiles!advisory_answers_author_id_fkey(id, full_name, role),
                verifier:profiles!advisory_answers_verified_by_fkey(id, full_name)
            `)
            .eq('question_id', questionId)
            .order('is_accepted', { ascending: false })
            .order('upvotes', { ascending: false })
            .order('created_at', { ascending: true })

        if (error) {
            console.error('Error fetching advisory answers:', error)
            return { data: [], error: error.message }
        }

        return { data: (data || []) as unknown as AdvisoryAnswer[], error: null }
    } catch (err) {
        console.error('Failed to fetch advisory answers:', err)
        return { data: [], error: 'Failed to fetch answers' }
    }
}

/**
 * Accept an answer using the database function
 */
export async function acceptAdvisoryAnswer(answerId: string): Promise<{ success: boolean; error: string | null }> {
    try {
        const supabase = await createClient()

        const { error } = await supabase.rpc('accept_advisory_answer', { p_answer_id: answerId })

        if (error) {
            console.error('Error accepting advisory answer:', error)
            return { success: false, error: error.message }
        }

        revalidatePath('/advisory')
        return { success: true, error: null }
    } catch (err) {
        console.error('Failed to accept advisory answer:', err)
        return { success: false, error: 'Failed to accept answer' }
    }
}

/**
 * Verify an answer using the database function
 */
export async function verifyAdvisoryAnswer(
    answerId: string,
    status: 'unverified' | 'endorsed' | 'verified' | 'disputed'
): Promise<{ success: boolean; error: string | null }> {
    try {
        const supabase = await createClient()

        const { error } = await supabase.rpc('verify_advisory_answer', { 
            p_answer_id: answerId,
            p_status: status
        })

        if (error) {
            console.error('Error verifying advisory answer:', error)
            return { success: false, error: error.message }
        }

        revalidatePath('/advisory')
        return { success: true, error: null }
    } catch (err) {
        console.error('Failed to verify advisory answer:', err)
        return { success: false, error: 'Failed to verify answer' }
    }
}

// ==========================================
// COMMENTS
// ==========================================

/**
 * Add a comment to an answer
 */
export async function addAdvisoryComment(data: {
    answerId: string
    body: string
}): Promise<{ data: AdvisoryComment | null; error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { data: null, error: 'Not authenticated' }

        const { data: comment, error } = await supabase
            .from('advisory_comments')
            .insert({
                answer_id: data.answerId,
                author_id: user.id,
                body: data.body.trim()
            })
            .select(`
                *,
                author:profiles!advisory_comments_author_id_fkey(id, full_name, role)
            `)
            .single()

        if (error) {
            console.error('Error adding advisory comment:', error)
            return { data: null, error: error.message }
        }

        revalidatePath('/advisory')
        return { data: comment as AdvisoryComment, error: null }
    } catch (err) {
        console.error('Failed to add advisory comment:', err)
        return { data: null, error: 'Failed to add comment' }
    }
}

/**
 * Get comments for an answer
 */
export async function getAdvisoryComments(answerId: string): Promise<{ data: AdvisoryComment[]; error: string | null }> {
    try {
        const supabase = await createClient()

        const { data, error } = await supabase
            .from('advisory_comments')
            .select(`
                *,
                author:profiles!advisory_comments_author_id_fkey(id, full_name, role)
            `)
            .eq('answer_id', answerId)
            .order('created_at', { ascending: true })

        if (error) {
            console.error('Error fetching advisory comments:', error)
            return { data: [], error: error.message }
        }

        return { data: (data || []) as AdvisoryComment[], error: null }
    } catch (err) {
        console.error('Failed to fetch advisory comments:', err)
        return { data: [], error: 'Failed to fetch comments' }
    }
}

// ==========================================
// VOTING
// ==========================================

/**
 * Vote on an answer
 */
export async function voteOnAnswer(
    answerId: string,
    voteType: 'up' | 'down'
): Promise<{ success: boolean; error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Not authenticated' }

        // Check if user already voted
        const { data: existingVote } = await supabase
            .from('advisory_votes')
            .select('id, vote_type')
            .eq('answer_id', answerId)
            .eq('user_id', user.id)
            .single()

        if (existingVote) {
            if (existingVote.vote_type === voteType) {
                // Remove vote if same type
                const { error } = await supabase
                    .from('advisory_votes')
                    .delete()
                    .eq('id', existingVote.id)

                if (error) return { success: false, error: error.message }
            } else {
                // Update vote if different type
                const { error } = await supabase
                    .from('advisory_votes')
                    .update({ vote_type: voteType })
                    .eq('id', existingVote.id)

                if (error) return { success: false, error: error.message }
            }
        } else {
            // Create new vote
            const { error } = await supabase
                .from('advisory_votes')
                .insert({
                    answer_id: answerId,
                    user_id: user.id,
                    vote_type: voteType
                })

            if (error) return { success: false, error: error.message }
        }

        revalidatePath('/advisory')
        return { success: true, error: null }
    } catch (err) {
        console.error('Failed to vote on answer:', err)
        return { success: false, error: 'Failed to register vote' }
    }
}

/**
 * Get user's vote on an answer
 */
export async function getUserVote(answerId: string): Promise<{ voteType: 'up' | 'down' | null; error: string | null }> {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { voteType: null, error: 'Not authenticated' }

        const { data, error } = await supabase
            .from('advisory_votes')
            .select('vote_type')
            .eq('answer_id', answerId)
            .eq('user_id', user.id)
            .single()

        if (error && error.code !== 'PGRST116') {
            return { voteType: null, error: error.message }
        }

        return { voteType: data?.vote_type as 'up' | 'down' | null, error: null }
    } catch (err) {
        console.error('Failed to get user vote:', err)
        return { voteType: null, error: 'Failed to get vote' }
    }
}

// ==========================================
// SUMMARY / STATS
// ==========================================

/**
 * Get advisory forum summary/stats
 */
export async function getAdvisorySummary(): Promise<{
    data: {
        totalQuestions: number
        openQuestions: number
        answeredQuestions: number
        verifiedQuestions: number
        popularCategories: { category: string; count: number }[]
        recentQuestions: AdvisoryQuestion[]
    } | null
    error: string | null
}> {
    try {
        const supabase = await createClient()
        const foundryId = await getFoundryIdCached()

        // Get counts by status
        const { data: statusCounts } = await supabase
            .from('advisory_questions')
            .select('status')

        const openQuestions = statusCounts?.filter(q => q.status === 'open').length || 0
        const answeredQuestions = statusCounts?.filter(q => q.status === 'answered').length || 0
        const verifiedQuestions = statusCounts?.filter(q => q.status === 'verified').length || 0

        // Get category counts
        const { data: categoryCounts } = await supabase
            .from('advisory_questions')
            .select('category')

        const categoryMap = new Map<string, number>()
        categoryCounts?.forEach(q => {
            if (q.category) {
                categoryMap.set(q.category, (categoryMap.get(q.category) || 0) + 1)
            }
        })

        const popularCategories = Array.from(categoryMap.entries())
            .map(([category, count]) => ({ category, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5)

        // Get recent questions
        const { data: recentQuestions } = await supabase
            .from('advisory_questions')
            .select(`
                *,
                author:profiles!advisory_questions_asked_by_fkey(id, full_name, role)
            `)
            .order('created_at', { ascending: false })
            .limit(5)

        return {
            data: {
                totalQuestions: statusCounts?.length || 0,
                openQuestions,
                answeredQuestions,
                verifiedQuestions,
                popularCategories,
                recentQuestions: (recentQuestions || []).map(q => ({
                    ...q,
                    tags: q.tags || []
                })) as AdvisoryQuestion[]
            },
            error: null
        }
    } catch (err) {
        console.error('Failed to get advisory summary:', err)
        return { data: null, error: 'Failed to get summary' }
    }
}
