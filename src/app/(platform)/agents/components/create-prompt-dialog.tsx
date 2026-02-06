"use client"

import React, { useState, useCallback } from "react"
import { X, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PROMPT_CATEGORIES, CATEGORY_META, type PromptCategory, type CustomPrompt } from "../lib/agent-types"
import { addCustomPrompt, DEFAULT_CUSTOM_PROMPT } from "../lib/custom-prompts"

interface CreatePromptDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onPromptCreated: (prompt: CustomPrompt) => void
}

export function CreatePromptDialog({ open, onOpenChange, onPromptCreated }: CreatePromptDialogProps) {
    const [title, setTitle] = useState("")
    const [description, setDescription] = useState("")
    const [category, setCategory] = useState<PromptCategory>("strategy")
    const [promptText, setPromptText] = useState("")
    const [inputLabel, setInputLabel] = useState("Your input")
    const [outputLabel, setOutputLabel] = useState("Output")
    const [tagInput, setTagInput] = useState("")
    const [tags, setTags] = useState<string[]>([])

    const resetForm = useCallback(() => {
        setTitle("")
        setDescription("")
        setCategory("strategy")
        setPromptText("")
        setInputLabel("Your input")
        setOutputLabel("Output")
        setTagInput("")
        setTags([])
    }, [])

    const handleAddTag = useCallback(() => {
        const tag = tagInput.trim().toLowerCase()
        if (tag && !tags.includes(tag)) {
            setTags([...tags, tag])
            setTagInput("")
        }
    }, [tagInput, tags])

    const handleRemoveTag = useCallback(
        (tag: string) => {
            setTags(tags.filter((t) => t !== tag))
        },
        [tags]
    )

    const handleCreate = useCallback(() => {
        if (!title.trim() || !promptText.trim()) return

        const newPrompt = addCustomPrompt({
            title: title.trim(),
            description: description.trim(),
            category,
            icon: CATEGORY_META[category].icon,
            defaultPrompt: promptText.trim(),
            inputLabel: inputLabel.trim() || "Your input",
            outputLabel: outputLabel.trim() || "Output",
            tags,
            suggestedNext: [],
        })

        onPromptCreated(newPrompt)
        resetForm()
        onOpenChange(false)
    }, [title, description, category, promptText, inputLabel, outputLabel, tags, onPromptCreated, resetForm, onOpenChange])

    const isValid = title.trim().length > 0 && promptText.trim().length > 0

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-base font-semibold">Create Custom Prompt</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 mt-2">
                    {/* Title */}
                    <div>
                        <label className="text-xs font-semibold text-foreground mb-1.5 block">
                            Title <span className="text-destructive">*</span>
                        </label>
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g. Competitive Landscape Analyzer"
                            className="h-9 text-sm"
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="text-xs font-semibold text-foreground mb-1.5 block">
                            Description
                        </label>
                        <Input
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Brief description of what this prompt does"
                            className="h-9 text-sm"
                        />
                    </div>

                    {/* Category */}
                    <div>
                        <label className="text-xs font-semibold text-foreground mb-1.5 block">
                            Category
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                            {PROMPT_CATEGORIES.map((cat) => {
                                const meta = CATEGORY_META[cat]
                                return (
                                    <button
                                        key={cat}
                                        type="button"
                                        onClick={() => setCategory(cat)}
                                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                                            category === cat
                                                ? `${meta.bgColor} ${meta.color} ring-1 ring-current`
                                                : "bg-slate-100 text-muted-foreground hover:bg-slate-200"
                                        }`}
                                    >
                                        {meta.label}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Input / Output labels */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold text-foreground mb-1.5 block">
                                Input label
                            </label>
                            <Input
                                value={inputLabel}
                                onChange={(e) => setInputLabel(e.target.value)}
                                placeholder="What goes in"
                                className="h-9 text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-foreground mb-1.5 block">
                                Output label
                            </label>
                            <Input
                                value={outputLabel}
                                onChange={(e) => setOutputLabel(e.target.value)}
                                placeholder="What comes out"
                                className="h-9 text-sm"
                            />
                        </div>
                    </div>

                    {/* Prompt text */}
                    <div>
                        <label className="text-xs font-semibold text-foreground mb-1.5 block">
                            Prompt <span className="text-destructive">*</span>
                        </label>
                        <Textarea
                            value={promptText}
                            onChange={(e) => setPromptText(e.target.value)}
                            placeholder={"Write your prompt here...\n\nUse {{input}} to reference data from the previous step."}
                            className="min-h-[160px] font-mono text-xs leading-relaxed resize-y"
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">
                            Use <code className="bg-slate-100 px-1 rounded text-[10px]">{"{{input}}"}</code> to reference the previous step&apos;s output.
                        </p>
                    </div>

                    {/* Tags */}
                    <div>
                        <label className="text-xs font-semibold text-foreground mb-1.5 block">
                            Tags
                        </label>
                        <div className="flex gap-2">
                            <Input
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault()
                                        handleAddTag()
                                    }
                                }}
                                placeholder="Add a tag..."
                                className="h-8 text-xs flex-1"
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleAddTag}
                                disabled={!tagInput.trim()}
                                className="h-8 px-2"
                            >
                                <Plus className="w-3.5 h-3.5" />
                            </Button>
                        </div>
                        {tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                                {tags.map((tag) => (
                                    <span
                                        key={tag}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-[10px] text-muted-foreground"
                                    >
                                        {tag}
                                        <button onClick={() => handleRemoveTag(tag)} className="hover:text-foreground">
                                            <X className="w-2.5 h-2.5" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-slate-100">
                    <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleCreate}
                        disabled={!isValid}
                        style={{ backgroundColor: isValid ? "#ff4500" : undefined }}
                    >
                        Create Prompt
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
