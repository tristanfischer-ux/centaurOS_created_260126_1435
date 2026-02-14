"use client"

import Image from "next/image"
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
    UserPlus,
    Scale,
    Sparkles,
    ArrowRight,
    Cpu,
    Code2,
    Factory,
    Route,
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
    UserPlus,
    Users: UserPlus,
    Scale,
    Cpu,
    Code2,
    Factory,
    Route,
}

/**
 * Default accent color for the card's left border.
 */
const CARD_BORDER_COLOR = "border-l-international-orange"

/**
 * Default accent color for the "Start here" badge.
 */
const BADGE_COLOR = "bg-international-orange-light text-international-orange"

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
 * @description Displays a specialist as a team member card with avatar image,
 * human name, functional title, tagline, working style, capability count,
 * highlights, and a "Brief" CTA. Recommended specialists get a "Start here" badge.
 */
export function SpecialistCard({ specialist, capabilityCount, onBrief, index = 0 }: SpecialistCardProps) {
    const Icon = ICON_MAP[specialist.icon] ?? Compass

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.08, ease: "easeOut" }}
        >
            <Card
                role="button"
                tabIndex={0}
                aria-label={`Brief ${specialist.name}, ${specialist.title}`}
                className={cn(
                    "border-l-4 rounded-xl shadow-sm bg-card",
                    "transition-all duration-200 hover:shadow-lg hover:-translate-y-1",
                    "flex flex-col h-full group cursor-pointer",
                    CARD_BORDER_COLOR
                )}
                onClick={() => onBrief(specialist.id)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        onBrief(specialist.id)
                    }
                }}
            >
                <CardContent className="pt-6 flex flex-col h-full">
                    {/* Recommended Badge */}
                    {specialist.recommended && (
                        <div className="flex items-center gap-1.5 mb-3">
                            <Badge className={cn("text-[11px] font-medium gap-1", BADGE_COLOR)}>
                                <Sparkles className="h-3 w-3" />
                                Start here
                            </Badge>
                        </div>
                    )}

                    {/* Avatar + Name */}
                    <div className="flex items-start gap-4 mb-3">
                        <div className="flex-shrink-0 relative h-14 w-14 rounded-full overflow-hidden bg-muted">
                            {specialist.avatarImage ? (
                                <Image
                                    src={specialist.avatarImage}
                                    alt={specialist.name}
                                    fill
                                    className="object-cover"
                                    sizes="56px"
                                />
                            ) : (
                                <div className="flex items-center justify-center h-full w-full">
                                    <Icon className="h-7 w-7 text-foreground" />
                                </div>
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <h3 className="font-display font-semibold text-foreground text-lg leading-tight">
                                {specialist.name}
                            </h3>
                            <p className="text-xs text-muted-foreground font-medium mt-0.5">
                                {specialist.title}
                            </p>
                            <p className="text-sm text-muted-foreground italic mt-1 leading-snug">
                                &ldquo;{specialist.tagline}&rdquo;
                            </p>
                        </div>
                    </div>

                    {/* Working Style */}
                    <p className="text-xs text-muted-foreground leading-relaxed mb-4 line-clamp-2">
                        {specialist.workingStyle}
                    </p>

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
                            {capabilityCount} {capabilityCount === 1 ? "brief" : "briefs"} ready
                        </span>
                        <Button
                            size="sm"
                            className="bg-international-orange hover:bg-international-orange-hover text-white gap-1.5 group-hover:gap-2.5 transition-all"
                            onClick={(e) => {
                                e.stopPropagation()
                                onBrief(specialist.id)
                            }}
                        >
                            Brief
                            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    )
}
