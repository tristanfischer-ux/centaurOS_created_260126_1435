/**
 * @file route.ts — SSE endpoint for streaming email sequence generation.
 *
 * @description Authenticates the user, fetches campaign + contact + KB data,
 * calls Claude's streaming API, forwards text chunks as SSE events, then
 * parses and saves the complete response to the database.
 *
 * @security Filters all queries by foundry_id. Auth via Supabase session.
 */

import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { aiGuard } from "@/lib/ai/guard"
import { rateLimit } from "@/lib/security/rate-limit"
import { buildOutreachPrompt, parseSequenceResponse } from "@/lib/outreach/prompt-builder"
import type { Campaign, Contact, OutreachKBEntry } from "@/types/outreach"

export const maxDuration = 120

export async function POST(request: Request) {
    // AUTH + AI GATE: Verify user session and check AI usage limits
    const supabase = await createClient()
    const guard = await aiGuard(supabase, 'outreach')
    if (guard.denied) return guard.response
    const user = { id: guard.userId }
    const foundryId = guard.foundryId
    if (!foundryId) {
        return NextResponse.json({ error: "Missing foundry" }, { status: 403 })
    }

    // SECURITY: Rate limit outreach generation (20 per hour per user)
    const rateLimitResult = await rateLimit('api', `outreach:${user.id}`, { limit: 20, window: 60 * 60 * 1000 })
    if (!rateLimitResult.success) {
        return NextResponse.json({ error: "Rate limit exceeded. Please wait before generating more sequences." }, { status: 429 })
    }

    // 3. Parse body
    let campaignId: string
    let contactId: string

    try {
        const body = await request.json()
        campaignId = body.campaignId
        contactId = body.contactId
        if (!campaignId || !contactId) throw new Error("Missing IDs")
    } catch {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    // 4. Fetch campaign, contact, and KB in parallel
    const [campaignRes, contactRes, kbRes] = await Promise.all([
        supabase.from("outreach_campaigns").select("*").eq("id", campaignId).eq("foundry_id", foundryId).single(),
        supabase.from("outreach_contacts").select("*").eq("id", contactId).eq("foundry_id", foundryId).single(),
        supabase.from("outreach_knowledge_base").select("*").eq("foundry_id", foundryId).limit(20),
    ])

    if (campaignRes.error || !campaignRes.data) {
        return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    }
    if (contactRes.error || !contactRes.data) {
        return NextResponse.json({ error: "Contact not found" }, { status: 404 })
    }

    const campaign: Campaign = {
        ...campaignRes.data,
        value_props: campaignRes.data.value_props as string[],
        case_studies: campaignRes.data.case_studies as string[],
        metadata: campaignRes.data.metadata as Record<string, unknown>,
    }

    const contact: Contact = {
        ...contactRes.data,
        tech_stack: contactRes.data.tech_stack as string[],
        signals: contactRes.data.signals as string[],
        pain_points: contactRes.data.pain_points as string[],
    }

    const knowledgeBase: OutreachKBEntry[] = (kbRes.data || []).map(kb => ({
        ...kb,
        tags: kb.tags as string[],
    }))

    // 5. Build prompt
    const { systemPrompt, userPrompt } = buildOutreachPrompt({ campaign, contact, knowledgeBase })

    // 6. Stream from Claude
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
    if (!apiKey) {
        return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 })
    }

    const encoder = new TextEncoder()

    const readable = new ReadableStream({
        async start(controller) {
            let fullOutput = ""
            const heartbeatInterval = setInterval(() => {
                try { controller.enqueue(encoder.encode(": keepalive\n\n")) } catch { /* stream closed */ }
            }, 15_000)

            try {
                const response = await fetch("https://api.anthropic.com/v1/messages", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-api-key": apiKey,
                        "anthropic-version": "2023-06-01",
                    },
                    body: JSON.stringify({
                        model: "claude-sonnet-4-6",
                        max_tokens: 4096,
                        stream: true,
                        system: systemPrompt,
                        messages: [{ role: "user", content: userPrompt }],
                    }),
                    signal: AbortSignal.timeout(120_000),
                })

                if (!response.ok || !response.body) {
                    const errText = await response.text()
                    console.error("[Outreach SSE] API error:", { status: response.status, body: errText.slice(0, 500) })
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Email generation failed. Please try again." })}\n\n`))
                    controller.close()
                    clearInterval(heartbeatInterval)
                    return
                }

                const reader = response.body.getReader()
                const decoder = new TextDecoder()
                let buffer = ""

                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break

                    buffer += decoder.decode(value, { stream: true })
                    const lines = buffer.split("\n")
                    buffer = lines.pop() ?? ""

                    for (const line of lines) {
                        if (!line.startsWith("data: ")) continue
                        const payload = line.slice(6).trim()
                        if (payload === "[DONE]") continue

                        try {
                            const event = JSON.parse(payload)

                            // FLOW: Forward text delta chunks to client
                            if (event.type === "content_block_delta" && event.delta?.text) {
                                fullOutput += event.delta.text
                                controller.enqueue(encoder.encode(
                                    `data: ${JSON.stringify({ text: event.delta.text })}\n\n`
                                ))
                            }
                        } catch {
                            // Skip non-JSON lines
                        }
                    }
                }

                // 7. Parse and save to DB
                clearInterval(heartbeatInterval)

                let emailCount = 0
                try {
                    const parsedEmails = parseSequenceResponse(fullOutput)
                    emailCount = parsedEmails.length

                    // Delete existing emails for this contact
                    await supabase
                        .from("outreach_emails")
                        .delete()
                        .eq("contact_id", contactId)
                        .eq("foundry_id", foundryId)

                    // Insert new emails
                    const emailRows = parsedEmails.map(email => ({
                        foundry_id: foundryId,
                        contact_id: contactId,
                        campaign_id: campaignId,
                        created_by: user.id,
                        sequence_position: email.sequence_position,
                        sequence_label: email.sequence_label,
                        subject: email.subject,
                        subject_variants: email.subject_variants,
                        body: email.body,
                        send_delay_days: email.send_delay_days,
                        status: "draft" as const,
                    }))

                    await supabase.from("outreach_emails").insert(emailRows)

                    // Update contact status
                    await supabase
                        .from("outreach_contacts")
                        .update({ status: "sequenced", updated_at: new Date().toISOString() })
                        .eq("id", contactId)
                        .eq("foundry_id", foundryId)

                } catch (err) {
                    console.error("[Outreach SSE] Failed to parse/save:", err)
                    controller.enqueue(encoder.encode(
                        `data: ${JSON.stringify({ error: "Failed to parse generated emails" })}\n\n`
                    ))
                    controller.close()
                    return
                }

                guard.trackUsage({ model: 'claude-sonnet-4-6' }).catch(() => {})

                controller.enqueue(encoder.encode(
                    `data: ${JSON.stringify({ done: true, emailCount })}\n\n`
                ))
                controller.close()

            } catch (err) {
                clearInterval(heartbeatInterval)
                console.error("[Outreach SSE] Stream error:", err)
                try {
                    controller.enqueue(encoder.encode(
                        `data: ${JSON.stringify({ error: "Generation failed" })}\n\n`
                    ))
                    controller.close()
                } catch { /* already closed */ }
            }
        },
    })

    return new Response(readable, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    })
}
