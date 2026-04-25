/**
 * Shared helper for setting up a new user's profile, foundry, memberships,
 * and demo data. Used by both email/password signup and OAuth callback.
 *
 * @module setup-new-user
 *
 * ─── State matrix for each code path ────────────────────────────────────────
 *
 * PATH A — Happy path (new founder with company / new executive / supplier)
 *   auth_user: EXISTS  profile: CREATED  foundry: CREATED  membership: CREATED
 *   User CAN: log in and use the product immediately
 *   User SEES: /welcome tour
 *   Returns: { ok: true, redirect: '/welcome', isNewUser: true }
 *
 * PATH B — Idempotency guard (profile already exists, duplicate call)
 *   auth_user: EXISTS  profile: EXISTS  foundry: EXISTS  membership: EXISTS
 *   User CAN: log in and use the product — they already have a full account
 *   User SEES: /investors (their existing landing)
 *   Returns: { ok: true, redirect: '/investors', isNewUser: false }
 *
 * PATH C — Foundry creation failed after 2 slug attempts (RLS denied or DB error)
 *   auth_user: EXISTS  profile: NOT YET  foundry: MISSING  membership: MISSING
 *   User CAN: contact support; their auth account exists but is unusable
 *   User SEES: /auth/setup-error with "We hit a snag setting up your foundry"
 *   Returns: { ok: false, reason: 'foundry_creation_failed' | 'foundry_slug_collision' | 'rls_denied' }
 *
 * PATH D — Profile creation failed after foundry was created
 *   auth_user: EXISTS  profile: MISSING  foundry: CREATED (then deleted)  membership: MISSING
 *   User CAN: contact support; auth account exists, orphaned foundry cleaned up
 *   User SEES: /auth/setup-error with "We hit a snag creating your profile"
 *   Returns: { ok: false, reason: 'profile_creation_failed' }
 *
 * PATH E — Unknown / unexpected error
 *   state unknown — may be partial
 *   User CAN: contact support with error_id
 *   User SEES: /auth/setup-error with generic message + error_id
 *   Returns: { ok: false, reason: 'unknown' }
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/types/database.types";
import { embedMarketplaceListing } from "@/lib/search/semantic-search";
import { scheduleOnboardingDrip } from "@/actions/onboarding-drip";
import { createAdminClient } from "@/lib/supabase/admin";

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

/**
 * Discriminated union returned by setupNewUser.
 *
 * ok: true  — setup completed; redirect the user to `redirect`
 * ok: false — setup failed; show the user the `userMessage` and log `supportContext`
 */
export type SetupResult =
  | { ok: true; redirect: string; isNewUser: boolean }
  | {
      ok: false;
      reason:
        | "auth_user_missing"
        | "profile_creation_failed"
        | "foundry_creation_failed"
        | "foundry_slug_collision"
        | "rls_denied"
        | "unknown";
      userMessage: string;
      /** Logged to signup_setup_errors.support_context for debugging */
      supportContext: Record<string, unknown>;
      /** Short ID the founder can include in a support email */
      errorId: string;
    };

/** @deprecated Use SetupResult instead. Kept for callers that haven't migrated. */
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

/** Generate a short random ID suitable for inclusion in support emails */
function generateErrorId(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

/**
 * Detect whether a Supabase error is likely an RLS denial (code 42501)
 * or a unique-constraint violation (code 23505 — slug collision).
 */
function classifyFoundryError(
  error: { code?: string; message?: string } | null
): "foundry_slug_collision" | "rls_denied" | "foundry_creation_failed" {
  if (!error) return "foundry_creation_failed";
  if (error.code === "23505") return "foundry_slug_collision";
  if (error.code === "42501" || error.message?.toLowerCase().includes("rls")) return "rls_denied";
  return "foundry_creation_failed";
}

/**
 * Persist an error row to signup_setup_errors so Tristan can debug
 * incidents by querying the table. Uses the admin client to bypass RLS.
 * Non-throwing — we never want logging to crash the caller.
 */
async function persistSetupError(params: {
  authUserId: string | null;
  reason: string;
  userMessage: string;
  supportContext: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("signup_setup_errors").insert({
      auth_user_id: params.authUserId || null,
      reason: params.reason,
      user_message: params.userMessage,
      support_context: params.supportContext as Json,
    });
  } catch (e) {
    // Non-fatal — logging failure must not block the error response
    console.warn("[setupNewUser] Failed to persist error row:", e);
  }
}

/**
 * Sets up a new user's profile, foundry, memberships, and demo data.
 * Handles Founder (own foundry), Supplier (forge-suppliers), and
 * Executive/Apprentice (personal sandbox foundry) paths.
 *
 * @returns SetupResult — discriminated union. ok: true = success + redirect.
 *   ok: false = structured error with userMessage + errorId for support.
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
}: SetupNewUserParams): Promise<SetupResult> {
  // INTENT: foundry bootstrap (insert with owner_id=NULL, then UPDATE to set
  // owner) cannot pass the foundries INSERT RLS policies, which require
  // owner_id = auth.uid() at the point of insert. We have to break the
  // circular FK (profiles.foundry_id → foundries.id ←→ foundries.owner_id
  // → profiles.id) somehow, so the bootstrap is run with the service-role
  // admin client. The auth user has already been verified above
  // (signUpInitiate created the auth row), so using admin here for the
  // setup-once writes is intentional and safe — RLS still applies to
  // every other surface in the app.
  const adminFoundries = createAdminClient();

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
      ok: true,
      isNewUser: false,
      // DECISION 2026-04-25 (RED-TEAM-PIVOT-PLAN Tier 2 step 17):
      // post-signup default landing is now /investors.
      redirect: "/investors",
    };
  }

  const memberRole = capitalizeRole(role);
  let foundryId: string;
  let accountType: "team_builder" | null = null;

  // --- Ensure shared foundries exist BEFORE any profile creation ---
  // INTENT: Suppliers need forge-suppliers. Founders/executives need forge-guild as a
  // fallback only (if personal foundry creation fails). Ensure it exists for FK safety.
  const neededFoundries = role === "supplier"
    ? ["forge-suppliers"] as const
    : ["forge-guild"] as const;

  for (const sharedId of neededFoundries) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: exists } = await (adminFoundries as any).from("foundries").select("id").eq("id", sharedId).single();
    if (!exists) {
      console.error(`[setupNewUser] Shared foundry "${sharedId}" missing. Creating.`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: sharedErr } = await (adminFoundries as any).from("foundries").insert({
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

    // Step 1: Create foundry with NULL owner (no profile FK dependency).
    // Admin client — see top-of-function comment about RLS bootstrap.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let { data: foundry, error: foundryError } = await (adminFoundries as any)
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
      const retry = await (adminFoundries as any)
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
      const reason = classifyFoundryError(foundryError);
      const errorId = generateErrorId();
      const userMessage =
        reason === "foundry_slug_collision"
          ? "We had trouble creating a unique workspace for your company. Please reload the page and try again. If it keeps happening, email tristan.fischer@gmail.com with this code: " + errorId
          : reason === "rls_denied"
          ? "We were not able to create your workspace due to a permissions issue. Please reload the page and try again. If it keeps happening, email tristan.fischer@gmail.com with this code: " + errorId
          : "We hit a snag setting up your foundry. Please reload the page and try again. If it keeps happening, email tristan.fischer@gmail.com with this code: " + errorId;

      await persistSetupError({
        authUserId: userId,
        reason,
        userMessage,
        supportContext: {
          userId,
          email,
          role,
          companyName,
          error: foundryError?.message,
          code: foundryError?.code,
          timestamp: new Date().toISOString(),
          errorId,
        },
      });

      return { ok: false, reason, userMessage, supportContext: { userId, email, role }, errorId };
    }

    foundryId = foundry.id;

    // Step 2: Create profile pointing to the real foundry
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
      // Admin client because the user has no profile yet, and the DELETE RLS
      // policy requires owner_id = auth.uid() — but we set owner_id to null.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- foundries table type constraints require cast
      await (adminFoundries as any).from("foundries").delete().eq("id", foundryId);

      const errorId = generateErrorId();
      const reason = "profile_creation_failed" as const;
      const userMessage =
        "We hit a snag creating your profile. Your account exists but your workspace was not set up correctly. Please reload and try again. If it keeps happening, email tristan.fischer@gmail.com with this code: " + errorId;

      await persistSetupError({
        authUserId: userId,
        reason,
        userMessage,
        supportContext: {
          userId,
          email,
          role,
          foundryId,
          error: profileError.message,
          code: profileError.code,
          timestamp: new Date().toISOString(),
          errorId,
        },
      });

      return { ok: false, reason, userMessage, supportContext: { userId, email, role, foundryId }, errorId };
    }

    // Step 3: Set the foundry owner now that profile exists.
    // Admin client because the foundries UPDATE RLS policy requires
    // owner_id = auth.uid() in BOTH using and with_check, and the row
    // currently has owner_id = null (so the user can't see it via RLS,
    // let alone update it). Setting the owner is a one-shot bootstrap.
    if (foundryId !== "forge-guild") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: ownerError } = await (adminFoundries as any).from("foundries").update({ owner_id: userId }).eq("id", foundryId);
      if (ownerError) {
        // Non-fatal: foundry works without owner (membership-based access).
        // But founder can't manage foundry settings. Repair RPC can fix.
        console.error("[setupNewUser] Failed to set foundry owner:", ownerError.message);
      }
    }
  } else if (role === "supplier") {
    // DECISION 2026-04-16: founder-first architecture. Suppliers are team_builders
    // with is_supplier=true set below. We still create their foundry under
    // forge-suppliers for historical continuity, but they now land on /today and
    // see the Supplier Portal section in the sidebar (Phase 3) via the flag.
    accountType = "team_builder";
    foundryId = "forge-suppliers";
  } else {
    // INTENT: Every executive/apprentice gets their own isolated sandbox foundry.
    // Previously all were dumped into shared forge-guild, causing cross-user data
    // pollution (users appearing on each other's Team pages, seeing each other's
    // objectives, etc.). Personal sandbox = full isolation from day one.
    accountType = "team_builder";

    const firstName = fullName.split(" ")[0] || "My";
    const sandboxSlug = `sandbox-${userId.slice(0, 8)}`;

    // Admin client — see top-of-function comment about RLS bootstrap.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let { data: sandboxFoundry, error: sandboxError } = await (adminFoundries as any)
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
      const retry = await (adminFoundries as any)
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
      console.error("[setupNewUser] Sandbox foundry creation failed after retry:", sandboxError);
      const reason = classifyFoundryError(sandboxError);
      const errorId = generateErrorId();
      const userMessage =
        "We hit a snag setting up your workspace. Please reload the page and try again. If it keeps happening, email tristan.fischer@gmail.com with this code: " + errorId;

      await persistSetupError({
        authUserId: userId,
        reason,
        userMessage,
        supportContext: {
          userId,
          email,
          role,
          error: sandboxError?.message,
          code: sandboxError?.code,
          timestamp: new Date().toISOString(),
          errorId,
        },
      });

      return { ok: false, reason, userMessage, supportContext: { userId, email, role }, errorId };
    }

    foundryId = sandboxFoundry.id;
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
      // Founder-first: supplier signups get the is_supplier flag flipped on
      // so the Supplier Portal sidebar section shows up on their first visit.
      is_supplier: role === "supplier",
    });

    if (profileError) {
      console.error("[setupNewUser] Profile creation failed:", profileError.message);
      const errorId = generateErrorId();
      const reason = "profile_creation_failed" as const;
      const userMessage =
        "We hit a snag creating your profile. Please reload the page and try again. If it keeps happening, email tristan.fischer@gmail.com with this code: " + errorId;

      await persistSetupError({
        authUserId: userId,
        reason,
        userMessage,
        supportContext: {
          userId,
          email,
          role,
          foundryId,
          error: profileError.message,
          code: profileError.code,
          timestamp: new Date().toISOString(),
          errorId,
        },
      });

      return { ok: false, reason, userMessage, supportContext: { userId, email, role, foundryId }, errorId };
    }

    // Set owner on sandbox foundries (same circular FK pattern as founders).
    // Admin client because the foundry currently has owner_id = null and the
    // UPDATE RLS policy requires owner_id = auth.uid() to find the row.
    if (foundryId.startsWith("sandbox-")) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: ownerError } = await (adminFoundries as any).from("foundries").update({ owner_id: userId }).eq("id", foundryId);
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

  // DECISION 2026-04-17: every brand-new user lands on /welcome — a guided
  // tour from Tristan covering each section and the 13 specialists. The
  // Welcome page's primary CTA marks onboarding_data.has_completed_welcome
  // and routes to /today. Existing-profile and error-fallback branches in
  // this file keep returning "/today" so only first-time signups hit the tour.
  // Supplier / fractional-executive are opt-in flags handled during
  // onboarding, not routing paths.
  return { ok: true, redirect: "/welcome", isNewUser: true };
}
