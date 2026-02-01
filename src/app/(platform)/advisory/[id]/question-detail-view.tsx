"use client"

import { useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { motion } from "framer-motion"
import { 
    ChevronRight, 
    MessageSquare, 
    Eye, 
    ThumbsUp,
    Share2,
    Bot,
    Send,
    Loader2,
    CheckCircle2,
    Shield,
    Clock,
    Globe,
    Building2
} from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { AnswerThread, Answer } from "@/components/advisory/answer-thread"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { VerificationStatus } from "@/components/advisory/question-card"

interface Member {
    id: string
    full_name: string
    role: string
    email?: string
}

interface QuestionWithAnswers {
    id: string
    title: string
    body: string
    category: string
    visibility: "public" | "foundry"
    created_at: string
    asker: {
        id: string
        full_name: string
        role?: string
    }
    verification_status: VerificationStatus
    upvotes: number
    answers_count: number
    views: number
    answers: Answer[]
}

interface QuestionDetailViewProps {
    question: QuestionWithAnswers
    members: Member[]
    currentUserId: string
    currentUserRole?: string
}

const categoryColors: Record<string, string> = {
    Finance: "bg-status-success-light text-status-success-dark",
    Legal: "bg-purple-100 text-purple-800",
    Sales: "bg-status-info-light text-status-info-dark",
    Operations: "bg-status-warning-light text-status-warning-dark",
    HR: "bg-pink-100 text-pink-800",
    Technology: "bg-sky-100 text-sky-800",
    Strategy: "bg-indigo-100 text-indigo-800",
    General: "bg-muted text-foreground",
}

const verificationConfig: Record<VerificationStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
    unverified: {
        label: "Awaiting Review",
        color: "bg-muted text-muted-foreground",
        icon: Clock,
    },
    endorsed: {
        label: "Endorsed",
        color: "bg-status-warning-light text-status-warning-dark",
        icon: Shield,
    },
    verified: {
        label: "Verified",
        color: "bg-status-success-light text-status-success-dark",
        icon: CheckCircle2,
    },
}

export function QuestionDetailView({ 
    question, 
    members, 
    currentUserId, 
    currentUserRole 
}: QuestionDetailViewProps) {
    const [newAnswer, setNewAnswer] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isUpvoted, setIsUpvoted] = useState(false)
    const [upvoteCount, setUpvoteCount] = useState(question.upvotes)

    const verificationInfo = verificationConfig[question.verification_status]
    const VerificationIcon = verificationInfo.icon

    const handleUpvote = async () => {
        // Optimistic update
        setIsUpvoted(!isUpvoted)
        setUpvoteCount(prev => isUpvoted ? prev - 1 : prev + 1)
        
        // In production, call server action
        // const result = await upvoteQuestion(question.id)
    }

    const handleShare = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href)
            toast.success("Link copied to clipboard")
        } catch {
            toast.error("Failed to copy link")
        }
    }

    const handleSubmitAnswer = async () => {
        if (!newAnswer.trim()) return

        setIsSubmitting(true)
        try {
            // In production, call server action
            // const result = await submitAnswer(question.id, newAnswer)
            toast.success("Answer submitted successfully")
            setNewAnswer("")
        } catch {
            toast.error("Failed to submit answer")
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleVote = async (answerId: string, voteType: "up" | "down") => {
        // In production, call server action
        return {}
    }

    const handleVerify = async (answerId: string, status: VerificationStatus, note?: string) => {
        // In production, call server action
        toast.success(`Answer ${status === 'verified' ? 'verified' : 'endorsed'} successfully`)
        return {}
    }

    const handleComment = async (answerId: string, content: string) => {
        // In production, call server action
        return {}
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Breadcrumb Navigation */}
            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
                <Link 
                    href="/advisory" 
                    className="text-muted-foreground hover:text-foreground transition-colors"
                >
                    Advisory Forum
                </Link>
                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span className="text-foreground font-medium truncate max-w-[300px]">
                    {question.title}
                </span>
            </nav>

            {/* Question Header */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <Card className="p-6">
                    {/* Badges Row */}
                    <div className="flex items-center gap-2 mb-4 flex-wrap">
                        <Badge className={cn("text-xs uppercase tracking-wider", categoryColors[question.category] || categoryColors.General)}>
                            {question.category}
                        </Badge>
                        <Badge className={cn("text-xs uppercase tracking-wider gap-1", verificationInfo.color)}>
                            <VerificationIcon className="h-3 w-3" />
                            {verificationInfo.label}
                        </Badge>
                        {question.visibility === "foundry" ? (
                            <Badge variant="secondary" className="text-xs uppercase tracking-wider gap-1">
                                <Building2 className="h-3 w-3" />
                                Private
                            </Badge>
                        ) : (
                            <Badge variant="secondary" className="text-xs uppercase tracking-wider gap-1">
                                <Globe className="h-3 w-3" />
                                Public
                            </Badge>
                        )}
                    </div>

                    {/* Title */}
                    <h1 className="text-2xl font-bold text-foreground mb-4 leading-tight">
                        {question.title}
                    </h1>

                    {/* Body */}
                    <div className="prose prose-slate max-w-none mb-6">
                        <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">
                            {question.body}
                        </p>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                        <div className="flex items-center gap-3">
                            <UserAvatar
                                name={question.asker.full_name}
                                role={question.asker.role}
                                size="lg"
                            />
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-foreground">
                                        {question.asker.full_name}
                                    </span>
                                    {question.asker.role && (
                                        <Badge variant="secondary" className="text-[10px]">
                                            {question.asker.role}
                                        </Badge>
                                    )}
                                </div>
                                <span className="text-sm text-muted-foreground">
                                    Asked {formatDistanceToNow(new Date(question.created_at), { addSuffix: true })}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleUpvote}
                                className={cn(
                                    "gap-1.5",
                                    isUpvoted && "text-status-success bg-status-success-light"
                                )}
                            >
                                <ThumbsUp className={cn("h-4 w-4", isUpvoted && "fill-current")} />
                                {upvoteCount}
                            </Button>
                            <Button variant="ghost" size="sm" className="gap-1.5">
                                <Eye className="h-4 w-4" />
                                {question.views}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={handleShare} className="gap-1.5">
                                <Share2 className="h-4 w-4" />
                                Share
                            </Button>
                        </div>
                    </div>
                </Card>
            </motion.div>

            {/* Answers Section */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                        <MessageSquare className="h-5 w-5 text-muted-foreground" />
                        {question.answers.length} {question.answers.length === 1 ? 'Answer' : 'Answers'}
                    </h2>
                </div>

                {/* AI Answer First */}
                {question.answers.filter(a => a.is_ai_generated).map((answer, index) => (
                    <motion.div
                        key={answer.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                    >
                        <div className="relative">
                            <div className="absolute -left-3 top-4 flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-violet-500 to-blue-500 text-white text-[10px] font-semibold uppercase tracking-wider rounded-r-full">
                                <Bot className="h-3 w-3" />
                                AI Answer
                            </div>
                            <AnswerThread
                                answer={answer}
                                questionId={question.id}
                                userRole={currentUserRole}
                                currentUserId={currentUserId}
                                onVote={handleVote}
                                onVerify={handleVerify}
                                onComment={handleComment}
                            />
                        </div>
                    </motion.div>
                ))}

                {/* Human Answers */}
                {question.answers.filter(a => !a.is_ai_generated).map((answer, index) => (
                    <motion.div
                        key={answer.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: (index + 1) * 0.1 }}
                    >
                        <AnswerThread
                            answer={answer}
                            questionId={question.id}
                            userRole={currentUserRole}
                            currentUserId={currentUserId}
                            onVote={handleVote}
                            onVerify={handleVerify}
                            onComment={handleComment}
                        />
                    </motion.div>
                ))}
            </div>

            {/* Add Answer Section */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
            >
                <Card className="p-6">
                    <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                        <MessageSquare className="h-5 w-5 text-muted-foreground" />
                        Add Your Answer
                    </h3>
                    <div className="space-y-4">
                        <Textarea
                            value={newAnswer}
                            onChange={(e) => setNewAnswer(e.target.value)}
                            placeholder="Share your knowledge or experience..."
                            className="min-h-[150px] resize-none"
                        />
                        <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">
                                Your answer will be reviewed by experts before verification.
                            </p>
                            <Button
                                onClick={handleSubmitAnswer}
                                disabled={isSubmitting || !newAnswer.trim()}
                                className="gap-2"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Submitting...
                                    </>
                                ) : (
                                    <>
                                        <Send className="h-4 w-4" />
                                        Submit Answer
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </Card>
            </motion.div>

            {/* Democratic Workflow Info */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="p-4 bg-gradient-to-r from-status-info-light to-violet-50 rounded-lg border border-status-info-light"
            >
                <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center shrink-0">
                        <Bot className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h4 className="font-semibold text-foreground mb-1">Democratic Workflow</h4>
                        <p className="text-sm text-muted-foreground">
                            AI provides instant analysis, then human experts verify for accuracy. 
                            Look for the <span className="inline-flex items-center gap-1 text-emerald-600 font-medium"><CheckCircle2 className="h-3.5 w-3.5" /> Verified</span> badge 
                            for answers that have been confirmed by experienced professionals.
                        </p>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
