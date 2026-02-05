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

import { PromptNode } from "./components/prompt-node"
import { PromptLibrarySidebar } from "./components/prompt-library-sidebar"
import { NodeInspector } from "./components/node-inspector"
import { WorkflowToolbar } from "./components/workflow-toolbar"
import { WorkflowTemplatesDialog } from "./components/workflow-templates-dialog"
import { getPromptById } from "./lib/prompt-library"
import type { PromptCategory, Workflow } from "./lib/agent-types"
import type { WorkflowTemplate } from "./lib/agent-types"

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

    // Workflow metadata
    const [workflowId, setWorkflowId] = useState<string>("")
    const [workflowName, setWorkflowName] = useState("Untitled Workflow")
    const [workflows, setWorkflows] = useState<Workflow[]>([])

    // Load saved workflows on mount
    useEffect(() => {
        const saved = loadWorkflows()
        setWorkflows(saved)
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
        // New blank workflow
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

    // ── Drag-and-drop from sidebar ────────────────────────────────
    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = "move"
    }, [])

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault()
            const promptId = event.dataTransfer.getData("application/promptId")
            if (!promptId) return

            const prompt = getPromptById(promptId)
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
        [screenToFlowPosition, setNodes]
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

    // ── Update node prompt text ────────────────────────────────────
    const handleUpdateNodePrompt = useCallback(
        (nodeId: string, newPrompt: string) => {
            setNodes((nds) =>
                nds.map((n) =>
                    n.id === nodeId
                        ? { ...n, data: { ...n.data, customPrompt: newPrompt } }
                        : n
                )
            )
        },
        [setNodes]
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

    // ── Copy all prompts as chained text ───────────────────────────
    const handleCopyAll = useCallback(() => {
        // Build ordered chain by following edges
        const nodeMap = new Map(nodes.map((n) => [n.id, n]))
        const edgeMap = new Map(edges.map((e) => [e.source, e.target]))

        // Find start node (not a target of any edge)
        const targets = new Set(edges.map((e) => e.target))
        let currentId = nodes.find((n) => !targets.has(n.id))?.id
        const orderedNodes: Node[] = []

        const visited = new Set<string>()
        while (currentId && !visited.has(currentId)) {
            visited.add(currentId)
            const node = nodeMap.get(currentId)
            if (node) orderedNodes.push(node)
            currentId = edgeMap.get(currentId)
        }

        // Add any unlinked nodes
        for (const n of nodes) {
            if (!visited.has(n.id)) orderedNodes.push(n)
        }

        const text = orderedNodes
            .map((n, i) => {
                const data = n.data as { label?: string; customPrompt?: string; promptId?: string }
                const prompt =
                    data.customPrompt ||
                    getPromptById(data.promptId ?? "")?.defaultPrompt ||
                    ""
                return `--- Step ${i + 1}: ${data.label || "Untitled"} ---\n\n${prompt}`
            })
            .join("\n\n")

        navigator.clipboard.writeText(text)
    }, [nodes, edges])

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
            />

            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                {sidebarOpen && (
                    <PromptLibrarySidebar
                        onClose={() => setSidebarOpen(false)}
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
                                    Drag prompts from the sidebar onto the canvas, then connect them
                                    to create powerful daisy-chained AI workflows. Copy the full
                                    chain to paste into any LLM.
                                </p>
                                <button
                                    onClick={() => setTemplatesOpen(true)}
                                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-international-orange hover:bg-orange-600 rounded-lg transition-colors shadow-sm"
                                >
                                    Start from a template
                                </button>
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
                        onDelete={handleDeleteNode}
                    />
                )}
            </div>

            {/* Templates dialog */}
            <WorkflowTemplatesDialog
                open={templatesOpen}
                onOpenChange={setTemplatesOpen}
                onSelectTemplate={handleLoadTemplate}
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
