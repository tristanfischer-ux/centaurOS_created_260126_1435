/**
 * @file /api/voice-to-task/route.ts
 *
 * @description Voice-to-task API that extracts structured task data from speech.
 * Accepts either pre-transcribed text (from browser Web Speech API — the fast
 * path) or an audio file (Whisper fallback for browsers without native STT).
 *
 * DECISION: Accept both JSON { text } and multipart/form-data { file } to
 * support the fast path (native STT sends text directly, skipping Whisper) and
 * the fallback path (audio file → Whisper → GPT-5.3). This keeps the API
 * backward-compatible while eliminating 4-6s of Whisper latency for most users.
 *
 * @security Requires authenticated user. Rate-limited to 5 req/hour per user.
 * @audit Tracks usage under the 'voice_to_task' AI feature.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { sanitizeFileName } from "@/lib/security/sanitize";
import { rateLimit } from "@/lib/security/rate-limit";
import { aiGuard } from "@/lib/ai/guard";
import { createRollout, addSpan, finishRollout } from "@/lib/agent-spans";

let openaiClient: OpenAI | null = null

function getOpenAIClient(): OpenAI | null {
    const apiKey = process.env.OPENAI_API_KEY?.trim()
    if (!apiKey) return null
    if (!openaiClient) {
        openaiClient = new OpenAI({ apiKey })
    }
    return openaiClient
}

const TaskSchema = z.object({
    title: z.string(),
    description: z.string(),
    assignee_type: z.enum(["Legal_AI", "General_AI", "Self", "Unassigned"]),
    priority: z.enum(["High", "Medium", "Low"]),
    due_date: z.string().optional().describe("ISO 8601 date string if parsed"),
});

const MAX_TEXT_LENGTH = 5000

const ALLOWED_MIME_TYPES = [
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav',
    'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/m4a', 'audio/x-m4a',
];

/**
 * INTENT: Extract the transcript text from either a JSON body (fast path from
 * browser native STT) or a multipart form with an audio file (Whisper fallback).
 * Returns { transcriptText, mode } or an error Response.
 */
async function extractTranscript(
    req: NextRequest,
    openai: OpenAI
): Promise<{ transcriptText: string; mode: string | null } | Response> {
    const contentType = req.headers.get("content-type") || ""

    if (contentType.includes("application/json")) {
        const body = await req.json()
        const { text, mode } = body as { text?: string; mode?: string }

        if (!text || typeof text !== "string" || text.trim().length === 0) {
            return NextResponse.json({ error: "Text is required" }, { status: 400 })
        }
        if (text.length > MAX_TEXT_LENGTH) {
            return NextResponse.json({ error: "Text too long" }, { status: 400 })
        }

        return { transcriptText: text.trim(), mode: mode || null }
    }

    const formData = await req.formData()
    const file = formData.get("file") as File
    const mode = formData.get("mode") as string | null

    if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const MAX_FILE_SIZE = 25 * 1024 * 1024
    if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({
            error: `File too large. Maximum size is 25MB, got ${Math.round(file.size / 1024 / 1024)}MB`
        }, { status: 400 })
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        return NextResponse.json({
            error: `Invalid file type: ${file.type}. Only audio files are allowed.`
        }, { status: 400 })
    }

    const sanitizedName = sanitizeFileName(file.name)
    if (sanitizedName !== file.name) {
        console.warn(`[SECURITY] Filename sanitized from "${file.name}" to "${sanitizedName}"`)
    }

    const transcription = await openai.audio.transcriptions.create({
        file: file,
        model: "whisper-1",
    })

    return { transcriptText: transcription.text, mode }
}

export async function POST(req: NextRequest) {
    let rolloutId: string | null = null;
    try {
        if (!process.env.OPENAI_API_KEY?.trim()) {
            console.error('[VOICE-TO-TASK] OpenAI API key not configured')
            return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
        }

        const openai = getOpenAIClient()
        if (!openai) {
            return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
        }
        
        const supabase = await createClient();

        const guard = await aiGuard(supabase, 'voice_to_task')
        if (guard.denied) return guard.response

        const user = { id: guard.userId }

        const rateLimitResult = await rateLimit('api', `voice-to-task:${user.id}`, { limit: 5, window: 3600 * 1000 })
        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: "Rate limit exceeded. Please wait before using voice-to-task again." },
                { status: 429 }
            );
        }

        const result = await extractTranscript(req, openai)
        if (result instanceof Response) return result

        const { transcriptText, mode } = result

        const { data: profileForRollout } = await supabase
            .from('profiles')
            .select('foundry_id')
            .eq('id', user.id)
            .single();

        if (profileForRollout?.foundry_id) {
            rolloutId = await createRollout({
                foundryId: profileForRollout.foundry_id,
                userId: user.id,
                agentId: 'voice_to_task',
                metadata: { model: 'gpt-4.1-mini' },
            });
        }

        const completion = await openai.chat.completions.parse({
            model: "gpt-4.1-mini",
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

        await guard.trackUsage({
            model: 'gpt-4.1-mini',
            promptTokens: completion.usage?.prompt_tokens || 500,
            completionTokens: completion.usage?.completion_tokens || 200,
        })

        if (rolloutId) {
            const systemPrompt = `You are an executive assistant for a fractional foundry OS. 
          Extract task details from the voice transcript.
          
          If the user mentions "Legal AI", map to assignee_type="Legal_AI".
          If "General Assistant" or "AI", map to "General_AI".
          If "My task" or "Me", map to "Self".
          Otherwise "Unassigned".
          
          Current Date: ${new Date().toISOString()}`;
            const promptSnapshot = `${systemPrompt}\n\n[user]\n${transcriptText}`;
            const responseSnapshot = JSON.stringify(completion.choices[0]?.message?.parsed ?? null);
            await addSpan({
                rolloutId,
                kind: 'llm_call',
                promptSnapshot,
                responseSnapshot,
                promptTokens: completion.usage?.prompt_tokens ?? null,
                completionTokens: completion.usage?.completion_tokens ?? null,
                metadata: { model: 'gpt-4.1-mini' },
            });
            await finishRollout(rolloutId, 'finished');
        }

        if (!completion.choices || completion.choices.length === 0) {
            return NextResponse.json({ error: "AI returned no response" }, { status: 500 });
        }

        const taskData = completion.choices[0].message.parsed;

        if (!taskData) {
            throw new Error("Failed to parse task data");
        }

        if (mode === 'parse') {
            return NextResponse.json({ success: true, task: taskData, transcript: transcriptText });
        }

        const profile = profileForRollout;
        if (!profile?.foundry_id) {
            return NextResponse.json({ error: 'User not associated with a foundry' }, { status: 403 });
        }

        let objectiveId: string | null = null

        const { data: defaultObjective } = await supabase
            .from('objectives')
            .select('id')
            .eq('foundry_id', profile.foundry_id)
            .eq('title', 'No objective set')
            .is('deleted_at', null)
            .limit(1)
            .maybeSingle()

        objectiveId = defaultObjective?.id ?? null

        if (!objectiveId) {
            const { data: firstObjective } = await supabase
                .from('objectives')
                .select('id')
                .eq('foundry_id', profile.foundry_id)
                .eq('is_ghost', false)
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()

            objectiveId = firstObjective?.id ?? null
        }

        if (!objectiveId) {
            return NextResponse.json(
                { error: 'No objectives available for task creation' },
                { status: 400 }
            )
        }

        let assigneeId = null;

        if (taskData.assignee_type === "Self") {
            assigneeId = user.id;
        } else if (taskData.assignee_type === "Legal_AI" || taskData.assignee_type === "General_AI") {
            const rolePattern = taskData.assignee_type === "Legal_AI" ? "ai.legal%" : "ai.general%";
            const { data: aiProfile } = await supabase
                .from('profiles')
                .select('id')
                .ilike('email', rolePattern)
                .eq('foundry_id', profile.foundry_id)
                .limit(1)
                .single();

            if (aiProfile) {
                assigneeId = aiProfile.id;
            }
        }

        const { data: newTask, error } = await supabase
            .from("tasks")
            .insert({
                title: taskData.title,
                description: `${taskData.description}\n\n[Transcript]: ${transcriptText}`,
                objective_id: objectiveId,
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
        if (typeof rolloutId === "string") {
            void finishRollout(rolloutId, "failed");
        }
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
