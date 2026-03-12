import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { Json } from "@/types/database.types";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/security/rate-limit";
import { buildAIContext } from "@/lib/ai-context/builder";
import { aiGuard } from "@/lib/ai/guard";

// SECURITY: Zod schema for input validation
const MarketplaceListingSchema = z.object({
    id: z.string().min(1),
    category: z.enum(["People", "Products", "Services"]),
    subcategory: z.string(),
    title: z.string().min(1).max(500),
    description: z.string().max(5000).nullable(),
    attributes: z.record(z.string(), z.unknown()).nullable(),
});

const CompareRequestSchema = z.object({
    items: z.array(MarketplaceListingSchema).min(2).max(3),
    foundryContext: z.object({
        industry: z.string().optional(),
        stage: z.string().optional(),
    }).optional(),
});

let openaiClient: OpenAI | null = null

function getOpenAIClient(): OpenAI | null {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
        return null
    }

    if (!openaiClient) {
        openaiClient = new OpenAI({ apiKey })
    }

    return openaiClient
}

// Types for the comparison request/response
export interface MarketplaceListingInput {
    id: string;
    category: "People" | "Products" | "Services";
    subcategory: string;
    title: string;
    description: string | null;
    attributes: Json | null;
}

export interface FoundryContext {
    industry?: string;
    stage?: string;
}

export interface CompareRequest {
    items: MarketplaceListingInput[];
    foundryContext?: FoundryContext;
}

export interface CompareResponse {
    winner: string;
    winnerTitle: string;
    reasoning: string;
    tradeoffs: string[];
    summary: string;
}

export async function POST(req: NextRequest) {
    try {
        // Validate API key is present
        if (!process.env.OPENAI_API_KEY) {
            console.error('OPENAI_API_KEY is not configured');
            return NextResponse.json(
                { error: "AI comparison service is not configured" },
                { status: 503 }
            );
        }

        const openai = getOpenAIClient()
        if (!openai) {
            return NextResponse.json(
                { error: "AI comparison service is not configured" },
                { status: 503 }
            );
        }
        
        const supabase = await createClient()
        const guard = await aiGuard(supabase, 'comparison_assistant')
        if (guard.denied) return guard.response
        const user = { id: guard.userId }

        // SECURITY: Rate limit to prevent OpenAI cost abuse (5 requests per minute per user)
        const rateLimitResult = await rateLimit('api', `compare:${user.id}`, { limit: 5, window: 60 * 1000 })
        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: "Rate limit exceeded. Please wait before comparing again." },
                { status: 429 }
            );
        }

        // SECURITY: Validate request body with Zod
        const body = await req.json();
        const validation = CompareRequestSchema.safeParse(body);
        
        if (!validation.success) {
            return NextResponse.json(
                { error: "Invalid request data" },
                { status: 400 }
            );
        }
        
        const { items, foundryContext } = validation.data;

        // Build the prompt
        const systemPrompt = `You are an expert advisor helping startup founders and operators of fractional/distributed businesses evaluate marketplace options.

Your task is to analyze the provided marketplace listings and recommend which one would be the best fit, considering:
1. Value for money
2. Relevance to the business context (if provided)
3. Quality indicators (experience, reviews, verified status)
4. Trade-offs between options

Guidelines:
- Be direct and practical - founders are time-constrained
- Consider the context of early-stage companies with limited resources
- Provide specific, actionable reasoning
- Be honest about trade-offs - there's rarely a "perfect" choice

Return ONLY a raw JSON object (no markdown formatting) with this exact structure:
{
    "winner": "item-id-here",
    "winnerTitle": "Full title of the winning item",
    "reasoning": "2-3 sentences explaining why this is the best choice for their situation",
    "tradeoffs": ["Trade-off 1: Winner advantage vs alternative disadvantage", "Trade-off 2: ..."],
    "summary": "One sentence bottom-line recommendation with situational nuance"
}`;

        // Format items for the prompt
        const itemsDescription = items.map((item, index) => {
            const attributesStr = item.attributes 
                ? `\n   Attributes: ${JSON.stringify(item.attributes, null, 2)}`
                : "";
            
            return `${index + 1}. **${item.title}** (ID: ${item.id})
   Category: ${item.category} > ${item.subcategory}
   Description: ${item.description || "No description provided"}${attributesStr}`;
        }).join("\n\n");

        // Build rich company context from the AI Context Builder
        let contextSection = ''
        const { data: userProfile } = await supabase
            .from('profiles')
            .select('foundry_id')
            .eq('id', user.id)
            .single()

        if (userProfile?.foundry_id) {
            contextSection = await buildAIContext(userProfile.foundry_id, user.id, {
                includeActivity: false, // Keep comparison fast
                includeObjectives: true,
            })
        }

        // Fallback to legacy context if no AI context was built
        if (!contextSection && foundryContext) {
            contextSection = `\nBusiness Context:
- Industry: ${foundryContext.industry || "Not specified"}
- Stage: ${foundryContext.stage || "Not specified"}`
        }

        const userPrompt = `Please compare these ${items.length} marketplace listings and recommend the best option:

${itemsDescription}
${contextSection}

Analyze these options and provide your recommendation.`;

        // Call OpenAI
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.7,
        });

        guard.trackUsage({
            model: 'gpt-4o',
            promptTokens: completion.usage?.prompt_tokens,
            completionTokens: completion.usage?.completion_tokens,
        }).catch(() => {})

        if (!completion.choices || completion.choices.length === 0) {
            return NextResponse.json(
                { error: "AI returned no response" },
                { status: 500 }
            );
        }

        const content = completion.choices[0].message.content;
        if (!content) {
            return NextResponse.json(
                { error: "AI returned empty content" },
                { status: 500 }
            );
        }

        // Clean up potential markdown formatting
        const cleanedContent = content
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();

        try {
            const parsed = JSON.parse(cleanedContent);

            // Validate the response structure
            const response: CompareResponse = {
                winner: String(parsed.winner || items[0].id),
                winnerTitle: String(parsed.winnerTitle || items[0].title),
                reasoning: String(parsed.reasoning || "Unable to generate reasoning"),
                tradeoffs: Array.isArray(parsed.tradeoffs)
                    ? parsed.tradeoffs.map((t: unknown) => String(t))
                    : [],
                summary: String(parsed.summary || "Unable to generate summary"),
            };

            // Verify the winner ID matches one of the input items
            const winnerItem = items.find(item => item.id === response.winner);
            if (!winnerItem) {
                // AI returned invalid winner ID, default to first item
                response.winner = items[0].id;
                response.winnerTitle = items[0].title;
            }

            return NextResponse.json(response);

        } catch (parseError) {
            console.error("Failed to parse AI response:", parseError);
            console.error("Raw content:", cleanedContent);
            return NextResponse.json(
                { error: "Failed to parse AI response. Please try again." },
                { status: 500 }
            );
        }

    } catch (error) {
        console.error("Marketplace comparison error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}