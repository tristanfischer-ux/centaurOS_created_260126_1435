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
  const memberRole = capitalizeRole(role);
  let foundryId: string;
  let accountType: "team_builder" | "supplier" | null = null;

  // --- Foundry creation / assignment ---
  if (role === "founder" && companyName) {
    accountType = "team_builder";

    // Profile must exist before foundry (FK: foundries.owner_id → profiles.id).
    // Create with temp shared foundry, then create real foundry, then update.
    const { error: tempProfileError } = await supabase.from("profiles").insert({
      id: userId,
      email,
      full_name: fullName,
      role: memberRole,
      foundry_id: "forge-guild",
      active_foundry_id: "forge-guild",
      account_type: accountType,
    });

    if (tempProfileError) {
      console.error("[setupNewUser] Founder profile creation failed:", tempProfileError.message);
      return { foundryId: "forge-guild", redirectPath: "/today" };
    }

    const baseSlug = generateSlug(companyName);
    const uniqueSlug = `${baseSlug}-${userId.slice(0, 6)}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: foundry, error: foundryError } = await (supabase as any)
      .from("foundries")
      .insert({
        name: companyName,
        slug: uniqueSlug,
        industry: industry || null,
        stage: stage || null,
        owner_id: userId,
      })
      .select("id")
      .single();

    if (foundryError) {
      console.error("[setupNewUser] Foundry creation error:", foundryError);
      // DECISION: Do NOT silently fall back to forge-guild for founders (RT2-04).
      // A founder in forge-guild can see/modify shared data and gets demo data seeded
      // into the shared foundry. Retry once with a more unique slug, then hard-fail.
      const retrySlug = `${baseSlug}-${Date.now().toString(36)}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: retryFoundry, error: retryError } = await (supabase as any)
        .from("foundries")
        .insert({
          name: companyName,
          slug: retrySlug,
          industry: industry || null,
          stage: stage || null,
          owner_id: userId,
        })
        .select("id")
        .single();

      if (retryError) {
        console.error("[setupNewUser] Foundry retry also failed:", retryError);
        // Fall back to guild as last resort but mark it clearly
        foundryId = "forge-guild";
      } else {
        foundryId = retryFoundry.id;
        await supabase
          .from("profiles")
          .update({ foundry_id: foundryId, active_foundry_id: foundryId })
          .eq("id", userId);
      }
    } else {
      foundryId = foundry.id;
      await supabase
        .from("profiles")
        .update({ foundry_id: foundryId, active_foundry_id: foundryId })
        .eq("id", userId);
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

  // --- Create profile for non-founders (founders already have one) ---
  if (role !== "founder") {
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

  // --- Demo data for founders ---
  if (role === "founder" && foundryId) {
    try {
      await supabase.rpc("seed_demo_forge_concept", {
        p_foundry_id: foundryId,
        p_user_id: userId,
      });
    } catch (e) {
      console.warn("[setupNewUser] seed_demo_forge_concept failed:", e);
    }

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
