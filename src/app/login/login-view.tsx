/**
 * @file login-view.tsx — Client-side login form with animated hero carousel
 *
 * @description Full-screen split layout: rotating hero carousel on left,
 * animated login form on right. Warm, optimistic copy designed to continue
 * the energy from the marketing page into the login experience.
 */

'use client'

import { Suspense } from 'react'
import { useFormStatus } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import { motion, type Variants } from 'framer-motion'
import { login } from './actions'
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
 * ErrorMessage — Displays auth errors from URL params.
 */
function ErrorMessage(): React.ReactNode {
    const searchParams = useSearchParams()
    const error = searchParams.get('error')

    if (!error) return null

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            role="alert"
            aria-live="polite"
            className="p-4 text-sm text-destructive bg-status-error-light border border-destructive rounded-sm mb-6 flex items-center gap-3"
        >
            <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" aria-hidden="true" />
            {error}
        </motion.div>
    )
}

/**
 * Staggered animation variants for form elements.
 */
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
            className="w-full max-w-sm mx-auto space-y-8 relative z-10"
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
                            autoFocus
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
                </motion.div>

                <motion.div variants={formItemVariants}>
                    <SubmitButton />
                </motion.div>

                <motion.div variants={formItemVariants} className="text-center pt-4">
                    <span className="text-xs text-muted-foreground">
                        Trusted by 100 founding members
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
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8 lg:p-12 relative bg-background flex-1">
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
