"use client"

/**
 * @file huddle-card.tsx
 *
 * @description Card component for a team huddle. Shows the team lead, member
 * avatars, a proactive discussion topic surfaced from the insights system,
 * and a "Join Huddle" CTA. Users can also pick an alternative topic or
 * free-type their own.
 *
 * INTENT: Replace the verbose specialist cards with action-oriented huddle
 * cards that tell the user "this team wants to discuss X with you" instead
 * of listing capabilities.
 *
 * @related
 * - huddle-config.ts — Huddle team definitions
 * - specialists-landing.tsx — Parent layout
 * - team-meeting-dialog.tsx — Opened when user joins a huddle
 */

import { useState } from "react"
import Image from "next/image"
import { motion } from "framer-motion"
import { ArrowRight, MessageSquare, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { getSpecialistById } from "@/lib/agents/specialists-config"
import type { HuddleConfig } from "./huddle-config"
import { getHuddleParticipantIds } from "./huddle-config"
import type { AgentInsight } from "@/actions/agent-insights"

interface HuddleCardProps {
    huddle: HuddleConfig
    /** Proactive discussion topics from the insights system, ordered by urgency */
    topics: AgentInsight[]
    /** Called when user wants to join the huddle with a topic */
    onJoinHuddle: (huddleId: string, participantIds: string[], topic: string) => void
    /** Animation index for staggered entrance */
    index?: number
}

export function HuddleCard({ huddle, topics, onJoinHuddle, index = 0 }: HuddleCardProps) {
    const [selectedTopicIdx, setSelectedTopicIdx] = useState(0)

    const lead = getSpecialistById(huddle.leadId)
    const participantIds = getHuddleParticipantIds(huddle)
    const members = participantIds
        .filter((id) => id !== huddle.leadId)
        .map((id) => getSpecialistById(id))
        .filter(Boolean)

    const primaryTopic = topics[selectedTopicIdx] ?? topics[0]
    const alternateTopics = topics.filter((_, i) => i !== selectedTopicIdx)
    const HuddleIcon = huddle.icon

    const handleJoin = () => {
        const topicText = primaryTopic
            ? primaryTopic.title
            : `${huddle.name}: Open discussion`
        onJoinHuddle(huddle.id, participantIds, topicText)
    }

    const handleSelectTopic = (idx: number) => {
        setSelectedTopicIdx(idx)
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.1 }}
        >
            <Card className="border hover:shadow-lg transition-shadow duration-200 overflow-hidden h-full flex flex-col">
                {/* Header with icon, name, and team avatars */}
                <div className="px-5 pt-5 pb-3">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                            <div className={cn("flex-shrink-0", huddle.accentColor)}>
                                <HuddleIcon className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="font-display font-semibold text-foreground text-sm">
                                    {huddle.name}
                                </h3>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {huddle.description}
                                </p>
                            </div>
                        </div>
                        {topics.length > 0 && (
                            <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                                {topics.length} topic{topics.length !== 1 ? "s" : ""}
                            </Badge>
                        )}
                    </div>

                    {/* Team avatars */}
                    <div className="flex items-center gap-2 mt-3">
                        {/* Lead avatar — larger */}
                        {lead && (
                            <div className="flex items-center gap-1.5">
                                <div className="relative h-9 w-9 rounded-full overflow-hidden bg-muted flex-shrink-0">
                                    {lead.avatarImage ? (
                                        <Image
                                            src={lead.avatarImage}
                                            alt={lead.name}
                                            fill
                                            unoptimized
                                            className="object-cover"
                                            sizes="36px"
                                        />
                                    ) : (
                                        <span className="flex items-center justify-center h-full w-full text-sm font-semibold text-foreground">
                                            {lead.name.charAt(0)}
                                        </span>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold text-foreground leading-tight truncate">
                                        {lead.name}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground leading-tight">
                                        {lead.title}
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center gap-0.5 ml-auto">
                            <span className="text-[10px] text-muted-foreground mr-1">+</span>
                            <div className="flex -space-x-1.5">
                                {members.slice(0, 4).map((member) => (
                                    <div
                                        key={member!.id}
                                        className="relative h-6 w-6 rounded-full overflow-hidden bg-muted border border-background flex-shrink-0"
                                        title={`${member!.name} (${member!.title})`}
                                    >
                                        {member!.avatarImage ? (
                                            <Image
                                                src={member!.avatarImage}
                                                alt={member!.name}
                                                fill
                                                unoptimized
                                                className="object-cover"
                                                sizes="24px"
                                            />
                                        ) : (
                                            <span className="flex items-center justify-center h-full w-full text-[9px] font-semibold text-foreground">
                                                {member!.name.charAt(0)}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {members.length > 4 && (
                                <span className="text-[10px] text-muted-foreground ml-1">
                                    +{members.length - 4}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Discussion topic */}
                <CardContent className="pt-0 pb-5 flex-1 flex flex-col">
                    {primaryTopic ? (
                        <div className="rounded-lg bg-muted/50 border border-muted p-3 mb-4 flex-1">
                            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
                                Wants to discuss
                            </p>
                            <p className="text-sm font-medium text-foreground leading-snug">
                                {primaryTopic.title}
                            </p>
                            {primaryTopic.body && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                                    {primaryTopic.body}
                                </p>
                            )}
                        </div>
                    ) : (
                        <div className="rounded-lg bg-muted/30 border border-dashed border-muted p-3 mb-4 flex-1">
                            <p className="text-xs text-muted-foreground">
                                No pending topics — start an open discussion
                            </p>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        <Button
                            onClick={handleJoin}
                            className="flex-1 bg-international-orange hover:bg-international-orange-hover text-white h-10 sm:h-8"
                            size="sm"
                        >
                            <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                            Join Huddle
                            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                        </Button>

                        {alternateTopics.length > 0 && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="secondary" size="sm" className="px-2 h-10 sm:h-8">
                                        <ChevronDown className="h-3.5 w-3.5" />
                                        <span className="sr-only">Other topics</span>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="max-w-[280px]">
                                    {alternateTopics.map((t) => {
                                        const originalIdx = topics.indexOf(t)
                                        return (
                                            <DropdownMenuItem
                                                key={t.id}
                                                onClick={() => handleSelectTopic(originalIdx)}
                                                className="text-xs py-2"
                                            >
                                                <span className="line-clamp-2">{t.title}</span>
                                            </DropdownMenuItem>
                                        )
                                    })}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    )
}
