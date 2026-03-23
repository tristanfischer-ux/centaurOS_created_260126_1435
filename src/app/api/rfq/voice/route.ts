import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { rateLimit } from "@/lib/security/rate-limit";
import { aiGuard } from "@/lib/ai/guard";

let openaiClient: OpenAI | null = null

function getOpenAIClient(): OpenAI | null {
    const apiKey = process.env.OPENAI_API_KEY?.trim()
    if (!apiKey) {
        return null
    }

    if (!openaiClient) {
        openaiClient = new OpenAI({ apiKey })
    }

    return openaiClient
}

// Schema for RFQ Extraction
const RFQSchema = z.object({
    title: z.string().describe("A concise title summarizing the RFQ request"),
    specifications: z.string().describe("Detailed specifications including quantity, materials, tolerances, and other technical requirements"),
    budget_range: z.string().describe("The budget or price range mentioned, formatted as currency (e.g., '£5,000' or '£5,000 - £10,000')"),
});

export async function POST(req: NextRequest) {
    try {
        // SECURITY: Fail closed when OpenAI key is not configured.
        if (!process.env.OPENAI_API_KEY?.trim()) {
            console.error('[VoiceToRFQAPI] OPENAI_API_KEY is not configured')
            return NextResponse.json(
                { error: 'Voice RFQ service is not configured' },
                { status: 503 }
            )
        }

        const openai = getOpenAIClient()
        if (!openai) {
            return NextResponse.json(
                { error: 'Voice RFQ service is not configured' },
                { status: 503 }
            )
        }

        const supabase = await createClient();
        const guard = await aiGuard(supabase, 'voice_to_rfq');
        if (guard.denied) return guard.response;
        const user = { id: guard.userId };

        // SECURITY: Rate limit to prevent OpenAI cost abuse (5 requests per hour per user)
        const rateLimitResult = await rateLimit('api', `rfq-voice:${user.id}`, { limit: 5, window: 3600 * 1000 })
        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: "Rate limit exceeded. Please wait before using voice input again." },
                { status: 429 }
            );
        }

        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
        }

        // Validate file size (max 25MB)
        const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB in bytes
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ 
                error: `File too large. Maximum size is 25MB, got ${Math.round(file.size / 1024 / 1024)}MB` 
            }, { status: 400 });
        }

        // Validate file type (audio formats)
        const ALLOWED_MIME_TYPES = [
            'audio/mpeg',
            'audio/mp3',
            'audio/wav',
            'audio/wave',
            'audio/x-wav',
            'audio/ogg',
            'audio/webm',
            'audio/mp4',
            'audio/m4a',
            'audio/x-m4a',
        ];
        
        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
            return NextResponse.json({ 
                error: `Invalid file type: ${file.type}. Only audio files are allowed.` 
            }, { status: 400 });
        }

        // Sanitize filename to prevent path traversal
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        if (sanitizedName !== file.name) {
            console.warn(`Filename sanitized from "${file.name}" to "${sanitizedName}"`);
        }

        // 1. Transcribe with Whisper
        const transcription = await openai.audio.transcriptions.create({
            file: file,
            model: "whisper-1",
        });

        const transcriptText = transcription.text;

        // 2. Extract RFQ fields with GPT-5.3
        const completion = await openai.chat.completions.parse({
            model: "gpt-5.3-chat-latest",
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
- budget_range: Extract the budget or price range. Format as currency (e.g., "£5,000" or "£5,000 - £10,000"). If no budget is mentioned, use "Not specified".

Be precise and comprehensive in extracting specifications.`
                },
                { role: "user", content: transcriptText },
            ],
            response_format: zodResponseFormat(RFQSchema, "rfq"),
        });

        // AUDIT: Track AI usage
        await guard.trackUsage({
            model: 'gpt-5.3-chat-latest',
            promptTokens: completion.usage?.prompt_tokens || 500,
            completionTokens: completion.usage?.completion_tokens || 200,
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
        
        // SECURITY: Don't expose internal error messages to client
        return NextResponse.json(
            { error: "Failed to process voice recording. Please try again." },
            { status: 500 }
        );
    }
}
