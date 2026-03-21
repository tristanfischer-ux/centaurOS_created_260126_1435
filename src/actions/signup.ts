"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers, cookies } from "next/headers";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { sanitizeEmail, escapeHtml, sanitizeErrorMessage } from "@/lib/security/sanitize";
import { setupNewUser, capitalizeRole } from "@/lib/auth/setup-new-user";

// Direct signup roles (Founder, Executive, Apprentice, Supplier)
type SignupRole = "founder" | "executive" | "apprentice" | "supplier";

// Application roles (VC, Factory, University, Network)
type ApplicationRole = "vc" | "factory" | "university" | "network";

/**
 * State returned by the signup action for useActionState.
 * On error, `error` contains the message to display inline and `values`
 * echoes back the submitted form data so inputs can repopulate.
 * On success, the action calls redirect() so no state is returned.
 */
export type SignupState = {
  error?: string;
  values?: {
    name?: string;
    email?: string;
    company_name?: string;
    industry?: string;
    stage?: string;
  };
};

/**
 * Security: Validate password strength
 * Requires: min 8 chars, at least one uppercase, one lowercase, one number
 */
function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password || password.length < 8) {
    return { valid: false, error: "Password must be at least 8 characters long" };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: "Password must contain at least one uppercase letter" };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: "Password must contain at least one lowercase letter" };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: "Password must contain at least one number" };
  }
  // Check for common weak passwords
  const commonPasswords = ["password", "12345678", "qwerty123", "letmein123"];
  if (commonPasswords.some(common => password.toLowerCase().includes(common))) {
    return { valid: false, error: "Password is too common. Please choose a stronger password." };
  }
  return { valid: true };
}

/**
 * Direct signup for Founders, Executives, and Apprentices.
 * Creates auth user and profile immediately.
 * For Founders: also creates a foundry record with company details.
 *
 * @description Open signup — no invite token required. Claim flow still
 * supported for suppliers claiming a listing via /claim/<token>.
 *
 * @param _prevState - Previous action state (required by useActionState)
 * @param formData - The submitted form data
 * @returns SignupState with an error message, or never returns on success (redirect)
 */
export async function signup(_prevState: SignupState, formData: FormData): Promise<SignupState> {
  // Extract role early for logging context
  const role = (formData.get("role") as SignupRole) || "general";

  // Capture raw form values up front so every error return can echo them back.
  const rawEmail = formData.get("email") as string;
  const rawFullName = formData.get("name") as string;
  const rawCompanyName = formData.get("company_name") as string | null;
  const rawIndustry = formData.get("industry") as string | null;
  const rawStage = formData.get("stage") as string | null;

  const formValues: SignupState["values"] = {
    name: rawFullName || "",
    email: rawEmail || "",
    company_name: rawCompanyName || "",
    industry: rawIndustry || "",
    stage: rawStage || "",
  };

  /** Return an error with the submitted form values so the client can repopulate fields. */
  function errorWithValues(error: string): SignupState {
    return { error, values: formValues };
  }

  // Claim flow detection (still needed for supplier listing claims)
  const redirectTo = (formData.get("redirect") as string)?.trim() || null;
  // SECURITY: Strict claim flow detection — must be exactly /claim/{16-128 hex chars}
  const isClaimFlow = redirectTo != null && /^\/claim\/[a-f0-9]{16,128}$/.test(redirectTo);

  // SECURITY: Validate claim token against the database to prevent abuse
  if (isClaimFlow) {
    const adminForClaim = createAdminClient();
    const claimToken = redirectTo!.split("/claim/")[1];
    const { data: claimValid } = await adminForClaim
      .from("listing_claim_tokens")
      .select("id")
      .eq("token", claimToken)
      .in("status", ["pending", "clicked"])
      .gt("expires_at", new Date().toISOString())
      .single();

    if (!claimValid) {
      return errorWithValues("This claim link is invalid or has expired. Please contact us for a new one.");
    }
  }

  // Security: Get client IP for rate limiting
  const headersList = await headers();
  const clientIP = getClientIP(headersList);

  // Security: Rate limit signup attempts
  const rateLimitResult = await rateLimit("signup", clientIP);
  if (!rateLimitResult.success) {
    return errorWithValues("Too many signup attempts. Please try again later.");
  }

  const supabase = await createClient();

  const password = formData.get("password") as string;
  const intent = formData.get("intent") as string | null;
  const listingId = formData.get("listing_id") as string | null;

  // Supplier-specific fields
  const rawBusinessName = formData.get("business_name") as string | null;
  const businessType = formData.get("business_type") as string | null;

  // Security: Validate and sanitize inputs
  const email = sanitizeEmail(rawEmail);
  if (!email) {
    return errorWithValues("Invalid email address");
  }

  // Security: Sanitize name to prevent XSS
  const fullName = rawFullName ? escapeHtml(rawFullName.trim().slice(0, 100)) : "";
  const companyName = rawCompanyName ? escapeHtml(rawCompanyName.trim().slice(0, 100)) : null;
  const businessName = rawBusinessName ? escapeHtml(rawBusinessName.trim().slice(0, 100)) : null;

  // Founder-specific fields (used later for foundry creation)
  const industry = rawIndustry || null;
  const stage = rawStage || null;

  if (!fullName || !role) {
    return errorWithValues("All fields are required");
  }

  // SECURITY: Validate role against allowlist to prevent arbitrary role injection
  const validRoles: SignupRole[] = ["founder", "executive", "apprentice", "supplier"];
  if (!validRoles.includes(role)) {
    return errorWithValues("Invalid signup role");
  }

  // Security: Validate password strength
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return errorWithValues(passwordValidation.error || "Invalid password");
  }

  // Founders must provide a company name
  if (role === "founder" && !companyName) {
    return errorWithValues("Company name is required");
  }

  // Suppliers must provide a business name (unless claiming a listing — it already has one)
  if (role === "supplier" && !businessName && !isClaimFlow) {
    return errorWithValues("Business name is required");
  }

  // 1. Create auth user
  // Strategy: try admin client first (creates user without sending a
  // confirmation email → avoids Supabase's email rate limit entirely).
  // Fall back to the regular signUp() if admin client is unavailable.
  let userId: string;
  let createdViaAdmin = false;

  try {
    const adminSupabase = createAdminClient();
    const { data: adminUser, error: adminCreateError } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // auto-confirmed — no email sent
      user_metadata: {
        full_name: fullName,
        role: capitalizeRole(role),
      },
    });

    if (adminCreateError) {
      console.error("[Signup] Admin createUser failed:", adminCreateError.message);
      throw adminCreateError; // fall through to regular signUp
    }

    userId = adminUser.user.id;
    createdViaAdmin = true;
    console.info("[Signup] User created via admin client (no email sent):", userId);

    // CRITICAL: admin.createUser() does NOT establish a session on the regular
    // supabase client. We must sign in immediately so that all subsequent
    // database operations (foundry, profile, memberships) pass RLS checks.
    const { error: earlySignInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (earlySignInError) {
      console.error("[Signup] Early sign-in after admin creation failed:", {
        userId,
        error: earlySignInError.message,
      });
    }
  } catch (adminError) {
    console.warn("[Signup] Admin creation unavailable, falling back to signUp():", {
      error: adminError instanceof Error ? adminError.message : "Unknown error",
    });

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role: capitalizeRole(role),
        },
      },
    });

    if (authError) {
      console.error("[Signup] signUp error:", authError);
      return errorWithValues(sanitizeErrorMessage(authError));
    }

    if (!authData.user) {
      return errorWithValues("Failed to create account");
    }

    userId = authData.user.id;
  }

  // Read referral code from cookie (set via ?ref= on join page)
  const cookieStore = await cookies();
  const referralCode = cookieStore.get('forge_ref')?.value || null;

  // 2. Set up profile, foundry, memberships, demo data via shared helper
  await setupNewUser({
    supabase,
    userId,
    email,
    fullName,
    role,
    companyName,
    industry,
    stage,
    businessName,
    businessType,
    referralCode,
  });

  // 3. Store booking intent if present
  if (intent && listingId) {
    const { error: intentError } = await supabase.from("signup_intents").insert({
      user_id: userId,
      intent_type: intent,
      listing_id: listingId,
      metadata: { role, email },
    });

    if (intentError) {
      console.error("Failed to store booking intent:", intentError);
    }
  }

  // 4. Auto-confirm email (only needed if user was created via regular signUp)
  if (!createdViaAdmin) {
    try {
      const adminSupabase = createAdminClient();
      const { error: confirmError } = await adminSupabase.auth.admin.updateUserById(
        userId,
        { email_confirm: true }
      );
      if (confirmError) {
        console.error("[Signup] Failed to auto-confirm email:", confirmError.message);
      }
    } catch (adminError) {
      console.error("[Signup] Admin auto-confirm unavailable:", {
        error: adminError instanceof Error ? adminError.message : "Unknown error",
      });
    }
  }

  // 5. Sign the user in
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    console.error("[Signup] Auto sign-in failed:", signInError.message);
    revalidatePath("/", "layout");
    redirect(`/login?message=${encodeURIComponent("Account created! Sign in with your email and password.")}`);
  }

  revalidatePath("/", "layout");

  // Claim flow: redirect back to the claim page to complete the claim
  // SECURITY: Strict regex — only /claim/{16-128 hex chars}, no traversal/query/encoded chars
  if (isClaimFlow && redirectTo && /^\/claim\/[a-f0-9]{16,128}$/.test(redirectTo)) {
    redirect(redirectTo);
  }

  if (role === "supplier") {
    redirect("/supplier-portal");
  }

  redirect("/today");
}

/**
 * Application submission for Network Partners (VCs, Factories, Universities)
 * Creates an application record for review
 */
export async function submitApplication(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const fullName = formData.get("name") as string;
  const role = formData.get("role") as ApplicationRole;
  const intent = formData.get("intent") as string | null;
  const listingId = formData.get("listing_id") as string | null;

  // SECURITY: Validate role against allowlist to prevent path traversal in redirect
  const validAppRoles: ApplicationRole[] = ["vc", "factory", "university", "network"];
  if (!role || !validAppRoles.includes(role)) {
    return redirect("/join?error=Invalid+role");
  }

  if (!email || !fullName) {
    return redirect(`/join/${role}?error=All+fields+are+required`);
  }

  // Build application data based on role
  const applicationData: Record<string, unknown> = {
    contact_name: fullName,
    contact_email: email,
  };

  // Add role-specific fields
  if (role === "vc") {
    applicationData.firm_name = formData.get("firm");
    applicationData.aum_range = formData.get("aum");
  } else if (role === "factory") {
    applicationData.facility_name = formData.get("facility");
    applicationData.capabilities = formData.get("capabilities");
  } else if (role === "university") {
    applicationData.institution = formData.get("institution");
    applicationData.department = formData.get("department");
  }

  // Add booking intent if present
  if (intent && listingId) {
    applicationData.booking_intent = intent;
    applicationData.listing_id = listingId;
  }

  // Insert application (user_id will be null for unauthenticated applications)
  const { error } = await supabase.from("provider_applications").insert({
    category: role,
    company_name:
      (formData.get("firm") as string) ||
      (formData.get("facility") as string) ||
      (formData.get("institution") as string) ||
      null,
    application_data: applicationData as any,
    status: "pending",
  } as any);

  if (error) {
    console.error("Application submission error:", error);
    return redirect(
      `/join/${role}?error=${encodeURIComponent("Failed to submit application. Please try again.")}`
    );
  }

  // Redirect to success page
  redirect(`/join/success?type=application&role=${role}`);
}
