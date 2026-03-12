"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { headers } from "next/headers";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { sanitizeEmail } from "@/lib/security/sanitize";
import { sendEmail } from "@/lib/notifications/channels/email";
import { createWaitlistActionToken } from "@/lib/waitlist-token";
import type { Database } from "@/types/database.types";

type WaitlistRow = Database["public"]["Tables"]["waitlist"]["Row"];

const ADMIN_EMAIL = process.env.PLATFORM_SUPER_ADMIN_EMAIL;
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://fractionalforge.app";

export type JoinWaitlistResult =
  | { success: true; message: string }
  | { success: false; error: string };

/**
 * Join the waitlist. Inserts email, sends notification to admin with approve/reject links.
 *
 * @param email - Applicant email
 * @returns Success message or error
 */
export async function joinWaitlist(email: string): Promise<JoinWaitlistResult> {
  const headersList = await headers();
  const clientIP = getClientIP(headersList);

  const rateLimitResult = await rateLimit("waitlist", clientIP);
  if (!rateLimitResult.success) {
    return { success: false, error: "Too many attempts. Please try again later." };
  }

  const normalized = sanitizeEmail(email);
  if (!normalized) {
    return { success: false, error: "Please enter a valid email address." };
  }

  if (!ADMIN_EMAIL) {
    console.error("[Waitlist] PLATFORM_SUPER_ADMIN_EMAIL not set");
    return { success: false, error: "Something went wrong. Please try again later." };
  }

  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("waitlist")
    .select("id, status")
    .eq("email", normalized)
    .maybeSingle();

  if (fetchError) {
    console.error("[Waitlist] Fetch error:", fetchError);
    return { success: false, error: "Something went wrong. Please try again later." };
  }

  // SECURITY: Return the same message regardless of status to prevent email enumeration
  if (existing) {
    return { success: true, message: "Thanks! We'll be in touch when your spot is ready." };
  }

  const { data: row, error: insertError } = await admin
    .from("waitlist")
    .insert({ email: normalized, status: "pending" })
    .select("id, created_at")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return { success: true, message: "You're already on the list! We'll be in touch." };
    }
    console.error("[Waitlist] Insert error:", insertError);
    return { success: false, error: "Something went wrong. Please try again later." };
  }

  const approveToken = createWaitlistActionToken(row.id, "approve");
  const rejectToken = createWaitlistActionToken(row.id, "reject");
  const approveUrl = `${BASE_URL}/api/waitlist/approve?token=${encodeURIComponent(approveToken)}`;
  const rejectUrl = `${BASE_URL}/api/waitlist/approve?token=${encodeURIComponent(rejectToken)}`;
  const createdAt = row.created_at
    ? new Date(row.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    : "Just now";

  await sendEmail({
    to: ADMIN_EMAIL,
    subject: `New Waitlist Signup: ${normalized}`,
    body: "",
    template: "waitlist_admin_notification",
    templateData: {
      email: normalized,
      createdAt,
      approveUrl,
      rejectUrl,
    },
  });

  return { success: true, message: "Thanks! We'll be in touch when your spot is ready." };
}

/**
 * Approve a waitlist entry (admin only). Updates status and sends invite email to applicant.
 */
export async function approveWaitlistEntry(entryId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { error: "You must be signed in to approve." };
  }
  // SECURITY: Fail-closed — if ADMIN_EMAIL is not configured, deny all approvals
  if (!ADMIN_EMAIL) {
    return { error: "Admin functionality is not configured." };
  }
  if (user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return { error: "Only the platform admin can approve waitlist entries." };
  }

  const admin = createAdminClient();
  const { data: entry, error: fetchError } = await admin
    .from("waitlist")
    .select("id, email, status, invite_token")
    .eq("id", entryId)
    .single();

  if (fetchError || !entry) {
    return { error: "Entry not found." };
  }
  if (entry.status !== "pending") {
    return { error: "This entry has already been processed." };
  }

  const { error: updateError } = await admin
    .from("waitlist")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: user.id,
    })
    .eq("id", entryId);

  if (updateError) {
    console.error("[Waitlist] Approve update error:", updateError);
    return { error: "Failed to update entry." };
  }

  const inviteUrl = `${BASE_URL}/join?token=${entry.invite_token}`;
  await sendEmail({
    to: entry.email,
    subject: "You're in! Your Fractional Forge invitation",
    body: "",
    template: "waitlist_approved",
    templateData: { inviteUrl, email: entry.email },
  });

  return {};
}

/**
 * Reject a waitlist entry (admin only).
 */
export async function rejectWaitlistEntry(entryId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { error: "You must be signed in to reject." };
  }
  // SECURITY: Fail-closed — if ADMIN_EMAIL is not configured, deny all rejections
  if (!ADMIN_EMAIL) {
    return { error: "Admin functionality is not configured." };
  }
  if (user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return { error: "Only the platform admin can reject waitlist entries." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("waitlist")
    .update({ status: "rejected", approved_at: new Date().toISOString(), approved_by: user.id })
    .eq("id", entryId);

  if (error) {
    console.error("[Waitlist] Reject update error:", error);
    return { error: "Failed to update entry." };
  }
  return {};
}

/**
 * Fetch all waitlist entries for admin page (admin only).
 */
export async function getWaitlistEntries(): Promise<{
  entries: WaitlistRow[];
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return { entries: [], error: "You must be signed in." };
  }
  // SECURITY: Fail-closed — if ADMIN_EMAIL is not configured, deny access
  if (!ADMIN_EMAIL) {
    return { entries: [], error: "Admin functionality is not configured." };
  }
  if (user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return { entries: [], error: "Only the platform admin can view the waitlist." };
  }

  const admin = createAdminClient();
  const { data: entries, error } = await admin
    .from("waitlist")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Waitlist] Fetch entries error:", error);
    return { entries: [], error: "Failed to load waitlist." };
  }
  return { entries: entries ?? [] };
}
