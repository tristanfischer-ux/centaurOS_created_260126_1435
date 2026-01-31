import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { sanitizeFileName } from "@/lib/security/sanitize";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";

// SECURITY: Fail fast if OpenAI API key is not configured
const apiKey = process.env.OPENAI_API_KEY
if (!apiKey && process.env.NODE_ENV === 'production') {
    console.error('[CRITICAL] OPENAI_API_KEY not configured in production!')
}

const openai = new OpenAI({
    apiKey: apiKey || 'dummy-key-for-build', // Build-time only fallback
});

// Schema for Task Extraction
const TaskSchema = z.object({
    title: z.string(),
    description: z.string(),
    assignee_type: z.enum(["Legal_AI", "General_AI", "Self", "Unassigned"]),
    priority: z.enum(["High", "Medium", "Low"]),
    due_date: z.string().optional().describe("ISO 8601 date string if parsed"),
});

export async function POST(req: NextRequest) {
    try {
        // SECURITY: Check if OpenAI is configured before processing
        if (!process.env.OPENAI_API_KEY) {
            console.error('[VOICE-TO-TASK] OpenAI API key not configured')
            return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
        }
        
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // SECURITY: Rate limit to prevent OpenAI cost abuse (5 requests per hour per user)
        const headersList = await headers()
        const clientIP = getClientIP(headersList)
        const rateLimitResult = await rateLimit('api', `voice-to-task:${user.id}`, { limit: 5, window: 3600 })
        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: "Rate limit exceeded. Please wait before using voice-to-task again." },
                { status: 429 }
            );
        }

        const formData = await req.formData();
        const file = formData.get("file") as File;
        const mode = formData.get("mode") as string | null; // check for 'parse' mode

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
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

        // SECURITY: Sanitize filename to prevent path traversal using proper sanitization
        const sanitizedName = sanitizeFileName(file.name);
        if (sanitizedName !== file.name) {
            console.warn(`[SECURITY] Filename sanitized from "${file.name}" to "${sanitizedName}"`);
        }

        // 1. Transcribe with Whisper
        const transcription = await openai.audio.transcriptions.create({
            file: file,
            model: "whisper-1",
        });

        const transcriptText = transcription.text;

        // 2. Extract Task Intent with GPT-4o
        // @ts-expect-error types for beta.chat.completions.parse are conflicting
        const completion = await openai.beta.chat.completions.parse({
            model: "gpt-4o-2024-08-06",
            messages: [
                {
                    role: "system",
                    content: `You are an executive assistant for a fractional foundry OS. 
          Extract task details from the voice transcript.
          
          If the user mentions "Legal AI", map to assignee_type="Legal_AI".
          If "General Assistant" or "AI", map to "General_AI".
          If "My task" or "Me", map to "Self".
          Otherwise "Unassigned".
          
          Current Date: ${new Date().toISOString()}`
                },
                { role: "user", content: transcriptText },
            ],
            response_format: zodResponseFormat(TaskSchema, "task"),
        });

        if (!completion.choices || completion.choices.length === 0) {
            return NextResponse.json({ error: "AI returned no response" }, { status: 500 });
        }

        const taskData = completion.choices[0].message.parsed;

        if (!taskData) {
            throw new Error("Failed to parse task data");
        }

        // If mode is 'parse', return the data immediately without saving
        if (mode === 'parse') {
            return NextResponse.json({ success: true, task: taskData, transcript: transcriptText });
        }

        // 3. Resolve Assignee ID
        let assigneeId = null; // Default unassigned


        if (taskData.assignee_type === "Self") {
            assigneeId = user.id;
        } else if (taskData.assignee_type === "Legal_AI" || taskData.assignee_type === "General_AI") {
            // Look up AI agent profile
            // Helper: in a real app, cache these IDs or queries.
            // For MVP, we query profiles by partial email pattern we seeded.
            const rolePattern = taskData.assignee_type === "Legal_AI" ? "ai.legal%" : "ai.general%";
            const { data: aiProfile } = await supabase
                .from('profiles')
                .select('id')
                .ilike('email', rolePattern)
                .limit(1)
                .single();

            if (aiProfile) {
                assigneeId = aiProfile.id;
            }
        }

        // 4. Get user's foundry_id from database (NOT from user_metadata which is client-writable)
        const { data: profile } = await supabase
            .from('profiles')
            .select('foundry_id')
            .eq('id', user.id)
            .single();

        if (!profile?.foundry_id) {
            return NextResponse.json({ error: 'User not associated with a foundry' }, { status: 403 });
        }

        // 5. Create Task in DB
        const { data: newTask, error } = await supabase
            .from("tasks")
            .insert({
                title: taskData.title,
                description: `${taskData.description}\n\n[Transcript]: ${transcriptText}`,
                creator_id: user.id,
                foundry_id: profile.foundry_id,
                assignee_id: assigneeId,
                status: "Pending",
                start_date: new Date().toISOString(),
                end_date: taskData.due_date || null
            })
            .select()
            .single();

        if (error) {
            console.error("DB Error:", error);
            return NextResponse.json({ error: "Database error" }, { status: 500 });
        }

        return NextResponse.json({ success: true, task: newTask, transcript: transcriptText });

    } catch (error) {
        console.error("Voice-to-Task Error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
