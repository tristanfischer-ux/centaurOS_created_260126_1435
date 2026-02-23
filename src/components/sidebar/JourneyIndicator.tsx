"use client"

import { Hammer, PoundSterling, Store, UserCircle, Waypoints } from "lucide-react"
import { motion } from "framer-motion"
import Link from "next/link"

import { cn } from "@/lib/utils"

import type { SectionId } from "@/lib/features/section-registry"

/** Config for each step in the journey stepper */
const JOURNEY_STEPS = [
    { id: "me" as SectionId, label: "You", icon: UserCircle, route: "/me" },
    { id: "plan" as SectionId, label: "Plan", icon: Waypoints, route: "/plan" },
    { id: "finance" as SectionId, label: "Finance", icon: PoundSterling, route: "/finance/intro" },
    {
        id: "workshop" as SectionId,
        label: "Build",
        icon: Hammer,
        route: "/workshop",
    },
    {
        id: "marketplace" as SectionId,
        label: "Scale",
        icon: Store,
        route: "/marketplace-hub",
    },
] as const

// ─── JourneyIndicator ────────────────────────────────────────────────────────

/**
 * JourneyIndicator — Horizontal stepper showing position in the ForgeOS section flow.
 *
 * @description Renders a 5-step journey indicator (You → Plan → Finance → Build → Scale)
 * with circles connected by lines. The current section is highlighted with
 * International Orange and a subtle glow. Other steps are clickable links
 * to their section intro pages. Uses Framer Motion for entrance animation.
 * On mobile, labels are hidden for a compact circles-only layout.
 *
 * @component
 *
 * @param {JourneyIndicatorProps} props - Component props
 * @param {SectionId} props.currentSection - The section the user is currently viewing
 * @param {string} [props.className] - Optional CSS classes for the root element
 *
 * @example
 * // In a section intro page header
 * <JourneyIndicator currentSection="workshop" className="mb-6" />
 *
 * @example
 * // In the sidebar or global nav
 * <JourneyIndicator currentSection={pathname.startsWith("/me") ? "me" : "plan"} />
 */
export function JourneyIndicator({
    currentSection,
    className,
}: JourneyIndicatorProps) {
    const currentIndex = JOURNEY_STEPS.findIndex((s) => s.id === currentSection)
    const currentIdx = currentIndex >= 0 ? currentIndex : 0

    return (
        <motion.nav
            aria-label="Section journey"
            className={cn("flex items-center justify-center", className)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
        >
            <div className="flex items-end gap-0">
                {JOURNEY_STEPS.map((step, index) => {
                    const Icon = step.icon
                    const isActive = step.id === currentSection

                    // Line before this step is orange when we've completed the prior step
                    const lineBeforeActive = index > 0 && currentIdx >= index

                    const stepContent = (
                        <div className="flex flex-col items-center gap-2">
                            <motion.div
                                className={cn(
                                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors md:h-9 md:w-9",
                                    isActive
                                        ? "bg-international-orange text-background shadow-[0_0_12px_rgba(255,69,0,0.4)]"
                                        : "bg-muted text-muted-foreground"
                                )}
                                initial={isActive ? { scale: 0.8, opacity: 0 } : false}
                                animate={
                                    isActive
                                        ? { scale: 1, opacity: 1 }
                                        : { scale: 1, opacity: 1 }
                                }
                                transition={{
                                    duration: 0.4,
                                    ease: [0.22, 1, 0.36, 1],
                                    delay: isActive ? 0.15 : 0,
                                }}
                            >
                                <Icon className="h-4 w-4 md:h-[18px] md:w-[18px]" />
                            </motion.div>
                            <span
                                className={cn(
                                    "hidden text-xs font-medium transition-colors md:block",
                                    isActive
                                        ? "text-international-orange font-semibold"
                                        : "text-muted-foreground"
                                )}
                            >
                                {step.label}
                            </span>
                        </div>
                    )

                    return (
                        <div
                            key={step.id}
                            className="flex items-end"
                        >
                            {/* Connecting line before this step */}
                            {index > 0 && (
                                <div
                                    className={cn(
                                        "h-0.5 w-3 shrink-0 self-center md:w-6 lg:w-8",
                                        lineBeforeActive
                                            ? "bg-international-orange/30"
                                            : "bg-muted"
                                    )}
                                    aria-hidden
                                />
                            )}

                            {isActive ? (
                                <div
                                    className="flex flex-col items-center"
                                    aria-current="step"
                                >
                                    {stepContent}
                                </div>
                            ) : (
                                <Link
                                    href={step.route}
                                    className="flex flex-col items-center transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-international-orange focus:ring-offset-2 rounded-sm"
                                    aria-label={`Go to ${step.label} section`}
                                >
                                    {stepContent}
                                </Link>
                            )}
                        </div>
                    )
                })}
            </div>
        </motion.nav>
    )
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface JourneyIndicatorProps {
    /** The section the user is currently viewing */
    currentSection: SectionId
    /** Optional CSS classes for the root element */
    className?: string
}
