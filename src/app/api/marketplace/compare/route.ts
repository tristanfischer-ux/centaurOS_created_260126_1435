import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { Json } from "@/types/database.types";
import { createClient } from "@/lib/supabase/server";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "dummy-key-for-build",
});

// Types for the comparison request/response
export interface MarketplaceListingInput {
    id: string;
    category: "People" | "Products" | "Services" | "AI";
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
        // Authenticate user
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (authError || !user) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const body: CompareRequest = await req.json();
        const { items, foundryContext } = body;

        // Validate request
        if (!items || !Array.isArray(items)) {
            return NextResponse.json(
                { error: "Invalid request: items array is required" },
                { status: 400 }
            );
        }

        if (items.length < 2) {
            return NextResponse.json(
                { error: "At least 2 items are required for comparison" },
                { status: 400 }
            );
        }

        if (items.length > 3) {
            return NextResponse.json(
                { error: "Maximum 3 items can be compared at once" },
                { status: 400 }
            );
        }

        // Validate each item has required fields
        for (const item of items) {
            if (!item.id || !item.title || !item.category) {
                return NextResponse.json(
                    { error: "Each item must have id, title, and category" },
                    { status: 400 }
                );
            }
        }

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

        const contextSection = foundryContext 
            ? `\nBusiness Context:
- Industry: ${foundryContext.industry || "Not specified"}
- Stage: ${foundryContext.stage || "Not specified"}`
            : "";

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

        if (!completion.choices || completion.choices.length === 0) {
            return NextResponse.json(
                { error: "AI returned no response" },
                { status: 500 }
            );
        }

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
