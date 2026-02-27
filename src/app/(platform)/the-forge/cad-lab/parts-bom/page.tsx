"use client"

/**
 * @file parts-bom/page.tsx — Structured Parts & BOM page for CAD Lab.
 *
 * @description AI-powered BOM generation from CAD Lab modules, with a
 * hierarchical tree viewer and inline editing. Lives in the cad-lab layout
 * and gets CadLabProvider context.
 */

import { useState, useCallback, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  List,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Package,
  ArrowLeft,
  Pencil,
  Check,
  X,
  Trash2,
  Loader2,
} from "lucide-react"

import { FORGE_ROUTES } from "@/lib/forge-routes"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"

import { generateBomFromModules, loadBom, savePart, deletePart } from "@/actions/bom"
import type { BomTreeNode, StructuredPart } from "@/lib/cad-lab-types"
import { useCadLab } from "../cad-lab-context"

// ─── Helpers ────────────────────────────────────────────────────────

const fmtCost = (n: number) => {
  if (isNaN(n)) return "£0.00"
  return `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const fmtMass = (kg: number) => {
  if (isNaN(kg)) return "0.00 kg"
  return kg < 0.01 ? "<0.01 kg" : `${kg.toFixed(2)} kg`
}

const processLabel: Record<string, string> = {
  cnc: "CNC",
  injection_molding: "Injection Moulding",
  sheet_metal: "Sheet Metal",
  "3d_print_fdm": "3D Print (FDM)",
  "3d_print_sla": "3D Print (SLA)",
  "3d_print_sls": "3D Print (SLS)",
  casting: "Casting",
  forging: "Forging",
  machining: "Machining",
  purchased_cots: "Purchased (COTS)",
  other: "Other",
}

// ─── Page ───────────────────────────────────────────────────────────

export default function PartsAndBomPage(): React.ReactNode {
  const router = useRouter()
  const {
    modules,
    subject,
    activeProjectId,
    diagnosticAnswers,
    designBrief,
  } = useCadLab()

  const [tree, setTree] = useState<BomTreeNode[]>([])
  const [parts, setParts] = useState<StructuredPart[]>([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [editingPartId, setEditingPartId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Partial<StructuredPart>>({})
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null)

  // Ref for current parts to avoid stale closure in saveEdit
  const partsRef = useRef(parts)
  partsRef.current = parts

  // ── Load existing BOM on mount ──

  useEffect(() => {
    if (!activeProjectId) return

    let cancelled = false
    setLoading(true)

    loadBom(activeProjectId).then((result) => {
      if (cancelled) return
      setLoading(false)
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      setTree(result.tree)
      setParts(result.parts)
      // Auto-expand top-level assemblies
      const topIds = new Set(result.tree.map((n) => n.part.id).filter(Boolean) as string[])
      setExpandedIds(topIds)
    })

    return () => { cancelled = true }
  }, [activeProjectId])

  // ── Reload helper ──

  const reloadBom = useCallback(async () => {
    if (!activeProjectId) return
    const loaded = await loadBom(activeProjectId)
    if ("error" in loaded) {
      toast.error("Failed to reload BOM")
      return
    }
    setTree(loaded.tree)
    setParts(loaded.parts)
    const topIds = new Set(loaded.tree.map((n) => n.part.id).filter(Boolean) as string[])
    setExpandedIds(topIds)
  }, [activeProjectId])

  // ── Generate BOM ──

  const handleGenerate = useCallback(async () => {
    if (!activeProjectId || !modules.length || generating) return

    // Cancel any active edit before regenerating
    setEditingPartId(null)
    setEditValues({})

    setGenerating(true)
    const result = await generateBomFromModules(
      activeProjectId,
      modules,
      designBrief,
      diagnosticAnswers,
    )
    setGenerating(false)

    if ("error" in result) {
      toast.error(result.error)
      return
    }

    if (!result.success) {
      toast.error(result.error ?? "BOM generation failed")
      return
    }

    toast.success(`Generated ${result.parts?.length ?? 0} parts in ${((result.generationTimeMs ?? 0) / 1000).toFixed(1)}s`)
    await reloadBom()
  }, [activeProjectId, modules, designBrief, diagnosticAnswers, generating, reloadBom])

  // ── Toggle expand ──

  const toggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // ── Inline editing ──

  const startEdit = useCallback((part: StructuredPart) => {
    if (saving || generating) return
    setEditingPartId(part.id ?? null)
    setEditValues({
      name: part.name,
      material: part.material,
      process: part.process,
      tolerance: part.tolerance,
      estimatedUnitCostGbp: part.estimatedUnitCostGbp,
      massKg: part.massKg,
    })
  }, [saving, generating])

  const cancelEdit = useCallback(() => {
    setEditingPartId(null)
    setEditValues({})
  }, [])

  const saveEdit = useCallback(async () => {
    if (!editingPartId || !activeProjectId || saving) return

    const part = partsRef.current.find((p) => p.id === editingPartId)
    if (!part) return

    setSaving(true)
    const updated = { ...part, ...editValues }
    const result = await savePart(activeProjectId, updated)
    setSaving(false)

    if ("error" in result) {
      toast.error(result.error)
      return
    }

    toast.success("Part updated")
    setEditingPartId(null)
    setEditValues({})
    await reloadBom()
  }, [editingPartId, editValues, activeProjectId, saving, reloadBom])

  // ── Delete part (with confirmation) ──

  const confirmDelete = useCallback(async () => {
    if (!deleteConfirm || !activeProjectId) return

    setSaving(true)
    const result = await deletePart(deleteConfirm.id)
    setSaving(false)
    setDeleteConfirm(null)

    if ("error" in result) {
      toast.error(result.error)
      return
    }

    toast.success("Part deleted")
    await reloadBom()
  }, [deleteConfirm, activeProjectId, reloadBom])

  // ── Summary stats (NaN-safe) ──

  const totalParts = parts.length
  const totalCost = tree.reduce((s, n) => s + (isNaN(n.totalCost) ? 0 : n.totalCost), 0)
  const totalMass = tree.reduce((s, n) => s + (isNaN(n.totalMass) ? 0 : n.totalMass), 0)
  const purchasedCount = parts.filter((p) => p.isPurchased).length
  const mfgCount = totalParts - purchasedCount

  // ── Render ──

  const hasBom = tree.length > 0
  const isBusy = generating || saving

  return (
    <div className="space-y-6">
      {/* Header with orange accent bar */}
      <div className="flex items-center gap-3">
        <div className="h-8 w-1 rounded-full bg-international-orange" />
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-foreground">Parts &amp; BOM</h1>
          <p className="text-xs text-muted-foreground">
            Structured Bill of Materials for {subject || "this project"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs gap-1.5"
          onClick={() => router.push(FORGE_ROUTES.cadLabSource)}
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Source
        </Button>
      </div>

      {/* Loading state */}
      {loading && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Loading BOM data…</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state — no BOM yet */}
      {!loading && !hasBom && (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={<Package className="h-10 w-10" />}
              title="No structured BOM yet"
              description={
                modules.length > 0
                  ? `Generate a structured BOM from ${modules.length} module${modules.length === 1 ? "" : "s"} with manufacturing specs, costs, and hierarchical assembly data.`
                  : "Build modules in the CAD Lab first, then generate a structured BOM here."
              }
              action={
                modules.length > 0 ? (
                  <Button
                    onClick={handleGenerate}
                    disabled={generating || !activeProjectId}
                    className="gap-1.5"
                  >
                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {generating ? "Generating…" : "Generate BOM"}
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      )}

      {/* BOM exists */}
      {!loading && hasBom && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard label="Total Parts" value={String(totalParts)} />
            <SummaryCard label="Total Cost" value={fmtCost(totalCost)} />
            <SummaryCard label="Total Mass" value={fmtMass(totalMass)} />
            <SummaryCard
              label="Mfg / Purchased"
              value={`${mfgCount} / ${purchasedCount}`}
            />
          </div>

          {/* BOM tree table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2" id="bom-table-title">
                  <List className="h-4 w-4" />
                  Bill of Materials
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 gap-1.5"
                  onClick={handleGenerate}
                  disabled={isBusy || !modules.length || !activeProjectId}
                >
                  {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  {generating ? "Regenerating…" : "Regenerate"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className={cn("border rounded-md overflow-auto", generating && "opacity-50 pointer-events-none")}>
                <table className="w-full text-xs" role="treegrid" aria-labelledby="bom-table-title">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th scope="col" className="text-left p-2 font-semibold text-muted-foreground">Part #</th>
                      <th scope="col" className="text-left p-2 font-semibold text-muted-foreground">Name</th>
                      <th scope="col" className="text-left p-2 font-semibold text-muted-foreground">Process</th>
                      <th scope="col" className="text-left p-2 font-semibold text-muted-foreground">Material</th>
                      <th scope="col" className="text-right p-2 font-semibold text-muted-foreground">Qty</th>
                      <th scope="col" className="text-right p-2 font-semibold text-muted-foreground">Mass</th>
                      <th scope="col" className="text-right p-2 font-semibold text-muted-foreground">Cost</th>
                      <th scope="col" className="text-right p-2 font-semibold text-muted-foreground w-20">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tree.map((node) => (
                      <TreeRow
                        key={node.part.id ?? node.part.partNumber}
                        node={node}
                        expandedIds={expandedIds}
                        onToggle={toggle}
                        editingPartId={editingPartId}
                        editValues={editValues}
                        onStartEdit={startEdit}
                        onCancelEdit={cancelEdit}
                        onSaveEdit={saveEdit}
                        onEditChange={setEditValues}
                        onRequestDelete={(id, name) => setDeleteConfirm({ id, name })}
                        isBusy={isBusy}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Footer */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled
              className="text-xs gap-1.5 opacity-50"
              title="Coming soon"
            >
              Create Manufacturing Order
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs gap-1.5"
              onClick={() => router.push(FORGE_ROUTES.cadLabSource)}
            >
              <ArrowLeft className="h-3 w-3" />
              Back to Source
            </Button>
          </div>
        </>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete part?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteConfirm?.name}</strong> and
              remove it from the BOM hierarchy. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── Summary Card ───────────────────────────────────────────────────

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold font-mono text-foreground mt-1">{value}</p>
      </CardContent>
    </Card>
  )
}

// ─── Tree Row ───────────────────────────────────────────────────────

interface TreeRowProps {
  node: BomTreeNode
  expandedIds: Set<string>
  onToggle: (id: string) => void
  editingPartId: string | null
  editValues: Partial<StructuredPart>
  onStartEdit: (part: StructuredPart) => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  onEditChange: (values: Partial<StructuredPart>) => void
  onRequestDelete: (id: string, name: string) => void
  isBusy: boolean
}

function TreeRow({
  node,
  expandedIds,
  onToggle,
  editingPartId,
  editValues,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditChange,
  onRequestDelete,
  isBusy,
}: TreeRowProps) {
  const { part, bomLine, children, depth, totalCost, totalMass } = node
  const partId = part.id ?? part.partNumber
  const isExpanded = expandedIds.has(partId)
  const hasChildren = children.length > 0
  const isEditing = editingPartId === part.id
  const qty = bomLine?.quantity ?? 1
  const indent = Math.min(depth, 8) * 24 // Cap indent to prevent off-screen

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === "Enter" || e.key === " ") && hasChildren) {
      e.preventDefault()
      onToggle(partId)
    }
  }, [hasChildren, onToggle, partId])

  return (
    <>
      <tr
        className={cn(
          "border-b transition-colors",
          hasChildren && "cursor-pointer hover:bg-muted/30",
          depth === 0 && "bg-muted/30 font-semibold",
        )}
        role="row"
        aria-level={depth + 1}
        aria-expanded={hasChildren ? isExpanded : undefined}
        tabIndex={hasChildren ? 0 : undefined}
        onClick={() => hasChildren && onToggle(partId)}
        onKeyDown={handleKeyDown}
      >
        {/* Part # */}
        <td className="p-2 font-mono text-foreground" style={{ paddingLeft: `${8 + indent}px` }}>
          <div className="flex items-center gap-1">
            {hasChildren ? (
              isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />
            ) : (
              <span className="w-3" />
            )}
            <span className="max-w-[120px] truncate" title={part.partNumber}>{part.partNumber}</span>
            {part.isPurchased && (
              <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1">COTS</Badge>
            )}
          </div>
        </td>

        {/* Name */}
        <td className="p-2 text-foreground max-w-[200px]">
          {isEditing ? (
            <input
              type="text"
              value={editValues.name ?? ""}
              onChange={(e) => onEditChange({ ...editValues, name: e.target.value })}
              className="w-full bg-background border border-input rounded px-1.5 py-0.5 text-xs"
              aria-label="Part name"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate block" title={part.name}>{part.name}</span>
          )}
        </td>

        {/* Process */}
        <td className="p-2 text-foreground">
          {isEditing ? (
            <select
              value={editValues.process ?? ""}
              onChange={(e) => onEditChange({ ...editValues, process: e.target.value as StructuredPart["process"] })}
              className="bg-background border border-input rounded px-1.5 py-0.5 text-xs"
              aria-label="Manufacturing process"
              onClick={(e) => e.stopPropagation()}
            >
              <option value="">—</option>
              {Object.entries(processLabel).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          ) : (
            processLabel[part.process ?? ""] ?? part.process ?? "—"
          )}
        </td>

        {/* Material */}
        <td className="p-2 text-foreground max-w-[150px]">
          {isEditing ? (
            <input
              type="text"
              value={editValues.material ?? ""}
              onChange={(e) => onEditChange({ ...editValues, material: e.target.value })}
              className="w-full bg-background border border-input rounded px-1.5 py-0.5 text-xs"
              aria-label="Material"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate block" title={part.material ?? undefined}>{part.material ?? "—"}</span>
          )}
        </td>

        {/* Qty */}
        <td className="p-2 text-right font-mono text-foreground">{qty}</td>

        {/* Mass */}
        <td className="p-2 text-right font-mono text-foreground">
          {isEditing ? (
            <input
              type="number"
              step="0.01"
              min="0"
              value={editValues.massKg ?? ""}
              onChange={(e) => onEditChange({ ...editValues, massKg: parseFloat(e.target.value) || undefined })}
              className="w-16 bg-background border border-input rounded px-1.5 py-0.5 text-xs text-right font-mono"
              aria-label="Mass in kg"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            fmtMass(totalMass)
          )}
        </td>

        {/* Cost */}
        <td className="p-2 text-right font-mono text-foreground">
          {isEditing ? (
            <input
              type="number"
              step="0.01"
              min="0"
              value={editValues.estimatedUnitCostGbp ?? ""}
              onChange={(e) => onEditChange({ ...editValues, estimatedUnitCostGbp: parseFloat(e.target.value) || undefined })}
              className="w-20 bg-background border border-input rounded px-1.5 py-0.5 text-xs text-right font-mono"
              aria-label="Unit cost in GBP"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            fmtCost(totalCost)
          )}
        </td>

        {/* Actions */}
        <td className="p-2 text-right">
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {isEditing ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-success hover:bg-success/10"
                  onClick={onSaveEdit}
                  disabled={isBusy}
                  aria-label="Save edit"
                >
                  {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:bg-destructive/10"
                  onClick={onCancelEdit}
                  disabled={isBusy}
                  aria-label="Cancel edit"
                >
                  <X className="h-3 w-3" />
                </Button>
              </>
            ) : (
              <>
                {part.id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground"
                    onClick={() => onStartEdit(part)}
                    disabled={isBusy}
                    aria-label={`Edit ${part.name}`}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                )}
                {part.id && !hasChildren && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() => onRequestDelete(part.id!, part.name)}
                    disabled={isBusy}
                    aria-label={`Delete ${part.name}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </>
            )}
          </div>
        </td>
      </tr>

      {/* Children (when expanded) */}
      {isExpanded && children.map((child) => (
        <TreeRow
          key={child.part.id ?? child.part.partNumber}
          node={child}
          expandedIds={expandedIds}
          onToggle={onToggle}
          editingPartId={editingPartId}
          editValues={editValues}
          onStartEdit={onStartEdit}
          onCancelEdit={onCancelEdit}
          onSaveEdit={onSaveEdit}
          onEditChange={onEditChange}
          onRequestDelete={onRequestDelete}
          isBusy={isBusy}
        />
      ))}
    </>
  )
}
