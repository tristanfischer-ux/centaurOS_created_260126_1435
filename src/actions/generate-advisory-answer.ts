"use server"

import OpenAI from 'openai'
import {
    GenerateAnswerInput,
    GenerateAnswerResult,
    StructuredAnswer,
    ConfidenceLevel,
    AdvisoryCategory
} from '@/types/advisory'

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "dummy-key-for-build",
})

/**
 * Generates an AI-powered answer to an advisory question.
 * Designed for founders of fractional businesses seeking guidance on 
 * legal, finance, HR, operations, and general business questions.
 */
export async function generateAdvisoryAnswer(
    input: GenerateAnswerInput
): Promise<{ result?: GenerateAnswerResult; error?: string }> {
    try {
        if (!input.question_title || input.question_title.trim().length < 5) {
            return { error: 'Please provide a question title (at least 5 characters)' }
        }

        if (!input.question_body || input.question_body.trim().length < 10) {
            return { error: 'Please provide more details about your question (at least 10 characters)' }
        }

        const systemPrompt = `You are an expert advisor for startup founders and operators of fractional/distributed businesses. Your role is to provide helpful, accurate, and actionable guidance.

Guidelines:
1. Be direct and practical - founders are time-constrained
2. Provide specific steps when possible, not just general advice
3. Flag when professional help (lawyer, accountant, etc.) is needed
4. Consider the context of early-stage companies with limited resources
5. If the question touches on legal, tax, or medical topics, include appropriate disclaimers
6. Be honest about your confidence level - don't pretend to know things you don't

For each answer, assess:
- Confidence level: 'high' (well-established best practices), 'medium' (generally accepted but varies), 'low' (complex/depends heavily on specifics)
- Whether it needs expert review (legal, tax, or high-stakes decisions)
- Any important caveats or considerations

Return ONLY a raw JSON object (no markdown formatting) with this structure:
{
    "answer": "Your comprehensive answer here (can be multiple paragraphs, use \\n for line breaks)",
    "confidence": "high" | "medium" | "low",
    "reasoning": "Brief explanation of why you're confident or not (1-2 sentences)",
    "caveats": ["Important caveat 1", "Important caveat 2"],
    "follow_up_questions": ["Question they might want to ask next"],
    "suggested_category": "Legal" | "Finance" | "HR" | "Operations" | "Strategy" | "Fundraising" | "Product" | "Marketing" | "Sales" | "Technical" | "General",
    "extracted_tags": ["tag1", "tag2"],
    "needs_expert_review": true | false,
    "expert_review_reason": "Why they should consult an expert (if applicable)",
    "marketplace_suggestions": [
        {
            "category": "People" | "Services" | "AI" | "Products",
            "subcategory": "Optional subcategory",
            "search_term": "What to search for"
        }
    ]
}`

        const contextSection = input.foundry_context ? `
Context about the business:
- Industry: ${input.foundry_context.industry || 'Not specified'}
- Stage: ${input.foundry_context.stage || 'Not specified'}
- Team Size: ${input.foundry_context.team_size || 'Not specified'}
- Location: ${input.foundry_context.location || 'Not specified'}` : ''

        const previousContext = input.previous_answers?.length 
            ? `\nPrevious answers in this conversation:\n${input.previous_answers.join('\n---\n')}`
            : ''

        const userPrompt = `Question Title: ${input.question_title}

Question Details:
${input.question_body}

${input.category ? `Category: ${input.category}` : ''}
${contextSection}
${previousContext}

Please provide a helpful, practical answer for a startup founder.`

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.7,
        })

        if (!completion.choices || completion.choices.length === 0) {
            return { error: 'AI returned no response' }
        }

        const content = completion.choices[0].message.content
        if (!content) {
            return { error: 'AI returned empty content' }
        }

        // Clean up potential markdown formatting
        const cleanedContent = content.replace(/```json/g, '').replace(/```/g, '').trim()

        try {
            const parsed = JSON.parse(cleanedContent)

            // Validate and type the response
            const result: GenerateAnswerResult = {
                answer: String(parsed.answer || 'Unable to generate an answer'),
                confidence: validateConfidence(parsed.confidence),
                reasoning: String(parsed.reasoning || ''),
                caveats: Array.isArray(parsed.caveats) 
                    ? parsed.caveats.map((c: unknown) => String(c))
                    : undefined,
                follow_up_questions: Array.isArray(parsed.follow_up_questions)
                    ? parsed.follow_up_questions.map((q: unknown) => String(q))
                    : undefined,
                suggested_category: validateCategory(parsed.suggested_category),
                extracted_tags: Array.isArray(parsed.extracted_tags)
                    ? parsed.extracted_tags.map((t: unknown) => String(t))
                    : undefined,
                needs_expert_review: Boolean(parsed.needs_expert_review),
                expert_review_reason: parsed.expert_review_reason 
                    ? String(parsed.expert_review_reason)
                    : undefined,
                marketplace_suggestions: Array.isArray(parsed.marketplace_suggestions)
                    ? parsed.marketplace_suggestions.map((s: Record<string, unknown>) => ({
                        category: String(s.category || 'Services'),
                        subcategory: s.subcategory ? String(s.subcategory) : undefined,
                        search_term: String(s.search_term || '')
                    }))
                    : undefined
            }

            return { result }
        } catch (parseError) {
            console.error('Failed to parse AI response:', parseError)
            return { error: 'Failed to parse AI response. Please try again.' }
        }

    } catch (error) {
        console.error('Advisory answer generation failed:', error)
        return { error: 'Failed to generate answer. Please try again.' }
    }
}

/**
 * Generates a structured answer with clear sections (summary, details, action items)
 */
export async function generateStructuredAnswer(
    input: GenerateAnswerInput
): Promise<{ result?: StructuredAnswer; error?: string }> {
    try {
        if (!input.question_title || !input.question_body) {
            return { error: 'Question title and body are required' }
        }

        const systemPrompt = `You are an expert advisor for startup founders. Provide a well-structured answer with clear sections.

Return ONLY a raw JSON object with this structure:
{
    "summary": "2-3 sentence TL;DR",
    "detailed_answer": "Full explanation (multiple paragraphs, use \\n for line breaks)",
    "action_items": ["Specific step 1", "Specific step 2", "..."],
    "considerations": ["Thing to keep in mind 1", "..."],
    "resources": [
        {
            "title": "Resource name",
            "url": "https://... (if available)",
            "description": "Why this is useful"
        }
    ],
    "disclaimer": "Any legal/professional disclaimer if needed"
}`

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Question: ${input.question_title}\n\nDetails: ${input.question_body}` }
            ],
            temperature: 0.7,
        })

        const content = completion.choices[0]?.message?.content
        if (!content) {
            return { error: 'No response from AI' }
        }

        const cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim()
        const parsed = JSON.parse(cleaned)

        const result: StructuredAnswer = {
            summary: String(parsed.summary || ''),
            detailed_answer: String(parsed.detailed_answer || ''),
            action_items: Array.isArray(parsed.action_items)
                ? parsed.action_items.map((i: unknown) => String(i))
                : undefined,
            considerations: Array.isArray(parsed.considerations)
                ? parsed.considerations.map((c: unknown) => String(c))
                : undefined,
            resources: Array.isArray(parsed.resources)
                ? parsed.resources.map((r: Record<string, unknown>) => ({
                    title: String(r.title || ''),
                    url: r.url ? String(r.url) : undefined,
                    description: String(r.description || '')
                }))
                : undefined,
            disclaimer: parsed.disclaimer ? String(parsed.disclaimer) : undefined
        }

        return { result }
    } catch (error) {
        console.error('Structured answer generation failed:', error)
        return { error: 'Failed to generate structured answer' }
    }
}

/**
 * Suggests a category for a question based on its content
 */
export async function suggestQuestionCategory(
    title: string,
    body: string
): Promise<{ category?: AdvisoryCategory; tags?: string[]; error?: string }> {
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { 
                    role: "system", 
                    content: `Categorize this question into one of: Legal, Finance, HR, Operations, Strategy, Fundraising, Product, Marketing, Sales, Technical, General.
Also extract 2-4 relevant tags.
Return JSON only: { "category": "...", "tags": ["...", "..."] }` 
                },
                { role: "user", content: `Title: ${title}\n\nBody: ${body}` }
            ],
            temperature: 0.3,
        })

        const content = completion.choices[0]?.message?.content
        if (!content) {
            return { category: 'General', tags: [] }
        }

        const cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim()
        const parsed = JSON.parse(cleaned)

        return {
            category: validateCategory(parsed.category),
            tags: Array.isArray(parsed.tags) ? parsed.tags.map((t: unknown) => String(t)) : []
        }
    } catch {
        return { category: 'General', tags: [] }
    }
}

// Helper to validate confidence level
function validateConfidence(confidence: unknown): ConfidenceLevel {
    const valid: ConfidenceLevel[] = ['high', 'medium', 'low']
    return valid.includes(confidence as ConfidenceLevel) ? confidence as ConfidenceLevel : 'medium'
}

// Helper to validate category
function validateCategory(category: unknown): AdvisoryCategory {
    const valid: AdvisoryCategory[] = [
        'Legal', 'Finance', 'HR', 'Operations', 'Strategy', 
        'Fundraising', 'Product', 'Marketing', 'Sales', 'Technical', 'General'
    ]
    return valid.includes(category as AdvisoryCategory) ? category as AdvisoryCategory : 'General'
}
