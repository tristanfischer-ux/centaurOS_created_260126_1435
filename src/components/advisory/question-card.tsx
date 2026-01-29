"use client"

import { formatDistanceToNow } from "date-fns"
import { motion } from "framer-motion"
import { MessageSquare, Eye, ThumbsUp, Bot, CheckCircle2, Shield, Clock } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import Link from "next/link"

export type VerificationStatus = "unverified" | "endorsed" | "verified"

export interface Question {
    id: string
    title: string
    body: string
    category: string
    visibility: "public" | "foundry"
    created_at: string
    asker: {
        id: string
        full_name: string
        avatar_url?: string
    }
    ai_answer?: string
    verification_status: VerificationStatus
    upvotes: number
    answers_count: number
    views: number
}

interface QuestionCardProps {
    question: Question
    className?: string
}

const categoryColors: Record<string, string> = {
    Finance: "bg-emerald-100 text-emerald-800",
    Legal: "bg-purple-100 text-purple-800",
    Sales: "bg-blue-100 text-blue-800",
    Operations: "bg-amber-100 text-amber-800",
    HR: "bg-pink-100 text-pink-800",
    Technology: "bg-cyan-100 text-cyan-800",
    Strategy: "bg-indigo-100 text-indigo-800",
    General: "bg-slate-100 text-slate-800",
}

const verificationConfig: Record<VerificationStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
    unverified: {
        label: "Awaiting Review",
        color: "bg-slate-100 text-slate-600",
        icon: Clock,
    },
    endorsed: {
        label: "Endorsed",
        color: "bg-amber-100 text-amber-700",
        icon: Shield,
    },
    verified: {
        label: "Verified",
        color: "bg-emerald-100 text-emerald-700",
        icon: CheckCircle2,
    },
}

export function QuestionCard({ question, className }: QuestionCardProps) {
    const verificationInfo = verificationConfig[question.verification_status]
    const VerificationIcon = verificationInfo.icon

    return (
        <Link href={`/advisory/${question.id}`}>
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
            >
                <Card className={cn(
                    "p-4 cursor-pointer hover:shadow-lg transition-all duration-200 border-l-4",
                    question.verification_status === "verified" && "border-l-emerald-500",
                    question.verification_status === "endorsed" && "border-l-amber-500",
                    question.verification_status === "unverified" && "border-l-slate-300",
                    className
                )}>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                <Badge className={cn("text-[10px] uppercase tracking-wider", categoryColors[question.category] || categoryColors.General)}>
                                    {question.category}
                                </Badge>
                                <Badge className={cn("text-[10px] uppercase tracking-wider gap-1", verificationInfo.color)}>
                                    <VerificationIcon className="h-3 w-3" />
                                    {verificationInfo.label}
                                </Badge>
                                {question.visibility === "foundry" && (
                                    <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                                        Private
                                    </Badge>
                                )}
                            </div>
                            <h3 className="font-semibold text-foreground line-clamp-2 leading-snug">
                                {question.title}
                            </h3>
                        </div>
                    </div>

                    {/* AI Answer Preview */}
                    {question.ai_answer && (
                        <div className="mb-3 p-3 bg-gradient-to-r from-violet-50 to-blue-50 rounded-lg border border-violet-100">
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <Bot className="h-3.5 w-3.5 text-violet-600" />
                                <span className="text-[10px] font-semibold text-violet-600 uppercase tracking-wider">
                                    AI Analysis
                                </span>
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                                {question.ai_answer}
                            </p>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                                <AvatarFallback className="text-[10px] font-medium bg-slate-100 text-slate-600">
                                    {question.asker.full_name?.substring(0, 2).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col">
                                <span className="text-xs font-medium text-foreground truncate max-w-[120px]">
                                    {question.asker.full_name}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                    {formatDistanceToNow(new Date(question.created_at), { addSuffix: true })}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                                <ThumbsUp className="h-3.5 w-3.5" />
                                {question.upvotes}
                            </span>
                            <span className="flex items-center gap-1">
                                <MessageSquare className="h-3.5 w-3.5" />
                                {question.answers_count}
                            </span>
                            <span className="flex items-center gap-1">
                                <Eye className="h-3.5 w-3.5" />
                                {question.views}
                            </span>
                        </div>
                    </div>
                </Card>
            </motion.div>
        </Link>
    )
}
