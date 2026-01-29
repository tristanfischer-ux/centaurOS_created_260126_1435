import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { createClient } from "@/lib/supabase/server";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "dummy-key-for-build",
});

// Marketplace categories
const MarketplaceCategory = z.enum(["People", "Products", "Services", "AI"]);

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

// AI-specific filters
const AIFiltersSchema = z.object({
    category: z.literal("AI"),
    subcategory: z.enum([
        "Automation",
        "Analytics",
        "Writing",
        "Design",
        "Development",
        "Customer Service"
    ]).optional().describe("The type of AI tool being sought"),
    type: z.string().optional().describe("Specific AI type or model"),
    maxCost: z.number().optional().describe("Maximum monthly cost in pounds"),
    integrations: z.array(z.string()).optional().describe("Required integrations (e.g., Slack, Notion)"),
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
    AIFiltersSchema,
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
    alternativeCategories?: Array<"People" | "Products" | "Services" | "AI">;
}

interface AISearchErrorResponse {
    success: false;
    error: string;
}

type AISearchResponse = AISearchSuccessResponse | AISearchErrorResponse;

export async function POST(req: NextRequest): Promise<NextResponse<AISearchResponse>> {
    try {
        // Authenticate user
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (authError || !user) {
            return NextResponse.json(
                { success: false, error: "Unauthorized" },
                { status: 401 }
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

        // Call OpenAI to extract structured filters
        // @ts-expect-error types for beta.chat.completions.parse are conflicting
        const completion = await openai.beta.chat.completions.parse({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `You are a marketplace search assistant for CentaurOS, a platform connecting businesses with fractional talent, products, services, and AI tools.

Your task is to extract structured search filters from natural language queries.

MARKETPLACE CATEGORIES:
1. **People** - Fractional executives, consultants, contractors, virtual assistants, specialists
   - Common roles: CTO, CFO, COO, CMO, designers, developers, marketers, legal advisors
   - Skills can include: AI, Machine Learning, SaaS, B2B Sales, Finance, Legal, etc.
   
2. **Products** - Manufacturing capabilities, fabrication, electronics, materials, components
   - For physical product sourcing, manufacturing partners, suppliers
   
3. **Services** - Professional services (Legal, Financial, HR, Marketing, Design, Development)
   - Agency services, professional firms, outsourced departments
   
4. **AI** - AI tools and automation solutions
   - Types: Automation, Analytics, Writing, Design, Development, Customer Service
   - Consider integrations (Slack, Notion, etc.) and cost constraints

EXTRACTION GUIDELINES:
- Identify the primary category based on what the user needs
- Extract specific filters relevant to that category
- "Fractional CTO" or "Fractional CFO" → People, subcategory "Fractional Executive"
- "Lawyer" or "Legal counsel" → People (if hiring someone) OR Services (if needing a firm)
- Skills like "AI", "blockchain", "fintech" go in the skills array for People
- Location mentions should be extracted (city, country, or region)
- Experience mentions (e.g., "senior", "10+ years") → minExperience
- Budget mentions for AI tools → maxCost
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
