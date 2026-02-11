/**
 * @file SectionConnections.tsx
 *
 * @description Renders how a section connects to other sections in ForgeOS.
 * Appears at the bottom of section intro pages. Shows each connection as a
 * card with relationship label, target section link, and description.
 * Cards animate in with a fade-up effect when scrolled into view.
 *
 * @related
 * - Section intro page: src/components/sidebar/SectionIntroPage.tsx
 * - Section registry: src/lib/features/section-registry.ts
 */

"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import { ArrowRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
    getSectionById,
    type SectionConnection,
    type SectionId,
} from "@/lib/features/section-registry"

/**
 * Maps accent text classes to border-left color values.
 * Uses inline styles for border color to avoid Tailwind JIT issues
 * with dynamic border classes like border-l-teal-600.
 */
const ACCENT_TO_BORDER_COLOR: Record<string, string> = {
    "text-international-orange": "#ff4500",
    "text-electric-blue": "#3b82f6",
    "text-teal-600": "#0d9488",
}

function getAccentBorderColor(accentText: string): string {
    return ACCENT_TO_BORDER_COLOR[accentText] ?? "#ff4500"
}

/**
 * Resolves a section ID to its display label and intro route.
 *
 * @param targetId - The section ID to resolve
 * @returns The section's label and introRoute, or undefined if not found
 */
function getTargetSection(targetId: SectionId) {
    return getSectionById(targetId)
}

interface SectionConnectionsProps {
    /** Connection definitions from the section registry */
    connections: SectionConnection[]
    /** CSS class for accent color (e.g. "text-international-orange"); used for card left border */
    accentText: string
    /** Additional CSS classes for the root element */
    className?: string
}

/**
 * SectionConnections — Integration zone showing section-to-section relationships.
 *
 * @description Displays a "How this connects" label followed by connection
 * cards. Each card shows an arrow, relationship badge, target section link,
 * and description. Uses the section's accent color for card left borders.
 * Cards fade up when scrolled into view.
 *
 * @param {SectionConnectionsProps} props - Component props
 * @param {SectionConnection[]} props.connections - Connection definitions
 * @param {string} props.accentText - Accent text color class (maps to border)
 * @param {string} [props.className] - Optional root className
 *
 * @returns {React.ReactElement | null} Renders the connections block or null if empty
 *
 * @example
 * <SectionConnections
 *   connections={section.connections}
 *   accentText={section.visual.accentText}
 * />
 */
export function SectionConnections({
    connections,
    accentText,
    className,
}: SectionConnectionsProps): React.ReactElement | null {
    if (!connections.length) return null

    const borderColor = getAccentBorderColor(accentText)

    return (
        <div className={cn("space-y-4", className)}>
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                How this connects
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {connections.map((connection, index) => {
                    const target = getTargetSection(connection.targetId)
                    if (!target) return null

                    return (
                        <motion.div
                            key={connection.targetId}
                            initial={{ opacity: 0, y: 16 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-24px" }}
                            transition={{
                                duration: 0.3,
                                delay: index * 0.05,
                            }}
                        >
                            <Card
                                className="border-l-4 transition-colors"
                                style={{ borderLeftColor: borderColor }}
                            >
                                <CardContent className="pt-6">
                                    <div className="flex flex-col gap-3">
                                        <div className="flex items-center gap-2">
                                            <ArrowRight
                                                className={cn(
                                                    "h-4 w-4 shrink-0",
                                                    accentText
                                                )}
                                                aria-hidden
                                            />
                                            <Badge variant="secondary" className="text-xs font-normal">
                                                {connection.relationship}
                                            </Badge>
                                        </div>

                                        <Link
                                            href={target.introRoute}
                                            className={cn(
                                                "font-semibold text-foreground hover:text-international-orange transition-colors"
                                            )}
                                        >
                                            {target.label}
                                        </Link>

                                        <p className="text-muted-foreground text-sm leading-relaxed">
                                            {connection.description}
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    )
                })}
            </div>
        </div>
    )
}
