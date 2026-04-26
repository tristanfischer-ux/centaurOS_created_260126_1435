"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Check,
  Mail,
  Clock,
  ArrowRight,
  Target,
  Users,
  Sparkles,
  Shield,
  Building,
  Bot,
  Loader2,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"

// ─── Config ────────────────────────────────────────────────────────────────

interface SuccessConfig {
  title: string
  subtitle: string
  description: string
  nextStep: string
  ctaText: string
  ctaLink: string
  preparing?: { label: string; icon: typeof Check }[]
}

const signupSuccessConfig: Record<string, SuccessConfig> = {
  founder: {
    title: "Welcome, Founder.",
    subtitle: "Your command center is being prepared.",
    description:
      "Check your email to verify your account. Once verified, you'll have immediate access to Fractional Forge.",
    nextStep: "Verify your email → Access your dashboard → Start building",
    ctaText: "Go to Login",
    ctaLink: "/login",
    preparing: [
      { label: "Creating your foundry workspace", icon: Building },
      { label: "Setting up strategic objectives", icon: Target },
      { label: "Preparing team management tools", icon: Users },
      { label: "Connecting to the marketplace", icon: Sparkles },
    ],
  },
  executive: {
    title: "Welcome to the Cadre.",
    subtitle: "Your expertise has a new home.",
    description:
      "Check your email to verify your account. We'll start matching you with ventures that need your skills.",
    nextStep: "Verify your email → Complete your profile → Get matched",
    ctaText: "Go to Login",
    ctaLink: "/login",
    preparing: [
      { label: "Joining The Guild", icon: Users },
      { label: "Setting up your executive profile", icon: Shield },
      { label: "Preparing approval workflows", icon: Check },
      { label: "Connecting to venture pipeline", icon: Target },
    ],
  },
  apprentice: {
    title: "Welcome to The Guild.",
    subtitle: "Your toolkit is ready.",
    description:
      "Check your email to verify your account. Your training begins immediately upon verification.",
    nextStep: "Verify your email → Enter The Guild → Begin training",
    ctaText: "Go to Login",
    ctaLink: "/login",
    preparing: [
      { label: "Joining The Guild", icon: Users },
      { label: "Preparing your productivity toolkit", icon: Bot },
      { label: "Assigning your first training tasks", icon: Target },
      { label: "Activating your toolkit", icon: Sparkles },
    ],
  },
  supplier: {
    title: "Welcome, Supplier.",
    subtitle: "Your storefront is being prepared.",
    description:
      "Check your email to verify your account. Once verified, you'll have access to your Supplier Portal where you can list products, respond to RFQs, and manage orders.",
    nextStep: "Verify your email → Access Supplier Portal → Start selling",
    ctaText: "Go to Login",
    ctaLink: "/login",
    preparing: [
      { label: "Setting up your supplier account", icon: Building },
      { label: "Preparing your product catalog", icon: Sparkles },
      { label: "Connecting to the marketplace", icon: Users },
      { label: "Activating order management", icon: Target },
    ],
  },
}

const applicationSuccessConfig: Record<string, SuccessConfig> = {
  vc: {
    title: "Application Received.",
    subtitle: "We review every application personally.",
    description:
      "Our team will evaluate your application and respond within 48 hours. We're selective about our VC partners to ensure quality deal flow for everyone.",
    nextStep: "Application review → Partner call → Network access",
    ctaText: "Back to Home",
    ctaLink: "/",
  },
  factory: {
    title: "Connection Request Received.",
    subtitle: "Welcome to the virtual factory network.",
    description:
      "We'll review your facility capabilities and reach out to discuss integration. Most facilities are onboarded within one week.",
    nextStep: "Capability review → Integration call → Start receiving jobs",
    ctaText: "Back to Home",
    ctaLink: "/",
  },
  university: {
    title: "Partnership Inquiry Received.",
    subtitle: "Bridging academia and industry.",
    description:
      "Our partnerships team will review your inquiry and reach out to discuss collaboration opportunities.",
    nextStep: "Inquiry review → Partnership call → Program design",
    ctaText: "Back to Home",
    ctaLink: "/",
  },
  network: {
    title: "Application Received.",
    subtitle: "Joining the Grid.",
    description:
      "We'll review your application and reach out to discuss how your resources can connect to ForgeOS.",
    nextStep: "Application review → Integration planning → Go live",
    ctaText: "Back to Home",
    ctaLink: "/",
  },
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Polling interval in ms — check for session every 3 seconds. */
const SESSION_POLL_INTERVAL = 3000

/**
 * Determine where to redirect an authenticated user after signup.
 *
 * @param role The role the user signed up with
 * @returns The redirect path
 */
function getPostSignupRedirect(_role: string): string {
  // DECISION 2026-04-25: /today removed — redirect post-signup to /investors,
  // the killer-feature default per the pivot. /welcome is shown first via
  // setupNewUser redirect; this is the fallback after welcome dismissal.
  return "/investors"
}

// ─── Component ─────────────────────────────────────────────────────────────

interface SuccessContentProps {
  type: string
  role: string
}

/**
 * Client-side success page content with session awareness.
 *
 * @description On mount, checks if the user already has a Supabase session.
 * If so, auto-redirects to the appropriate post-signup destination. If not,
 * polls every 3 seconds for a session (user may verify email in another tab)
 * and auto-redirects once detected. Shows the "check your email" UI while
 * waiting. Uses light-first design with semantic tokens.
 */
export function SuccessContent({ type, role }: SuccessContentProps): React.ReactElement {
  const router = useRouter()
  const [isRedirecting, setIsRedirecting] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isApplication = type === "application"
  const isSignup = !isApplication

  const configMap = isApplication ? applicationSuccessConfig : signupSuccessConfig
  const config = configMap[role] || {
    title: "Success!",
    subtitle: "Your submission was received.",
    description: "We'll be in touch soon.",
    nextStep: "",
    ctaText: "Back to Home",
    ctaLink: "/",
  }

  useEffect(() => {
    // Only poll for session on signup pages, not application submissions
    if (!isSignup) return

    const supabase = createClient()

    async function checkSessionAndRedirect(): Promise<void> {
      // SECURITY: getUser() validates JWT server-side; getSession() only reads local cache (RT2-07)
      const { data: { user: confirmedUser } } = await supabase.auth.getUser()
      if (confirmedUser) {
        setIsRedirecting(true)
        if (pollRef.current) clearInterval(pollRef.current)
        router.push(getPostSignupRedirect(role))
      }
    }

    // Check immediately on mount
    checkSessionAndRedirect()

    // Poll for session (user may verify email in another tab/window)
    pollRef.current = setInterval(checkSessionAndRedirect, SESSION_POLL_INTERVAL)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [isSignup, role, router])

  // Redirecting state — show a clean loading indicator
  if (isRedirecting) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 sm:px-6">
        <div className="max-w-lg w-full text-center space-y-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-status-success-light">
            <Loader2 className="w-8 h-8 text-status-success animate-spin" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            Account verified!
          </h1>
          <p className="text-muted-foreground">
            Setting up your workspace. One moment...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-4 sm:px-6">
      <div className="max-w-lg w-full text-center">
        {/* Success Icon */}
        <div className="mb-6 sm:mb-8 inline-flex items-center justify-center w-16 sm:w-20 h-16 sm:h-20 rounded-full bg-status-info-light border border-status-info/30">
          {isApplication ? (
            <Clock className="w-8 sm:w-10 h-8 sm:h-10 text-status-info" />
          ) : (
            <Mail className="w-8 sm:w-10 h-8 sm:h-10 text-status-info" />
          )}
        </div>

        {/* Title */}
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black mb-3 sm:mb-4 text-foreground">
          {config.title}
        </h1>

        {/* Subtitle */}
        <p className="text-lg sm:text-xl text-muted-foreground mb-6 sm:mb-8">
          {config.subtitle}
        </p>

        {/* Description */}
        <p className="text-muted-foreground mb-8 sm:mb-10 leading-relaxed text-sm sm:text-base">
          {config.description}
        </p>

        {/* What's Being Prepared */}
        {config.preparing && config.preparing.length > 0 && (
          <div className="mb-8 sm:mb-10 p-4 sm:p-6 bg-muted/50 border text-left rounded-xl">
            <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-4">
              Preparing your workspace
            </h3>
            <div className="space-y-3">
              {config.preparing.map((item, index) => {
                const Icon = item.icon
                return (
                  <div
                    key={item.label}
                    className="flex items-center gap-3 text-foreground text-sm animate-fade-in"
                    style={{ animationDelay: `${index * 200}ms` }}
                  >
                    <div className="w-6 h-6 rounded-full bg-status-info-light flex items-center justify-center">
                      <Icon className="w-3 h-3 text-status-info" />
                    </div>
                    <span>{item.label}</span>
                    <div className="ml-auto">
                      <Check
                        className="w-4 h-4 text-status-success animate-scale-in"
                        style={{ animationDelay: `${index * 200 + 400}ms` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Waiting for verification — signup only */}
        {isSignup && (
          <div className="mb-8 sm:mb-10 p-4 sm:p-6 bg-status-info-light border border-status-info/20 text-left rounded-xl">
            <div className="flex items-start gap-3">
              <Loader2 className="w-4 h-4 text-status-info mt-0.5 animate-spin shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">
                  Waiting for email verification
                </h3>
                <p className="text-xs text-muted-foreground">
                  Click the link in your email. This page will redirect automatically once verified.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Next Steps */}
        {config.nextStep && (
          <div className="mb-8 sm:mb-10 p-4 sm:p-6 bg-muted/50 border text-left rounded-xl">
            <h3 className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">
              What happens next
            </h3>
            <div className="flex items-center gap-2 text-foreground text-sm sm:text-base">
              <Check className="w-4 h-4 text-status-info shrink-0" />
              <span>{config.nextStep}</span>
            </div>
          </div>
        )}

        {/* CTA */}
        <Link
          href={config.ctaLink}
          className="inline-flex items-center gap-2 bg-international-orange text-white px-6 sm:px-8 py-3 sm:py-4 font-bold tracking-widest uppercase hover:bg-international-orange/90 transition-colors text-sm rounded-lg shadow-md hover:shadow-lg"
        >
          {config.ctaText}
          <ArrowRight className="w-4 h-4" />
        </Link>

        {/* Support Link */}
        <p className="mt-8 sm:mt-10 text-xs text-muted-foreground">
          Questions?{" "}
          <a
            href="mailto:support@fractionalforge.app"
            className="underline hover:text-foreground transition-colors"
          >
            Contact support
          </a>
        </p>
      </div>
    </div>
  )
}
