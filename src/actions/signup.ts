"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

// Direct signup roles (Founder, Executive, Apprentice)
type SignupRole = "founder" | "executive" | "apprentice";

// Application roles (VC, Factory, University, Network)
type ApplicationRole = "vc" | "factory" | "university" | "network";

function capitalizeRole(role: string): "Founder" | "Executive" | "Apprentice" {
  const mapping: Record<string, "Founder" | "Executive" | "Apprentice"> = {
    founder: "Founder",
    executive: "Executive",
    apprentice: "Apprentice",
  };
  return mapping[role] || "Apprentice";
}

/**
 * Direct signup for Founders, Executives, and Apprentices
 * Creates auth user and profile immediately
 */
export async function signup(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("name") as string;
  const role = formData.get("role") as SignupRole;
  const intent = formData.get("intent") as string | null;
  const listingId = formData.get("listing_id") as string | null;

  if (!email || !password || !fullName || !role) {
    return redirect(`/join/${role || "general"}?error=All fields are required`);
  }

  // 1. Create auth user
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
    return redirect(`/join/${role}?error=Failed to create account`);
  }

  // 2. Create foundry for Founders, or use a shared foundry for others
  const foundryId =
    role === "founder"
      ? `foundry_${authData.user.id.slice(0, 8)}` // Unique foundry for founders
      : "centaur-guild"; // Shared foundry for execs and apprentices initially

  // 3. Create profile
  const { error: profileError } = await supabase.from("profiles").insert({
    id: authData.user.id,
    email,
    full_name: fullName,
    role: capitalizeRole(role),
    foundry_id: foundryId,
  });

  if (profileError) {
    console.error("Profile creation error:", profileError);
    // Don't fail completely - auth user exists, profile can be created later
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

  // 5. Redirect to success/verification page
  revalidatePath("/", "layout");
  redirect(`/join/success?type=signup&role=${role}`);
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
