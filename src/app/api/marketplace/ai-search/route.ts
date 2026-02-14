import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/security/rate-limit";
import { buildAIContext } from "@/lib/ai-context/builder";
import { aiGuard } from "@/lib/ai/guard";

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

// Marketplace categories
const MarketplaceCategory = z.enum(["People", "Products", "Services"]);

// People-specific filters
const PeopleFiltersSchema = z.object({
    category: z.literal("People"),
    subcategory: z.enum([
        "Fractional Executive",
        "Consultant",
        "Contractor",
        "Virtual Assistant",
        "Specialist"
    ]).optional().describe("The type of person being sought"),
    location: z.string().optional().describe("Geographic location preference"),
    skills: z.array(z.string()).optional().describe("Required skills or expertise areas"),
    minExperience: z.number().optional().describe("Minimum years of experience required"),
});

// Products-specific filters
const ProductsFiltersSchema = z.object({
    category: z.literal("Products"),
    subcategory: z.enum([
        "Manufacturing",
        "Fabrication",
        "Electronics",
        "Materials",
        "Components"
    ]).optional().describe("The type of product or manufacturing capability"),
    location: z.string().optional().describe("Geographic location of manufacturer/supplier"),
    certifications: z.array(z.string()).optional().describe("Required certifications (e.g., ISO 9001)"),
    technology: z.string().optional().describe("Specific technology or manufacturing process"),
});

// Services-specific filters
const ServicesFiltersSchema = z.object({
    category: z.literal("Services"),
    subcategory: z.enum([
        "Legal",
        "Financial",
        "HR",
        "Marketing",
        "Design",
        "Development"
    ]).optional().describe("The type of service being sought"),
    location: z.string().optional().describe("Geographic location preference"),
});

// Combined filter schema with discriminated union
const MarketplaceFiltersSchema = z.discriminatedUnion("category", [
    PeopleFiltersSchema,
    ProductsFiltersSchema,
    ServicesFiltersSchema,
]);

// Response schema for AI extraction
const SearchExtractionSchema = z.object({
    filters: MarketplaceFiltersSchema,
    explanation: z.string().describe("Brief explanation of what the user is looking for"),
    confidence: z.enum(["high", "medium", "low"]).describe("Confidence level in the extraction"),
    alternativeCategories: z.array(MarketplaceCategory).optional().describe("Other categories that might be relevant"),
});

// TypeScript types derived from schemas
export type MarketplaceFilters = z.infer<typeof MarketplaceFiltersSchema>;
export type SearchExtractionResult = z.infer<typeof SearchExtractionSchema>;

// Request body type
interface AISearchRequest {
    query: string;
}

// Response types
interface AISearchSuccessResponse {
    success: true;
    filters: MarketplaceFilters;
    explanation: string;
    confidence: "high" | "medium" | "low";
    alternativeCategories?: Array<"People" | "Products" | "Services">;
}

interface AISearchErrorResponse {
    success: false;
    error: string;
}

type AISearchResponse = AISearchSuccessResponse | AISearchErrorResponse;

export async function POST(req: NextRequest): Promise<NextResponse<AISearchResponse>> {
    try {
        // SECURITY: Fail closed when OpenAI key is not configured.
        if (!process.env.OPENAI_API_KEY) {
            console.error('[AISearchAPI] OPENAI_API_KEY is not configured')
            return NextResponse.json(
                { success: false, error: 'AI search service is not configured' },
                { status: 503 }
            )
        }

        const openai = getOpenAIClient()
        if (!openai) {
            return NextResponse.json(
                { success: false, error: 'AI search service is not configured' },
                { status: 503 }
            )
        }

        // AUTH + AI LIMIT: Check subscription tier AI limits
        const supabase = await createClient()
        const guard = await aiGuard(supabase, 'ai_search')
        if (guard.denied) return guard.response

        const user = { id: guard.userId }

        // SECURITY: Rate limit to prevent OpenAI cost abuse (10 requests per minute per user)
        const rateLimitResult = await rateLimit('api', `ai-search:${user.id}`, { limit: 10, window: 60 * 1000 })
        if (!rateLimitResult.success) {
            return NextResponse.json(
                { success: false, error: "Rate limit exceeded. Please wait before searching again." },
                { status: 429 }
            );
        }

        // Parse request body
        const body = await req.json() as AISearchRequest;
        
        if (!body.query || typeof body.query !== "string") {
            return NextResponse.json(
                { success: false, error: "Missing or invalid 'query' field" },
                { status: 400 }
            );
        }

        const query = body.query.trim();
        
        if (query.length < 3) {
            return NextResponse.json(
                { success: false, error: "Query must be at least 3 characters" },
                { status: 400 }
            );
        }

        if (query.length > 500) {
            return NextResponse.json(
                { success: false, error: "Query must be less than 500 characters" },
                { status: 400 }
            );
        }

        // Build company context for more relevant search understanding
        let businessContext = ''
        const { data: profile } = await supabase
            .from('profiles')
            .select('foundry_id')
            .eq('id', user.id)
            .single()

        if (profile?.foundry_id) {
            businessContext = await buildAIContext(profile.foundry_id, user.id, {
                includeActivity: false, // Keep search fast
                includeObjectives: false,
            })
        }

        // Call OpenAI to extract structured filters
        // @ts-expect-error types for beta.chat.completions.parse are conflicting
        const completion = await openai.beta.chat.completions.parse({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `You are a marketplace search assistant for ForgeOS, a platform connecting businesses with fractional talent, products, services, and AI tools.

Your task is to extract structured search filters from natural language queries.
${businessContext ? `\nThe user's business context (use this to infer intent and prioritise relevant results):\n${businessContext}` : ''}

MARKETPLACE CATEGORIES:
1. **People** - Fractional executives, consultants, contractors, virtual assistants, specialists
   - Common roles: CTO, CFO, COO, CMO, designers, developers, marketers, legal advisors
   - Skills can include: AI, Machine Learning, SaaS, B2B Sales, Finance, Legal, etc.
   
2. **Products** - Manufacturing capabilities, fabrication, electronics, materials, components
   - For physical product sourcing, manufacturing partners, suppliers
   
3. **Services** - Professional services (Legal, Financial, HR, Marketing, Design, Development)
   - Agency services, professional firms, outsourced departments

EXTRACTION GUIDELINES:
- Identify the primary category based on what the user needs
- Extract specific filters relevant to that category
- "Fractional CTO" or "Fractional CFO" → People, subcategory "Fractional Executive"
- "Lawyer" or "Legal counsel" → People (if hiring someone) OR Services (if needing a firm)
- Skills like "AI", "blockchain", "fintech" go in the skills array for People
- Location mentions should be extracted (city, country, or region)
- Experience mentions (e.g., "senior", "10+ years") → minExperience
- Be generous with skill extraction - include related/implied skills

Set confidence:
- "high": Clear intent with specific requirements
- "medium": Clear category but some ambiguity in details  
- "low": Ambiguous query that could match multiple interpretations`
                },
                {
                    role: "user",
                    content: query
                }
            ],
            response_format: zodResponseFormat(SearchExtractionSchema, "marketplace_search"),
            temperature: 0.3, // Lower temperature for more consistent extraction
        });

        // AUDIT: Track AI usage
        await guard.trackUsage({
            model: 'gpt-4o',
            promptTokens: completion.usage?.prompt_tokens || 800,
            completionTokens: completion.usage?.completion_tokens || 300,
        })

        const parsed = completion.choices[0]?.message?.parsed as SearchExtractionResult | undefined;

        if (!parsed) {
            return NextResponse.json(
                { success: false, error: "Failed to parse search query" },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            filters: parsed.filters,
            explanation: parsed.explanation,
            confidence: parsed.confidence,
            alternativeCategories: parsed.alternativeCategories,
        });

    } catch (error) {
        console.error("AI Search Error:", error);
        
        // Handle specific OpenAI errors
        if (error instanceof OpenAI.APIError) {
            if (error.status === 401) {
                return NextResponse.json(
                    { success: false, error: "OpenAI API key not configured" },
                    { status: 500 }
                );
            }
            if (error.status === 429) {
                return NextResponse.json(
                    { success: false, error: "Rate limit exceeded. Please try again later." },
                    { status: 429 }
                );
            }
        }

        return NextResponse.json(
            { success: false, error: "Internal server error" },
            { status: 500 }
        );
    }
}
