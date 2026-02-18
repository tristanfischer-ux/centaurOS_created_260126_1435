/**
 * POST /api/agents/upload
 *
 * @description Uploads a file for specialist/agent chat attachment.
 * Files are stored in Supabase Storage under agent-attachments/{foundryId}/{threadId}/.
 *
 * @security
 * - Requires authentication
 * - Rate limited: 10 uploads per minute per user
 * - Foundry isolation: user must have access to thread's foundry
 * - File size limit: 10MB, MIME allowlist
 *
 * @returns { path, url, filename, size, mimeType }
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getFoundryIdCached } from "@/lib/supabase/foundry-context"
import { rateLimit, getClientIP } from "@/lib/security/rate-limit"

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/x-zip-compressed",
]

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const ip = getClientIP(request.headers)
    const rateLimitResult = await rateLimit("upload", `agent-upload:${user.id}:${ip}`, {
      limit: 10,
      window: 60 * 1000,
    })
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Too many uploads. Please try again later." },
        { status: 429 }
      )
    }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) {
      return NextResponse.json({ error: "No active foundry" }, { status: 400 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const threadId = formData.get("threadId") as string | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }
    if (!threadId || !UUID_REGEX.test(threadId)) {
      return NextResponse.json({ error: "Invalid or missing threadId" }, { status: 400 })
    }

    // AUTH: Ensure thread belongs to user's foundry
    const { data: thread, error: threadError } = await supabase
      .from("agent_memory_threads")
      .select("id, foundry_id")
      .eq("id", threadId)
      .eq("foundry_id", foundryId)
      .single()

    if (threadError || !thread) {
      return NextResponse.json({ error: "Thread not found or access denied" }, { status: 403 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` },
        { status: 413 }
      )
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "File type not allowed. Use images, PDF, Office docs, text, or ZIP." },
        { status: 400 }
      )
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_")
    const unique = `${Date.now()}-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`
    const fileName = `${unique}-${safeName}`
    const filePath = `${foundryId}/${threadId}/${fileName}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("agent-attachments")
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error("[AgentUpload] Storage upload failed:", {
        error: uploadError.message,
        foundryId,
        threadId,
        fileName,
      })
      return NextResponse.json({ error: "Failed to upload file" }, { status: 500 })
    }

    const { data: signedData } = await supabase.storage
      .from("agent-attachments")
      .createSignedUrl(uploadData.path, 60 * 60 * 24) // 24h for sending in chat

    return NextResponse.json({
      path: uploadData.path,
      url: signedData?.signedUrl ?? null,
      filename: file.name,
      size: file.size,
      mimeType: file.type,
    })
  } catch (error) {
    console.error("[AgentUpload] Unexpected error:", error instanceof Error ? error.message : "Unknown error")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
