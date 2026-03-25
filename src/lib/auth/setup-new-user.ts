/**
 * Shared helper for setting up a new user's profile, foundry, memberships,
 * and demo data. Used by both email/password signup and OAuth callback.
 *
 * @module setup-new-user
 */

import type { SupabaseClient } from "@supabase/supabase-js";

type SignupRole = "founder" | "executive" | "apprentice" | "supplier";

export interface SetupNewUserParams {
  supabase: SupabaseClient;
  userId: string;
  email: string;
  fullName: string;
  role: SignupRole;
  companyName?: string | null;
  industry?: string | null;
  stage?: string | null;
  businessName?: string | null;
  businessType?: string | null;
  /** Referral code from the forge_ref cookie (set via ?ref= on join page) */
  referralCode?: string | null;
}

export interface SetupNewUserResult {
  foundryId: string;
  redirectPath: string;
}

export function capitalizeRole(role: string): "Founder" | "Executive" | "Apprentice" | "Supplier" {
  const mapping: Record<string, "Founder" | "Executive" | "Apprentice" | "Supplier"> = {
    founder: "Founder",
    executive: "Executive",
    apprentice: "Apprentice",
    supplier: "Supplier",
  };
  return mapping[role] || "Apprentice";
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

/**
 * Sets up a new user's profile, foundry, memberships, and demo data.
 * Handles Founder (own foundry), Supplier (forge-suppliers), and
 * Executive/Apprentice (forge-guild) paths.
 *
 * @returns foundryId and redirectPath for the new user
 */
export async function setupNewUser({
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
}: SetupNewUserParams): Promise<SetupNewUserResult> {
  // SECURITY: Idempotency guard — if profile already exists, this is a duplicate
  // call (e.g., signup race condition, double-click). Return early to prevent
  // duplicate foundry/membership creation.
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id, foundry_id")
    .eq("id", userId)
    .single();

  if (existingProfile) {
    console.warn("[setupNewUser] Profile already exists for user, skipping:", userId);
    return {
      foundryId: existingProfile.foundry_id || "forge-guild",
      redirectPath: role === "supplier" ? "/supplier-portal" : "/today",
    };
  }

  const memberRole = capitalizeRole(role);
  let foundryId: string;
  let accountType: "team_builder" | "supplier" | null = null;

  // --- Foundry creation / assignment ---
  if (role === "founder" && companyName) {
    accountType = "team_builder";

    // INTENT: Break the circular FK dependency (profiles.foundry_id → foundries.id,
    // foundries.owner_id → profiles.id) by creating the foundry with NULL owner first,
    // then the profile pointing to it, then setting the owner. This is atomic — if any
    // step fails, the user doesn't end up in forge-guild with someone else's data.
    const baseSlug = generateSlug(companyName);
    const uniqueSlug = `${baseSlug}-${userId.slice(0, 6)}`;

    // Step 1: Create foundry with NULL owner (no profile FK dependency)
    // INTENT: foundries.id is text NOT NULL with no default — must generate explicitly.
    const foundryUniqueId = uniqueSlug;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let { data: foundry, error: foundryError } = await (supabase as any)
      .from("foundries")
      .insert({
        id: foundryUniqueId,
        name: companyName,
        slug: uniqueSlug,
        industry: industry || null,
        stage: stage || null,
        owner_id: null,
      })
      .select("id")
      .single();

    if (foundryError) {
      // Retry with more unique slug (likely slug collision)
      const retrySlug = `${baseSlug}-${Date.now().toString(36)}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const retry = await (supabase as any)
        .from("foundries")
        .insert({
          id: retrySlug,
          name: companyName,
          slug: retrySlug,
          industry: industry || null,
          stage: stage || null,
          owner_id: null,
        })
        .select("id")
        .single();
      foundry = retry.data;
      foundryError = retry.error;
    }

    if (foundryError || !foundry) {
      console.error("[setupNewUser] Foundry creation failed after retry:", foundryError);
      foundryId = "forge-guild";
    } else {
      foundryId = foundry.id;
    }

    // Step 2: Create profile pointing to the real foundry (or forge-guild fallback)
    const { error: profileError } = await supabase.from("profiles").insert({
      id: userId,
      email,
      full_name: fullName,
      role: memberRole,
      foundry_id: foundryId,
      active_foundry_id: foundryId,
      account_type: accountType,
    });

    if (profileError) {
      console.error("[setupNewUser] Founder profile creation failed:", profileError.message);
      return { foundryId: "forge-guild", redirectPath: "/today" };
    }

    // Step 3: Set the foundry owner now that profile exists
    if (foundryId !== "forge-guild") {
      await supabase.from("foundries").update({ owner_id: userId }).eq("id", foundryId);
    }
  } else if (role === "supplier") {
    accountType = "supplier";
    foundryId = "forge-suppliers";
  } else {
    accountType = "team_builder";
    foundryId = "forge-guild";
  }

  // --- Ensure shared foundry exists ---
  if (foundryId === "forge-guild" || foundryId === "forge-suppliers") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: foundryExists } = await (supabase as any)
      .from("foundries")
      .select("id")
      .eq("id", foundryId)
      .single();

    if (!foundryExists) {
      console.error(`[setupNewUser] Shared foundry "${foundryId}" missing. Creating.`);
      // SECURITY: Use system UUID as owner, not the signing-up user (RT2-05)
      const SYSTEM_UUID = '00000000-0000-0000-0000-000000000000';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("foundries").insert({
        id: foundryId,
        name: foundryId === "forge-guild" ? "ForgeOS Guild" : "ForgeOS Suppliers",
        slug: foundryId,
        owner_id: SYSTEM_UUID,
      });
    }
  }

  // --- Create profile for non-founders AND founders without company (OAuth edge case) ---
  // GOTCHA: Founders with companyName already created their profile above (step 2).
  // Founders WITHOUT companyName fall through to the else branch and need a profile here.
  if (role !== "founder" || !companyName) {
    const { error: profileError } = await supabase.from("profiles").insert({
      id: userId,
      email,
      full_name: fullName,
      role: memberRole,
      foundry_id: foundryId,
      active_foundry_id: foundryId,
      account_type: accountType,
    });

    if (profileError) {
      console.error("[setupNewUser] Profile creation failed:", profileError.message);
      return { foundryId, redirectPath: "/today" };
    }
  }

  // --- Foundry membership ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("foundry_memberships").insert({
    user_id: userId,
    foundry_id: foundryId,
    role: memberRole,
    is_primary: true,
    joined_at: new Date().toISOString(),
  });

  // --- Demo data for founders (own isolated foundry) ---
  // DECISION: Only seed demo data for founders who get their own foundry (RT-03).
  // Executives/Apprentices share forge-guild — seeding per-user demo concepts into
  // a shared foundry causes data pollution (N signups = 3N demo entries visible to
  // everyone). The guided tour still shows them what The Forge looks like.
  // GOTCHA: Founders without companyName (OAuth edge case) fall through to
  // forge-guild. Guard against seeding into shared foundries (RT2-04).
  if (role === "founder" && foundryId && foundryId !== "forge-guild") {
    // Demo forge concepts — 3 products showing breadth of The Forge
    const conceptRpcs = [
      "seed_demo_forge_concept",
      "seed_demo_air_quality_sensor",
      "seed_demo_drone_motor_mount",
    ] as const;

    for (const rpc of conceptRpcs) {
      try {
        await supabase.rpc(rpc, {
          p_foundry_id: foundryId,
          p_user_id: userId,
        });
      } catch (e) {
        console.warn(`[setupNewUser] ${rpc} failed:`, e);
      }
    }

    // Founder-only: demo objectives and tasks
    try {
      await supabase.rpc("seed_founder_demo_data", {
        p_foundry_id: foundryId,
        p_user_id: userId,
      });
    } catch (e) {
      console.warn("[setupNewUser] seed_founder_demo_data failed:", e);
    }

    try {
      await supabase.rpc("seed_founder_demo_data_expanded", {
        p_foundry_id: foundryId,
        p_user_id: userId,
      });
    } catch (e) {
      console.warn("[setupNewUser] seed_founder_demo_data_expanded failed:", e);
    }
  }

  // --- Provider profile for trial roles ---
  if (role === "founder" || role === "executive" || role === "apprentice") {
    const roleLabel =
      role === "founder" ? "Founder" : role === "executive" ? "Fractional Executive" : "Apprentice";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: providerError } = await (supabase as any).from("provider_profiles").insert({
      user_id: userId,
      headline: roleLabel,
      bio: null,
      tier: "approved",
      is_active: true,
      is_public: true,
    });
    if (providerError) {
      console.warn("[setupNewUser] Provider profile failed:", providerError);
    }
  }

  // --- Supplier business info ---
  if (role === "supplier" && businessName) {
    await supabase
      .from("profiles")
      .update({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onboarding_data: {
          business_name: businessName,
          business_type: businessType,
          is_supplier_signup: true,
        } as any,
      })
      .eq("id", userId);
  }

  // --- Referral tracking + founding member check ---
  // FLOW: Non-blocking — referral/founding errors shouldn't break signup
  try {
    const { processSignupReferral } = await import('@/lib/referrals/process-signup')
    await processSignupReferral(referralCode, userId, foundryId)
  } catch (e) {
    console.warn('[setupNewUser] Referral/founding member processing failed (non-blocking):', e)
  }

  // --- Determine redirect ---
  let redirectPath = "/today";
  if (role === "supplier") {
    redirectPath = "/supplier-portal";
  }

  return { foundryId, redirectPath };
}
