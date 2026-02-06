import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import OpenAI from "openai"

export const runtime = "nodejs"

export async function POST(request: Request) {
    // 1. Authenticate
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 2. Parse body
    let prompt: string
    let input: string

    try {
        const body = await request.json()
        prompt = body.prompt
        input = body.input ?? ""

        if (!prompt || typeof prompt !== "string") {
            return NextResponse.json({ error: "prompt is required" }, { status: 400 })
        }
        if (typeof input !== "string") {
            return NextResponse.json({ error: "input must be a string" }, { status: 400 })
        }
        // Reasonable size limits
        if (prompt.length > 50_000) {
            return NextResponse.json({ error: "prompt too long (max 50k chars)" }, { status: 400 })
        }
        if (input.length > 100_000) {
            return NextResponse.json({ error: "input too long (max 100k chars)" }, { status: 400 })
        }
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    // 3. Build the final prompt by replacing {{input}}
    const finalPrompt = prompt.replace(/\{\{input\}\}/g, input)

    // 4. Call OpenAI with streaming
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
        return NextResponse.json({ error: "AI service not configured" }, { status: 503 })
    }

    try {
        const openai = new OpenAI({ apiKey })

        const stream = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content:
                        "You are a world-class business strategist and AI assistant. Execute the prompt below with precision, depth, and actionable detail. Be thorough and practical.",
                },
                { role: "user", content: finalPrompt },
            ],
            stream: true,
            max_tokens: 4096,
        })

        // Stream response back to client
        const encoder = new TextEncoder()
        const readable = new ReadableStream({
            async start(controller) {
                try {
                    for await (const chunk of stream) {
                        const text = chunk.choices[0]?.delta?.content ?? ""
                        if (text) {
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
                        }
                    }
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"))
                    controller.close()
                } catch (err) {
                    controller.enqueue(
                        encoder.encode(
                            `data: ${JSON.stringify({ error: "Stream interrupted" })}\n\n`
                        )
                    )
                    controller.close()
                }
            },
        })

        return new Response(readable, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
            },
        })
    } catch (err) {
        console.error("[agents/execute] OpenAI error:", err)
        return NextResponse.json(
            { error: "Failed to execute prompt" },
            { status: 500 }
        )
    }
}
