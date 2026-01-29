"use client"

import { useState, useMemo } from "react"
import { formatDistanceToNow } from "date-fns"
import { motion, AnimatePresence } from "framer-motion"
import { 
    Bot, 
    ThumbsUp, 
    ThumbsDown, 
    MessageSquare, 
    Send, 
    Loader2,
    ChevronDown,
    User,
    Sparkles
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { VerifyButton } from "./verify-button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { VerificationStatus } from "./question-card"
import { createClient } from "@/lib/supabase/client"

interface Comment {
    id: string
    content: string
    created_at: string
    user: {
        id: string
        full_name: string
        role?: string
    }
}

export interface Answer {
    id: string
    content: string
    is_ai_generated: boolean
    created_at: string
    verification_status: VerificationStatus
    verification_note?: string
    verified_by?: {
        id: string
        full_name: string
    }
    verified_at?: string
    upvotes: number
    downvotes: number
    user_vote?: "up" | "down" | null
    author: {
        id: string
        full_name: string
        role?: string
    }
    comments: Comment[]
}

interface AnswerThreadProps {
    answer: Answer
    questionId: string
    userRole?: string
    currentUserId?: string
    onVote?: (answerId: string, voteType: "up" | "down") => Promise<{ error?: string }>
    onVerify?: (answerId: string, status: VerificationStatus, note?: string) => Promise<{ error?: string }>
    onComment?: (answerId: string, content: string) => Promise<{ error?: string }>
}

export function AnswerThread({ 
    answer, 
    questionId,
    userRole, 
    currentUserId,
    onVote,
    onVerify,
    onComment 
}: AnswerThreadProps) {
    const [showComments, setShowComments] = useState(false)
    const [newComment, setNewComment] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isVoting, setIsVoting] = useState(false)
    const [localVote, setLocalVote] = useState<"up" | "down" | null>(answer.user_vote || null)
    const [localUpvotes, setLocalUpvotes] = useState(answer.upvotes)
    const [localDownvotes, setLocalDownvotes] = useState(answer.downvotes)
    const [localComments, setLocalComments] = useState<Comment[]>(answer.comments)
    const supabase = useMemo(() => createClient(), [])

    const handleVote = async (voteType: "up" | "down") => {
        if (!onVote || isVoting) return

        setIsVoting(true)
        
        // Optimistic update
        const previousVote = localVote
        const previousUpvotes = localUpvotes
        const previousDownvotes = localDownvotes

        if (localVote === voteType) {
            // Remove vote
            setLocalVote(null)
            if (voteType === "up") setLocalUpvotes(prev => prev - 1)
            else setLocalDownvotes(prev => prev - 1)
        } else {
            // Add or change vote
            if (localVote) {
                // Changing vote
                if (localVote === "up") setLocalUpvotes(prev => prev - 1)
                else setLocalDownvotes(prev => prev - 1)
            }
            setLocalVote(voteType)
            if (voteType === "up") setLocalUpvotes(prev => prev + 1)
            else setLocalDownvotes(prev => prev + 1)
        }

        try {
            const result = await onVote(answer.id, voteType)
            if (result?.error) {
                // Revert on error
                setLocalVote(previousVote)
                setLocalUpvotes(previousUpvotes)
                setLocalDownvotes(previousDownvotes)
                toast.error(result.error)
            }
        } catch {
            // Revert on error
            setLocalVote(previousVote)
            setLocalUpvotes(previousUpvotes)
            setLocalDownvotes(previousDownvotes)
            toast.error("Failed to register vote")
        } finally {
            setIsVoting(false)
        }
    }

    const handleSubmitComment = async () => {
        if (!newComment.trim() || !onComment || isSubmitting) return

        setIsSubmitting(true)
        try {
            const result = await onComment(answer.id, newComment.trim())
            if (result?.error) {
                toast.error(result.error)
            } else {
                // Refresh comments
                const { data: userData } = await supabase.auth.getUser()
                if (userData.user) {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('full_name, role')
                        .eq('id', userData.user.id)
                        .single()
                    
                    setLocalComments(prev => [...prev, {
                        id: crypto.randomUUID(),
                        content: newComment.trim(),
                        created_at: new Date().toISOString(),
                        user: {
                            id: userData.user.id,
                            full_name: profile?.full_name || 'You',
                            role: profile?.role
                        }
                    }])
                }
                setNewComment("")
                toast.success("Comment added")
            }
        } catch {
            toast.error("Failed to add comment")
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                "border rounded-lg overflow-hidden",
                answer.is_ai_generated 
                    ? "bg-gradient-to-br from-violet-50/50 to-blue-50/50 border-violet-200" 
                    : "bg-white border-slate-200"
            )}
        >
            {/* Answer Header */}
            <div className="p-4 border-b border-slate-100">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <Avatar className={cn(
                            "h-10 w-10",
                            answer.is_ai_generated && "ring-2 ring-violet-300 ring-offset-2"
                        )}>
                            <AvatarFallback className={cn(
                                "text-sm font-medium",
                                answer.is_ai_generated 
                                    ? "bg-gradient-to-br from-violet-500 to-blue-500 text-white" 
                                    : "bg-slate-100 text-slate-600"
                            )}>
                                {answer.is_ai_generated ? (
                                    <Bot className="h-5 w-5" />
                                ) : (
                                    answer.author.full_name?.substring(0, 2).toUpperCase()
                                )}
                            </AvatarFallback>
                        </Avatar>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-semibold text-foreground">
                                    {answer.is_ai_generated ? "AI Assistant" : answer.author.full_name}
                                </span>
                                {answer.is_ai_generated && (
                                    <Badge className="bg-violet-100 text-violet-700 text-[10px] uppercase tracking-wider gap-1">
                                        <Sparkles className="h-3 w-3" />
                                        AI Generated
                                    </Badge>
                                )}
                                {answer.author.role && !answer.is_ai_generated && (
                                    <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                                        {answer.author.role}
                                    </Badge>
                                )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(answer.created_at), { addSuffix: true })}
                            </span>
                        </div>
                    </div>

                    <VerifyButton
                        answerId={answer.id}
                        currentStatus={answer.verification_status}
                        userRole={userRole}
                        onVerify={onVerify}
                    />
                </div>
            </div>

            {/* Answer Content */}
            <div className="p-4">
                <div className="prose prose-sm max-w-none text-foreground">
                    <p className="whitespace-pre-wrap leading-relaxed">{answer.content}</p>
                </div>

                {/* Verification Note */}
                {answer.verification_note && answer.verified_by && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="mt-4 p-3 bg-emerald-50 rounded-lg border border-emerald-200"
                    >
                        <div className="flex items-center gap-2 mb-1">
                            <User className="h-3.5 w-3.5 text-emerald-600" />
                            <span className="text-xs font-semibold text-emerald-700">
                                Verified by {answer.verified_by.full_name}
                            </span>
                            {answer.verified_at && (
                                <span className="text-xs text-emerald-600">
                                    {formatDistanceToNow(new Date(answer.verified_at), { addSuffix: true })}
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-emerald-800">{answer.verification_note}</p>
                    </motion.div>
                )}
            </div>

            {/* Actions Bar */}
            <div className="px-4 pb-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleVote("up")}
                            disabled={isVoting}
                            className={cn(
                                "h-8 gap-1.5",
                                localVote === "up" && "text-emerald-600 bg-emerald-50"
                            )}
                        >
                            <ThumbsUp className={cn("h-4 w-4", localVote === "up" && "fill-current")} />
                            <span>{localUpvotes}</span>
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleVote("down")}
                            disabled={isVoting}
                            className={cn(
                                "h-8 gap-1.5",
                                localVote === "down" && "text-red-600 bg-red-50"
                            )}
                        >
                            <ThumbsDown className={cn("h-4 w-4", localVote === "down" && "fill-current")} />
                            <span>{localDownvotes}</span>
                        </Button>
                    </div>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowComments(!showComments)}
                        className="h-8 gap-1.5"
                    >
                        <MessageSquare className="h-4 w-4" />
                        <span>{localComments.length} Comments</span>
                        <ChevronDown className={cn(
                            "h-4 w-4 transition-transform",
                            showComments && "rotate-180"
                        )} />
                    </Button>
                </div>
            </div>

            {/* Comments Section */}
            <AnimatePresence>
                {showComments && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="border-t border-slate-100 overflow-hidden"
                    >
                        <div className="p-4 bg-slate-50/50 space-y-3">
                            {localComments.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-2">
                                    No comments yet. Be the first to comment!
                                </p>
                            ) : (
                                localComments.map((comment) => (
                                    <div key={comment.id} className="flex gap-2">
                                        <Avatar className="h-7 w-7 shrink-0">
                                            <AvatarFallback className="text-[10px] font-medium bg-white text-slate-600">
                                                {comment.user.full_name?.substring(0, 2).toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <span className="text-xs font-medium text-foreground">
                                                    {comment.user.full_name}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground">
                                                    {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                                                </span>
                                            </div>
                                            <p className="text-sm text-muted-foreground">{comment.content}</p>
                                        </div>
                                    </div>
                                ))
                            )}

                            {/* Add Comment */}
                            <div className="flex gap-2 pt-2 border-t border-slate-200">
                                <Textarea
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    placeholder="Add a comment..."
                                    className="min-h-[60px] resize-none text-sm bg-white"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                            handleSubmitComment()
                                        }
                                    }}
                                />
                                <Button
                                    size="sm"
                                    onClick={handleSubmitComment}
                                    disabled={isSubmitting || !newComment.trim()}
                                    className="h-10 w-10 p-0 shrink-0"
                                >
                                    {isSubmitting ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Send className="h-4 w-4" />
                                    )}
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}
