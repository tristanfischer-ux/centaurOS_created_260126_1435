/**
 * GET /api/shared/[token]
 *
 * Returns artifact content for a share token (public, no auth).
 * Used by the /shared/[token] page to display shared artifacts.
 *
 * @security Uses service role to read shared_artifacts and agent_artifacts by token only.
 */

import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit, getClientIP } from "@/lib/security/rate-limit"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 })
  }

  // SECURITY: Rate limit public endpoint to prevent token enumeration
  const ip = getClientIP(request.headers)
  const rl = await rateLimit("preview", ip)
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  // SECURITY: admin client — public share link endpoint, foundry_id not needed: intentionally cross-foundry for unauthenticated viewers
  const supabase = createAdminClient()

  // SECURITY: Fetch only metadata first — check expiry BEFORE loading artifact content
  const { data: shared, error: sharedError } = await supabase
    .from("shared_artifacts")
    .select("id, artifact_id, expires_at, view_count")
    .eq("share_token", token)
    .single()

  if (sharedError || !shared) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (shared.expires_at && new Date(shared.expires_at) < new Date()) {
    return NextResponse.json({ error: "Link expired" }, { status: 410 })
  }

  const { data: artifact, error: artifactError } = await supabase
    .from("agent_artifacts")
    .select("id, title, content, content_type")
    .eq("id", shared.artifact_id)
    .single()

  if (artifactError || !artifact) {
    return NextResponse.json({ error: "Artifact not found" }, { status: 404 })
  }

  await supabase
    .from("shared_artifacts")
    .update({ view_count: (shared.view_count ?? 0) + 1 })
    .eq("id", shared.id)

  return NextResponse.json({
    title: artifact.title,
    content: artifact.content,
    contentType: artifact.content_type,
  })
}
