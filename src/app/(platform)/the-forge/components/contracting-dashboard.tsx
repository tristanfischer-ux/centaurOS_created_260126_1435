/**
 * @file contracting-dashboard.tsx — Stage 5: Full contracting interface
 *
 * @description Replaces the previous stub RFQ section with a complete
 * procurement dashboard. Three tabs: RFQ Pack, Contracts, and Readiness.
 * Generates documents from project data and stores them in forge_contracts.
 *
 * @related
 * - Actions: src/actions/forge-contracts.ts
 * - Migration: supabase/migrations/20260211230000_forge_contracts.sql
 * - Context: ./forge-project-context.tsx
 */

"use client"

import React, { useState, useEffect, useCallback } from "react"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import {
  FileText,
  Package,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Loader2,
  ScrollText,
  ShieldCheck,
  FileSignature,
  Trash2,
  RefreshCw,
  Info,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

import {
  getForgeContractsAction,
  generateRfqPackAction,
  generateForgeContractAction,
  deleteForgeContractAction,
} from "@/actions/forge-contracts"

import type { ForgeContract, ForgeDocumentType } from "@/actions/forge-contracts"
import type { XRaySpec } from "../services/xray-schema"

// ─── Helpers ─────────────────────────────────────────────────────────

/** Maps template_type to human label */
const DOC_TYPE_LABELS: Record<ForgeDocumentType, string> = {
  rfq_pack: "RFQ Pack",
  sow: "Statement of Work",
  nda: "Non-Disclosure Agreement",
  ip_assignment: "IP Assignment",
  fractional_engagement: "Engagement Agreement",
} satisfies Record<ForgeDocumentType, string>

/** Maps template_type to icon */
const DOC_TYPE_ICONS: Record<string, React.ElementType> = {
  rfq_pack: FileText,
  sow: ScrollText,
  nda: ShieldCheck,
  ip_assignment: FileSignature,
  fractional_engagement: FileSignature,
}

// ─── Props ───────────────────────────────────────────────────────────

interface ContractingDashboardProps {
  /** Current X-Ray spec */
  spec: XRaySpec
  /** The xray_scan_id */
  scanId: string
  /** The foundry_id */
  foundryId: string
  /** Project name from metadata */
  projectName: string
}

// ─── Component ───────────────────────────────────────────────────────

/**
 * ContractingDashboard — Full procurement interface for Forge Stage 5.
 *
 * @description Three-tab interface for generating RFQ packs, contracts,
 * and tracking procurement readiness per module.
 *
 * @component
 */
export function ContractingDashboard({
  spec,
  scanId,
  foundryId,
  projectName,
}: ContractingDashboardProps): React.ReactNode {
  const [contracts, setContracts] = useState<ForgeContract[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)

  // RFQ form state
  const [buyerName, setBuyerName] = useState("")
  const [deadline, setDeadline] = useState("")
  const [specialTerms, setSpecialTerms] = useState("")

  const processClass = spec.modules.find((m) => m.isGatingModule)?.diagnostic?.derivedProcessClass
  const totalCost = spec.modules.reduce((s, m) => s + (m.estCost ?? 0), 0)
  const criticalPath = Math.max(...spec.modules.map((m) => m.requirements.leadWeeks), 0)
  const modulesWithSupplier = spec.modules.filter((m) => m.supplier).length

  // ── Load contracts on mount ──
  const loadContracts = useCallback(async (): Promise<void> => {
    const result = await getForgeContractsAction(scanId)
    if ("contracts" in result) {
      setContracts(result.contracts)
    } else {
      console.error("[Contracting] Load error:", result.error)
    }
    setIsLoading(false)
  }, [scanId])

  useEffect(() => {
    loadContracts()
  }, [loadContracts])

  // ── Generate RFQ Pack ──
  const handleGenerateRfq = async (): Promise<void> => {
    setIsGenerating(true)
    const result = await generateRfqPackAction({
      scanId,
      foundryId,
      projectName,
      processClass,
      modules: spec.modules.map((m) => ({
        id: m.id,
        name: m.name,
        purpose: m.purpose,
        keyParts: m.keyParts,
        requirements: m.requirements,
        supplier: m.supplier,
        estCost: m.estCost,
      })),
      buyerName: buyerName || undefined,
      submissionDeadline: deadline || undefined,
      specialTerms: specialTerms || undefined,
    })

    if ("contract" in result) {
      toast.success("RFQ pack generated")
      await loadContracts()
    } else {
      toast.error(result.error)
    }
    setIsGenerating(false)
  }

  // ── Generate Contract ──
  const handleGenerateContract = async (
    templateType: string,
    supplierName: string,
    moduleId?: string,
  ): Promise<void> => {
    setIsGenerating(true)
    const result = await generateForgeContractAction({
      scanId,
      foundryId,
      templateType,
      moduleId,
      supplierName,
      projectName,
      processClass,
      modules: spec.modules.map((m) => ({
        id: m.id,
        name: m.name,
        purpose: m.purpose,
        keyParts: m.keyParts,
        requirements: m.requirements,
        supplier: m.supplier,
        estCost: m.estCost,
      })),
      buyerName: buyerName || undefined,
    })

    if ("contract" in result) {
      toast.success(`${DOC_TYPE_LABELS[templateType as ForgeDocumentType] ?? templateType} generated`)
      await loadContracts()
    } else {
      toast.error(result.error)
    }
    setIsGenerating(false)
  }

  // ── Delete contract ──
  const handleDelete = async (contractId: string): Promise<void> => {
    const result = await deleteForgeContractAction(contractId)
    if ("success" in result) {
      toast.success("Document deleted")
      setContracts((prev) => prev.filter((c) => c.id !== contractId))
    } else {
      toast.error(result.error)
    }
  }

  // ── Copy to clipboard ──
  const handleCopy = (content: string): void => {
    navigator.clipboard.writeText(content)
    toast.success("Copied to clipboard")
  }

  // ── Download as text ──
  const handleDownload = (content: string, filename: string): void => {
    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Derived data ──
  const rfqPack = contracts.find((c) => c.document_type === "rfq_pack")
  const supplierContracts = contracts.filter((c) => c.document_type !== "rfq_pack")

  // Group contracts by supplier
  const contractsBySupplier: Record<string, ForgeContract[]> = {}
  for (const c of supplierContracts) {
    const key = c.supplier_name ?? "Unknown"
    if (!contractsBySupplier[key]) contractsBySupplier[key] = []
    contractsBySupplier[key].push(c)
  }

  // Get unique suppliers from modules
  const assignedSuppliers = Array.from(new Set(
    spec.modules.filter((m) => m.supplier).map((m) => m.supplier!)
  ))

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Section heading */}
      <div className="flex items-center gap-3">
        <div className="w-1 h-7 bg-chart-5 rounded-full" />
        <div>
          <h2 className="text-lg font-display font-semibold tracking-tight text-foreground">
            Contracting & Procurement
          </h2>
          <p className="text-xs text-muted-foreground">
            Generate procurement documents from your project data
          </p>
        </div>
      </div>

      <Tabs defaultValue="rfq">
        <TabsList>
          <TabsTrigger value="rfq">
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            RFQ Pack
          </TabsTrigger>
          <TabsTrigger value="contracts">
            <ScrollText className="h-3.5 w-3.5 mr-1.5" />
            Contracts
            {supplierContracts.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[10px]">{supplierContracts.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="readiness">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            Readiness
          </TabsTrigger>
        </TabsList>

        {/* ── RFQ Pack Tab ── */}
        <TabsContent value="rfq" className="space-y-4 mt-4">
          {/* Project summary metrics */}
          <Card className="rounded-xl shadow-sm">
            <CardContent className="pt-6 space-y-5">
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <p className="text-xs text-muted-foreground">Project</p>
                  <p className="text-sm font-semibold text-foreground">{projectName}</p>
                </div>
                {processClass && (
                  <div>
                    <p className="text-xs text-muted-foreground">Process Class</p>
                    <p className="text-sm font-semibold text-foreground">{processClass}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">Modules</p>
                  <p className="text-sm font-semibold text-foreground">{spec.modules.length}</p>
                </div>
                {totalCost > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground">Estimated Total</p>
                    <p className="text-sm font-semibold text-foreground">
                      £{Math.round(totalCost).toLocaleString()}
                    </p>
                  </div>
                )}
                {criticalPath > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground">Critical Path</p>
                    <p className="text-sm font-semibold text-foreground">{criticalPath} weeks</p>
                  </div>
                )}
              </div>

              {/* RFQ generation form */}
              <div className="rounded-xl border p-4 space-y-4">
                <h4 className="text-sm font-semibold text-foreground">Generate RFQ Pack</h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="buyer-name">Buyer / Company Name</Label>
                    <Input
                      id="buyer-name"
                      value={buyerName}
                      onChange={(e) => setBuyerName(e.target.value)}
                      placeholder="Your company name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="deadline">Submission Deadline</Label>
                    <Input
                      id="deadline"
                      type="date"
                      value={deadline}
                      onChange={(e) => setDeadline(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="special-terms">Special Terms (optional)</Label>
                  <Textarea
                    id="special-terms"
                    value={specialTerms}
                    onChange={(e) => setSpecialTerms(e.target.value)}
                    placeholder="Any additional requirements or terms..."
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    {specialTerms.length} / 500 characters
                  </p>
                </div>
                <Button
                  onClick={handleGenerateRfq}
                  disabled={isGenerating}
                  className="bg-international-orange hover:bg-international-orange-hover text-white"
                >
                  {isGenerating ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Generating...</>
                  ) : rfqPack ? (
                    <><RefreshCw className="h-4 w-4 mr-2" />Regenerate RFQ Pack</>
                  ) : (
                    <><FileText className="h-4 w-4 mr-2" />Generate RFQ Pack</>
                  )}
                </Button>
              </div>

              {/* Generated RFQ preview */}
              {rfqPack && (
                <DocumentCard
                  contract={rfqPack}
                  onCopy={handleCopy}
                  onDownload={handleDownload}
                  onDelete={handleDelete}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Contracts Tab ── */}
        <TabsContent value="contracts" className="space-y-4 mt-4">
          {assignedSuppliers.length === 0 ? (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Assign suppliers to modules in the Supply Chain step first.
                Contract generation requires at least one assigned supplier.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-6">
              {assignedSuppliers.map((supplier) => {
                const supplierModules = spec.modules.filter((m) => m.supplier === supplier)
                const existingContracts = contractsBySupplier[supplier] ?? []

                return (
                  <Card key={supplier} className="rounded-xl shadow-sm">
                    <CardContent className="pt-6 space-y-4">
                      {/* Supplier header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-chart-4" />
                          <span className="text-sm font-semibold text-foreground">{supplier}</span>
                          <Badge variant="secondary" className="text-[10px]">
                            {supplierModules.length} module{supplierModules.length !== 1 ? "s" : ""}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full text-xs"
                            onClick={() => handleGenerateContract("sow", supplier)}
                            disabled={isGenerating}
                          >
                            <ScrollText className="h-3 w-3 mr-1" />
                            SOW
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-full text-xs"
                            onClick={() => handleGenerateContract("nda", supplier)}
                            disabled={isGenerating}
                          >
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            NDA
                          </Button>
                        </div>
                      </div>

                      {/* Module breakdown for this supplier */}
                      <div className="space-y-1">
                        {supplierModules.map((m) => (
                          <div
                            key={m.id}
                            className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm bg-status-success-light/30"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <Package className="h-3 w-3 text-muted-foreground shrink-0" />
                              <span className="truncate text-foreground">{m.name}</span>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {m.requirements.leadWeeks}w
                              </span>
                              {m.estCost ? (
                                <span className="text-xs font-medium tabular-nums">
                                  £{Math.round(m.estCost).toLocaleString()}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Generated contracts for this supplier */}
                      {existingContracts.length > 0 && (
                        <div className="space-y-3 pt-2">
                          {existingContracts.map((c) => (
                            <DocumentCard
                              key={c.id}
                              contract={c}
                              onCopy={handleCopy}
                              onDownload={handleDownload}
                              onDelete={handleDelete}
                              compact
                            />
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Readiness Tab ── */}
        <TabsContent value="readiness" className="space-y-4 mt-4">
          <Card className="rounded-xl shadow-sm">
            <CardContent className="pt-6 space-y-5">
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                RFQ Readiness
              </h4>
              <div className="space-y-2">
                <ReadinessItem
                  label="Process class derived"
                  done={!!processClass}
                />
                <ReadinessItem
                  label={`Suppliers assigned (${modulesWithSupplier}/${spec.modules.length})`}
                  done={modulesWithSupplier === spec.modules.length}
                />
                <ReadinessItem
                  label="Cost estimates available"
                  done={totalCost > 0}
                />
                <ReadinessItem
                  label="RFQ pack generated"
                  done={!!rfqPack}
                />
                <ReadinessItem
                  label={`Contracts generated (${supplierContracts.length})`}
                  done={supplierContracts.length > 0}
                />
              </div>

              {/* Module-level readiness */}
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider pt-4">
                Module Readiness
              </h4>
              <div className="space-y-1.5">
                {spec.modules.map((m) => {
                  const hasSupplier = !!m.supplier
                  const hasCost = !!m.estCost
                  const hasContract = supplierContracts.some(
                    (c) => c.module_id === m.id || c.supplier_name === m.supplier
                  )
                  const score = [hasSupplier, hasCost, hasContract].filter(Boolean).length

                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "flex items-center justify-between rounded-lg border px-3 py-2 text-sm",
                        score === 3 ? "bg-status-success-light/30" : "bg-background",
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Package className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="truncate text-foreground">{m.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <MiniIndicator done={hasSupplier} label="Supplier" />
                        <MiniIndicator done={hasCost} label="Cost" />
                        <MiniIndicator done={hasContract} label="Contract" />
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Document Card ───────────────────────────────────────────────────

interface DocumentCardProps {
  contract: ForgeContract
  onCopy: (content: string) => void
  onDownload: (content: string, filename: string) => void
  onDelete: (id: string) => void
  compact?: boolean
}

function DocumentCard({ contract, onCopy, onDownload, onDelete, compact }: DocumentCardProps): React.ReactNode {
  const [isExpanded, setIsExpanded] = useState(false)
  const Icon = (DOC_TYPE_ICONS[contract.document_type] ?? FileText) as typeof FileText
  const label = DOC_TYPE_LABELS[contract.document_type] ?? contract.document_type
  const filename = `${contract.document_type}_${contract.supplier_name ?? "project"}.txt`
    .replace(/\s+/g, "_")
    .toLowerCase()

  return (
    <div className={cn(
      "rounded-xl border p-4 space-y-3",
      compact ? "bg-muted/20" : "bg-muted/30",
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-chart-5" />
          <span className="text-sm font-semibold text-foreground">{label}</span>
          {contract.supplier_name && (
            <span className="text-xs text-muted-foreground">— {contract.supplier_name}</span>
          )}
          <Badge
            variant={contract.status === "final" ? "success" : contract.status === "signed" ? "info" : "secondary"}
            className="text-[10px]"
          >
            {contract.status}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onCopy(contract.rendered_content)}
            aria-label="Copy to clipboard"
          >
            <Copy className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onDownload(contract.rendered_content, filename)}
            aria-label="Download"
          >
            <Download className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => onDelete(contract.id)}
            aria-label="Delete document"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Expandable content */}
      <Button
        variant="ghost"
        size="sm"
        className="text-xs"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? "Hide content" : "Show content"}
      </Button>
      {isExpanded && (
        <pre className="whitespace-pre-wrap text-xs text-muted-foreground bg-background rounded-lg border p-4 max-h-96 overflow-y-auto font-mono">
          {contract.rendered_content}
        </pre>
      )}

      <p className="text-[10px] text-muted-foreground">
        Generated {new Date(contract.created_at).toLocaleDateString()}
      </p>
    </div>
  )
}

// ─── Readiness Item ──────────────────────────────────────────────────

function ReadinessItem({ label, done }: { label: string; done: boolean }): React.ReactNode {
  return (
    <div className="flex items-center gap-2 text-sm">
      {done ? (
        <div className="h-4 w-4 rounded-full bg-status-success flex items-center justify-center">
          <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      ) : (
        <div className="h-4 w-4 rounded-full border-2 border-muted" />
      )}
      <span className={cn("text-sm", done ? "text-foreground" : "text-muted-foreground")}>
        {label}
      </span>
    </div>
  )
}

// ─── Mini Indicator ──────────────────────────────────────────────────

function MiniIndicator({ done, label }: { done: boolean; label: string }): React.ReactNode {
  return (
    <div className="flex items-center gap-1" title={label}>
      <div className={cn(
        "h-2 w-2 rounded-full",
        done ? "bg-status-success" : "bg-muted",
      )} />
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  )
}
