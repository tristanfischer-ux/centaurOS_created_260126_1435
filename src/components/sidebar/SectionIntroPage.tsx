/**
 * SectionIntroPage — Rich, visually immersive introduction page for sidebar sections.
 *
 * @description Renders a high-impact visual overview of a sidebar section with:
 * - Hero zone with background image, title, tagline, and journey indicator
 * - Value propositions explaining what the section offers
 * - Animated feature cards linking to each page within the section
 * - Integration zone showing how this section connects to others
 *
 * Each section has its own visual identity (accent colors, hero image) while
 * sharing the same layout structure, creating a cohesive "chapter opener" feel.
 *
 * @param {SectionIntroPageProps} props - Component props
 * @param {Section} props.section - The section definition from section-registry
 *
 * @example
 * <SectionIntroPage section={getSectionById("workshop")!} />
 */

"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect } from "react"
import { motion, type Variants } from "framer-motion"

import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useSectionNewBadges } from "@/hooks/useSectionNewBadge"
import type { Section, SectionFeature, SectionId } from "@/lib/features/section-registry"
import { JourneyIndicator } from "./JourneyIndicator"
import { SectionConnections } from "./SectionConnections"

// ─── Constants ────────────────────────────────────────────────────────────────

/** How many days a feature is considered "new" on the intro page */
const NEW_THRESHOLD_DAYS = 30

/**
 * Explicit gradient class map per section.
 * Using a static map ensures Tailwind includes these classes at build time,
 * since dynamic string interpolation like `bg-gradient-to-b ${gradient}` is
 * not detectable by the JIT compiler.
 */
const SECTION_GRADIENT_CLASS: Record<SectionId, string> = {
    me: "from-orange-500 to-amber-400",
    plan: "from-orange-500 to-blue-500",
    workshop: "from-orange-600 to-amber-500",
    marketplace: "from-orange-500 to-teal-400",
}

// ─── Animation Variants ──────────────────────────────────────────────────────

const heroContainer: Variants = {
    hidden: {},
    visible: {
        transition: { staggerChildren: 0.1, delayChildren: 0.05 },
    },
}

const heroChild: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
    },
}

const cardStagger: Variants = {
    hidden: {},
    visible: {
        transition: { staggerChildren: 0.08, delayChildren: 0.2 },
    },
}

const cardItem: Variants = {
    hidden: { opacity: 0, y: 24 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
    },
}

const valuePropStagger: Variants = {
    hidden: {},
    visible: {
        transition: { staggerChildren: 0.06, delayChildren: 0.1 },
    },
}

const valuePropItem: Variants = {
    hidden: { opacity: 0, x: -12 },
    visible: {
        opacity: 1,
        x: 0,
        transition: { duration: 0.35, ease: "easeOut" },
    },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isFeatureRecent(feature: SectionFeature): boolean {
    const daysSinceAdded = (Date.now() - feature.addedAt.getTime()) / (1000 * 60 * 60 * 24)
    return daysSinceAdded <= NEW_THRESHOLD_DAYS
}

// ─── Component ───────────────────────────────────────────────────────────────

interface SectionIntroPageProps {
    /** The section to render */
    section: Section
}

export function SectionIntroPage({ section }: SectionIntroPageProps): React.ReactElement {
    const { markSectionSeen } = useSectionNewBadges()

    // Mark this section as seen when the user visits the intro page
    useEffect(() => {
        markSectionSeen(section.id)
    }, [section.id, markSectionSeen])

    const { visual, valueProps, connections } = section

    return (
        <div className="space-y-12 -mt-4 sm:-mt-6 lg:-mt-8 -mx-4 sm:-mx-6 lg:-mx-8">
            {/* ── Hero Zone ─────────────────────────────────────────────── */}
            <div className="relative overflow-hidden rounded-b-2xl">
                {/* Background Image */}
                <div className="absolute inset-0">
                    <Image
                        src={visual.heroImage}
                        alt={visual.heroAlt}
                        fill
                        className="object-cover object-center"
                        priority
                        sizes="100vw"
                    />
                    {/* Gradient overlay: white fade from left + bottom for readability */}
                    <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-background/40" />
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
                </div>

                {/* Hero Content */}
                <motion.div
                    className="relative z-10 px-6 sm:px-8 lg:px-12 pt-10 sm:pt-14 lg:pt-16 pb-8 sm:pb-10 lg:pb-12 max-w-3xl"
                    initial="hidden"
                    animate="visible"
                    variants={heroContainer}
                >
                    {/* Journey Indicator */}
                    <motion.div variants={heroChild}>
                        <JourneyIndicator
                            currentSection={section.id}
                            className="justify-start mb-8"
                        />
                    </motion.div>

                    {/* Section Title */}
                    <motion.div variants={heroChild} className="flex items-center gap-3 mb-3">
                        <div className="h-10 w-2 bg-international-orange rounded-full shadow-[0_0_10px_rgba(255,69,0,0.5)]" />
                        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold text-foreground tracking-tight">
                            {section.label}
                        </h1>
                    </motion.div>

                    {/* Tagline */}
                    <motion.p
                        variants={heroChild}
                        className="text-xl sm:text-2xl text-foreground/80 font-display font-medium leading-snug mb-2 pl-5"
                    >
                        {section.tagline}
                    </motion.p>

                    {/* Description */}
                    <motion.p
                        variants={heroChild}
                        className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-2xl pl-5"
                    >
                        {section.description}
                    </motion.p>
                </motion.div>
            </div>

            {/* ── Value Propositions ────────────────────────────────────── */}
            {valueProps.length > 0 && (
                <motion.div
                    className="px-4 sm:px-6 lg:px-8"
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-40px" }}
                    variants={valuePropStagger}
                >
                    <motion.p
                        variants={valuePropItem}
                        className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-6"
                    >
                        What you&apos;ll find here
                    </motion.p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {valueProps.map((prop) => (
                            <motion.div
                                key={prop.title}
                                variants={valuePropItem}
                                className="flex gap-4"
                            >
                                <div className={cn(
                                    "h-10 w-1 rounded-full shrink-0 mt-0.5 bg-gradient-to-b",
                                    SECTION_GRADIENT_CLASS[section.id]
                                )} />
                                <div>
                                    <h3 className="text-sm font-semibold text-foreground mb-1">
                                        {prop.title}
                                    </h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        {prop.text}
                                    </p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* ── Feature Cards ─────────────────────────────────────────── */}
            <motion.div
                className="px-4 sm:px-6 lg:px-8"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-40px" }}
                variants={cardStagger}
            >
                <motion.p
                    variants={cardItem}
                    className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-6"
                >
                    Explore {section.label}
                </motion.p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {section.features.map((feature) => (
                        <motion.div key={feature.route} variants={cardItem}>
                            <FeatureCard
                                feature={feature}
                                accentBg={visual.accentBg}
                            />
                        </motion.div>
                    ))}
                </div>
            </motion.div>

            {/* ── Connections Zone ──────────────────────────────────────── */}
            {connections.length > 0 && (
                <div className="px-4 sm:px-6 lg:px-8 pb-4">
                    <SectionConnections
                        connections={connections}
                        accentText={visual.accentText}
                    />
                </div>
            )}
        </div>
    )
}

// ─── Feature Card ────────────────────────────────────────────────────────────

interface FeatureCardProps {
    /** Feature data from section registry */
    feature: SectionFeature
    /** Background class for the icon container */
    accentBg: string
}

/**
 * FeatureCard — Enhanced card for a section feature with hover animation.
 *
 * @description Renders a feature as a card with icon, name, description,
 * and optional "New" badge. Includes hover lift animation and icon scale.
 */
function FeatureCard({ feature, accentBg }: FeatureCardProps): React.ReactElement {
    const Icon = feature.icon
    const isNew = isFeatureRecent(feature)

    return (
        <Link href={feature.route}>
            <Card className={cn(
                "group relative overflow-hidden transition-all duration-300",
                "hover:shadow-lg hover:-translate-y-1 cursor-pointer h-full",
                "border"
            )}>
                <CardContent className="pt-6">
                    <div className="flex items-start justify-between mb-4">
                        <div className={cn(
                            "flex items-center justify-center w-12 h-12 rounded-xl transition-transform duration-300 group-hover:scale-110",
                            accentBg,
                            "text-international-orange"
                        )}>
                            <Icon className="h-6 w-6" />
                        </div>
                        {isNew && (
                            <Badge
                                variant="default"
                                className="bg-international-orange text-background text-[10px] px-2 py-0.5"
                            >
                                New
                            </Badge>
                        )}
                    </div>
                    <h3 className="text-base font-semibold text-foreground mb-1 group-hover:text-international-orange transition-colors">
                        {feature.name}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        {feature.description}
                    </p>

                    {/* Subtle gradient shimmer on hover */}
                    <div className="absolute inset-0 bg-gradient-to-br from-international-orange/0 to-international-orange/0 group-hover:from-international-orange/[0.02] group-hover:to-international-orange/[0.06] transition-all duration-500 pointer-events-none rounded-xl" />
                </CardContent>
            </Card>
        </Link>
    )
}
