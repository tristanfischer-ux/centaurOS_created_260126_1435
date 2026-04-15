/**
 * Shared helper for setting up a new user's profile, foundry, memberships,
 * and demo data. Used by both email/password signup and OAuth callback.
 *
 * @module setup-new-user
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/types/database.types";
import { embedMarketplaceListing } from "@/lib/search/semantic-search";
import { scheduleOnboardingDrip } from "@/actions/onboarding-drip";

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
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
  // GOTCHA: Pure unicode names (e.g., "日本製造") produce empty slug.
  // Fall back to "foundry" so the final ID is "foundry-{userId.slice(0,6)}".
  return slug || "foundry";
}

/**
 * Sets up a new user's profile, foundry, memberships, and demo data.
 * Handles Founder (own foundry), Supplier (forge-suppliers), and
 * Executive/Apprentice (personal sandbox foundry) paths.
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

  // --- Ensure shared foundries exist BEFORE any profile creation ---
  // INTENT: Suppliers need forge-suppliers. Founders/executives need forge-guild as a
  // fallback only (if personal foundry creation fails). Ensure it exists for FK safety.
  const neededFoundries = role === "supplier"
    ? ["forge-suppliers"] as const
    : ["forge-guild"] as const;

  for (const sharedId of neededFoundries) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: exists } = await (supabase as any).from("foundries").select("id").eq("id", sharedId).single();
    if (!exists) {
      console.error(`[setupNewUser] Shared foundry "${sharedId}" missing. Creating.`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: sharedErr } = await (supabase as any).from("foundries").insert({
        id: sharedId,
        name: sharedId === "forge-guild" ? "ForgeOS Guild" : "ForgeOS Suppliers",
        slug: sharedId,
        owner_id: null,
      });
      if (sharedErr && sharedErr.code !== "23505") {
        console.error(`[setupNewUser] Shared foundry creation failed:`, sharedErr.message);
      }
    }
  }

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let { data: foundry, error: foundryError } = await (supabase as any)
      .from("foundries")
      .insert({
        id: uniqueSlug,
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
      // INTENT: Clean up orphaned foundry — it has NULL owner and no profile pointing to it.
      // Without this, retries create additional orphans via slug collision → retry slug.
      if (foundryId !== "forge-guild") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- foundries table type constraints require cast
        await (supabase as any).from("foundries").delete().eq("id", foundryId);
      }
      return { foundryId: "forge-guild", redirectPath: "/today" };
    }

    // Step 3: Set the foundry owner now that profile exists
    if (foundryId !== "forge-guild") {
      const { error: ownerError } = await supabase.from("foundries").update({ owner_id: userId }).eq("id", foundryId);
      if (ownerError) {
        // Non-fatal: foundry works without owner (membership-based access).
        // But founder can't manage foundry settings. Repair RPC can fix.
        console.error("[setupNewUser] Failed to set foundry owner:", ownerError.message);
      }
    }
  } else if (role === "supplier") {
    accountType = "supplier";
    foundryId = "forge-suppliers";
  } else {
    // INTENT: Every executive/apprentice gets their own isolated sandbox foundry.
    // Previously all were dumped into shared forge-guild, causing cross-user data
    // pollution (users appearing on each other's Team pages, seeing each other's
    // objectives, etc.). Personal sandbox = full isolation from day one.
    accountType = "team_builder";

    const firstName = fullName.split(" ")[0] || "My";
    const sandboxSlug = `sandbox-${userId.slice(0, 8)}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let { data: sandboxFoundry, error: sandboxError } = await (supabase as any)
      .from("foundries")
      .insert({
        id: sandboxSlug,
        name: `${firstName}'s Company`,
        slug: sandboxSlug,
        owner_id: null,
        is_sandbox: true,
      })
      .select("id")
      .single();

    if (sandboxError) {
      // Retry with more unique slug (unlikely collision but safety net)
      const retrySlug = `sandbox-${Date.now().toString(36)}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const retry = await (supabase as any)
        .from("foundries")
        .insert({
          id: retrySlug,
          name: `${firstName}'s Company`,
          slug: retrySlug,
          owner_id: null,
          is_sandbox: true,
        })
        .select("id")
        .single();
      sandboxFoundry = retry.data;
      sandboxError = retry.error;
    }

    if (sandboxError || !sandboxFoundry) {
      // FALLBACK: forge-guild is a last-resort safety net. The intended path is
      // always a personal sandbox. This only fires if both insert attempts fail
      // (e.g., transient DB error). The user lands in a shared workspace but
      // can create their own company later from the sidebar.
      console.error("[setupNewUser] Sandbox foundry creation failed after retry:", sandboxError);
      foundryId = "forge-guild";
    } else {
      foundryId = sandboxFoundry.id;
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
      return { foundryId, redirectPath: role === "supplier" ? "/supplier-portal" : "/today" };
    }

    // Set owner on sandbox foundries (same circular FK pattern as founders)
    if (foundryId.startsWith("sandbox-")) {
      const { error: ownerError } = await supabase.from("foundries").update({ owner_id: userId }).eq("id", foundryId);
      if (ownerError) {
        console.error("[setupNewUser] Failed to set sandbox owner:", ownerError.message);
      }
    }
  }

  // --- Foundry membership ---
  // INTENT: Upsert (onConflict) instead of plain insert — if the repair RPC already
  // created a membership before setupNewUser runs (race condition), a plain insert
  // would fail with 23505 unique violation. Upsert is idempotent.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: membershipError } = await (supabase as any).from("foundry_memberships").upsert({
    user_id: userId,
    foundry_id: foundryId,
    role: memberRole,
    is_primary: true,
    joined_at: new Date().toISOString(),
  }, { onConflict: "user_id,foundry_id" });
  if (membershipError) {
    console.error("[setupNewUser] Membership upsert failed:", membershipError.message);
  }

  // --- Demo data for users with their own isolated foundry ---
  // DECISION: Seed demo data for any user with their own foundry (founders or
  // sandbox users). Previously only founders got demo data because executives
  // shared forge-guild and seeding would pollute shared data. Now that every
  // user gets their own workspace, all isolated foundries get demo data.
  // GOTCHA: Guard against seeding into shared foundries (forge-guild, forge-suppliers).
  const isIsolatedFoundry = foundryId && foundryId !== "forge-guild" && foundryId !== "forge-suppliers";
  if (isIsolatedFoundry) {
    // Demo forge concepts — 3 products showing breadth of The Forge
    const conceptRpcs = [
      "seed_demo_forge_concept",
      "seed_demo_air_quality_sensor",
      "seed_demo_drone_motor_mount",
    ] as const;

    // INTENT: supabase.rpc() returns { error } instead of throwing — must check .error.
    for (const rpc of conceptRpcs) {
      const { error: rpcErr } = await supabase.rpc(rpc, {
        p_foundry_id: foundryId,
        p_user_id: userId,
      });
      if (rpcErr) console.warn(`[setupNewUser] ${rpc} failed:`, rpcErr.message);
    }

    // Founder-only: demo objectives and tasks
    const { error: demoErr1 } = await supabase.rpc("seed_founder_demo_data", {
      p_foundry_id: foundryId,
      p_user_id: userId,
    });
    if (demoErr1) console.warn("[setupNewUser] seed_founder_demo_data failed:", demoErr1.message);

    const { error: demoErr2 } = await supabase.rpc("seed_founder_demo_data_expanded", {
      p_foundry_id: foundryId,
      p_user_id: userId,
    });
    if (demoErr2) console.warn("[setupNewUser] seed_founder_demo_data_expanded failed:", demoErr2.message);
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

    // INTENT: Create a marketplace People listing so executives are discoverable
    // via the Recruits page (marketplace_listings WHERE category='People').
    // Without this, executives only have provider_profiles but no marketplace
    // presence — they're invisible to companies looking for fractional talent.
    if (role === "executive") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: newListing, error: listingError } = await (supabase as any).from("marketplace_listings").insert({
        category: "People",
        subcategory: "Executive",
        title: fullName,
        description: "Fractional executive on ForgeOS — complete profile for full details.",
        attributes: {
          role: "Fractional Executive",
          availability: "Available",
          profile_id: userId,
        },
        is_verified: false,
        approval_status: "approved",
      }).select("id").single();
      if (listingError) {
        console.warn("[setupNewUser] Marketplace listing failed:", listingError);
      }

      // FLOW: Fire-and-forget embedding generation — don't block signup if OpenAI is down
      if (newListing?.id) {
        embedMarketplaceListing(newListing.id).catch((e: unknown) =>
          console.warn("[setupNewUser] Embedding failed (non-blocking):", e)
        );
      }
    }
  }

  // --- Supplier business info ---
  if (role === "supplier" && businessName) {
    // INTENT: Merge into existing onboarding_data rather than replacing it.
    // Other code (referral system, onboarding modal) may have already written fields.
    const { data: current } = await supabase.from("profiles").select("onboarding_data").eq("id", userId).single();
    const existing = (current?.onboarding_data ?? {}) as Record<string, unknown>;
    await supabase
      .from("profiles")
      .update({
        onboarding_data: {
          ...existing,
          business_name: businessName,
          business_type: businessType,
          is_supplier_signup: true,
        } as Json,
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

  // --- Schedule onboarding drip emails (non-blocking) ---
  try {
    const firstName = fullName.split(' ')[0] || fullName
    await scheduleOnboardingDrip(userId, email, firstName)
  } catch (e) {
    console.warn('[setupNewUser] Onboarding drip scheduling failed (non-blocking):', e)
  }

  // --- Determine redirect ---
  let redirectPath = "/today";
  if (role === "supplier") {
    redirectPath = "/supplier-portal";
  }

  return { foundryId, redirectPath };
}
