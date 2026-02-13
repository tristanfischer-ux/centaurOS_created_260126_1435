"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, Send, AlertCircle, Copy, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { getPromptsByCategory } from "./lib/prompt-library"
import type { PromptTemplate } from "./lib/agent-types"
import type { Specialist } from "./specialists-data"

interface BriefSpecialistDialogProps {
    /** The specialist being briefed */
    specialist: Specialist
    /** Dialog open state */
    open: boolean
    /** Dialog state change handler */
    onOpenChange: (open: boolean) => void
    /** Whether the user has an API key configured */
    hasApiKey: boolean
}

/**
 * BriefSpecialistDialog -- Centered dialog for briefing a specialist.
 *
 * @description Presents the specialist's capabilities as quick-select chips,
 * a text area for the brief, and streams the response from the existing
 * /api/agents/execute endpoint. No new backend work required.
 */
export function BriefSpecialistDialog({
    specialist,
    open,
    onOpenChange,
    hasApiKey,
}: BriefSpecialistDialogProps) {
    const [selectedPrompt, setSelectedPrompt] = useState<PromptTemplate | null>(null)
    const [briefText, setBriefText] = useState("")
    const [isExecuting, setIsExecuting] = useState(false)
    const [response, setResponse] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const responseRef = useRef<HTMLDivElement>(null)

    // Get all prompts for this specialist's categories
    const capabilities = useMemo(() => {
        const prompts: PromptTemplate[] = []
        for (const cat of specialist.categories) {
            prompts.push(...getPromptsByCategory(cat))
        }
        return prompts
    }, [specialist.categories])

    // Reset state when dialog opens
    useEffect(() => {
        if (open) {
            setSelectedPrompt(null)
            setBriefText("")
            setResponse("")
            setError(null)
            setCopied(false)
            // Focus textarea after a short delay
            setTimeout(() => textareaRef.current?.focus(), 150)
        }
    }, [open])

    // Auto-scroll response as it streams
    useEffect(() => {
        if (responseRef.current && response) {
            responseRef.current.scrollTop = responseRef.current.scrollHeight
        }
    }, [response])

    const handleSelectCapability = (prompt: PromptTemplate) => {
        if (selectedPrompt?.id === prompt.id) {
            setSelectedPrompt(null)
        } else {
            setSelectedPrompt(prompt)
            // Pre-fill placeholder if brief is empty
            if (!briefText.trim()) {
                textareaRef.current?.focus()
            }
        }
    }

    const handleExecute = async () => {
        if (!briefText.trim() && !selectedPrompt) {
            setError("Tell your specialist what you need, or pick a capability above.")
            return
        }

        if (!hasApiKey) {
            setError("Please configure an AI provider key in Settings to use specialists.")
            return
        }

        setIsExecuting(true)
        setResponse("")
        setError(null)

        // Use selected prompt template or a generic brief prompt
        const promptTemplate = selectedPrompt?.defaultPrompt ??
            `You are a ${specialist.name} specialist. The user is briefing you on a task.\n\n{{input}}\n\n{{company_context}}\n\nProvide a thorough, actionable response that demonstrates deep expertise in your domain. Use markdown formatting for clarity.`

        try {
            const res = await fetch("/api/agents/execute", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt: promptTemplate,
                    input: briefText,
                    providerId: "anthropic",
                    modelId: "claude-sonnet-4-20250514",
                    modality: "text",
                }),
            })

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ error: "Execution failed" }))
                throw new Error(errData.error || `HTTP ${res.status}`)
            }

            // Handle streaming response
            const reader = res.body?.getReader()
            if (!reader) {
                throw new Error("No response body")
            }

            const decoder = new TextDecoder()
            let fullResponse = ""

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                const chunk = decoder.decode(value, { stream: true })
                // Parse SSE events
                const lines = chunk.split("\n")
                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const data = line.slice(6)
                        if (data === "[DONE]") continue
                        try {
                            const parsed = JSON.parse(data)
                            if (parsed.text) {
                                fullResponse += parsed.text
                                setResponse(fullResponse)
                            }
                        } catch {
                            // Some SSE events are plain text
                            fullResponse += data
                            setResponse(fullResponse)
                        }
                    }
                }
            }

            if (!fullResponse) {
                setResponse("No response received. Please try again.")
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error"
            console.error("[BriefSpecialistDialog] Execution failed:", { specialist: specialist.id, error: message })
            setError(message)
        } finally {
            setIsExecuting(false)
        }
    }

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(response)
            setCopied(true)
            toast.success("Copied to clipboard")
            setTimeout(() => setCopied(false), 2000)
        } catch {
            toast.error("Failed to copy")
        }
    }

    const isResponseView = response.length > 0 || isExecuting

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col">
                {/* Header */}
                <DialogHeader>
                    <div className="flex items-center gap-3">
                        <div className="flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-muted">
                            <span className="text-lg font-display font-semibold text-foreground">
                                {specialist.name.charAt(0)}
                            </span>
                        </div>
                        <div>
                            <DialogTitle className="font-display">{specialist.name}</DialogTitle>
                            <p className="text-sm text-muted-foreground italic">
                                &ldquo;{specialist.tagline}&rdquo;
                            </p>
                        </div>
                    </div>
                </DialogHeader>

                {/* Content */}
                <div className="flex-1 min-h-0 space-y-4 overflow-y-auto">
                    {!isResponseView ? (
                        <>
                            {/* Capability Chips */}
                            <div className="space-y-2">
                                <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                                    Quick-select a capability
                                </Label>
                                <div className="flex flex-wrap gap-1.5">
                                    {capabilities.map((cap) => (
                                        <Badge
                                            key={cap.id}
                                            variant={selectedPrompt?.id === cap.id ? "default" : "secondary"}
                                            className={cn(
                                                "cursor-pointer text-xs transition-colors",
                                                selectedPrompt?.id === cap.id
                                                    ? "bg-international-orange text-white hover:bg-international-orange-hover"
                                                    : "hover:bg-muted"
                                            )}
                                            onClick={() => handleSelectCapability(cap)}
                                        >
                                            {cap.title}
                                        </Badge>
                                    ))}
                                </div>
                                {selectedPrompt && (
                                    <p className="text-xs text-muted-foreground">
                                        {selectedPrompt.description}
                                    </p>
                                )}
                            </div>

                            {/* Brief Text Area */}
                            <div className="space-y-2">
                                <Label htmlFor="brief-text" className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                                    {selectedPrompt?.inputLabel ?? "Describe what you need"}
                                </Label>
                                <Textarea
                                    ref={textareaRef}
                                    id="brief-text"
                                    value={briefText}
                                    onChange={(e) => {
                                        setBriefText(e.target.value)
                                        if (error) setError(null)
                                    }}
                                    placeholder={
                                        selectedPrompt
                                            ? `Tell your ${specialist.name} the details...`
                                            : `What do you need from your ${specialist.name}?`
                                    }
                                    className="min-h-[120px] resize-none"
                                    aria-required
                                />
                                <p className="text-xs text-muted-foreground text-right">
                                    {briefText.length.toLocaleString()} characters
                                </p>
                            </div>

                            {/* Error */}
                            {error && (
                                <Alert variant="destructive">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}
                        </>
                    ) : (
                        /* Response View */
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                                    {selectedPrompt?.outputLabel ?? `${specialist.name}'s response`}
                                </Label>
                                {response && !isExecuting && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleCopy}
                                        className="text-xs"
                                    >
                                        {copied ? (
                                            <Check className="h-3.5 w-3.5 mr-1" />
                                        ) : (
                                            <Copy className="h-3.5 w-3.5 mr-1" />
                                        )}
                                        {copied ? "Copied" : "Copy"}
                                    </Button>
                                )}
                            </div>
                            <div
                                ref={responseRef}
                                className="rounded-lg border bg-muted/30 p-4 max-h-[50vh] overflow-y-auto"
                            >
                                {isExecuting && !response && (
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Your {specialist.name} is working on this...
                                    </div>
                                )}
                                {response && (
                                    <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap">
                                        {response}
                                    </div>
                                )}
                            </div>

                            {/* Error during execution */}
                            {error && (
                                <Alert variant="destructive">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <DialogFooter>
                    <div className="flex w-full items-center justify-between">
                        <Button
                            variant="secondary"
                            onClick={() => {
                                if (isResponseView && !isExecuting) {
                                    // Go back to input view
                                    setResponse("")
                                    setError(null)
                                } else {
                                    onOpenChange(false)
                                }
                            }}
                            disabled={isExecuting}
                        >
                            {isResponseView && !isExecuting ? "New Brief" : "Cancel"}
                        </Button>
                        {!isResponseView && (
                            <Button
                                onClick={handleExecute}
                                disabled={isExecuting || (!briefText.trim() && !selectedPrompt)}
                                className="bg-international-orange hover:bg-international-orange-hover text-white"
                            >
                                {isExecuting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        Working...
                                    </>
                                ) : (
                                    <>
                                        <Send className="h-4 w-4 mr-2" />
                                        Go
                                    </>
                                )}
                            </Button>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
