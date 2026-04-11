"use client";

import { useState, useEffect, useActionState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Sparkles,
  Building2,
  Factory,
  TestTube2,
  Loader2,
  Shield,
  Lock,
  Scale,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { signup } from "@/actions/signup";
import type { SignupState } from "@/actions/signup";
import { getDemoAccountData, type DemoAccountData } from "@/actions/demo-accounts";
import { lookupReferrer, getFoundingMemberCount } from "@/actions/referrals";
import { Gift } from "lucide-react";
import { PasswordStrength } from "@/components/ui/password-strength";

/** Total founding member spots available */
const TOTAL_FOUNDING_SPOTS = 100;

/**
 * FoundingMemberCounter -- Animated progress bar showing remaining spots.
 */
function FoundingMemberCounter({ spotsClaimed }: { spotsClaimed: number }) {
  const clampedClaimed = Math.min(spotsClaimed, TOTAL_FOUNDING_SPOTS);
  const spotsRemaining = TOTAL_FOUNDING_SPOTS - clampedClaimed;
  const percentClaimed = (clampedClaimed / TOTAL_FOUNDING_SPOTS) * 100;

  return (
    <div className="px-3 py-2 sm:p-4 rounded-xl bg-muted/50 border">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-international-orange" />
          <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Founding Members
          </span>
        </div>
        <span className="text-xs font-bold text-international-orange">
          {spotsRemaining} of {TOTAL_FOUNDING_SPOTS} spots left
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentClaimed}%` }}
          transition={{ duration: 1.2, delay: 0.3, ease: "easeOut" }}
          className="h-full bg-international-orange rounded-full"
        />
      </div>
    </div>
  );
}

/**
 * GoogleIcon — Inline SVG of the Google "G" logo in brand colours.
 */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

/**
 * GoogleOAuthButton — Triggers Google OAuth sign-in via Supabase.
 * Sets a forge_signup_context cookie before redirecting so the OAuth callback
 * can create the correct profile/foundry for the chosen role.
 */
function GoogleOAuthButton({
  redirect,
  signupContext,
}: {
  redirect?: string | null;
  signupContext?: { role: string; companyName?: string; industry?: string; stage?: string } | null;
}) {
  const [loading, setLoading] = useState(false);

  async function handleGoogleLogin() {
    setLoading(true);

    // Persist signup context in a short-lived cookie so the OAuth callback
    // knows which role/company to set up for this user.
    // For Founders, read company fields from the live form at click time.
    if (signupContext) {
      const ctx = { ...signupContext } as Record<string, string | undefined>;
      if (signupContext.role === "founder") {
        const companyEl = document.getElementById("company_name") as HTMLInputElement | null;
        const industryEl = document.getElementById("industry") as HTMLInputElement | null;
        const stageEl = document.getElementById("stage") as HTMLInputElement | null;
        if (companyEl?.value) ctx.companyName = companyEl.value.trim().slice(0, 100);
        if (industryEl?.value) ctx.industry = industryEl.value.trim().slice(0, 100);
        if (stageEl?.value) ctx.stage = stageEl.value.trim().slice(0, 100);
      }
      const secureSuffix = window.location.protocol === 'https:' ? '; secure' : ''
      document.cookie = `forge_signup_context=${encodeURIComponent(JSON.stringify(ctx))}; path=/; max-age=300; samesite=lax${secureSuffix}`;
    }

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback${redirect ? `?next=${encodeURIComponent(redirect)}` : ""}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      console.error("Google OAuth error:", error);
      setLoading(false);
    }
  }

  return (
    <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
      <Button
        type="button"
        variant="outline"
        onClick={handleGoogleLogin}
        disabled={loading}
        className="w-full h-12 bg-background border font-medium text-sm transition-all duration-300 hover:shadow-md flex items-center justify-center gap-3"
      >
        <GoogleIcon className="h-5 w-5" />
        {loading ? "Redirecting..." : "Continue with Google"}
      </Button>
    </motion.div>
  );
}

/**
 * OAuthDivider — "or" text divider between OAuth and email/password.
 */
function OAuthDivider() {
  return (
    <div className="relative flex items-center gap-4">
      <div className="flex-1 border-t" />
      <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">or</span>
      <div className="flex-1 border-t" />
    </div>
  );
}

/**
 * JoinPageInner — The actual join page content (needs searchParams).
 * Open signup — always shows the full form.
 */
function JoinPageInner() {
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get("redirect");
  const isClaimFlow = redirectParam != null && /^\/claim\/[a-f0-9]{16,128}$/.test(redirectParam);
  const refCode = searchParams.get("ref");

  // Deep-link support: ?role=founder shows founder fields for backward compat
  const roleParam = searchParams.get("role");
  const isDemoMode = searchParams.get("demo") === "true";
  const isFactorySignup = roleParam === "factory" || roleParam === "supplier" || isClaimFlow;
  const isFounderDeepLink = roleParam === "founder";
  const stageParam = searchParams.get("stage");
  const industryParam = searchParams.get("industry");

  const [demoData, setDemoData] = useState<Omit<DemoAccountData, 'password'> | null>(null);
  const [state, formAction, isPending] = useActionState<SignupState, FormData>(signup, {});
  const [referrerInfo, setReferrerInfo] = useState<{ name: string; company: string | null } | null>(null);
  const [foundingCount, setFoundingCount] = useState(53); // sensible default
  const [passwordValue, setPasswordValue] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const passwordMismatch = confirmPassword.length > 0 && passwordValue !== confirmPassword;

  // INTENT: Default role is executive. Founder deep-link still works for backward compat.
  const effectiveRole = isFounderDeepLink ? "founder" : "executive";

  // Set forge_ref cookie when ?ref= param is present
  useEffect(() => {
    if (refCode) {
      const secureSuffix = window.location.protocol === 'https:' ? '; secure' : ''
      document.cookie = `forge_ref=${encodeURIComponent(refCode)}; path=/; max-age=${30 * 24 * 60 * 60}; samesite=lax${secureSuffix}`;
      // Look up referrer for warm banner
      lookupReferrer(refCode).then((info) => {
        if (info) setReferrerInfo(info);
      });
    }
  }, [refCode]);

  // Fetch dynamic founding member count
  useEffect(() => {
    getFoundingMemberCount().then(setFoundingCount);
  }, []);

  useEffect(() => {
    if (isDemoMode) {
      getDemoAccountData(effectiveRole).then(setDemoData);
    }
  }, [isDemoMode, effectiveRole]);

  // Build signup context for Google OAuth cookie.
  // For Founders we also need companyName/industry/stage — these are read
  // from the live form fields at click time (see GoogleOAuthButton).
  const signupContext = { role: effectiveRole };

  // Factory/supplier claim flow — simplified single-path signup
  if (isFactorySignup) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <nav className="px-4 sm:px-6 py-4 sm:py-6">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <Link
              href="/"
              className="text-muted-foreground hover:text-foreground text-sm font-mono uppercase tracking-widest flex items-center gap-2 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Link>
            <Link
              href={`/login${redirectParam ? `?redirect=${encodeURIComponent(redirectParam)}` : ""}`}
              className="text-muted-foreground hover:text-international-orange text-sm font-mono uppercase tracking-widest transition-colors"
            >
              Sign in
            </Link>
          </div>
        </nav>
        <div className="px-4 sm:px-6 pb-12 sm:pb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-2xl mx-auto space-y-8"
          >
            <div className="text-center space-y-3">
              <div className="flex justify-center">
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-international-orange/10">
                  <Factory className="w-7 h-7 text-international-orange" />
                </div>
              </div>
              <h1 className="text-3xl sm:text-4xl font-black text-foreground">
                Claim Your Company Listing
              </h1>
              <p className="text-muted-foreground text-base sm:text-lg max-w-lg mx-auto">
                Create a free account to manage your listing on Fractional Forge
              </p>
            </div>

            <GoogleOAuthButton redirect={redirectParam} signupContext={{ role: "supplier" }} />
            <OAuthDivider />

            {state.error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                role="alert"
                aria-live="polite"
                className="p-3 sm:p-4 text-xs sm:text-sm text-destructive bg-status-error-light border border-destructive rounded-lg flex items-center gap-2 sm:gap-3"
              >
                <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" aria-hidden="true" />
                {state.error}
              </motion.div>
            )}

            <form action={formAction} className="space-y-5">
              <input type="hidden" name="role" value="supplier" />
              {redirectParam && <input type="hidden" name="redirect" value={redirectParam} />}

              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium text-foreground">
                  Full Name
                  <span className="text-destructive ml-1" aria-label="required">*</span>
                </Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="Jane Smith"
                  key={`name-${state.values?.name ?? ""}`}
                  defaultValue={state.values?.name || ""}
                  autoComplete="name"
                  className="bg-background border-input focus:border-international-orange focus:ring-international-orange/20"
                  required
                  aria-required="true"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-foreground">
                  Email
                  <span className="text-destructive ml-1" aria-label="required">*</span>
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  key={`email-${state.values?.email ?? ""}`}
                  defaultValue={state.values?.email || ""}
                  autoComplete="email"
                  className="bg-background border-input focus:border-international-orange focus:ring-international-orange/20"
                  required
                  aria-required="true"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-foreground">
                  Password
                  <span className="text-destructive ml-1" aria-label="required">*</span>
                </Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="Create a strong password"
                  defaultValue=""
                  onChange={(e) => setPasswordValue(e.target.value)}
                  autoComplete="new-password"
                  enterKeyHint="go"
                  className="bg-background border-input focus:border-international-orange focus:ring-international-orange/20"
                  required
                  aria-required="true"
                  minLength={8}
                  aria-describedby="password-hint"
                />
                <p id="password-hint" className="text-xs text-muted-foreground">
                  Min 8 characters, with uppercase, lowercase, and a number
                </p>
                <PasswordStrength password={passwordValue} />
              </div>

              <motion.div
                whileHover={isPending ? {} : { scale: 1.01 }}
                whileTap={isPending ? {} : { scale: 0.98 }}
                className="pt-2"
              >
                <Button
                  type="submit"
                  disabled={isPending}
                  className="w-full bg-international-orange hover:bg-international-orange/90 text-white font-bold tracking-widest uppercase min-h-[48px] sm:min-h-[52px] text-sm transition-colors shadow-lg hover:shadow-xl disabled:opacity-70"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Creating Account...
                    </>
                  ) : (
                    "Create Free Account & Claim"
                  )}
                </Button>
              </motion.div>
            </form>

            <p className="text-xs text-center text-muted-foreground">
              Already have an account?{" "}
              <Link
                href={`/login${redirectParam ? `?redirect=${encodeURIComponent(redirectParam)}` : ""}`}
                className="text-international-orange hover:underline font-medium"
              >
                Sign in
              </Link>
            </p>

            <p className="text-xs text-center text-muted-foreground">
              Not a supplier?{" "}
              <Link
                href="/join?role=founder"
                className="text-international-orange hover:underline font-medium"
              >
                Register as a founder instead
              </Link>
            </p>

            <p className="text-xs text-center text-muted-foreground">
              By creating an account, you agree to our{" "}
              <Link href="/terms" className="underline hover:text-foreground transition-colors">Terms of Service</Link>
              {" "}and{" "}
              <Link href="/privacy" className="underline hover:text-foreground transition-colors">Privacy Policy</Link>.
            </p>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navigation */}
      <nav className="px-4 sm:px-6 py-4 sm:py-6">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground text-sm font-mono uppercase tracking-widest flex items-center gap-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <Link
            href="/login"
            className="text-muted-foreground hover:text-international-orange text-sm font-mono uppercase tracking-widest transition-colors"
          >
            Sign in
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <div className="px-4 sm:px-6 pb-12 sm:pb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-2xl mx-auto space-y-8"
        >
          {/* Header */}
          <div className="text-center space-y-3">
            <h1 className="text-3xl sm:text-4xl font-black text-foreground">
              Join ForgeOS
            </h1>
            <p className="text-muted-foreground text-base sm:text-lg max-w-lg mx-auto">
              The operating system for building physical products — expert teams, guided manufacturing, and full IP protection.
            </p>
          </div>

          {/* Error Message — displayed inline from action state */}
          {state.error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              role="alert"
              aria-live="polite"
              className="p-3 sm:p-4 text-xs sm:text-sm text-destructive bg-status-error-light border border-destructive rounded-lg flex items-center gap-2 sm:gap-3"
            >
              <span
                className="h-2 w-2 rounded-full bg-destructive animate-pulse"
                aria-hidden="true"
              />
              {state.error}
            </motion.div>
          )}

          {/* Referrer Banner — shown when ?ref= param is present */}
          {referrerInfo && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-lg bg-international-orange/5 border border-international-orange/20 flex items-start gap-3"
            >
              <Gift className="h-5 w-5 text-international-orange mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {referrerInfo.name}
                  {referrerInfo.company ? ` from ${referrerInfo.company}` : ''} invited you
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  You&apos;ll both get <span className="font-semibold text-international-orange">10 bonus AI tasks</span> when you join.
                </p>
              </div>
            </motion.div>
          )}

          {/* Demo Mode Banner */}
          {isDemoMode && demoData && (
            <div className="bg-status-info-light border border-status-info rounded-lg p-4 flex items-start gap-3">
              <TestTube2
                className="h-5 w-5 text-status-info mt-0.5 shrink-0"
                aria-hidden="true"
              />
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">
                  Demo Mode Active
                </h3>
                <p className="text-xs text-muted-foreground">
                  Fields are pre-populated with demo data. Just click
                  &quot;Create Account&quot; to test!
                </p>
              </div>
            </div>
          )}

          <GoogleOAuthButton redirect={redirectParam} signupContext={signupContext} />
          <OAuthDivider />

          <form action={formAction} className="space-y-5">
            <input type="hidden" name="role" value={effectiveRole} />
            {redirectParam && <input type="hidden" name="redirect" value={redirectParam} />}

            {/* Common Fields */}
            <div className="space-y-2">
              <Label
                htmlFor="name"
                className="text-sm font-medium text-foreground"
              >
                Full Name
                <span className="text-destructive ml-1" aria-label="required">
                  *
                </span>
              </Label>
              <Input
                id="name"
                name="name"
                placeholder="Jane Smith"
                key={`name-${state.values?.name ?? ""}`}
                defaultValue={state.values?.name || demoData?.fullName || ""}
                autoComplete="name"
                className="bg-background border-input focus:border-international-orange focus:ring-international-orange/20"
                required
                aria-required="true"
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="email"
                className="text-sm font-medium text-foreground"
              >
                Email
                <span className="text-destructive ml-1" aria-label="required">
                  *
                </span>
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                key={`email-${state.values?.email ?? ""}`}
                defaultValue={state.values?.email || demoData?.email || ""}
                autoComplete="email"
                className="bg-background border-input focus:border-international-orange focus:ring-international-orange/20"
                required
                aria-required="true"
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="password"
                className="text-sm font-medium text-foreground"
              >
                Password
                <span className="text-destructive ml-1" aria-label="required">
                  *
                </span>
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Create a strong password"
                defaultValue=""
                onChange={(e) => setPasswordValue(e.target.value)}
                autoComplete="new-password"
                enterKeyHint="go"
                className="bg-background border-input focus:border-international-orange focus:ring-international-orange/20"
                required
                aria-required="true"
                minLength={8}
                aria-describedby="password-hint"
              />
              <p
                id="password-hint"
                className="text-xs text-muted-foreground"
              >
                Min 8 characters, with uppercase, lowercase, and a number
              </p>
              <PasswordStrength password={passwordValue} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-sm font-medium text-foreground">
                Confirm Password
                <span className="text-destructive ml-1" aria-label="required">*</span>
              </Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                enterKeyHint="go"
                className={cn(
                  "bg-background border-input focus:border-international-orange focus:ring-international-orange/20",
                  passwordMismatch && "border-destructive",
                )}
                required
                aria-required="true"
                aria-invalid={passwordMismatch}
              />
              {passwordMismatch && (
                <p className="text-xs text-destructive" role="alert">Passwords do not match</p>
              )}
            </div>

            {/* Founder-specific fields — only shown via ?role=founder deep-link */}
            <AnimatePresence>
              {isFounderDeepLink && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  transition={{ duration: 0.3 }}
                  className="space-y-4 pt-2 border-t"
                >
                  <div className="flex items-center gap-2 pt-3">
                    <Building2 className="w-4 h-4 text-international-orange" />
                    <p className="text-sm font-medium text-foreground">
                      About your company
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="company_name"
                      className="text-sm font-medium text-foreground"
                    >
                      Company Name
                      <span
                        className="text-destructive ml-1"
                        aria-label="required"
                      >
                        *
                      </span>
                    </Label>
                    <Input
                      id="company_name"
                      name="company_name"
                      placeholder="Your startup name"
                      key={`company-${state.values?.company_name ?? ""}`}
                      defaultValue={state.values?.company_name || demoData?.companyName || ""}
                      className="bg-background border-input focus:border-international-orange focus:ring-international-orange/20"
                      required
                      aria-required="true"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label
                        htmlFor="industry"
                        className="text-sm font-medium text-foreground"
                      >
                        Industry
                      </Label>
                      <Input
                        id="industry"
                        name="industry"
                        placeholder="Hardware, DeepTech..."
                        key={`industry-${state.values?.industry ?? ""}`}
                        defaultValue={state.values?.industry || demoData?.industry || industryParam || ""}
                        className="bg-background border-input focus:border-international-orange focus:ring-international-orange/20"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label
                        htmlFor="stage"
                        className="text-sm font-medium text-foreground"
                      >
                        Stage
                      </Label>
                      <Input
                        id="stage"
                        name="stage"
                        placeholder="Pre-seed, Seed..."
                        key={`stage-${state.values?.stage ?? ""}`}
                        defaultValue={state.values?.stage || demoData?.stage || stageParam || ""}
                        className="bg-background border-input focus:border-international-orange focus:ring-international-orange/20"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit */}
            <motion.div
              whileHover={isPending ? {} : { scale: 1.01 }}
              whileTap={isPending ? {} : { scale: 0.98 }}
              className="pt-2"
            >
              <Button
                type="submit"
                disabled={isPending || passwordMismatch}
                className="w-full bg-international-orange hover:bg-international-orange/90 text-white font-bold tracking-widest uppercase min-h-[48px] sm:min-h-[52px] text-sm transition-colors shadow-lg hover:shadow-xl disabled:opacity-70"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Creating Account...
                  </>
                ) : (
                  "Create Account"
                )}
              </Button>
            </motion.div>
          </form>

          {/* Founding member counter */}
          <FoundingMemberCounter spotsClaimed={foundingCount} />

          {/* Trust signals */}
          <div className="flex justify-center gap-6 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-international-orange" />
              <span>Your IP, always</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-international-orange" />
              <span>Designs stay confidential</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Scale className="h-3.5 w-3.5 text-international-orange" />
              <span>Clear risk terms</span>
            </div>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            By joining, you agree to our{" "}
            <Link
              href="/terms"
              className="underline hover:text-foreground transition-colors"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              className="underline hover:text-foreground transition-colors"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </motion.div>
      </div>
    </div>
  );
}

/**
 * JoinPage — Unified signup page.
 *
 * @description Open signup — no invite token required. Single form with
 * Name, Email, Password, and Google OAuth. Founder deep-link (?role=founder)
 * adds company fields. Supplier/claim flow gets a simplified variant.
 */
export default function JoinPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <JoinPageInner />
    </Suspense>
  );
}
