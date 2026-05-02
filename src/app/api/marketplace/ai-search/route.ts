import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/security/rate-limit";
import { buildAIContext } from "@/lib/ai-context/builder";
import { aiGuard } from "@/lib/ai/guard";
import { createRollout, addSpan, finishRollout } from "@/lib/agent-spans";
import {
  estimateAICost,
} from "@/lib/ai/usage-tracking";

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return null;
  if (!openaiClient) openaiClient = new OpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1' });
  return openaiClient;
}

// Marketplace categories
const MarketplaceCategory = z.enum(["People", "Products", "Services"]);

const PeopleFiltersSchema = z.object({
  category: z.literal("People"),
  subcategory: z
    .enum([
      "Fractional Executive",
      "Consultant",
      "Contractor",
      "Virtual Assistant",
      "Specialist",
    ])
    .optional(),
  location: z.string().optional(),
  skills: z.array(z.string()).optional(),
  minExperience: z.number().optional(),
});

const ProductsFiltersSchema = z.object({
  category: z.literal("Products"),
  subcategory: z
    .enum(["Manufacturing", "Fabrication", "Electronics", "Materials", "Components"])
    .optional(),
  location: z.string().optional(),
  industries: z.array(z.string()).optional(),
  certifications: z.array(z.string()).optional(),
  technology: z.string().optional(),
});

const ServicesFiltersSchema = z.object({
  category: z.literal("Services"),
  subcategory: z
    .enum(["Legal", "Financial", "HR", "Marketing", "Design", "Development"])
    .optional(),
  location: z.string().optional(),
  industries: z.array(z.string()).optional(),
  certifications: z.array(z.string()).optional(),
});

const MarketplaceFiltersSchema = z.discriminatedUnion("category", [
  PeopleFiltersSchema,
  ProductsFiltersSchema,
  ServicesFiltersSchema,
]);

const SearchExtractionSchema = z.object({
  filters: MarketplaceFiltersSchema,
  explanation: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  alternativeCategories: z.array(MarketplaceCategory).optional(),
});

export type MarketplaceFilters = z.infer<typeof MarketplaceFiltersSchema>;
export type SearchExtractionResult = z.infer<typeof SearchExtractionSchema>;

interface AISearchRequest {
  query: string;
}

async function handleOpenAIExtraction(
  query: string,
  businessContext: string,
  guard: Awaited<ReturnType<typeof aiGuard>>,
  rolloutId: string | null,
  openai: OpenAI
): Promise<NextResponse> {
  const systemContent = `You are a marketplace search assistant for ForgeOS, a platform connecting businesses with fractional talent, products, services, and AI tools.

Your task is to extract structured search filters from natural language queries.
${businessContext ? `\nThe user's business context (use this to infer intent and prioritise relevant results):\n${businessContext}` : ""}

MARKETPLACE CATEGORIES:
1. **People** - Fractional executives, consultants, contractors, virtual assistants, specialists
   - Common roles: CTO, CFO, COO, CMO, designers, developers, marketers, legal advisors
   - Skills can include: AI, Machine Learning, SaaS, B2B Sales, Finance, Legal, etc.
2. **Products** - Manufacturing capabilities, fabrication, electronics, materials, components
   - Supports: industries (e.g. "Aerospace","Automotive","Medical"), certifications (e.g. "ISO 9001","AS9100"), technology
3. **Services** - Professional services (Legal, Financial, HR, Marketing, Design, Development)
   - Supports: industries, certifications

EXTRACTION GUIDELINES:
- Identify the primary category based on what the user needs
- Extract specific filters relevant to that category
- "Fractional CTO" or "Fractional CFO" → People, subcategory "Fractional Executive"
- "Lawyer" or "Legal counsel" → People (if hiring someone) OR Services (if needing a firm)
- Skills like "AI", "blockchain", "fintech" go in the skills array for People
- Location mentions should be extracted (city, country, or region)
- Experience mentions (e.g., "senior", "10+ years") → minExperience
- Industry mentions (e.g., "aerospace", "automotive") → industries array for Products/Services
- Certification mentions (e.g., "ISO 9001", "AS9100") → certifications array for Products/Services
- Be generous with skill extraction - include related/implied skills

Set confidence:
- "high": Clear intent with specific requirements
- "medium": Clear category but some ambiguity in details
- "low": Ambiguous query that could match multiple interpretations`;

  const completion = await openai.chat.completions.parse({
    model: "openai/gpt-4.1-mini",
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: query },
    ],
    response_format: zodResponseFormat(SearchExtractionSchema, "marketplace_search"),
    temperature: 0.3,
  });

  await guard.trackUsage({
    model: "openai/gpt-4.1-mini",
    promptTokens: completion.usage?.prompt_tokens || 800,
    completionTokens: completion.usage?.completion_tokens || 300,
  });

  if (rolloutId) {
    const promptSnapshot = `${systemContent}\n\n[user]\n${query}`;
    const responseSnapshot = JSON.stringify(completion.choices[0]?.message?.parsed ?? null);
    await addSpan({
      rolloutId,
      kind: "llm_call",
      promptSnapshot,
      responseSnapshot,
      promptTokens: completion.usage?.prompt_tokens ?? null,
      completionTokens: completion.usage?.completion_tokens ?? null,
      metadata: { model: "openai/gpt-4.1-mini" },
    });
    await finishRollout(rolloutId, "finished");
  }

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
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let rolloutId: string | null = null;
  try {
    const supabase = await createClient();
    const guard = await aiGuard(supabase, "ai_search");
    if (guard.denied) return guard.response;

    const user = { id: guard.userId };

    // SECURITY: Rate limit (5 requests per minute per user; higher cost per request with web search)
    const rateLimitResult = await rateLimit("api", `ai-search:${user.id}`, {
      limit: 5,
      window: 60 * 1000,
    });
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { success: false, error: "Rate limit exceeded. Please wait before searching again." },
        { status: 429 }
      );
    }

    const body = (await req.json()) as AISearchRequest;
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

    let businessContext = "";
    const { data: profile } = await supabase
      .from("profiles")
      .select("foundry_id")
      .eq("id", user.id)
      .single();

    if (profile?.foundry_id) {
      businessContext = await buildAIContext(profile.foundry_id, user.id, {
        includeActivity: false,
        includeObjectives: false,
      });
    }

    if (profile?.foundry_id) {
      rolloutId = await createRollout({
        foundryId: profile.foundry_id,
        userId: user.id,
        agentId: "ai_search",
        metadata: { model: "openai/gpt-4.1-mini" },
      });
    }

    if (!process.env.OPENROUTER_API_KEY?.trim()) {
      return NextResponse.json(
        { success: false, error: "AI search service is not configured" },
        { status: 503 }
      );
    }
    const openai = getOpenAIClient();
    if (!openai) {
      return NextResponse.json(
        { success: false, error: "AI search service is not configured" },
        { status: 503 }
      );
    }

    return await handleOpenAIExtraction(
      query,
      businessContext,
      guard,
      rolloutId,
      openai
    );
  } catch (error) {
    console.error("AI Search Error:", error);
    if (typeof rolloutId === "string") void finishRollout(rolloutId, "failed");
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
