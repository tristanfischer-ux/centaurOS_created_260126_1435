"use client"

import React, { useState, useCallback, useRef, useMemo, useEffect } from "react"
import {
    ReactFlow,
    Controls,
    MiniMap,
    Background,
    BackgroundVariant,
    useNodesState,
    useEdgesState,
    addEdge,
    type Connection,
    type Node,
    type Edge,
    ReactFlowProvider,
    useReactFlow,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { toast } from "sonner"

import { PromptNode } from "./components/prompt-node"
import { PromptLibrarySidebar } from "./components/prompt-library-sidebar"
import { NodeInspector } from "./components/node-inspector"
import { WorkflowToolbar } from "./components/workflow-toolbar"
import { WorkflowTemplatesDialog } from "./components/workflow-templates-dialog"
import { CreatePromptDialog } from "./components/create-prompt-dialog"
import { getPromptById } from "./lib/prompt-library"
import { loadCustomPrompts, getCustomPromptById } from "./lib/custom-prompts"
import type { PromptCategory, Workflow, WorkflowTemplate, CustomPrompt, AttachedFile, ExecutionStatus } from "./lib/agent-types"

// ─── localStorage persistence ─────────────────────────────────────
const STORAGE_KEY = "forgeos-agent-workflows"
const ACTIVE_KEY = "forgeos-active-workflow"

function loadWorkflows(): Workflow[] {
    if (typeof window === "undefined") return []
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        return raw ? JSON.parse(raw) : []
    } catch {
        return []
    }
}

function saveWorkflows(workflows: Workflow[]) {
    if (typeof window === "undefined") return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workflows))
}

function loadActiveId(): string | null {
    if (typeof window === "undefined") return null
    return localStorage.getItem(ACTIVE_KEY)
}

function saveActiveId(id: string) {
    if (typeof window === "undefined") return
    localStorage.setItem(ACTIVE_KEY, id)
}

// ─── Custom node types ────────────────────────────────────────────
const nodeTypes = { prompt: PromptNode }

// ─── Generate unique ID ───────────────────────────────────────────
let idCounter = 0
function uid() {
    return `node_${Date.now()}_${idCounter++}`
}

// ─── Topological sort for chain execution ─────────────────────────
function getOrderedNodeIds(nodes: Node[], edges: Edge[]): string[] {
    const nodeMap = new Map(nodes.map((n) => [n.id, n]))
    const edgeMap = new Map(edges.map((e) => [e.source, e.target]))

    // Find start node (not a target of any edge)
    const targets = new Set(edges.map((e) => e.target))
    let currentId = nodes.find((n) => !targets.has(n.id))?.id
    const ordered: string[] = []

    const visited = new Set<string>()
    while (currentId && !visited.has(currentId)) {
        visited.add(currentId)
        if (nodeMap.has(currentId)) ordered.push(currentId)
        currentId = edgeMap.get(currentId)
    }

    // Add any unlinked nodes
    for (const n of nodes) {
        if (!visited.has(n.id)) ordered.push(n.id)
    }

    return ordered
}

// ─── Get upstream node output (for chaining) ──────────────────────
function getUpstreamOutput(nodeId: string, nodes: Node[], edges: Edge[]): string | undefined {
    const sourceEdge = edges.find((e) => e.target === nodeId)
    if (!sourceEdge) return undefined
    const sourceNode = nodes.find((n) => n.id === sourceEdge.source)
    if (!sourceNode) return undefined
    return (sourceNode.data as { output?: string }).output
}

// ─── Inner flow (needs ReactFlowProvider) ─────────────────────────
function AgentsFlowInner() {
    const reactFlowWrapper = useRef<HTMLDivElement>(null)
    const { screenToFlowPosition } = useReactFlow()

    // ── State ──────────────────────────────────────────────────────
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
    const [sidebarOpen, setSidebarOpen] = useState(true)
    const [inspectorOpen, setInspectorOpen] = useState(false)
    const [templatesOpen, setTemplatesOpen] = useState(false)
    const [createPromptOpen, setCreatePromptOpen] = useState(false)

    // Workflow metadata
    const [workflowId, setWorkflowId] = useState<string>("")
    const [workflowName, setWorkflowName] = useState("Untitled Workflow")
    const [workflows, setWorkflows] = useState<Workflow[]>([])

    // Custom prompts
    const [customPrompts, setCustomPrompts] = useState<CustomPrompt[]>([])

    // Chain execution state
    const [isChainRunning, setIsChainRunning] = useState(false)
    const [chainProgress, setChainProgress] = useState<{ current: number; total: number } | undefined>()
    const abortControllerRef = useRef<AbortController | null>(null)
    const pendingContinueRef = useRef<string | null>(null)

    // Load saved workflows and custom prompts on mount
    useEffect(() => {
        const saved = loadWorkflows()
        setWorkflows(saved)
        setCustomPrompts(loadCustomPrompts())

        const activeId = loadActiveId()
        if (activeId) {
            const active = saved.find((w) => w.id === activeId)
            if (active) {
                setWorkflowId(active.id)
                setWorkflowName(active.name)
                setNodes(active.nodes as Node[])
                setEdges(active.edges as Edge[])
                return
            }
        }
        const newId = `wf_${Date.now()}`
        setWorkflowId(newId)
    }, [setNodes, setEdges])

    // ── Selected node ──────────────────────────────────────────────
    const selectedNode = useMemo(
        () => nodes.find((n) => n.id === selectedNodeId) ?? null,
        [nodes, selectedNodeId]
    )

    // ── Connection handling ────────────────────────────────────────
    const onConnect = useCallback(
        (connection: Connection) => {
            setEdges((eds) =>
                addEdge(
                    { ...connection, animated: true, style: { stroke: "#3b82f6", strokeWidth: 2 } },
                    eds
                )
            )
        },
        [setEdges]
    )

    // ── Node click ────────────────────────────────────────────────
    const onNodeClick = useCallback(
        (_: React.MouseEvent, node: Node) => {
            setSelectedNodeId(node.id)
            setInspectorOpen(true)
        },
        []
    )

    const onPaneClick = useCallback(() => {
        setSelectedNodeId(null)
        setInspectorOpen(false)
    }, [])

    // ── Helper to resolve a prompt (library or custom) ────────────
    const resolvePrompt = useCallback((promptId: string) => {
        return getPromptById(promptId) ?? getCustomPromptById(promptId) ?? null
    }, [])

    // ── Drag-and-drop from sidebar ────────────────────────────────
    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = "move"
    }, [])

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault()

            // Check for file drops first
            if (event.dataTransfer.files.length > 0) {
                // File dropped on canvas — create a data input node
                const file = event.dataTransfer.files[0]
                const reader = new FileReader()
                reader.onload = () => {
                    const position = screenToFlowPosition({
                        x: event.clientX,
                        y: event.clientY,
                    })
                    const newNode: Node = {
                        id: uid(),
                        type: "prompt",
                        position,
                        data: {
                            label: `Data: ${file.name}`,
                            description: `Imported from ${file.name}`,
                            category: "data-analytics",
                            icon: "FileText",
                            customPrompt: "Analyze the following data and provide a comprehensive summary with key insights:\n\n{{input}}",
                            userInput: reader.result as string,
                            attachedFiles: [{
                                name: file.name,
                                content: reader.result as string,
                                type: file.type || "text/plain",
                                size: file.size,
                            }],
                        },
                    }
                    setNodes((nds) => [...nds, newNode])
                    toast.success(`Imported ${file.name}`)
                }
                reader.readAsText(file)
                return
            }

            // Prompt drag from sidebar
            const promptId = event.dataTransfer.getData("application/promptId")
            if (!promptId) return

            const prompt = resolvePrompt(promptId)
            if (!prompt) return

            const position = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            })

            const newNode: Node = {
                id: uid(),
                type: "prompt",
                position,
                data: {
                    promptId: prompt.id,
                    label: prompt.title,
                    description: prompt.description,
                    category: prompt.category,
                    icon: prompt.icon,
                    customPrompt: prompt.defaultPrompt,
                },
            }

            setNodes((nds) => [...nds, newNode])
        },
        [screenToFlowPosition, setNodes, resolvePrompt]
    )

    // ── Update node data helpers ──────────────────────────────────
    const updateNodeData = useCallback(
        (nodeId: string, updates: Record<string, unknown>) => {
            setNodes((nds) =>
                nds.map((n) =>
                    n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n
                )
            )
        },
        [setNodes]
    )

    const handleUpdateNodePrompt = useCallback(
        (nodeId: string, newPrompt: string) => updateNodeData(nodeId, { customPrompt: newPrompt }),
        [updateNodeData]
    )

    const handleUpdateNodeInput = useCallback(
        (nodeId: string, input: string) => updateNodeData(nodeId, { userInput: input }),
        [updateNodeData]
    )

    const handleUpdateNodeOutput = useCallback(
        (nodeId: string, output: string) => updateNodeData(nodeId, { output }),
        [updateNodeData]
    )

    const handleUpdateNodeFiles = useCallback(
        (nodeId: string, files: AttachedFile[]) => updateNodeData(nodeId, { attachedFiles: files }),
        [updateNodeData]
    )

    // ── Delete node ────────────────────────────────────────────────
    const handleDeleteNode = useCallback(
        (nodeId: string) => {
            setNodes((nds) => nds.filter((n) => n.id !== nodeId))
            setEdges((eds) =>
                eds.filter((e) => e.source !== nodeId && e.target !== nodeId)
            )
            if (selectedNodeId === nodeId) {
                setSelectedNodeId(null)
                setInspectorOpen(false)
            }
        },
        [setNodes, setEdges, selectedNodeId]
    )

    // ── Save workflow ──────────────────────────────────────────────
    const handleSave = useCallback(() => {
        const workflow: Workflow = {
            id: workflowId,
            name: workflowName,
            description: "",
            nodes: nodes.map((n) => ({
                id: n.id,
                type: (n.type ?? "prompt") as "prompt" | "trigger" | "output",
                position: n.position,
                data: n.data as Workflow["nodes"][number]["data"],
            })),
            edges: edges.map((e) => ({
                id: e.id,
                source: e.source,
                target: e.target,
                animated: e.animated,
            })),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        }

        const updated = workflows.filter((w) => w.id !== workflowId)
        updated.push(workflow)
        setWorkflows(updated)
        saveWorkflows(updated)
        saveActiveId(workflowId)
    }, [workflowId, workflowName, nodes, edges, workflows])

    // ── Load template ──────────────────────────────────────────────
    const handleLoadTemplate = useCallback(
        (template: WorkflowTemplate) => {
            const newId = `wf_${Date.now()}`
            setWorkflowId(newId)
            setWorkflowName(template.name)
            setNodes(template.nodes as Node[])
            setEdges(
                template.edges.map((e) => ({
                    ...e,
                    style: { stroke: "#3b82f6", strokeWidth: 2 },
                })) as Edge[]
            )
            setTemplatesOpen(false)
            saveActiveId(newId)
        },
        [setNodes, setEdges]
    )

    // ── New workflow ───────────────────────────────────────────────
    const handleNew = useCallback(() => {
        const newId = `wf_${Date.now()}`
        setWorkflowId(newId)
        setWorkflowName("Untitled Workflow")
        setNodes([])
        setEdges([])
        setSelectedNodeId(null)
        setInspectorOpen(false)
        saveActiveId(newId)
    }, [setNodes, setEdges])

    // ── Copy all prompts as chained text ───────────────────────────
    const handleCopyAll = useCallback(() => {
        const orderedIds = getOrderedNodeIds(nodes, edges)
        const nodeMap = new Map(nodes.map((n) => [n.id, n]))

        const text = orderedIds
            .map((id, i) => {
                const n = nodeMap.get(id)
                if (!n) return ""
                const data = n.data as { label?: string; customPrompt?: string; promptId?: string; userInput?: string; output?: string }
                const prompt =
                    data.customPrompt ||
                    resolvePrompt(data.promptId ?? "")?.defaultPrompt ||
                    ""
                let section = `--- Step ${i + 1}: ${data.label || "Untitled"} ---\n\n${prompt}`
                if (data.userInput) section += `\n\n[Input Data]\n${data.userInput}`
                if (data.output) section += `\n\n[Output]\n${data.output}`
                return section
            })
            .filter(Boolean)
            .join("\n\n")

        navigator.clipboard.writeText(text)
    }, [nodes, edges, resolvePrompt])

    // ── Custom prompts refresh ────────────────────────────────────
    const handleCustomPromptsChange = useCallback(() => {
        setCustomPrompts(loadCustomPrompts())
    }, [])

    const handlePromptCreated = useCallback(
        (prompt: CustomPrompt) => {
            handleCustomPromptsChange()
            toast.success(`Created "${prompt.title}"`)
        },
        [handleCustomPromptsChange]
    )

    // ═══════════════════════════════════════════════════════════════
    // ── AI Execution ──────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════

    const executeNode = useCallback(
        async (nodeId: string, signal?: AbortSignal): Promise<boolean> => {
            // Get current node data
            const node = nodes.find((n) => n.id === nodeId)
            if (!node) return false

            const data = node.data as {
                customPrompt?: string
                promptId?: string
                userInput?: string
            }

            const prompt =
                data.customPrompt ||
                resolvePrompt(data.promptId ?? "")?.defaultPrompt ||
                ""

            if (!prompt.trim()) {
                updateNodeData(nodeId, { executionStatus: "error", error: "No prompt text" })
                return false
            }

            // Determine input: user input > upstream output > empty
            const upstreamOutput = getUpstreamOutput(nodeId, nodes, edges)
            const input = data.userInput?.trim() || upstreamOutput || ""

            // Guard: root nodes (no upstream connection) MUST have user input
            const isRootNode = !edges.some((e) => e.target === nodeId)
            if (isRootNode && !input.trim()) {
                // Don't execute — select the node so user sees the input field
                setSelectedNodeId(nodeId)
                setInspectorOpen(true)
                toast.error("Add your input data before running this step", {
                    description: "Paste your data into the Input Data field, then click Run Prompt.",
                })
                return false
            }

            // Set running state
            updateNodeData(nodeId, { executionStatus: "running", output: "", error: undefined })

            try {
                const response = await fetch("/api/agents/execute", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ prompt, input }),
                    signal,
                })

                if (!response.ok) {
                    const err = await response.json().catch(() => ({ error: "Request failed" }))
                    updateNodeData(nodeId, {
                        executionStatus: "error",
                        error: err.error || `HTTP ${response.status}`,
                    })
                    return false
                }

                // Read SSE stream
                const reader = response.body?.getReader()
                if (!reader) {
                    updateNodeData(nodeId, { executionStatus: "error", error: "No response stream" })
                    return false
                }

                const decoder = new TextDecoder()
                let fullOutput = ""

                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break

                    const chunk = decoder.decode(value, { stream: true })
                    const lines = chunk.split("\n")

                    for (const line of lines) {
                        if (line.startsWith("data: ")) {
                            const payload = line.slice(6).trim()
                            if (payload === "[DONE]") break

                            try {
                                const parsed = JSON.parse(payload)
                                if (parsed.error) {
                                    updateNodeData(nodeId, {
                                        executionStatus: "error",
                                        error: parsed.error,
                                        output: fullOutput,
                                    })
                                    return false
                                }
                                if (parsed.text) {
                                    fullOutput += parsed.text
                                    // Update output progressively
                                    updateNodeData(nodeId, { output: fullOutput })
                                }
                            } catch {
                                // Skip unparseable lines
                            }
                        }
                    }
                }

                // Done — set to review state (HITL pattern)
                updateNodeData(nodeId, {
                    executionStatus: "review",
                    output: fullOutput,
                })
                return true
            } catch (err) {
                if ((err as Error).name === "AbortError") {
                    updateNodeData(nodeId, {
                        executionStatus: "idle",
                        error: undefined,
                    })
                    return false
                }
                updateNodeData(nodeId, {
                    executionStatus: "error",
                    error: (err as Error).message || "Execution failed",
                })
                return false
            }
        },
        [nodes, edges, resolvePrompt, updateNodeData]
    )

    // ── Run single node ───────────────────────────────────────────
    const handleRunNode = useCallback(
        async (nodeId: string) => {
            abortControllerRef.current = new AbortController()
            const success = await executeNode(nodeId, abortControllerRef.current.signal)
            if (success) {
                // Select the node and open inspector to show output
                setSelectedNodeId(nodeId)
                setInspectorOpen(true)
            }
        },
        [executeNode]
    )

    // ── Approve node (HITL) ───────────────────────────────────────
    const handleApproveNode = useCallback(
        (nodeId: string) => {
            updateNodeData(nodeId, { executionStatus: "approved" })
            toast.success("Output approved")
        },
        [updateNodeData]
    )

    // ── Approve and continue chain ────────────────────────────────
    const handleApproveAndContinue = useCallback(
        async (nodeId: string) => {
            // Approve the current node
            updateNodeData(nodeId, { executionStatus: "approved" })

            // Find next node in chain
            const nextEdge = edges.find((e) => e.source === nodeId)
            if (!nextEdge) {
                toast.success("Chain complete — all steps approved")
                setIsChainRunning(false)
                setChainProgress(undefined)
                return
            }

            const nextNodeId = nextEdge.target
            // Select and run next node
            setSelectedNodeId(nextNodeId)
            setInspectorOpen(true)

            abortControllerRef.current = new AbortController()
            await executeNode(nextNodeId, abortControllerRef.current.signal)
        },
        [edges, updateNodeData, executeNode]
    )

    // ── Run chain (HITL step-through) ─────────────────────────────
    const handleRunChain = useCallback(async () => {
        const orderedIds = getOrderedNodeIds(nodes, edges)
        if (orderedIds.length === 0) return

        // Find first node that isn't already approved
        const startIdx = orderedIds.findIndex((id) => {
            const node = nodes.find((n) => n.id === id)
            const status = (node?.data as { executionStatus?: string })?.executionStatus
            return status !== "approved"
        })

        if (startIdx === -1) {
            toast.info("All steps already approved")
            return
        }

        const nodeId = orderedIds[startIdx]
        setChainProgress({ current: startIdx + 1, total: orderedIds.length })

        // Select the node and open inspector
        setSelectedNodeId(nodeId)
        setInspectorOpen(true)

        // Try to execute — executeNode will block if root node has no input
        abortControllerRef.current = new AbortController()
        const started = await executeNode(nodeId, abortControllerRef.current.signal)

        // Only mark chain as running if execution actually started
        if (started) {
            setIsChainRunning(true)
        } else {
            setChainProgress(undefined)
        }

        // Chain continues via handleApproveAndContinue (HITL pattern)
    }, [nodes, edges, executeNode])

    // ── Stop chain ────────────────────────────────────────────────
    const handleStopChain = useCallback(() => {
        abortControllerRef.current?.abort()
        setIsChainRunning(false)
        setChainProgress(undefined)
        toast.info("Chain execution stopped")
    }, [])

    // ── Keyboard shortcuts ────────────────────────────────────────
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            // Cmd+Enter: Run selected node
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !e.shiftKey) {
                if (selectedNodeId) {
                    e.preventDefault()
                    handleRunNode(selectedNodeId)
                }
            }
            // Cmd+Shift+Enter: Run chain
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "Enter") {
                e.preventDefault()
                handleRunChain()
            }
            // Cmd+S: Save
            if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                e.preventDefault()
                handleSave()
                toast.success("Workflow saved")
            }
        }
        window.addEventListener("keydown", handler)
        return () => window.removeEventListener("keydown", handler)
    }, [selectedNodeId, handleRunNode, handleRunChain, handleSave])

    return (
        <div className="flex flex-col h-[calc(100vh-2rem)] -m-4 sm:-m-6 lg:-m-8">
            {/* Toolbar */}
            <WorkflowToolbar
                workflowName={workflowName}
                onNameChange={setWorkflowName}
                onSave={handleSave}
                onNew={handleNew}
                onOpenTemplates={() => setTemplatesOpen(true)}
                onCopyAll={handleCopyAll}
                onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
                sidebarOpen={sidebarOpen}
                nodeCount={nodes.length}
                onRunChain={handleRunChain}
                onStopChain={handleStopChain}
                isChainRunning={isChainRunning}
                chainProgress={chainProgress}
            />

            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                {sidebarOpen && (
                    <PromptLibrarySidebar
                        onClose={() => setSidebarOpen(false)}
                        onCreatePrompt={() => setCreatePromptOpen(true)}
                        customPrompts={customPrompts}
                        onCustomPromptsChange={handleCustomPromptsChange}
                    />
                )}

                {/* Canvas */}
                <div className="flex-1 relative" ref={reactFlowWrapper}>
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onNodeClick={onNodeClick}
                        onPaneClick={onPaneClick}
                        onDragOver={onDragOver}
                        onDrop={onDrop}
                        nodeTypes={nodeTypes}
                        fitView
                        proOptions={{ hideAttribution: true }}
                        defaultEdgeOptions={{
                            animated: true,
                            style: { stroke: "#3b82f6", strokeWidth: 2 },
                        }}
                        className="bg-slate-50/50"
                    >
                        <Controls
                            className="!bg-white !border-slate-200 !shadow-sm"
                            showInteractive={false}
                        />
                        <MiniMap
                            className="!bg-white !border-slate-200 !shadow-sm"
                            maskColor="rgba(248, 250, 252, 0.7)"
                            nodeColor={(n) => {
                                const status = (n.data as { executionStatus?: string })?.executionStatus
                                if (status === "running") return "#3b82f6"
                                if (status === "review") return "#f59e0b"
                                if (status === "approved") return "#10b981"
                                if (status === "error") return "#ef4444"

                                const cat = (n.data as { category?: string })?.category
                                const colors: Record<string, string> = {
                                    "startup-strategy": "#ea580c",
                                    fundraising: "#059669",
                                    marketing: "#db2777",
                                    sales: "#2563eb",
                                    strategy: "#7c3aed",
                                    product: "#0891b2",
                                    finance: "#d97706",
                                    hr: "#0d9488",
                                    "customer-success": "#65a30d",
                                    legal: "#475569",
                                    creative: "#c026d3",
                                    "data-analytics": "#4f46e5",
                                }
                                return colors[cat ?? ""] ?? "#94a3b8"
                            }}
                        />
                        <Background
                            variant={BackgroundVariant.Dots}
                            gap={20}
                            size={1}
                            color="#e2e8f0"
                        />
                    </ReactFlow>

                    {/* Empty state */}
                    {nodes.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="text-center max-w-md pointer-events-auto">
                                <div className="w-16 h-16 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center mx-auto mb-4">
                                    <svg
                                        className="w-8 h-8 text-orange-400"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        strokeWidth={1.5}
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
                                        />
                                    </svg>
                                </div>
                                <h3 className="font-display text-lg font-semibold text-foreground mb-2">
                                    Build your AI workflow
                                </h3>
                                <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                                    Drag prompts from the sidebar, connect them into chains, add your data, then hit <strong>Run Chain</strong> to execute with AI. Review each step before continuing.
                                </p>
                                <div className="flex items-center justify-center gap-3">
                                    <button
                                        onClick={() => setTemplatesOpen(true)}
                                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-international-orange hover:bg-orange-600 rounded-lg transition-colors shadow-sm"
                                    >
                                        Start from a template
                                    </button>
                                    <button
                                        onClick={() => setCreatePromptOpen(true)}
                                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
                                    >
                                        Create a prompt
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Inspector */}
                {inspectorOpen && selectedNode && (
                    <NodeInspector
                        node={selectedNode}
                        onClose={() => {
                            setInspectorOpen(false)
                            setSelectedNodeId(null)
                        }}
                        onUpdatePrompt={handleUpdateNodePrompt}
                        onUpdateInput={handleUpdateNodeInput}
                        onUpdateOutput={handleUpdateNodeOutput}
                        onUpdateFiles={handleUpdateNodeFiles}
                        onDelete={handleDeleteNode}
                        onRunNode={handleRunNode}
                        onApproveNode={handleApproveNode}
                        onApproveAndContinue={handleApproveAndContinue}
                    />
                )}
            </div>

            {/* Templates dialog */}
            <WorkflowTemplatesDialog
                open={templatesOpen}
                onOpenChange={setTemplatesOpen}
                onSelectTemplate={handleLoadTemplate}
            />

            {/* Create prompt dialog */}
            <CreatePromptDialog
                open={createPromptOpen}
                onOpenChange={setCreatePromptOpen}
                onPromptCreated={handlePromptCreated}
            />
        </div>
    )
}

// ─── Exported wrapper with provider ───────────────────────────────
export function AgentsWorkflowView() {
    return (
        <ReactFlowProvider>
            <AgentsFlowInner />
        </ReactFlowProvider>
    )
}
