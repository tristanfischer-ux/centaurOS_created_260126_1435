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
import Link from "next/link"
import { Info, X as XIcon } from "lucide-react"

import { PromptNode, HumanTaskNode } from "./components/prompt-node"
import { PromptLibrarySidebar } from "./components/prompt-library-sidebar"
import { NodeInspector } from "./components/node-inspector"
import { WorkflowToolbar } from "./components/workflow-toolbar"
import { WorkflowTemplatesDialog } from "./components/workflow-templates-dialog"
import { CreatePromptDialog } from "./components/create-prompt-dialog"
import { AgentsHelpDialog } from "./components/agents-help-dialog"
import { getPromptById } from "./lib/prompt-library"
import { dbCustomPromptToLocal, getCustomPromptById } from "./lib/custom-prompts"
import {
    saveAgentWorkflow,
    deleteAgentWorkflow,
    migrateLocalWorkflows,
    migrateLocalCustomPrompts,
} from "@/actions/agent-workflows"
import type { AgentWorkflowRow, AgentCustomPromptRow } from "@/actions/agent-workflows"
import type { PromptCategory, Workflow, WorkflowTemplate, CustomPrompt, AttachedFile, ExecutionStatus } from "./lib/agent-types"

// ─── localStorage keys (used only for one-time migration) ─────────
const LS_WORKFLOWS_KEY = "forgeos-agent-workflows"
const LS_CUSTOM_PROMPTS_KEY = "forgeos-custom-prompts"
const LS_ACTIVE_KEY = "forgeos-active-workflow"
const LS_MIGRATED_KEY = "forgeos-agent-migrated-to-db"

// ─── Custom node types ────────────────────────────────────────────
const nodeTypes = { prompt: PromptNode, "human-task": HumanTaskNode }

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

// ─── Auto-layout (topological rank-based, no external deps) ──────
const NODE_WIDTH = 220
const NODE_HEIGHT = 80
const NODE_GAP_X = 60
const NODE_GAP_Y = 80

/**
 * Arrange nodes in a layered graph layout using topological sorting.
 *
 * @description Replaces dagre with a lightweight implementation that
 * Turbopack can bundle without "dynamic require" errors. Assigns each
 * node a rank (layer) based on its longest path from a root, then
 * spaces nodes evenly within each rank.
 */
function getLayoutedElements(
    nodes: Node[],
    edges: Edge[],
    direction: "TB" | "LR" = "TB"
): { nodes: Node[]; edges: Edge[] } {
    if (nodes.length === 0) return { nodes, edges }

    // Build adjacency lists
    const children = new Map<string, string[]>()
    const parents = new Map<string, string[]>()
    const nodeIds = new Set(nodes.map((n) => n.id))

    for (const n of nodes) {
        children.set(n.id, [])
        parents.set(n.id, [])
    }
    for (const e of edges) {
        if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
            children.get(e.source)!.push(e.target)
            parents.get(e.target)!.push(e.source)
        }
    }

    // Assign ranks via longest-path from roots (nodes with no parents)
    const rank = new Map<string, number>()
    const roots = nodes.filter((n) => parents.get(n.id)!.length === 0)

    // BFS with longest-path semantics
    const queue: string[] = roots.map((n) => n.id)
    for (const id of queue) {
        if (!rank.has(id)) rank.set(id, 0)
    }

    // If there are no roots (cycle or all connected), start from first node
    if (queue.length === 0) {
        queue.push(nodes[0].id)
        rank.set(nodes[0].id, 0)
    }

    for (let i = 0; i < queue.length; i++) {
        const id = queue[i]
        const currentRank = rank.get(id) ?? 0
        for (const childId of children.get(id) ?? []) {
            const existingRank = rank.get(childId)
            if (existingRank === undefined || currentRank + 1 > existingRank) {
                rank.set(childId, currentRank + 1)
            }
            if (!queue.includes(childId)) {
                queue.push(childId)
            }
        }
    }

    // Catch any disconnected nodes
    for (const n of nodes) {
        if (!rank.has(n.id)) rank.set(n.id, 0)
    }

    // Group nodes by rank
    const rankGroups = new Map<number, string[]>()
    for (const n of nodes) {
        const r = rank.get(n.id) ?? 0
        if (!rankGroups.has(r)) rankGroups.set(r, [])
        rankGroups.get(r)!.push(n.id)
    }

    // Position nodes: center each rank horizontally
    const maxNodesInRank = Math.max(...Array.from(rankGroups.values()).map((g) => g.length))
    const totalWidth = maxNodesInRank * (NODE_WIDTH + NODE_GAP_X) - NODE_GAP_X
    const posMap = new Map<string, { x: number; y: number }>()

    for (const [r, ids] of rankGroups) {
        const rowWidth = ids.length * (NODE_WIDTH + NODE_GAP_X) - NODE_GAP_X
        const offsetX = (totalWidth - rowWidth) / 2

        for (let i = 0; i < ids.length; i++) {
            const x = offsetX + i * (NODE_WIDTH + NODE_GAP_X)
            const y = r * (NODE_HEIGHT + NODE_GAP_Y)

            if (direction === "LR") {
                posMap.set(ids[i], { x: y, y: x })
            } else {
                posMap.set(ids[i], { x, y })
            }
        }
    }

    const layoutedNodes = nodes.map((node) => ({
        ...node,
        position: posMap.get(node.id) ?? node.position,
    }))

    return { nodes: layoutedNodes, edges }
}

// ─── Inner flow (needs ReactFlowProvider) ─────────────────────────
function AgentsFlowInner({
    hasApiKey,
    initialWorkflows,
    initialCustomPrompts,
}: {
    hasApiKey: boolean
    initialWorkflows: AgentWorkflowRow[]
    initialCustomPrompts: AgentCustomPromptRow[]
}) {
    const reactFlowWrapper = useRef<HTMLDivElement>(null)
    const { screenToFlowPosition, fitView } = useReactFlow()

    // ── State ──────────────────────────────────────────────────────
    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
    const [sidebarOpen, setSidebarOpen] = useState(true)
    const [inspectorOpen, setInspectorOpen] = useState(false)
    const [templatesOpen, setTemplatesOpen] = useState(false)
    const [createPromptOpen, setCreatePromptOpen] = useState(false)
    const [helpOpen, setHelpOpen] = useState(false)
    const [apiBannerDismissed, setApiBannerDismissed] = useState(false)

    // Workflow metadata — initialised from server-fetched data
    const [dbWorkflowId, setDbWorkflowId] = useState<string | null>(
        initialWorkflows.length > 0 ? initialWorkflows[0].id : null
    )
    const [workflowName, setWorkflowName] = useState(
        initialWorkflows.length > 0 ? initialWorkflows[0].name : "Untitled Workflow"
    )
    const [savedWorkflows, setSavedWorkflows] = useState<AgentWorkflowRow[]>(initialWorkflows)

    // Custom prompts from database
    const [dbCustomPrompts, setDbCustomPrompts] = useState<AgentCustomPromptRow[]>(initialCustomPrompts)
    const customPrompts: CustomPrompt[] = useMemo(
        () => dbCustomPrompts.map(dbCustomPromptToLocal),
        [dbCustomPrompts]
    )

    // Chain execution state
    const [isChainRunning, setIsChainRunning] = useState(false)
    const [chainProgress, setChainProgress] = useState<{ current: number; total: number } | undefined>()
    const abortControllerRef = useRef<AbortController | null>(null)
    const pendingContinueRef = useRef<string | null>(null)
    const [isSaving, setIsSaving] = useState(false)

    // Load initial workflow nodes/edges from first saved workflow
    useEffect(() => {
        if (initialWorkflows.length > 0) {
            const first = initialWorkflows[0]
            setNodes(first.nodes as unknown as Node[])
            setEdges(first.edges as unknown as Edge[])
        }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // ── One-time migration from localStorage ────────────────────────
    useEffect(() => {
        if (typeof window === "undefined") return
        if (localStorage.getItem(LS_MIGRATED_KEY)) return

        const migrateAsync = async () => {
            try {
                // Migrate workflows
                const rawWf = localStorage.getItem(LS_WORKFLOWS_KEY)
                if (rawWf) {
                    const localWorkflows = JSON.parse(rawWf) as Workflow[]
                    if (localWorkflows.length > 0) {
                        const { data } = await migrateLocalWorkflows(
                            localWorkflows.map((wf) => ({
                                name: wf.name,
                                description: wf.description,
                                nodes: wf.nodes,
                                edges: wf.edges,
                            }))
                        )
                        if (data && data.length > 0) {
                            setSavedWorkflows((prev) => [...data, ...prev])
                            // Load the first migrated workflow if canvas is empty
                            if (nodes.length === 0) {
                                setDbWorkflowId(data[0].id)
                                setWorkflowName(data[0].name)
                                setNodes(data[0].nodes as Node[])
                                setEdges(data[0].edges as Edge[])
                            }
                        }
                    }
                }

                // Migrate custom prompts
                const rawCp = localStorage.getItem(LS_CUSTOM_PROMPTS_KEY)
                if (rawCp) {
                    const localPrompts = JSON.parse(rawCp) as CustomPrompt[]
                    if (localPrompts.length > 0) {
                        const { data } = await migrateLocalCustomPrompts(
                            localPrompts.map((p) => ({
                                title: p.title,
                                description: p.description,
                                category: p.category,
                                icon: p.icon,
                                default_prompt: p.defaultPrompt,
                                input_label: p.inputLabel,
                                output_label: p.outputLabel,
                                tags: p.tags,
                                suggested_next: p.suggestedNext,
                            }))
                        )
                        if (data) {
                            setDbCustomPrompts((prev) => [...data, ...prev])
                        }
                    }
                }

                // Mark migration as done and clean up localStorage
                localStorage.setItem(LS_MIGRATED_KEY, "true")
                localStorage.removeItem(LS_WORKFLOWS_KEY)
                localStorage.removeItem(LS_CUSTOM_PROMPTS_KEY)
                localStorage.removeItem(LS_ACTIVE_KEY)
            } catch (err) {
                console.error("[AgentsFlow] localStorage migration failed:", {
                    error: err instanceof Error ? err.message : "Unknown error",
                })
                // Don't mark as migrated so it retries next time
            }
        }

        migrateAsync()
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
        return getPromptById(promptId) ?? getCustomPromptById(promptId, customPrompts) ?? null
    }, [customPrompts])

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

    const handleUpdateNodeProvider = useCallback(
        (nodeId: string, providerId: string, modelId: string, modality: string) =>
            updateNodeData(nodeId, { providerId, modelId, outputModality: modality }),
        [updateNodeData]
    )

    const handleUpdateChecklist = useCallback(
        (nodeId: string, completed: boolean[]) =>
            updateNodeData(nodeId, { checklistCompleted: completed }),
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

    // ── Delete multiple nodes (keyboard Delete/Backspace) ─────────
    const onNodesDelete = useCallback(
        (deletedNodes: Node[]) => {
            const ids = new Set(deletedNodes.map((n) => n.id))
            setEdges((eds) =>
                eds.filter((e) => !ids.has(e.source) && !ids.has(e.target))
            )
            if (selectedNodeId && ids.has(selectedNodeId)) {
                setSelectedNodeId(null)
                setInspectorOpen(false)
            }
        },
        [setEdges, selectedNodeId]
    )

    // ── Clear entire canvas ──────────────────────────────────────
    const handleClearCanvas = useCallback(() => {
        setNodes([])
        setEdges([])
        setSelectedNodeId(null)
        setInspectorOpen(false)
        toast.success("Canvas cleared")
    }, [setNodes, setEdges])

    // ── Auto-arrange nodes using dagre ────────────────────────────
    const handleAutoArrange = useCallback(() => {
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, "TB")
        setNodes(layoutedNodes)
        setEdges(layoutedEdges)
        // Allow React to render the new positions, then fit view
        requestAnimationFrame(() => {
            fitView({ padding: 0.2, duration: 300 })
        })
        toast.success("Layout tidied up")
    }, [nodes, edges, setNodes, setEdges, fitView])

    // ── Save workflow (to Supabase) ──────────────────────────────────
    const handleSave = useCallback(async () => {
        if (isSaving) return
        setIsSaving(true)

        try {
            const serializedNodes = nodes.map((n) => ({
                id: n.id,
                type: (n.type ?? "prompt") as "prompt" | "trigger" | "output",
                position: n.position,
                data: n.data as Workflow["nodes"][number]["data"],
            }))
            const serializedEdges = edges.map((e) => ({
                id: e.id,
                source: e.source,
                target: e.target,
                animated: e.animated,
            }))

            const { data, error } = await saveAgentWorkflow({
                id: dbWorkflowId,
                name: workflowName,
                description: "",
                nodes: serializedNodes,
                edges: serializedEdges,
            })

            if (error) {
                toast.error("Failed to save workflow", { description: error })
                return
            }

            if (data) {
                // Update local state with the saved row
                setDbWorkflowId(data.id)
                setSavedWorkflows((prev) => {
                    const filtered = prev.filter((w) => w.id !== data.id)
                    return [data, ...filtered]
                })
            }
        } catch (err) {
            console.error("[AgentsFlow] Save failed:", {
                error: err instanceof Error ? err.message : "Unknown error",
            })
            toast.error("Failed to save workflow")
        } finally {
            setIsSaving(false)
        }
    }, [dbWorkflowId, workflowName, nodes, edges, isSaving])

    // ── Load template ──────────────────────────────────────────────
    const handleLoadTemplate = useCallback(
        (template: WorkflowTemplate) => {
            // New unsaved workflow — will get a DB id on first Save
            setDbWorkflowId(null)
            setWorkflowName(template.name)

            const styledEdges = template.edges.map((e) => ({
                ...e,
                style: { stroke: "#3b82f6", strokeWidth: 2 },
            })) as Edge[]

            // Auto-layout template nodes so they always look clean
            const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
                template.nodes as Node[],
                styledEdges,
                "TB"
            )
            setNodes(layoutedNodes)
            setEdges(layoutedEdges)
            setTemplatesOpen(false)

            requestAnimationFrame(() => {
                fitView({ padding: 0.2, duration: 300 })
            })
        },
        [setNodes, setEdges, fitView]
    )

    // ── New workflow ───────────────────────────────────────────────
    const handleNew = useCallback(() => {
        setDbWorkflowId(null)
        setWorkflowName("Untitled Workflow")
        setNodes([])
        setEdges([])
        setSelectedNodeId(null)
        setInspectorOpen(false)
    }, [setNodes, setEdges])

    // ── Load a saved workflow from database ─────────────────────────
    const handleLoadWorkflow = useCallback(
        (workflow: AgentWorkflowRow) => {
            setDbWorkflowId(workflow.id)
            setWorkflowName(workflow.name)

            const styledEdges = (workflow.edges as Edge[]).map((e) => ({
                ...e,
                style: { stroke: "#3b82f6", strokeWidth: 2 },
            })) as Edge[]

            setNodes(workflow.nodes as Node[])
            setEdges(styledEdges)
            setSelectedNodeId(null)
            setInspectorOpen(false)

            requestAnimationFrame(() => {
                fitView({ padding: 0.2, duration: 300 })
            })
        },
        [setNodes, setEdges, fitView]
    )

    // ── Delete a saved workflow ──────────────────────────────────────
    const handleDeleteWorkflow = useCallback(
        async (workflowId: string) => {
            const { error } = await deleteAgentWorkflow(workflowId)
            if (error) {
                toast.error("Failed to delete workflow", { description: error })
                return
            }
            setSavedWorkflows((prev) => prev.filter((w) => w.id !== workflowId))
            // If we deleted the currently active workflow, reset to blank canvas
            if (dbWorkflowId === workflowId) {
                setDbWorkflowId(null)
                setWorkflowName("Untitled Workflow")
                setNodes([])
                setEdges([])
                setSelectedNodeId(null)
                setInspectorOpen(false)
            }
            toast.success("Workflow deleted")
        },
        [dbWorkflowId, setNodes, setEdges]
    )

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
    const handleCustomPromptsChange = useCallback((updatedPrompts: AgentCustomPromptRow[]) => {
        setDbCustomPrompts(updatedPrompts)
    }, [])

    const handlePromptCreated = useCallback(
        (prompt: CustomPrompt, dbRow?: AgentCustomPromptRow) => {
            if (dbRow) {
                setDbCustomPrompts((prev) => [dbRow, ...prev])
            }
            toast.success(`Created "${prompt.title}"`)
        },
        []
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
                providerId?: string
                modelId?: string
                outputModality?: string
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

            const providerId = data.providerId ?? "openai"
            const modelId = data.modelId ?? "gpt-4o"
            const modality = data.outputModality ?? "text"

            // Set running state — clear any previous media outputs
            updateNodeData(nodeId, {
                executionStatus: "running",
                output: "",
                error: undefined,
                imageUrl: undefined,
                audioUrl: undefined,
                videoUrl: undefined,
            })

            try {
                const response = await fetch("/api/agents/execute", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ prompt, input, providerId, modelId, modality }),
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

                // Non-text modalities return JSON directly
                if (modality !== "text") {
                    const result = await response.json()
                    if (result.error) {
                        updateNodeData(nodeId, { executionStatus: "error", error: result.error })
                        return false
                    }
                    updateNodeData(nodeId, {
                        executionStatus: "review",
                        imageUrl: result.imageUrl,
                        audioUrl: result.audioUrl,
                        videoUrl: result.videoUrl,
                        output: result.imageUrl ? "[Image generated]" : result.audioUrl ? "[Audio generated]" : result.videoUrl ? "[Video generated]" : "",
                    })
                    return true
                }

                // Text modality: Read SSE stream
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
            const nextNode = nodes.find((n) => n.id === nextNodeId)

            // Select and open inspector for the next node
            setSelectedNodeId(nextNodeId)
            setInspectorOpen(true)

            // Human-task nodes pause for the person — no API call needed
            if (nextNode?.type === "human-task") {
                updateNodeData(nextNodeId, { executionStatus: "review" })
                setIsChainRunning(true)
                return
            }

            abortControllerRef.current = new AbortController()
            await executeNode(nextNodeId, abortControllerRef.current.signal)
        },
        [nodes, edges, updateNodeData, executeNode]
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
        const targetNode = nodes.find((n) => n.id === nodeId)
        setChainProgress({ current: startIdx + 1, total: orderedIds.length })

        // Select the node and open inspector
        setSelectedNodeId(nodeId)
        setInspectorOpen(true)

        // Human-task nodes pause for the person — no API call
        if (targetNode?.type === "human-task") {
            updateNodeData(nodeId, { executionStatus: "review" })
            setIsChainRunning(true)
            return
        }

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
    }, [nodes, edges, executeNode, updateNodeData])

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
            // Don't trigger shortcuts when typing in inputs/textareas
            const target = e.target as HTMLElement
            const isTyping = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable

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
            // ? : Open help (only when not typing)
            if (e.key === "?" && !isTyping) {
                e.preventDefault()
                setHelpOpen(true)
            }
        }
        window.addEventListener("keydown", handler)
        return () => window.removeEventListener("keydown", handler)
    }, [selectedNodeId, handleRunNode, handleRunChain, handleSave])

    return (
        <div className="flex flex-col h-full">
            {/* Toolbar */}
            <WorkflowToolbar
                workflowName={workflowName}
                onNameChange={setWorkflowName}
                onSave={handleSave}
                isSaving={isSaving}
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
                onAutoArrange={handleAutoArrange}
                onClearCanvas={handleClearCanvas}
                onOpenHelp={() => setHelpOpen(true)}
                savedWorkflows={savedWorkflows}
                activeWorkflowId={dbWorkflowId}
                onLoadWorkflow={handleLoadWorkflow}
                onDeleteWorkflow={handleDeleteWorkflow}
            />

            {/* API key banner — shown when user has no keys configured */}
            {!hasApiKey && !apiBannerDismissed && (
                <div className="flex items-center gap-3 px-4 py-2.5 bg-status-info-light border-b border-status-info/20 flex-shrink-0">
                    <Info className="w-4 h-4 text-status-info flex-shrink-0" />
                    <p className="text-xs text-foreground flex-1">
                        <strong>Connect a provider</strong> to run workflows.{" "}
                        <Link href="/settings#ai-providers" className="text-status-info hover:underline font-medium">
                            Go to Settings
                        </Link>
                    </p>
                    <button
                        onClick={() => setApiBannerDismissed(true)}
                        className="p-1 rounded hover:bg-white/50 text-muted-foreground"
                        aria-label="Dismiss"
                    >
                        <XIcon className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                {sidebarOpen && (
                    <PromptLibrarySidebar
                        onClose={() => setSidebarOpen(false)}
                        onCreatePrompt={() => setCreatePromptOpen(true)}
                        customPrompts={customPrompts}
                        dbCustomPrompts={dbCustomPrompts}
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
                        onNodesDelete={onNodesDelete}
                        onDragOver={onDragOver}
                        onDrop={onDrop}
                        nodeTypes={nodeTypes}
                        deleteKeyCode={["Backspace", "Delete"]}
                        selectionOnDrag
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

                    {/* Empty state with guided steps */}
                    {nodes.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="text-center max-w-lg pointer-events-auto">
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
                                    Build a workflow for your team
                                </h3>
                                <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
                                    Chain steps together so your people can focus on the decisions that matter.
                                </p>

                                {/* 3-step visual guide */}
                                <div className="flex items-start gap-2 mb-6 text-left mx-auto max-w-md">
                                    <div className="flex flex-col items-center gap-1 flex-1">
                                        <div className="w-8 h-8 rounded-full bg-international-orange text-white flex items-center justify-center text-xs font-bold">1</div>
                                        <div className="h-px w-full bg-slate-200 mt-1 mb-1" />
                                        <p className="text-[11px] font-medium text-foreground text-center">Drag prompts</p>
                                        <p className="text-[10px] text-muted-foreground text-center">From the sidebar onto the canvas</p>
                                    </div>
                                    <div className="text-muted-foreground mt-2 flex-shrink-0">&#8594;</div>
                                    <div className="flex flex-col items-center gap-1 flex-1">
                                        <div className="w-8 h-8 rounded-full bg-international-orange text-white flex items-center justify-center text-xs font-bold">2</div>
                                        <div className="h-px w-full bg-slate-200 mt-1 mb-1" />
                                        <p className="text-[11px] font-medium text-foreground text-center">Connect & add data</p>
                                        <p className="text-[10px] text-muted-foreground text-center">Link nodes and paste your content</p>
                                    </div>
                                    <div className="text-muted-foreground mt-2 flex-shrink-0">&#8594;</div>
                                    <div className="flex flex-col items-center gap-1 flex-1">
                                        <div className="w-8 h-8 rounded-full bg-international-orange text-white flex items-center justify-center text-xs font-bold">3</div>
                                        <div className="h-px w-full bg-slate-200 mt-1 mb-1" />
                                        <p className="text-[11px] font-medium text-foreground text-center">Run & review</p>
                                        <p className="text-[10px] text-muted-foreground text-center">Results generated, you review each step</p>
                                    </div>
                                </div>

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

                                <p className="text-[10px] text-muted-foreground mt-4">
                                    Press <kbd className="px-1 py-0.5 rounded bg-muted border text-[9px] font-mono">?</kbd> for keyboard shortcuts and tips
                                </p>
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
                        onUpdateProvider={handleUpdateNodeProvider}
                        onUpdateChecklist={handleUpdateChecklist}
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

            {/* Help dialog */}
            <AgentsHelpDialog
                open={helpOpen}
                onOpenChange={setHelpOpen}
            />
        </div>
    )
}

// ─── Exported wrapper with provider ───────────────────────────────
export function AgentsWorkflowView({
    hasApiKey,
    initialWorkflows,
    initialCustomPrompts,
}: {
    hasApiKey: boolean
    initialWorkflows: AgentWorkflowRow[]
    initialCustomPrompts: AgentCustomPromptRow[]
}) {
    return (
        <ReactFlowProvider>
            <AgentsFlowInner
                hasApiKey={hasApiKey}
                initialWorkflows={initialWorkflows}
                initialCustomPrompts={initialCustomPrompts}
            />
        </ReactFlowProvider>
    )
}
