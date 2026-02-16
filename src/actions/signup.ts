"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { rateLimit, getClientIP } from "@/lib/security/rate-limit";
import { sanitizeEmail, escapeHtml } from "@/lib/security/sanitize";

// Direct signup roles (Founder, Executive, Apprentice, Supplier)
type SignupRole = "founder" | "executive" | "apprentice" | "supplier";

// Application roles (VC, Factory, University, Network)
type ApplicationRole = "vc" | "factory" | "university" | "network";

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

function capitalizeRole(role: string): "Founder" | "Executive" | "Apprentice" {
  const mapping: Record<string, "Founder" | "Executive" | "Apprentice"> = {
    founder: "Founder",
    executive: "Executive",
    apprentice: "Apprentice",
  };
  return mapping[role] || "Apprentice";
}

/**
 * Generate a URL-friendly slug from a company name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

/**
 * Direct signup for Founders, Executives, and Apprentices
 * Creates auth user and profile immediately
 * For Founders: also creates a foundry record with company details
 */
export async function signup(formData: FormData) {
  // Extract role early so error redirects go to the correct page
  const role = (formData.get("role") as SignupRole) || "general";

  // Security: Get client IP for rate limiting
  const headersList = await headers();
  const clientIP = getClientIP(headersList);

  // Security: Rate limit signup attempts
  const rateLimitResult = await rateLimit("signup", clientIP);
  if (!rateLimitResult.success) {
    return redirect(`/join?role=${role}&error=${encodeURIComponent("Too many signup attempts. Please try again later.")}`);
  }

  const supabase = await createClient();

  const rawEmail = formData.get("email") as string;
  const password = formData.get("password") as string;
  const rawFullName = formData.get("name") as string;
  const intent = formData.get("intent") as string | null;
  const listingId = formData.get("listing_id") as string | null;

  // Founder-specific fields
  const rawCompanyName = formData.get("company_name") as string | null;
  const industry = formData.get("industry") as string | null;
  const stage = formData.get("stage") as string | null;

  // Supplier-specific fields
  const rawBusinessName = formData.get("business_name") as string | null;
  const businessType = formData.get("business_type") as string | null;

  // Security: Validate and sanitize inputs
  const email = sanitizeEmail(rawEmail);
  if (!email) {
    return redirect(`/join?role=${role || "general"}&error=${encodeURIComponent("Invalid email address")}`);
  }

  // Security: Sanitize name to prevent XSS
  const fullName = rawFullName ? escapeHtml(rawFullName.trim().slice(0, 100)) : "";
  const companyName = rawCompanyName ? escapeHtml(rawCompanyName.trim().slice(0, 100)) : null;
  const businessName = rawBusinessName ? escapeHtml(rawBusinessName.trim().slice(0, 100)) : null;

  if (!fullName || !role) {
    return redirect(`/join?role=${role || "general"}&error=${encodeURIComponent("All fields are required")}`);
  }

  // Security: Validate password strength
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return redirect(`/join?role=${role || "general"}&error=${encodeURIComponent(passwordValidation.error || "Invalid password")}`);
  }

  // Founders must provide a company name
  if (role === "founder" && !companyName) {
    return redirect(`/join?role=founder&error=${encodeURIComponent("Company name is required")}`);
  }

  // Suppliers must provide a business name
  if (role === "supplier" && !businessName) {
    return redirect(`/join?role=supplier&error=${encodeURIComponent("Business name is required")}`);
  }

  // 1. Create auth user
  // Note: email confirmation is handled server-side after signup (auto-confirmed
  // via admin client) so emailRedirectTo is not needed.
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
    console.error("Signup error:", authError);
    return redirect(
      `/join/${role}?error=${encodeURIComponent(authError.message)}`
    );
  }

  if (!authData.user) {
    return redirect(`/join?role=${role}&error=${encodeURIComponent("Failed to create account")}`);
  }

  let foundryId: string;
  let accountType: 'team_builder' | 'supplier' | null = null;

  // 2. Create foundry for Founders, create business for Suppliers, or use shared "forge-guild" for others
  if (role === "founder" && companyName) {
    accountType = 'team_builder'; // Founders are team builders
    
    // Generate a unique slug
    const baseSlug = generateSlug(companyName);
    const uniqueSlug = `${baseSlug}-${authData.user.id.slice(0, 6)}`;

    // Create the foundry record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: foundry, error: foundryError } = await (supabase as any)
      .from("foundries")
      .insert({
        name: companyName,
        slug: uniqueSlug,
        industry: industry || null,
        stage: stage || null,
        owner_id: authData.user.id,
      })
      .select("id")
      .single();

    if (foundryError) {
      console.error("Foundry creation error:", foundryError);
      // Fall back to string-based foundry ID if creation fails
      foundryId = `foundry_${authData.user.id.slice(0, 8)}`;
    } else {
      // Use the UUID of the created foundry
      foundryId = foundry.id;
    }
  } else if (role === "supplier" && businessName) {
    accountType = 'supplier'; // Suppliers get supplier account type
    
    // Suppliers join a dedicated supplier foundry (isolated from team management)
    foundryId = "forge-suppliers";
    
    // Note: businessName and businessType are captured for later use when creating their listing
  } else {
    accountType = 'team_builder'; // Executives and Apprentices are team builders
    
    // Executives and Apprentices join the shared Guild
    foundryId = "forge-guild";
  }

  // 3. Create profile
  // Suppliers get 'Apprentice' role (minimal permissions) but 'supplier' account_type
  const memberRole = role === 'supplier' ? 'Apprentice' : capitalizeRole(role);

  // VALIDATION: For shared foundries, verify the foundry exists before inserting profile
  if (foundryId === "forge-guild" || foundryId === "forge-suppliers") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: foundryExists } = await (supabase as any)
      .from("foundries")
      .select("id")
      .eq("id", foundryId)
      .single();

    if (!foundryExists) {
      console.error(`[Signup] Shared foundry "${foundryId}" does not exist. Creating it now.`);
      // Auto-create the shared foundry if it's missing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: createFoundryError } = await (supabase as any)
        .from("foundries")
        .insert({
          id: foundryId,
          name: foundryId === "forge-guild" ? "ForgeOS Guild" : "ForgeOS Suppliers",
          slug: foundryId,
          owner_id: authData.user.id,
        });
      if (createFoundryError) {
        console.error(`[Signup] Failed to create shared foundry "${foundryId}":`, createFoundryError);
        // Fall back: set foundryId to null so the user can still sign up
        // Their profile will lack a foundry, but they won't be completely blocked
      }
    }
  }
  
  const { error: profileError } = await supabase.from("profiles").insert({
    id: authData.user.id,
    email,
    full_name: fullName,
    role: memberRole,
    foundry_id: foundryId,
    active_foundry_id: foundryId,
    account_type: accountType,
  });

  if (profileError) {
    console.error("[Signup] Profile creation failed:", {
      userId: authData.user.id,
      foundryId,
      role: memberRole,
      error: profileError.message,
      code: profileError.code,
      details: profileError.details,
    });
    // CRITICAL: Profile is required for the app to function.
    // Redirect to an error state rather than silently continuing.
    return redirect(
      `/join?role=${role}&error=${encodeURIComponent("Account created but profile setup failed. Please try logging in — your profile will be created automatically.")}`
    );
  }

  // 3b. Create foundry_memberships record for multi-foundry support
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("foundry_memberships").insert({
    user_id: authData.user.id,
    foundry_id: foundryId,
    role: memberRole,
    is_primary: true,
    joined_at: new Date().toISOString(),
  });

  // 3c. Seed demo data for new founders so they can explore the app with sample content
  if (role === "founder" && foundryId && authData.user) {
    // Seed demo forge concept (The Forge example)
    try {
      await supabase.rpc("seed_demo_forge_concept", {
        p_foundry_id: foundryId,
        p_user_id: authData.user.id,
      })
    } catch (demoError) {
      // Non-critical — don't fail signup if demo seeding fails
      console.warn("[Signup] Failed to seed demo forge concept:", demoError)
    }

    // Seed demo strategic goals, objectives, and tasks for learning the app
    try {
      await supabase.rpc("seed_founder_demo_data", {
        p_foundry_id: foundryId,
        p_user_id: authData.user.id,
      })
    } catch (demoError) {
      // Non-critical — don't fail signup if demo seeding fails
      console.warn("[Signup] Failed to seed demo objectives/tasks:", demoError)
    }

    // Seed expanded demo data: marketplace listings + activity events
    try {
      await supabase.rpc("seed_founder_demo_data_expanded", {
        p_foundry_id: foundryId,
        p_user_id: authData.user.id,
      })
    } catch (demoError) {
      // Non-critical — don't fail signup if expanded demo seeding fails
      console.warn("[Signup] Failed to seed expanded demo data:", demoError)
    }
  }

  // 3c. Auto-create provider profile for trial roles (Founder, Executive, Apprentice)
  // so they can create marketplace listings without the provider-portal application flow.
  // Founders list themselves to be discoverable; Executives/Apprentices offer their services.
  if ((role === 'founder' || role === 'executive' || role === 'apprentice') && authData.user) {
    const roleLabel = role === 'founder' ? 'Founder' : role === 'executive' ? 'Fractional Executive' : 'Apprentice';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: providerError } = await (supabase as any)
      .from('provider_profiles')
      .insert({
        user_id: authData.user.id,
        headline: roleLabel,
        bio: null,
        tier: 'approved', // Auto-approve for trial — skip application flow
        is_active: true,
        is_public: true,
      });

    if (providerError) {
      // Non-critical — don't fail signup if provider profile creation fails
      console.warn('[Signup] Failed to create provider profile:', providerError);
    }
  }

  // 3a. For suppliers, store their business info in onboarding_data for later use
  if (role === 'supplier' && businessName) {
    await supabase.from("profiles").update({
      onboarding_data: {
        business_name: businessName,
        business_type: businessType,
        is_supplier_signup: true,
      } as any,
    }).eq('id', authData.user.id);
  }

  // 4. Store booking intent if present
  if (intent && listingId) {
    const { error: intentError } = await supabase.from("signup_intents").insert({
      user_id: authData.user.id,
      intent_type: intent,
      listing_id: listingId,
      metadata: { role, email },
    });

    if (intentError) {
      console.error("Failed to store booking intent:", intentError);
      // Don't fail signup over this
    }
  }

  // 5. Auto-confirm email and sign the user in immediately.
  // The user just gave us their email and password — no reason to make them
  // verify via email before they can use the app. Confirm server-side with
  // the admin client, then sign in with the credentials they just provided.
  //
  // CRITICAL: This entire block is wrapped in try/catch because createAdminClient()
  // throws if SUPABASE_SERVICE_ROLE_KEY is missing. An unhandled throw here would
  // crash the server action and flash the user back to a blank form.
  try {
    const adminSupabase = createAdminClient();

    const { error: confirmError } = await adminSupabase.auth.admin.updateUserById(
      authData.user.id,
      { email_confirm: true }
    );

    if (confirmError) {
      console.error("[Signup] Failed to auto-confirm email:", {
        userId: authData.user.id,
        error: confirmError.message,
      });
    }
  } catch (adminError) {
    // Admin client unavailable (missing service role key) or confirm failed.
    // Log but don't block — signInWithPassword will still work if Supabase
    // has email confirmation disabled, or the user can verify via email.
    console.error("[Signup] Admin auto-confirm unavailable:", {
      userId: authData.user.id,
      error: adminError instanceof Error ? adminError.message : "Unknown error",
    });
  }

  // Sign the user in with the password they just created.
  // This works when: (a) email was auto-confirmed above, or
  // (b) Supabase has email confirmation disabled in project settings.
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    console.error("[Signup] Auto sign-in failed:", {
      userId: authData.user.id,
      error: signInError.message,
    });
    // Account was created but we can't sign them in automatically.
    // Send to login — NEVER back to /join (their account already exists).
    revalidatePath("/", "layout");
    redirect(`/login?message=${encodeURIComponent("Account created! Sign in with your email and password.")}`);
  }

  // User is now authenticated — go straight into the app
  revalidatePath("/", "layout");

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

  if (!email || !fullName || !role) {
    return redirect(`/join/${role || "network"}?error=All fields are required`);
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
