"use server"

/**
 * @file meeting-thread-pdf.tsx
 *
 * @description Thin server action wrapper around the Node.js PDF route handler.
 *
 * WHY a separate route handler:
 *   @react-pdf/renderer requires the Node.js runtime (Buffer, canvas, pdfkit).
 *   Next.js server actions inherit the runtime of the page that calls them.
 *   The /agents/m/[id] page runs in the Edge runtime (no explicit runtime export
 *   → Edge by default). The Edge runtime doesn't have Node.js APIs.
 *   The route handler at /api/brainstorm-pdf/[threadId] exports
 *   `runtime = 'nodejs'` explicitly, so react-pdf always runs in Node.js.
 *   This wrapper handles the primary auth gate + cache check, then delegates
 *   the heavy lifting to the route (same pattern as brainstorm-cover.ts →
 *   /api/brainstorm-cover/[threadId]).
 *
 * @security
 *   - Auth-gated: caller must be authenticated AND able to SELECT the thread
 *     via RLS. Anonymous requests return NOT_AUTHENTICATED immediately.
 *   - Cookie forwarding: the user's session cookie is forwarded to the route
 *     handler so its own auth check passes.
 *
 * @related
 *   src/app/api/brainstorm-pdf/[threadId]/route.tsx — Node.js renderer
 *   src/components/pdf/MeetingThreadPdf.tsx — react-pdf Document component
 *   src/app/(platform)/agents/meeting-history.tsx — Download button (history)
 *   src/app/(platform)/agents/m/[id]/meeting-thread-view.tsx — Download button
 *   src/actions/brainstorm-cover.ts — same pattern reference
 */

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isValidUUID } from "@/lib/security/sanitize"

// ─── Constants ────────────────────────────────────────────────────────────────

const COVER_BUCKET = "brainstorm-assets"
const SIGNED_URL_EXPIRY_SECONDS = 3_600

// ─── Result type ──────────────────────────────────────────────────────────────

export type GenerateMeetingThreadPdfResult =
    | { ok: true; signedUrl: string }
    | {
          ok: false
          error: string
          errorCode:
              | "INVALID_ID"
              | "NOT_AUTHENTICATED"
              | "NOT_AUTHORISED"
              | "ROUTE_FAILED"
              | "INTERNAL"
      }

// ─── Action ───────────────────────────────────────────────────────────────────

/**
 * Generate or retrieve a signed PDF URL for a meeting thread.
 *
 * @description
 *   1. Validate the threadId.
 *   2. Auth-gate: caller must be authenticated and own/read the thread.
 *   3. Check if a cached PDF exists — if so, re-sign and return immediately.
 *   4. Otherwise: call /api/brainstorm-pdf/[threadId] (Node.js runtime) with
 *      the user's Cookie header forwarded so the route's auth check passes.
 *      The route renders the PDF, uploads it, saves transcript_pdf_url, and
 *      returns the signed URL as JSON.
 *
 * @param threadId — UUID of the meeting_thread
 * @returns signed URL (1-hour expiry) or an error object
 */
export async function generateMeetingThreadPdf(
    threadId: string,
): Promise<GenerateMeetingThreadPdfResult> {
    // ── 1. Validate ────────────────────────────────────────────────────────────
    if (!isValidUUID(threadId)) {
        return { ok: false, error: "Invalid thread ID", errorCode: "INVALID_ID" }
    }

    // ── 2. Auth gate ───────────────────────────────────────────────────────────
    const userClient = await createClient()
    const {
        data: { user },
    } = await userClient.auth.getUser()

    if (!user) {
        return { ok: false, error: "Not authenticated", errorCode: "NOT_AUTHENTICATED" }
    }

    const { data: gateRow, error: gateErr } = await userClient
        .from("meeting_threads")
        .select("id, transcript_pdf_url")
        .eq("id", threadId)
        .single()

    if (gateErr || !gateRow) {
        return { ok: false, error: "Not authorised", errorCode: "NOT_AUTHORISED" }
    }

    // ── 3. Cache check — re-sign an existing PDF rather than re-rendering ──────
    if (gateRow.transcript_pdf_url) {
        const admin = createAdminClient()
        const { data: signData, error: signErr } = await admin.storage
            .from(COVER_BUCKET)
            .createSignedUrl(`${threadId}/transcript.pdf`, SIGNED_URL_EXPIRY_SECONDS)

        if (!signErr && signData?.signedUrl) {
            console.info("[meeting-thread-pdf] Returning cached PDF:", { threadId })
            return { ok: true, signedUrl: signData.signedUrl }
        }
        // File may have been deleted — fall through to regenerate
        console.warn("[meeting-thread-pdf] Re-sign failed, regenerating:", {
            threadId,
            signErr: signErr?.message,
        })
    }

    // ── 4. Delegate rendering to the Node.js route handler ────────────────────
    // The route handler runs in the Node.js sandbox (export const runtime = 'nodejs')
    // which is required for @react-pdf/renderer. We forward the user's cookie so
    // the route's own auth check can pass.
    const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"

    // Forward caller's cookies (Next.js server action has access to next/headers)
    const { cookies } = await import("next/headers")
    const cookieStore = await cookies()
    const cookieHeader = cookieStore
        .getAll()
        .map((c) => `${c.name}=${c.value}`)
        .join("; ")

    const routeUrl = `${baseUrl}/api/brainstorm-pdf/${threadId}`

    try {
        const resp = await fetch(routeUrl, {
            method: "GET",
            headers: {
                Cookie: cookieHeader,
                Accept: "application/json",
            },
            // Allow up to 4 minutes for large transcripts (route maxDuration=300)
            signal: AbortSignal.timeout(240_000),
        })

        if (!resp.ok) {
            const errBody = await resp.text().catch(() => "")
            console.error("[meeting-thread-pdf] Route returned non-ok:", {
                threadId,
                status: resp.status,
                body: errBody.slice(0, 300),
            })
            return {
                ok: false,
                error: `PDF generation failed (HTTP ${resp.status})`,
                errorCode: "ROUTE_FAILED",
            }
        }

        const body = (await resp.json()) as { ok: boolean; signedUrl?: string; error?: string }

        if (!body.ok || !body.signedUrl) {
            console.error("[meeting-thread-pdf] Route returned error body:", { threadId, body })
            return {
                ok: false,
                error: body.error ?? "PDF generation failed",
                errorCode: "ROUTE_FAILED",
            }
        }

        console.info("[meeting-thread-pdf] PDF ready:", { threadId })
        return { ok: true, signedUrl: body.signedUrl }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error("[meeting-thread-pdf] Route call failed:", { threadId, message })
        return { ok: false, error: message, errorCode: "INTERNAL" }
    }
}
