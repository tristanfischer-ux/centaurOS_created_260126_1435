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
  estimateWebSearchCost,
} from "@/lib/ai/usage-tracking";

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  if (!openaiClient) openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

let anthropicClient: InstanceType<typeof import("@anthropic-ai/sdk").default> | null = null;

async function getAnthropicClient(): Promise<InstanceType<typeof import("@anthropic-ai/sdk").default> | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!anthropicClient) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
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
  certifications: z.array(z.string()).optional(),
  technology: z.string().optional(),
});

const ServicesFiltersSchema = z.object({
  category: z.literal("Services"),
  subcategory: z
    .enum(["Legal", "Financial", "HR", "Marketing", "Design", "Development"])
    .optional(),
  location: z.string().optional(),
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

const WEB_SEARCH_BETA = "code-execution-web-tools-2026-02-09" as const;
const AI_SEARCH_MODEL = "claude-sonnet-4-6";
const WEB_SEARCH_MAX_USES = 3;

/** Extract JSON object from a text block (handles markdown code fences) */
function extractJsonFromText(text: string): SearchExtractionResult | null {
  const trimmed = text.trim();
  const jsonMatch =
    trimmed.match(/```(?:json)?\s*([\s\S]*?)```/) ||
    trimmed.match(/\{[\s\S]*\}/);
  const raw = jsonMatch ? (jsonMatch[1] ?? jsonMatch[0]).trim() : trimmed;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return SearchExtractionSchema.parse(parsed);
  } catch {
    return null;
  }
}

/** Collect web search citations from Anthropic response content blocks */
function collectWebSources(
  content: Array<{ type: string; text?: string; citations?: Array<{ url?: string; title?: string | null; cited_text?: string }> | null }>
): { title: string; url: string; snippet: string }[] {
  const seen = new Set<string>();
  const sources: { title: string; url: string; snippet: string }[] = [];
  for (const block of content) {
    if (block.type !== "text" || !block.citations) continue;
    for (const c of block.citations) {
      const url = c.url ?? "";
      if (!url || seen.has(url)) continue;
      seen.add(url);
      sources.push({
        title: (c.title ?? "Source").toString(),
        url,
        snippet: (c.cited_text ?? "").slice(0, 200),
      });
    }
  }
  return sources;
}

/** Get all assistant text concatenated (for JSON extraction) */
function getAssistantText(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((b): b is { type: string; text: string } => b.type === "text" && "text" in b && typeof (b as { text: string }).text === "string")
    .map((b) => (b as { text: string }).text)
    .join("\n");
}

interface AnthropicSearchParams {
  query: string;
  businessContext: string;
  userLocation?: { type: "approximate"; city?: string; region?: string; country?: string; timezone?: string };
}

async function handleAnthropicSearch(
  params: AnthropicSearchParams,
  guard: Awaited<ReturnType<typeof aiGuard>>,
  rolloutId: string | null
): Promise<NextResponse> {
  const client = await getAnthropicClient();
  if (!client) throw new Error("Anthropic client not configured");

  const systemContent = `You are a marketplace search assistant for ForgeOS, a platform connecting businesses with fractional talent, products, services, and AI tools.

Your tasks:
1. Use web search (you have access to it) to find real suppliers, services, or talent relevant to the user's query when it would help (e.g. "CNC machining Melbourne", "fractional CTO", "ISO 9001 manufacturers").
2. Extract structured search filters from the query and from what you find.
3. At the end of your response, output a single JSON object with this exact structure (no other text after it):
{"filters":{...},"explanation":"...","confidence":"high"|"medium"|"low","alternativeCategories":["People"|"Products"|"Services"]}

Filters must use one of these categories and their allowed subcategories:
- People: subcategory optional one of "Fractional Executive","Consultant","Contractor","Virtual Assistant","Specialist"; optional location, skills (array of strings), minExperience (number).
- Products: subcategory optional one of "Manufacturing","Fabrication","Electronics","Materials","Components"; optional location, certifications (array), technology.
- Services: subcategory optional one of "Legal","Financial","HR","Marketing","Design","Development"; optional location.

${params.businessContext ? `Business context for intent:\n${params.businessContext}` : ""}

Guidelines: "Fractional CTO" → People, subcategory "Fractional Executive". Skills like "AI","SaaS" go in skills. Location and certifications from the query or search results go in the filters. Set confidence high when intent is clear, medium when category is clear but details ambiguous, low when ambiguous.`;

  const webSearchTool = {
    type: "web_search_20260209",
    name: "web_search",
    max_uses: WEB_SEARCH_MAX_USES,
    ...(params.userLocation && { user_location: params.userLocation }),
  };

  const createParams = {
    model: AI_SEARCH_MODEL,
    max_tokens: 4096,
    system: systemContent,
    messages: [{ role: "user" as const, content: params.query }],
    tools: [webSearchTool],
    betas: [WEB_SEARCH_BETA],
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let response = await client.beta.messages.create(createParams as any);

  // Handle pause_turn: continue the turn until end_turn
  const maxContinue = 5;
  let continueCount = 0;
  while (response.stop_reason === "pause_turn" && continueCount < maxContinue) {
    continueCount++;
    const prevMessages = [
      { role: "user" as const, content: params.query },
      { role: "assistant" as const, content: response.content },
      { role: "user" as const, content: "Continue." },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    response = await client.beta.messages.create({ ...createParams, messages: prevMessages } as any);
  }

  const msg = response;
  const usage = msg.usage;
  const serverToolUse = usage && "server_tool_use" in usage ? (usage as { server_tool_use?: { web_search_requests?: number } }).server_tool_use : undefined;
  const webSearchRequests = serverToolUse?.web_search_requests ?? 0;

  const tokenCost = estimateAICost(
    AI_SEARCH_MODEL,
    usage?.input_tokens ?? 0,
    usage?.output_tokens ?? 0
  );
  const webCost = estimateWebSearchCost(webSearchRequests);
  const estimatedCostUsd = tokenCost + webCost;

  await guard.trackUsage({
    model: AI_SEARCH_MODEL,
    promptTokens: usage?.input_tokens ?? 0,
    completionTokens: usage?.output_tokens ?? 0,
    estimatedCostUsd,
    metadata: { web_search_requests: webSearchRequests },
  });

  if (rolloutId) {
    const promptSnapshot = `${systemContent}\n\n[user]\n${params.query}`;
    const responseSnapshot = getAssistantText(msg.content);
    await addSpan({
      rolloutId,
      kind: "llm_call",
      promptSnapshot,
      responseSnapshot,
      promptTokens: usage?.input_tokens ?? null,
      completionTokens: usage?.output_tokens ?? null,
      metadata: { model: AI_SEARCH_MODEL, web_search_requests: webSearchRequests },
    });
    await finishRollout(rolloutId, "finished");
  }

  const contentBlocks = msg.content as Array<{ type: string; text?: string; citations?: Array<{ url?: string; title?: string | null; cited_text?: string }> | null }>;
  const fullText = getAssistantText(contentBlocks);
  const parsed = extractJsonFromText(fullText);
  if (!parsed) {
    return NextResponse.json(
      { success: false, error: "Failed to parse search response" },
      { status: 500 }
    );
  }

  const sources = collectWebSources(contentBlocks);
  const firstTextBlock = contentBlocks.find((b) => b.type === "text" && typeof b.text === "string");
  const summary =
    firstTextBlock && typeof firstTextBlock.text === "string"
      ? firstTextBlock.text.replace(/\s*\{[\s\S]*\}$/, "").trim().slice(0, 500)
      : "";

  return NextResponse.json({
    success: true,
    filters: parsed.filters,
    explanation: parsed.explanation,
    confidence: parsed.confidence,
    alternativeCategories: parsed.alternativeCategories,
    webIntelligence: {
      summary: summary || (sources.length > 0 ? `Found ${sources.length} relevant source(s).` : ""),
      sources,
      searchCount: webSearchRequests,
    },
  });
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
3. **Services** - Professional services (Legal, Financial, HR, Marketing, Design, Development)

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
- "low": Ambiguous query that could match multiple interpretations`;

  const completion = await openai.chat.completions.parse({
    model: "gpt-5.3-instant",
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: query },
    ],
    response_format: zodResponseFormat(SearchExtractionSchema, "marketplace_search"),
    temperature: 0.3,
  });

  await guard.trackUsage({
    model: "gpt-5.3-instant",
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
      metadata: { model: "gpt-5.3-instant" },
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
        metadata: { model: AI_SEARCH_MODEL },
      });
    }

    // Prefer Anthropic web search when key is set; fallback to OpenAI extraction-only
    const anthropic = await getAnthropicClient();
    if (anthropic) {
      try {
        return await handleAnthropicSearch(
          {
            query,
            businessContext,
          },
          guard,
          rolloutId
        );
      } catch (err) {
        console.warn("[AISearch] Anthropic web search failed, falling back to OpenAI:", err);
        if (rolloutId) void finishRollout(rolloutId, "failed");
        rolloutId = null;
      }
    }

    // Fallback: OpenAI extraction only (no web search)
    if (!process.env.OPENAI_API_KEY) {
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

    if (profile?.foundry_id && !rolloutId) {
      rolloutId = await createRollout({
        foundryId: profile.foundry_id,
        userId: user.id,
        agentId: "ai_search",
        metadata: { model: "gpt-5.3-instant" },
      });
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
