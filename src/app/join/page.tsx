"use client";

import { useState, useEffect, useActionState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Rocket,
  Users,
  Sparkles,
  Building2,
  Briefcase,
  GraduationCap,
  TestTube2,
  Loader2,
} from "lucide-react";
import { signup } from "@/actions/signup";
import type { SignupState } from "@/actions/signup";
import { getDemoAccountData, type DemoAccountData } from "@/actions/demo-accounts";

/** Total founding member spots available */
const TOTAL_FOUNDING_SPOTS = 100;
/** Spots already claimed */
const SPOTS_CLAIMED = 53;

type UserPath = "founder" | "joining";
type JoiningRole = "executive" | "apprentice";

/**
 * FoundingMemberCounter -- Animated progress bar showing remaining spots.
 */
function FoundingMemberCounter() {
  const spotsRemaining = TOTAL_FOUNDING_SPOTS - SPOTS_CLAIMED;
  const percentClaimed = (SPOTS_CLAIMED / TOTAL_FOUNDING_SPOTS) * 100;

  return (
    <div className="p-4 rounded-xl bg-muted/50 border">
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
 * JoinPageInner — The actual join page content (needs searchParams).
 */
function JoinPageInner() {
  const searchParams = useSearchParams();

  // Pre-select path from URL (e.g. /join?role=founder or /join?role=executive)
  const roleParam = searchParams.get("role");
  const isDemoMode = searchParams.get("demo") === "true";

  const initialPath: UserPath | null = roleParam === "founder"
    ? "founder"
    : roleParam === "executive" || roleParam === "apprentice"
      ? "joining"
      : null;

  const initialJoiningRole: JoiningRole =
    roleParam === "apprentice" ? "apprentice" : "executive";

  const [selectedPath, setSelectedPath] = useState<UserPath | null>(initialPath);
  const [joiningRole, setJoiningRole] = useState<JoiningRole>(initialJoiningRole);
  const [demoData, setDemoData] = useState<DemoAccountData | null>(null);

  // useActionState: errors returned inline, form data preserved on failure.
  // On success the server action calls redirect() so this state is never updated.
  const [state, formAction, isPending] = useActionState<SignupState, FormData>(signup, {});

  // Fetch demo data if in demo mode
  useEffect(() => {
    if (isDemoMode && selectedPath) {
      const role = selectedPath === "founder" ? "founder" : joiningRole;
      getDemoAccountData(role).then(setDemoData);
    }
  }, [isDemoMode, selectedPath, joiningRole]);

  // Determine the actual role to submit
  const effectiveRole = selectedPath === "founder" ? "founder" : joiningRole;

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
              The operating system for building physical products.
              Pick your path and create your account.
            </p>
          </div>

          {/* Error Message — displayed inline from action state */}
          {state.error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              role="alert"
              aria-live="polite"
              className="p-4 text-sm text-destructive bg-status-error-light border border-destructive rounded-lg flex items-center gap-3"
            >
              <span
                className="h-2 w-2 rounded-full bg-destructive animate-pulse"
                aria-hidden="true"
              />
              {state.error}
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

          {/* Path Selection */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">
              What brings you to ForgeOS?
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Founder Path */}
              <button
                type="button"
                onClick={() => setSelectedPath("founder")}
                className={`group relative text-left p-5 rounded-xl border-2 transition-all duration-200 ${
                  selectedPath === "founder"
                    ? "border-international-orange bg-international-orange/5 shadow-md"
                    : "border-muted hover:border-international-orange/40 hover:shadow-sm bg-card"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`flex items-center justify-center w-10 h-10 rounded-lg shrink-0 transition-colors ${
                      selectedPath === "founder"
                        ? "bg-international-orange text-white"
                        : "bg-muted text-muted-foreground group-hover:bg-international-orange/10 group-hover:text-international-orange"
                    }`}
                  >
                    <Rocket className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">
                      I&apos;m founding a company
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Create your venture and build your fractional team
                    </p>
                  </div>
                </div>
                {selectedPath === "founder" && (
                  <div className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-international-orange" />
                )}
              </button>

              {/* Joining Path */}
              <button
                type="button"
                onClick={() => setSelectedPath("joining")}
                className={`group relative text-left p-5 rounded-xl border-2 transition-all duration-200 ${
                  selectedPath === "joining"
                    ? "border-international-orange bg-international-orange/5 shadow-md"
                    : "border-muted hover:border-international-orange/40 hover:shadow-sm bg-card"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`flex items-center justify-center w-10 h-10 rounded-lg shrink-0 transition-colors ${
                      selectedPath === "joining"
                        ? "bg-international-orange text-white"
                        : "bg-muted text-muted-foreground group-hover:bg-international-orange/10 group-hover:text-international-orange"
                    }`}
                  >
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">
                      I&apos;m joining the marketplace
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Join as an Executive or Apprentice and find a team
                    </p>
                  </div>
                </div>
                {selectedPath === "joining" && (
                  <div className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-international-orange" />
                )}
              </button>
            </div>
          </div>

          {/* Form — appears once a path is selected */}
          <AnimatePresence mode="wait">
            {selectedPath && (
              <motion.div
                key={selectedPath}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                <form action={formAction} className="space-y-5">
                  <input type="hidden" name="role" value={effectiveRole} />

                  {/* Role sub-selection for Joining path */}
                  {selectedPath === "joining" && (
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-foreground">
                        Which best describes you?
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setJoiningRole("executive")}
                          className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all duration-200 text-left ${
                            joiningRole === "executive"
                              ? "border-international-orange bg-international-orange/5"
                              : "border-muted hover:border-international-orange/40 bg-card"
                          }`}
                        >
                          <Briefcase
                            className={`w-5 h-5 shrink-0 ${
                              joiningRole === "executive"
                                ? "text-international-orange"
                                : "text-muted-foreground"
                            }`}
                          />
                          <div>
                            <p className="font-semibold text-sm text-foreground">
                              Executive
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Experienced professional
                            </p>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setJoiningRole("apprentice")}
                          className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all duration-200 text-left ${
                            joiningRole === "apprentice"
                              ? "border-international-orange bg-international-orange/5"
                              : "border-muted hover:border-international-orange/40 bg-card"
                          }`}
                        >
                          <GraduationCap
                            className={`w-5 h-5 shrink-0 ${
                              joiningRole === "apprentice"
                                ? "text-international-orange"
                                : "text-muted-foreground"
                            }`}
                          />
                          <div>
                            <p className="font-semibold text-sm text-foreground">
                              Apprentice
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Early career / student
                            </p>
                          </div>
                        </button>
                      </div>
                    </div>
                  )}

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
                      className="bg-background border-input focus:border-international-orange focus:ring-international-orange/20"
                      required
                      aria-required="true"
                      autoFocus
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
                      defaultValue={demoData?.password || ""}
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
                  </div>

                  {/* Founder-specific fields */}
                  {selectedPath === "founder" && (
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

                      <div className="grid grid-cols-2 gap-3">
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
                            defaultValue={state.values?.industry || demoData?.industry || ""}
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
                            defaultValue={state.values?.stage || demoData?.stage || ""}
                            className="bg-background border-input focus:border-international-orange focus:ring-international-orange/20"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Submit */}
                  <motion.div
                    whileHover={isPending ? {} : { scale: 1.01 }}
                    whileTap={isPending ? {} : { scale: 0.98 }}
                    className="pt-2"
                  >
                    <Button
                      type="submit"
                      disabled={isPending}
                      className="w-full bg-international-orange hover:bg-international-orange/90 text-white font-bold tracking-widest uppercase py-5 sm:py-6 h-auto text-sm transition-colors shadow-lg hover:shadow-xl disabled:opacity-70"
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
                <div className="mt-6">
                  <FoundingMemberCounter />
                </div>

                <p className="text-xs text-center text-muted-foreground mt-6">
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
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}

/**
 * JoinPage — Unified signup page. One form, pick your path.
 *
 * @description Replaces the separate /join/founder, /join/executive,
 * /join/apprentice pages with a single entry point. Users select whether
 * they're founding a company or joining the marketplace, fill in their
 * details, and are signed into the app immediately.
 */
export default function JoinPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <JoinPageInner />
    </Suspense>
  );
}
