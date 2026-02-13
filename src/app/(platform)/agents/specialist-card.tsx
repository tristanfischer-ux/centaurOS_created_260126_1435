"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { motion } from "framer-motion"
import {
    Compass,
    Package,
    Crown,
    Megaphone,
    Handshake,
    TrendingUp,
    Calculator,
    Users,
    Scale,
} from "lucide-react"
import type { Specialist } from "./specialists-data"

/**
 * Icon map from string names to Lucide components.
 * Covers all icons used in specialists-data.ts.
 */
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
    Compass,
    Package,
    Crown,
    Megaphone,
    Handshake,
    TrendingUp,
    Calculator,
    Users,
    Scale,
}

/**
 * Row-based accent colors for the card's left border.
 */
const ROW_BORDER_COLORS: Record<string, string> = {
    know: "border-l-electric-blue",
    grow: "border-l-international-orange",
    run: "border-l-status-success",
}

interface SpecialistCardProps {
    /** The specialist data to display */
    specialist: Specialist
    /** Number of capabilities (prompts) available for this specialist */
    capabilityCount: number
    /** Called when "Brief" is clicked */
    onBrief: (specialistId: string) => void
    /** Animation delay for staggered entrance */
    index?: number
}

/**
 * SpecialistCard -- A single specialist in the 3x3 roster grid.
 *
 * @description Displays a specialist as a team member card with avatar,
 * name, tagline, capability count, highlights, and a "Brief" CTA.
 * Uses row-themed left border accent (blue=KNOW, orange=GROW, green=RUN).
 */
export function SpecialistCard({ specialist, capabilityCount, onBrief, index = 0 }: SpecialistCardProps) {
    const Icon = ICON_MAP[specialist.icon] ?? Compass
    const borderColor = ROW_BORDER_COLORS[specialist.row] ?? "border-l-muted"

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.08, ease: "easeOut" }}
        >
            <Card
                className={cn(
                    "border-l-4 rounded-xl shadow-sm bg-card",
                    "transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5",
                    "flex flex-col h-full",
                    borderColor
                )}
            >
                <CardContent className="pt-6 flex flex-col h-full">
                    {/* Avatar + Name */}
                    <div className="flex items-start gap-4 mb-4">
                        <div className="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-muted">
                            <Icon className="h-6 w-6 text-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h3 className="font-display font-semibold text-foreground text-lg leading-tight">
                                {specialist.name}
                            </h3>
                            <p className="text-sm text-muted-foreground italic mt-0.5 leading-snug">
                                &ldquo;{specialist.tagline}&rdquo;
                            </p>
                        </div>
                    </div>

                    {/* Highlights */}
                    <div className="flex flex-wrap gap-1.5 mb-4">
                        {specialist.highlights.slice(0, 4).map((h) => (
                            <Badge key={h} variant="secondary" className="text-[11px] font-normal">
                                {h}
                            </Badge>
                        ))}
                        {specialist.highlights.length > 4 && (
                            <Badge variant="secondary" className="text-[11px] font-normal">
                                +{specialist.highlights.length - 4} more
                            </Badge>
                        )}
                    </div>

                    {/* Spacer to push CTA to bottom */}
                    <div className="flex-1" />

                    {/* CTA Row */}
                    <div className="flex items-center justify-between pt-4 border-t border-muted">
                        <span className="text-xs text-muted-foreground">
                            {capabilityCount} {capabilityCount === 1 ? "capability" : "capabilities"}
                        </span>
                        <Button
                            size="sm"
                            className="bg-international-orange hover:bg-international-orange-hover text-white"
                            onClick={() => onBrief(specialist.id)}
                        >
                            Brief
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    )
}
