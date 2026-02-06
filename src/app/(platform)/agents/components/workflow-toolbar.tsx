"use client"

import React, { useState, useCallback } from "react"
import {
    Save,
    Plus,
    LayoutTemplate,
    Copy,
    Check,
    PanelLeftClose,
    PanelLeft,
    Play,
    Square,
    Loader2,
    AlignVerticalSpaceAround,
    Trash2,
    HelpCircle,
    ChevronDown,
    FolderOpen,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { AgentWorkflowRow } from "@/actions/agent-workflows"

interface WorkflowToolbarProps {
    workflowName: string
    onNameChange: (name: string) => void
    onSave: () => void
    isSaving?: boolean
    onNew: () => void
    onOpenTemplates: () => void
    onCopyAll: () => void
    onToggleSidebar: () => void
    sidebarOpen: boolean
    nodeCount: number
    onRunChain: () => void
    onStopChain: () => void
    isChainRunning: boolean
    chainProgress?: { current: number; total: number }
    onAutoArrange?: () => void
    onClearCanvas?: () => void
    onOpenHelp?: () => void
    /** Saved workflows from the database */
    savedWorkflows?: AgentWorkflowRow[]
    /** Currently active workflow's database ID (null if unsaved) */
    activeWorkflowId?: string | null
    /** Load a saved workflow */
    onLoadWorkflow?: (workflow: AgentWorkflowRow) => void
    /** Delete a saved workflow */
    onDeleteWorkflow?: (workflowId: string) => void
}

/**
 * Format a relative time string from a date.
 */
function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return "just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function WorkflowToolbar({
    workflowName,
    onNameChange,
    onSave,
    isSaving,
    onNew,
    onOpenTemplates,
    onCopyAll,
    onToggleSidebar,
    sidebarOpen,
    nodeCount,
    onRunChain,
    onStopChain,
    isChainRunning,
    chainProgress,
    onAutoArrange,
    onClearCanvas,
    onOpenHelp,
    savedWorkflows = [],
    activeWorkflowId,
    onLoadWorkflow,
    onDeleteWorkflow,
}: WorkflowToolbarProps) {
    const [copied, setCopied] = useState(false)
    const [saved, setSaved] = useState(false)
    const [workflowPickerOpen, setWorkflowPickerOpen] = useState(false)

    const handleCopy = useCallback(() => {
        onCopyAll()
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }, [onCopyAll])

    const handleSave = useCallback(async () => {
        await onSave()
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
    }, [onSave])

    return (
        <div className="h-14 bg-white border-b border-slate-100 flex items-center justify-between px-4 gap-4 flex-shrink-0">
            {/* Left: sidebar toggle + title */}
            <div className="flex items-center gap-3 min-w-0">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={onToggleSidebar}
                            className="p-2 rounded-lg hover:bg-slate-100 text-muted-foreground transition-colors"
                        >
                            {sidebarOpen ? (
                                <PanelLeftClose className="w-4 h-4" />
                            ) : (
                                <PanelLeft className="w-4 h-4" />
                            )}
                        </button>
                    </TooltipTrigger>
                    <TooltipContent>
                        {sidebarOpen ? "Hide library" : "Show library"}
                    </TooltipContent>
                </Tooltip>

                {/* Orange accent */}
                <div className="h-6 w-1 bg-international-orange rounded-full shadow-[0_0_8px_rgba(255,69,0,0.4)]" />

                <div className="flex items-center gap-2 min-w-0">
                    <Input
                        value={workflowName}
                        onChange={(e) => onNameChange(e.target.value)}
                        className="h-8 text-sm font-semibold border-transparent hover:border-slate-200 focus:border-slate-300 bg-transparent px-2 max-w-[240px]"
                    />
                    {nodeCount > 0 && (
                        <span className="text-[10px] text-muted-foreground bg-slate-100 px-2 py-0.5 rounded-full flex-shrink-0">
                            {nodeCount} {nodeCount === 1 ? "step" : "steps"}
                        </span>
                    )}
                </div>
            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-2">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onNew}
                            className="gap-1.5 text-xs"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            New
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>New blank workflow</TooltipContent>
                </Tooltip>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onOpenTemplates}
                            className="gap-1.5 text-xs"
                        >
                            <LayoutTemplate className="w-3.5 h-3.5" />
                            Templates
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Load a pre-built workflow</TooltipContent>
                </Tooltip>

                {/* My Workflows dropdown */}
                {savedWorkflows.length > 0 && (
                    <Popover open={workflowPickerOpen} onOpenChange={setWorkflowPickerOpen}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="gap-1.5 text-xs"
                                    >
                                        <FolderOpen className="w-3.5 h-3.5" />
                                        My Workflows
                                        <ChevronDown className="w-3 h-3 opacity-60" />
                                    </Button>
                                </PopoverTrigger>
                            </TooltipTrigger>
                            <TooltipContent>Open a saved workflow</TooltipContent>
                        </Tooltip>
                        <PopoverContent align="end" className="w-72 p-0">
                            <div className="px-3 py-2.5 border-b border-slate-100">
                                <p className="text-xs font-semibold text-foreground">
                                    Saved Workflows
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                    {savedWorkflows.length} workflow{savedWorkflows.length !== 1 ? "s" : ""}
                                </p>
                            </div>
                            <ScrollArea className="max-h-[280px]">
                                <div className="p-1">
                                    {savedWorkflows.map((wf) => {
                                        const isActive = wf.id === activeWorkflowId
                                        const nodeCount = Array.isArray(wf.nodes) ? wf.nodes.length : 0
                                        return (
                                            <div
                                                key={wf.id}
                                                className={`group flex items-center gap-2 px-2.5 py-2 rounded-md transition-colors cursor-pointer ${
                                                    isActive
                                                        ? "bg-orange-50 border border-orange-200"
                                                        : "hover:bg-slate-50"
                                                }`}
                                                onClick={() => {
                                                    if (!isActive && onLoadWorkflow) {
                                                        onLoadWorkflow(wf)
                                                    }
                                                    setWorkflowPickerOpen(false)
                                                }}
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-xs font-medium truncate ${
                                                        isActive ? "text-international-orange" : "text-foreground"
                                                    }`}>
                                                        {wf.name}
                                                    </p>
                                                    <p className="text-[10px] text-muted-foreground">
                                                        {nodeCount} step{nodeCount !== 1 ? "s" : ""} · {formatRelativeTime(wf.updated_at)}
                                                    </p>
                                                </div>
                                                {isActive && (
                                                    <span className="text-[9px] font-medium text-international-orange bg-orange-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                                        Active
                                                    </span>
                                                )}
                                                {!isActive && onDeleteWorkflow && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            onDeleteWorkflow(wf.id)
                                                            // Don't close popover — let user see the list update
                                                        }}
                                                        className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                                                        aria-label={`Delete ${wf.name}`}
                                                    >
                                                        <Trash2 className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </ScrollArea>
                        </PopoverContent>
                    </Popover>
                )}

                {nodeCount > 0 && (
                    <>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={onAutoArrange}
                                    className="gap-1.5 text-xs"
                                    disabled={nodeCount === 0}
                                >
                                    <AlignVerticalSpaceAround className="w-3.5 h-3.5" />
                                    Tidy Up
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Auto-arrange nodes into a clean layout</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={onClearCanvas}
                                    className="gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Clear
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Remove all nodes from canvas</TooltipContent>
                        </Tooltip>
                    </>
                )}

                <div className="h-5 w-px bg-slate-200" />

                {/* Run Chain button */}
                <Tooltip>
                    <TooltipTrigger asChild>
                        {isChainRunning ? (
                            <Button
                                size="sm"
                                onClick={onStopChain}
                                className="gap-1.5 text-xs"
                                variant="outline"
                            >
                                <Square className="w-3 h-3" />
                                Stop
                                {chainProgress && (
                                    <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full ml-1">
                                        {chainProgress.current}/{chainProgress.total}
                                    </span>
                                )}
                            </Button>
                        ) : (
                            <Button
                                size="sm"
                                onClick={onRunChain}
                                disabled={nodeCount === 0}
                                className="gap-1.5 text-xs text-white"
                                style={{ backgroundColor: nodeCount > 0 ? "#3b82f6" : undefined }}
                            >
                                <Play className="w-3.5 h-3.5" />
                                Run Chain
                            </Button>
                        )}
                    </TooltipTrigger>
                    <TooltipContent>
                        {isChainRunning
                            ? "Stop chain execution"
                            : "Run all prompts in order (with human review at each step)"}
                    </TooltipContent>
                </Tooltip>

                <div className="h-5 w-px bg-slate-200" />

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCopy}
                            className="gap-1.5 text-xs"
                            disabled={nodeCount === 0}
                        >
                            {copied ? (
                                <>
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    <span className="text-emerald-600">Copied</span>
                                </>
                            ) : (
                                <>
                                    <Copy className="w-3.5 h-3.5" />
                                    Copy All
                                </>
                            )}
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        Copy all prompts as a chained text
                    </TooltipContent>
                </Tooltip>

                <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="gap-1.5 text-xs"
                    style={
                        saved
                            ? { backgroundColor: "#059669" }
                            : { backgroundColor: "#ff4500" }
                    }
                >
                    {isSaving ? (
                        <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
                        </>
                    ) : saved ? (
                        <>
                            <Check className="w-3.5 h-3.5" /> Saved
                        </>
                    ) : (
                        <>
                            <Save className="w-3.5 h-3.5" /> Save
                        </>
                    )}
                </Button>

                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={onOpenHelp}
                            className="p-2 rounded-lg hover:bg-slate-100 text-muted-foreground transition-colors"
                            aria-label="Help and keyboard shortcuts"
                        >
                            <HelpCircle className="w-4 h-4" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent>Help & keyboard shortcuts</TooltipContent>
                </Tooltip>
            </div>
        </div>
    )
}
