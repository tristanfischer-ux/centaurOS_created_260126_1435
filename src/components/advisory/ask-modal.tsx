"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
    MessageSquare, 
    Loader2, 
    Bot, 
    Globe, 
    Building2,
    Sparkles,
    AlertCircle
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const CATEGORIES = [
    { value: "Finance", label: "Finance", icon: "💰" },
    { value: "Legal", label: "Legal", icon: "⚖️" },
    { value: "Sales", label: "Sales", icon: "📈" },
    { value: "Operations", label: "Operations", icon: "⚙️" },
    { value: "HR", label: "HR", icon: "👥" },
    { value: "Technology", label: "Technology", icon: "💻" },
    { value: "Strategy", label: "Strategy", icon: "🎯" },
    { value: "General", label: "General", icon: "💡" },
]

interface AskModalProps {
    onSubmit?: (data: {
        title: string
        body: string
        category: string
        visibility: "public" | "foundry"
        getAiAnswer: boolean
    }) => Promise<{ error?: string; questionId?: string }>
    trigger?: React.ReactNode
}

export function AskModal({ onSubmit, trigger }: AskModalProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    
    // Form state
    const [title, setTitle] = useState("")
    const [body, setBody] = useState("")
    const [category, setCategory] = useState("")
    const [visibility, setVisibility] = useState<"public" | "foundry">("foundry")
    const [getAiAnswer, setGetAiAnswer] = useState(true)

    // Validation
    const [errors, setErrors] = useState<Record<string, string>>({})

    const validate = () => {
        const newErrors: Record<string, string> = {}
        
        if (!title.trim()) {
            newErrors.title = "Please enter a question title"
        } else if (title.length < 10) {
            newErrors.title = "Title should be at least 10 characters"
        }
        
        if (!body.trim()) {
            newErrors.body = "Please provide more details about your question"
        } else if (body.length < 20) {
            newErrors.body = "Please provide more context (at least 20 characters)"
        }
        
        if (!category) {
            newErrors.category = "Please select a category"
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    const handleSubmit = async () => {
        if (!validate()) return
        if (!onSubmit) {
            toast.error("Submit handler not configured")
            return
        }

        setIsSubmitting(true)
        try {
            const result = await onSubmit({
                title: title.trim(),
                body: body.trim(),
                category,
                visibility,
                getAiAnswer,
            })

            if (result?.error) {
                toast.error(result.error)
            } else {
                toast.success(
                    getAiAnswer 
                        ? "Question submitted! AI is generating an answer..." 
                        : "Question submitted successfully"
                )
                // Reset form
                setTitle("")
                setBody("")
                setCategory("")
                setVisibility("foundry")
                setGetAiAnswer(true)
                setErrors({})
                setIsOpen(false)
            }
        } catch {
            toast.error("Failed to submit question")
        } finally {
            setIsSubmitting(false)
        }
    }

    const resetForm = () => {
        setTitle("")
        setBody("")
        setCategory("")
        setVisibility("foundry")
        setGetAiAnswer(true)
        setErrors({})
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => {
            setIsOpen(open)
            if (!open) resetForm()
        }}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button className="gap-2">
                        <MessageSquare className="h-4 w-4" />
                        Ask a Question
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent size="md" className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-violet-600" />
                        Ask the Advisory Forum
                    </DialogTitle>
                    <DialogDescription>
                        Get instant AI-powered insights, verified by human experts through our democratic workflow.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-4">
                    {/* Title */}
                    <div className="space-y-2">
                        <Label htmlFor="title" className="text-sm font-medium">
                            Question Title <span className="text-red-500">*</span>
                        </Label>
                        <Input
                            id="title"
                            value={title}
                            onChange={(e) => {
                                setTitle(e.target.value)
                                if (errors.title) setErrors(prev => ({ ...prev, title: "" }))
                            }}
                            placeholder="What would you like to know?"
                            className={cn(errors.title && "border-red-500")}
                        />
                        {errors.title && (
                            <p className="text-xs text-red-500 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                {errors.title}
                            </p>
                        )}
                    </div>

                    {/* Body */}
                    <div className="space-y-2">
                        <Label htmlFor="body" className="text-sm font-medium">
                            Details <span className="text-red-500">*</span>
                        </Label>
                        <Textarea
                            id="body"
                            value={body}
                            onChange={(e) => {
                                setBody(e.target.value)
                                if (errors.body) setErrors(prev => ({ ...prev, body: "" }))
                            }}
                            placeholder="Provide context and specifics to get better answers..."
                            className={cn("min-h-[120px] resize-none", errors.body && "border-red-500")}
                        />
                        {errors.body && (
                            <p className="text-xs text-red-500 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                {errors.body}
                            </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                            {body.length}/500 characters
                        </p>
                    </div>

                    {/* Category */}
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">
                            Category <span className="text-red-500">*</span>
                        </Label>
                        <Select 
                            value={category} 
                            onValueChange={(val) => {
                                setCategory(val)
                                if (errors.category) setErrors(prev => ({ ...prev, category: "" }))
                            }}
                        >
                            <SelectTrigger className={cn(errors.category && "border-red-500")}>
                                <SelectValue placeholder="Select a category" />
                            </SelectTrigger>
                            <SelectContent>
                                {CATEGORIES.map((cat) => (
                                    <SelectItem key={cat.value} value={cat.value}>
                                        <span className="flex items-center gap-2">
                                            <span>{cat.icon}</span>
                                            <span>{cat.label}</span>
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {errors.category && (
                            <p className="text-xs text-red-500 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                {errors.category}
                            </p>
                        )}
                    </div>

                    {/* Visibility Toggle */}
                    <div className="space-y-3">
                        <Label className="text-sm font-medium">Visibility</Label>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setVisibility("foundry")}
                                className={cn(
                                    "flex-1 p-3 rounded-lg border-2 transition-all text-left",
                                    visibility === "foundry"
                                        ? "border-violet-500 bg-violet-50"
                                        : "border-slate-200 hover:border-slate-300"
                                )}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <Building2 className={cn(
                                        "h-4 w-4",
                                        visibility === "foundry" ? "text-violet-600" : "text-slate-400"
                                    )} />
                                    <span className="font-medium text-sm">Private to Foundry</span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Only visible to your team members
                                </p>
                            </button>
                            <button
                                type="button"
                                onClick={() => setVisibility("public")}
                                className={cn(
                                    "flex-1 p-3 rounded-lg border-2 transition-all text-left",
                                    visibility === "public"
                                        ? "border-blue-500 bg-blue-50"
                                        : "border-slate-200 hover:border-slate-300"
                                )}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <Globe className={cn(
                                        "h-4 w-4",
                                        visibility === "public" ? "text-blue-600" : "text-slate-400"
                                    )} />
                                    <span className="font-medium text-sm">Share with Network</span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Visible to the entire Centaur network
                                </p>
                            </button>
                        </div>
                    </div>

                    {/* AI Answer Toggle */}
                    <div className="flex items-center justify-between p-4 bg-gradient-to-r from-violet-50 to-blue-50 rounded-lg border border-violet-100">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center">
                                <Bot className="h-5 w-5 text-white" />
                            </div>
                            <div>
                                <Label htmlFor="ai-answer" className="text-sm font-medium cursor-pointer">
                                    Get AI Answer
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                    Receive an instant AI-generated response
                                </p>
                            </div>
                        </div>
                        <Switch
                            id="ai-answer"
                            checked={getAiAnswer}
                            onCheckedChange={setGetAiAnswer}
                        />
                    </div>

                    {/* Democratic Workflow Info */}
                    <AnimatePresence>
                        {getAiAnswer && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="p-3 bg-blue-50 rounded-lg text-sm text-blue-800 overflow-hidden"
                            >
                                <p className="font-medium mb-1 flex items-center gap-1.5">
                                    <Sparkles className="h-3.5 w-3.5" />
                                    Democratic Workflow
                                </p>
                                <p className="text-xs text-blue-600">
                                    AI answers first, then human experts verify. This ensures you get fast insights 
                                    that are vetted for accuracy by experienced professionals.
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <DialogFooter>
                    <Button 
                        variant="ghost" 
                        onClick={() => setIsOpen(false)} 
                        disabled={isSubmitting}
                    >
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleSubmit} 
                        disabled={isSubmitting}
                        className="gap-2"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Submitting...
                            </>
                        ) : (
                            <>
                                <MessageSquare className="h-4 w-4" />
                                Submit Question
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
