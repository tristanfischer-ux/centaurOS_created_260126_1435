import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "dummy-key-for-build",
});

// Schema for RFQ Extraction
const RFQSchema = z.object({
    title: z.string().describe("A concise title summarizing the RFQ request"),
    specifications: z.string().describe("Detailed specifications including quantity, materials, tolerances, and other technical requirements"),
    budget_range: z.string().describe("The budget or price range mentioned, formatted as currency (e.g., '$5,000' or '$5,000 - $10,000')"),
});

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
        }

        // 1. Transcribe with Whisper
        const transcription = await openai.audio.transcriptions.create({
            file: file,
            model: "whisper-1",
        });

        const transcriptText = transcription.text;

        // 2. Extract RFQ fields with GPT-4o
        // @ts-expect-error types for beta.chat.completions.parse are conflicting
        const completion = await openai.beta.chat.completions.parse({
            model: "gpt-4o-2024-08-06",
            messages: [
                {
                    role: "system",
                    content: `You are a procurement assistant for a manufacturing marketplace.
Extract RFQ (Request for Quote) details from the voice transcript.

Guidelines:
- title: Create a concise, descriptive title that summarizes the request (e.g., "Aluminum Enclosure Manufacturing - 500 units")
- specifications: Extract all technical details including:
  - Quantity/volume
  - Materials
  - Manufacturing processes (CNC, injection molding, etc.)
  - Tolerances and quality requirements
  - Dimensions if mentioned
  - Any other technical specifications
- budget_range: Extract the budget or price range. Format as currency (e.g., "$5,000" or "$5,000 - $10,000"). If no budget is mentioned, use "Not specified".

Be precise and comprehensive in extracting specifications.`
                },
                { role: "user", content: transcriptText },
            ],
            response_format: zodResponseFormat(RFQSchema, "rfq"),
        });

        const rfqData = completion.choices[0].message.parsed;

        if (!rfqData) {
            throw new Error("Failed to parse RFQ data from transcript");
        }

        return NextResponse.json({
            title: rfqData.title,
            specifications: rfqData.specifications,
            budget_range: rfqData.budget_range,
            transcription: transcriptText,
        });

    } catch (error) {
        console.error("Voice-to-RFQ Error:", error);
        
        if (error instanceof Error) {
            return NextResponse.json(
                { error: error.message },
                { status: 500 }
            );
        }
        
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
