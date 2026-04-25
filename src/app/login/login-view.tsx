/**
 * @file login-view.tsx — Client-side login form with animated hero carousel
 *
 * @description Full-screen split layout: rotating hero carousel on left,
 * animated login form on right. Warm, optimistic copy designed to continue
 * the energy from the marketing page into the login experience.
 */

'use client'

import { Suspense, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { motion, type Variants } from 'framer-motion'
import { login } from './actions'
import { createClient } from '@/lib/supabase/client'
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { LoginHeroCarousel, MobileHeroBanner } from './login-hero-carousel'

/**
 * SubmitButton — Animated login submit with loading state.
 */
function SubmitButton(): React.ReactNode {
    const { pending } = useFormStatus()

    return (
        <motion.div
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
        >
            <Button
                formAction={login}
                className="w-full h-12 bg-international-orange hover:bg-international-orange/90 text-white font-medium tracking-wide uppercase text-sm transition-all duration-300 shadow-md hover:shadow-lg"
                disabled={pending}
            >
                {pending ? 'Opening the forge...' : 'Enter the Forge'}
            </Button>
        </motion.div>
    )
}

/**
 * SECURITY: Map error codes to safe messages. Never render raw URL params —
 * an attacker can craft phishing URLs with arbitrary "error" text.
 */
const ERROR_MESSAGES: Record<string, string> = {
    'invalid-credentials': 'Invalid email or password. Try resetting your password if you\'re sure the email is correct.',
    'email-not-confirmed': 'Please check your inbox and confirm your email address before signing in.',
    'rate-limited': 'Too many login attempts. Please try again in 15 minutes.',
    'invalid-email': 'Invalid email address',
    'password-required': 'Password is required',
    'password-too-short': 'Password must be at least 8 characters',
    'password-too-long': 'Password is too long',
    'timeout': 'Login timed out — please try again.',
}

/**
 * ErrorMessage — Displays auth errors from URL params (code-mapped only).
 */
function ErrorMessage(): React.ReactNode {
    const searchParams = useSearchParams()
    const errorCode = searchParams.get('error')
    const message = errorCode ? ERROR_MESSAGES[errorCode] : null

    if (!message) return null

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            role="alert"
            aria-live="polite"
            className="p-4 text-sm text-destructive bg-status-error-light border border-destructive rounded-sm mb-6 flex items-center gap-3"
        >
            <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" aria-hidden="true" />
            {message}
        </motion.div>
    )
}

/**
 * Staggered animation variants for form elements.
 */
/**
 * GoogleIcon — Inline SVG of the Google "G" logo in brand colours.
 */
function GoogleIcon({ className }: { className?: string }): React.ReactNode {
    return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
    )
}

/**
 * GoogleOAuthButton — Triggers Google OAuth sign-in via Supabase.
 */
function GoogleOAuthButton({ redirect }: { redirect?: string | null }): React.ReactNode {
    const [loading, setLoading] = useState(false)

    async function handleGoogleLogin() {
        setLoading(true)
        const supabase = createClient()
        const redirectTo = `${window.location.origin}/auth/callback${redirect ? `?next=${encodeURIComponent(redirect)}` : ''}`
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo },
        })
        if (error) {
            console.error('Google OAuth error:', error)
            setLoading(false)
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
                {loading ? 'Redirecting...' : 'Continue with Google'}
            </Button>
        </motion.div>
    )
}

/**
 * OAuthDivider — "or" text divider between OAuth and email/password.
 */
function OAuthDivider(): React.ReactNode {
    return (
        <div className="relative flex items-center gap-4">
            <div className="flex-1 border-t" />
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">or</span>
            <div className="flex-1 border-t" />
        </div>
    )
}

const formContainerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1,
            delayChildren: 0.2,
        },
    },
}

const formItemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.5, ease: 'easeOut' },
    },
}

/**
 * LoginForm — Animated form with warm, inviting copy.
 */
function LoginForm({ redirect }: { redirect?: string | null }): React.ReactNode {
    const marketingDomain = process.env.NEXT_PUBLIC_MARKETING_DOMAIN || 'https://fractionalforge.app'

    return (
        <motion.div
            variants={formContainerVariants}
            initial="hidden"
            animate="visible"
            className="w-full max-w-sm mx-auto space-y-8 relative z-10 my-auto"
        >
            <motion.div variants={formItemVariants} className="space-y-2">
                <a href={marketingDomain} className="inline-flex items-center min-h-[44px] mb-8 group">
                    <span className="text-xs font-bold tracking-[0.3em] uppercase text-muted-foreground group-hover:text-international-orange transition-colors">
                        &larr; Return to Site
                    </span>
                </a>

                <motion.div variants={formItemVariants} className="mb-8">
                    <h2 className="text-sm font-bold tracking-[0.2em] uppercase text-international-orange">
                        Fractional Forge
                    </h2>
                </motion.div>

                <motion.div variants={formItemVariants} className="space-y-2">
                    <h1 className="text-4xl font-display font-semibold text-foreground tracking-tight">
                        Welcome back, builder.
                    </h1>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                        Your foundry is waiting. Sign in to{' '}
                        <span className="font-semibold text-foreground">ForgeOS</span>.
                    </p>
                </motion.div>
            </motion.div>

            <motion.div variants={formItemVariants}>
                <GoogleOAuthButton redirect={redirect} />
            </motion.div>

            <motion.div variants={formItemVariants}>
                <OAuthDivider />
            </motion.div>

            <form className="space-y-6">
                <Suspense fallback={null}>
                    <ErrorMessage />
                </Suspense>
                {redirect && <input type="hidden" name="redirect" value={redirect} />}

                <motion.div variants={formItemVariants} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email" className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                            Email Address
                            <span className="text-destructive ml-1" aria-label="required">*</span>
                        </Label>
                        <Input
                            id="email"
                            name="email"
                            type="email"
                            placeholder="you@company.com"
                            autoComplete="off"
                            required
                            aria-required="true"
                            className="h-11 bg-background border focus:border-international-orange focus:ring-international-orange/20 transition-all font-medium"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                            Password
                            <span className="text-destructive ml-1" aria-label="required">*</span>
                        </Label>
                        <Input
                            id="password"
                            name="password"
                            type="password"
                            autoComplete="current-password"
                            required
                            aria-required="true"
                            className="h-11 bg-background border focus:border-international-orange focus:ring-international-orange/20 transition-all font-medium font-mono tracking-widest"
                        />
                    </div>
                    <div className="flex justify-end">
                        <Link
                            href="/forgot-password"
                            className="text-xs text-muted-foreground hover:text-international-orange transition-colors"
                        >
                            Forgot password?
                        </Link>
                    </div>
                </motion.div>

                <motion.div variants={formItemVariants}>
                    <SubmitButton />
                </motion.div>

                <motion.div variants={formItemVariants} className="text-center pt-2">
                    <span className="text-sm text-muted-foreground">
                        Don&apos;t have an account?{' '}
                        <Link
                            href={redirect ? `/signup?redirect=${encodeURIComponent(redirect)}` : '/signup'}
                            className="text-international-orange hover:underline font-medium"
                        >
                            Create one for free
                        </Link>
                    </span>
                </motion.div>

            </form>
        </motion.div>
    )
}

/**
 * LoginView — Full-screen login page with animated hero carousel.
 *
 * @description Split layout: rotating hero carousel on left (desktop),
 * compact mobile banner (mobile), animated login form on right.
 * Continues the energy and optimism from the marketing landing page.
 */
export function LoginView({ redirect }: { redirect?: string | null }): React.ReactNode {
    return (
        <div className="min-h-screen flex flex-col lg:flex-row w-full bg-background">
            {/* Mobile Hero Banner (visible on small screens) */}
            <MobileHeroBanner />

            {/* Left Side - Hero Carousel (desktop only) */}
            <div className="hidden lg:flex w-1/2 relative bg-muted overflow-hidden">
                <LoginHeroCarousel />
            </div>

            {/* Right Side - Login Form */}
            {/* GOTCHA: Do NOT use justify-center — pushes top off-screen when
                form overflows on mobile (keyboard open shrinks viewport by ~50%).
                Use my-auto on child instead (centers when space allows, scrolls
                naturally when not). overflow-y-auto enables scroll to submit button. */}
            <div className="w-full lg:w-1/2 flex items-center p-8 lg:p-12 relative bg-background flex-1 overflow-y-auto">
                {/* Subtle animated background pattern */}
                <div
                    className="absolute inset-0 opacity-[0.03] pointer-events-none"
                    style={{
                        backgroundImage: 'radial-gradient(#ea580c 1px, transparent 1px)',
                        backgroundSize: '32px 32px',
                    }}
                />
                <LoginForm redirect={redirect} />
            </div>
        </div>
    )
}
