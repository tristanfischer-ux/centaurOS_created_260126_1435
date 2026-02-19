import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWaitlistActionToken } from "@/lib/waitlist-token";
import { sendEmail } from "@/lib/notifications/channels/email";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://fractionalforge.app";

/**
 * GET /api/waitlist/approve?token=<signed_token>
 * One-click approve or reject from admin notification email.
 * Token is signed with WAITLIST_SECRET; no auth required.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return new NextResponse(htmlPage("Invalid link", "Missing token. Use the link from your email."), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const decoded = verifyWaitlistActionToken(token);
  if (!decoded) {
    return new NextResponse(
      htmlPage("Invalid or expired link", "This link has expired or is invalid. Check your email for a recent waitlist notification."),
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const admin = createAdminClient();
  const { data: entry, error: fetchError } = await admin
    .from("waitlist")
    .select("id, email, status, invite_token")
    .eq("id", decoded.id)
    .single();

  if (fetchError || !entry) {
    return new NextResponse(
      htmlPage("Not found", "This waitlist entry could not be found."),
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  if (entry.status !== "pending") {
    return new NextResponse(
      htmlPage("Already processed", `This entry was already ${entry.status}. No action taken.`),
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  if (decoded.action === "reject") {
    const { error: updateError } = await admin
      .from("waitlist")
      .update({ status: "rejected" })
      .eq("id", entry.id);

    if (updateError) {
      console.error("[Waitlist API] Reject update error:", updateError);
      return new NextResponse(
        htmlPage("Error", "Something went wrong. Please try again from the admin page."),
        { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }
    return new NextResponse(
      htmlPage("Rejected", `Entry for ${escapeHtml(entry.email)} has been rejected.`),
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  // Approve
  const { error: updateError } = await admin
    .from("waitlist")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", entry.id);

  if (updateError) {
    console.error("[Waitlist API] Approve update error:", updateError);
    return new NextResponse(
      htmlPage("Error", "Something went wrong. Please try again from the admin page."),
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const inviteUrl = `${BASE_URL}/join?token=${entry.invite_token}`;
  const { success: emailOk } = await sendEmail({
    to: entry.email,
    subject: "You're in! Your Fractional Forge invitation",
    body: "",
    template: "waitlist_approved",
    templateData: { inviteUrl, email: entry.email },
  });

  if (!emailOk) {
    console.error("[Waitlist API] Failed to send invite email to:", entry.email);
  }

  return new NextResponse(
    htmlPage(
      "Approved",
      `Invite ${emailOk ? "sent" : "queued"} to ${escapeHtml(entry.email)}. They can sign up at the link in the email.`
    ),
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Waitlist – ${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
    h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    p { color: #666; margin: 0; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p>${message}</p>
</body>
</html>`;
}
