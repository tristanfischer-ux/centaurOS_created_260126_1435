import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "dummy-key-for-build",
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
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get("file") as File;
        const mode = formData.get("mode") as string | null; // check for 'parse' mode

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
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
