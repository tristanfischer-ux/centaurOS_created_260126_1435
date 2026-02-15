/**
 * @file cad-lab-contracting.tsx — Contract document generation for The Forge.
 *
 * @description Generates RFQ, SOW, and NDA document templates from project
 * data. Pulls module specifications, diagnostic answers, and CAD metrics
 * to produce copy-ready contract text. Documents are plain text that can
 * be copied to clipboard or printed.
 *
 * @component
 *
 * @example
 * <CadLabContracting
 *   modules={modules}
 *   projectName={subject}
 *   diagnosticAnswers={diagnosticAnswers}
 * />
 */

"use client"

import { useEffect, useMemo, useState } from "react"
import {
  FileSignature,
  Copy,
  FileText,
  Shield,
  ClipboardList,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ArrowRight,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { CadLabDesignBrief, CadLabModule } from "@/lib/cad-lab-types"
import type { DiagnosticAnswers } from "./cad-lab-diagnostics"
import { computeRfqReadiness } from "./cad-lab-procurement-utils"
import { createCadLabRfqAction } from "@/actions/cad-lab-rfq"
import { getRFQDetail, getMatchedSuppliers } from "@/actions/rfq"
import type { SupplierMatch } from "@/types/rfq"

// ─── Types ──────────────────────────────────────────────────────────

interface CadLabContractingProps {
  /** Array of decomposed modules */
  modules: CadLabModule[]
  /** Project name */
  projectName: string
  /** Diagnostic answers per module */
  diagnosticAnswers?: DiagnosticAnswers
  /** Active Cad Lab project ID */
  projectId?: string | null
  /** Existing RFQ linked to this project */
  linkedRfqId?: string | null
  /** Persist RFQ linkage */
  onRfqLinked?: (rfqId: string) => Promise<void> | void
  /** Structured design brief captured in research stage */
  designBrief?: CadLabDesignBrief
  /** Optional assumptions entered by user */
  assumptionNotes?: string
}

type DocType = "rfq" | "sow" | "nda"

interface DocTemplate {
  id: DocType
  name: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}

const DOC_TYPES: DocTemplate[] = [
  {
    id: "rfq",
    name: "Request for Quotation",
    description:
      "Formal RFQ pack with module specs, quantities, and requirements",
    icon: ClipboardList,
  },
  {
    id: "sow",
    name: "Statement of Work",
    description: "Detailed scope, deliverables, timeline, and acceptance criteria",
    icon: FileText,
  },
  {
    id: "nda",
    name: "Non-Disclosure Agreement",
    description: "Standard mutual NDA for sharing technical specifications",
    icon: Shield,
  },
]

// ─── Document Generators ────────────────────────────────────────────

/**
 * Generates an RFQ document from project data.
 */
function generateRfq(
  projectName: string,
  modules: CadLabModule[],
  diagnosticAnswers?: DiagnosticAnswers,
  buyerName?: string,
  deadline?: string,
  specialTerms?: string,
  rfqId?: string,
  rfqStatus?: string,
): string {
  const date = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
  const lines: string[] = []

  lines.push("REQUEST FOR QUOTATION (RFQ)")
  lines.push("=".repeat(50))
  lines.push("")
  lines.push(`Project: ${projectName}`)
  lines.push(`Date: ${date}`)
  if (buyerName) lines.push(`Buyer: ${buyerName}`)
  if (deadline) lines.push(`Submission Deadline: ${deadline}`)
  if (rfqId) lines.push(`Marketplace RFQ ID: ${rfqId}`)
  if (rfqStatus) lines.push(`Marketplace Status: ${rfqStatus}`)
  lines.push(`Modules: ${modules.length}`)
  lines.push("")

  lines.push("SCOPE OF SUPPLY")
  lines.push("-".repeat(30))
  lines.push("")

  for (const mod of modules) {
    const diag = diagnosticAnswers?.[mod.id] || {}
    lines.push(`Module: ${mod.name}`)
    lines.push(`  Purpose: ${mod.purpose}`)
    lines.push(`  Key parts: ${mod.keyParts.join(", ")}`)
    lines.push(`  Lead time: ${mod.leadWeeks} weeks`)

    if (diag.mfg_process) lines.push(`  Process: ${diag.mfg_process}`)
    if (diag.material) lines.push(`  Material: ${diag.material}`)
    if (diag.tolerance) lines.push(`  Tolerance: ${diag.tolerance}`)
    if (diag.finish) lines.push(`  Finish: ${diag.finish}`)
    if (diag.batch_size) lines.push(`  Quantity: ${diag.batch_size}`)
    if (diag.environment) lines.push(`  Environment: ${diag.environment}`)

    if (mod.result?.bbox) {
      lines.push(
        `  Dimensions: ${mod.result.bbox.xLen.toFixed(0)}×${mod.result.bbox.yLen.toFixed(0)}×${mod.result.bbox.zLen.toFixed(0)} mm`
      )
    }
    if (mod.result?.massGrams) {
      lines.push(`  Mass: ${mod.result.massGrams.toFixed(1)} g`)
    }

    lines.push("")
  }

  lines.push("QUOTE REQUIREMENTS")
  lines.push("-".repeat(30))
  lines.push("Please provide:")
  lines.push("  1. Unit price per module")
  lines.push("  2. Tooling costs (if applicable)")
  lines.push("  3. Lead time from order confirmation")
  lines.push("  4. Minimum order quantity")
  lines.push("  5. Material certifications available")
  lines.push("  6. Quality inspection method")
  lines.push("")

  if (specialTerms) {
    lines.push("SPECIAL TERMS")
    lines.push("-".repeat(30))
    lines.push(specialTerms)
    lines.push("")
  }

  lines.push("=".repeat(50))
  lines.push(`Generated by The Forge — ForgeOS — ${date}`)

  return lines.join("\n")
}

/**
 * Generates a Statement of Work from project data.
 */
function generateSow(
  projectName: string,
  modules: CadLabModule[],
  diagnosticAnswers?: DiagnosticAnswers,
  buyerName?: string,
  rfqId?: string,
): string {
  const date = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
  const maxLead = Math.max(...modules.map((m) => m.leadWeeks), 0)
  const lines: string[] = []

  lines.push("STATEMENT OF WORK (SOW)")
  lines.push("=".repeat(50))
  lines.push("")
  lines.push(`Project: ${projectName}`)
  lines.push(`Date: ${date}`)
  if (buyerName) lines.push(`Client: ${buyerName}`)
  if (rfqId) lines.push(`Marketplace RFQ Reference: ${rfqId}`)
  lines.push("")

  lines.push("1. SCOPE")
  lines.push("-".repeat(30))
  lines.push(
    `Manufacturing and delivery of ${modules.length} modules as specified below.`
  )
  lines.push("")

  lines.push("2. DELIVERABLES")
  lines.push("-".repeat(30))
  for (let i = 0; i < modules.length; i++) {
    const mod = modules[i]
    lines.push(`  ${i + 1}. ${mod.name} — ${mod.purpose}`)
    lines.push(`     Parts: ${mod.keyParts.join(", ")}`)
    lines.push(`     Lead: ${mod.leadWeeks} weeks`)
  }
  lines.push("")

  lines.push("3. TIMELINE")
  lines.push("-".repeat(30))
  lines.push(`  Estimated total duration: ${maxLead} weeks (critical path)`)
  lines.push("  Milestones:")
  lines.push("    - Week 0: Kick-off and material procurement")
  lines.push(`    - Week ${Math.ceil(maxLead * 0.3)}: First article inspection`)
  lines.push(`    - Week ${Math.ceil(maxLead * 0.7)}: Pre-delivery review`)
  lines.push(`    - Week ${maxLead}: Final delivery and acceptance`)
  lines.push("")

  lines.push("4. ACCEPTANCE CRITERIA")
  lines.push("-".repeat(30))
  lines.push("  - Dimensional compliance per specified tolerances")
  lines.push("  - Material certification provided")
  lines.push("  - Visual inspection: no defects, correct finish")
  lines.push("  - Functional test (if applicable)")
  lines.push("")

  lines.push("5. PAYMENT TERMS")
  lines.push("-".repeat(30))
  lines.push("  - 30% upon order confirmation")
  lines.push("  - 40% upon first article approval")
  lines.push("  - 30% upon final delivery and acceptance")
  lines.push("")

  lines.push("=".repeat(50))
  lines.push(`Generated by The Forge — ForgeOS — ${date}`)

  return lines.join("\n")
}

/**
 * Generates a mutual NDA template.
 */
function generateNda(projectName: string, buyerName?: string, rfqId?: string): string {
  const date = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
  const lines: string[] = []

  lines.push("MUTUAL NON-DISCLOSURE AGREEMENT")
  lines.push("=".repeat(50))
  lines.push("")
  lines.push(`Date: ${date}`)
  lines.push(`Project: ${projectName}`)
  if (rfqId) lines.push(`RFQ Reference: ${rfqId}`)
  lines.push("")
  lines.push("BETWEEN:")
  lines.push(`  Party A (Discloser): ${buyerName || "[BUYER NAME]"}`)
  lines.push("  Party B (Recipient): [SUPPLIER NAME]")
  lines.push("")
  lines.push("1. PURPOSE")
  lines.push("-".repeat(30))
  lines.push(
    "The parties wish to exchange confidential technical information"
  )
  lines.push(
    `relating to the project "${projectName}" for the purpose of`
  )
  lines.push("evaluating a potential manufacturing engagement.")
  lines.push("")
  lines.push("2. CONFIDENTIAL INFORMATION INCLUDES")
  lines.push("-".repeat(30))
  lines.push("  - CAD models, drawings, and specifications")
  lines.push("  - Manufacturing processes and parameters")
  lines.push("  - Material compositions and formulations")
  lines.push("  - Cost data, pricing, and business terms")
  lines.push("  - Research reports and analysis results")
  lines.push("")
  lines.push("3. OBLIGATIONS")
  lines.push("-".repeat(30))
  lines.push(
    "  - Treat all disclosed information as confidential"
  )
  lines.push(
    "  - Use information solely for the stated purpose"
  )
  lines.push(
    "  - Not disclose to third parties without written consent"
  )
  lines.push("  - Return or destroy all materials upon request")
  lines.push("")
  lines.push("4. TERM")
  lines.push("-".repeat(30))
  lines.push(
    "  This agreement shall remain in effect for 3 years from the date above."
  )
  lines.push("")
  lines.push("5. SIGNATURES")
  lines.push("-".repeat(30))
  lines.push("")
  lines.push(`Party A: ________________________  Date: ________`)
  lines.push(`Party B: ________________________  Date: ________`)
  lines.push("")
  lines.push("=".repeat(50))
  lines.push(`Template generated by The Forge — ForgeOS — ${date}`)

  return lines.join("\n")
}

// ─── Component ──────────────────────────────────────────────────────

/**
 * CadLabContracting — contract document generation.
 *
 * @description Generates RFQ, SOW, and NDA documents from project data.
 * User fills in buyer name/deadline, then generates and copies
 * document text to clipboard.
 */
export function CadLabContracting({
  modules,
  projectName,
  diagnosticAnswers,
  projectId,
  linkedRfqId,
  onRfqLinked,
  designBrief,
  assumptionNotes,
}: CadLabContractingProps): React.ReactNode {
  const [buyerName, setBuyerName] = useState("")
  const [deadline, setDeadline] = useState("")
  const [specialTerms, setSpecialTerms] = useState("")
  const [generatedDocs, setGeneratedDocs] = useState<
    Map<DocType, string>
  >(new Map())
  const [expandedDoc, setExpandedDoc] = useState<DocType | null>(null)
  const [isCreatingRfq, setIsCreatingRfq] = useState(false)
  const [createdRfqId, setCreatedRfqId] = useState<string | null>(null)
  const [rfqStatus, setRfqStatus] = useState<string | null>(null)
  const [rfqResponseCount, setRfqResponseCount] = useState(0)
  const [suggestedSuppliers, setSuggestedSuppliers] = useState<SupplierMatch[]>([])
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState(false)

  const rfqReadiness = useMemo(
    () => computeRfqReadiness(modules, diagnosticAnswers),
    [modules, diagnosticAnswers],
  )
  const canCreateRfq =
    rfqReadiness.quoteReadyModuleCount > 0
  const createRfqBlockedReason = !canCreateRfq
    ? "At least one module must be quote-ready (generated + STEP/STL/manifest) before RFQ creation."
    : null

  useEffect(() => {
    if (linkedRfqId) {
      setCreatedRfqId(linkedRfqId)
    }
  }, [linkedRfqId])

  useEffect(() => {
    if (!createdRfqId) {
      setRfqStatus(null)
      setRfqResponseCount(0)
      setSuggestedSuppliers([])
      return
    }

    let isMounted = true

    const fetchRfqContext = async (): Promise<void> => {
      try {
        setIsLoadingSuppliers(true)
        const [detail, matches] = await Promise.all([
          getRFQDetail(createdRfqId),
          getMatchedSuppliers(createdRfqId),
        ])

        if (!isMounted) return
        if (!detail.error && detail.data) {
          setRfqStatus(detail.data.status)
          setRfqResponseCount(detail.data.response_count ?? 0)
        }
        if (!matches.error) {
          setSuggestedSuppliers(matches.data.slice(0, 5))
        }
      } catch {
        // best effort only
      } finally {
        if (isMounted) setIsLoadingSuppliers(false)
      }
    }

    fetchRfqContext()
    const poll = window.setInterval(fetchRfqContext, 20000)
    return () => {
      isMounted = false
      window.clearInterval(poll)
    }
  }, [createdRfqId])

  const handleGenerate = (type: DocType): void => {
    let text: string
    switch (type) {
      case "rfq":
        text = generateRfq(
          projectName,
          modules,
          diagnosticAnswers,
          buyerName || undefined,
          deadline || undefined,
          specialTerms || undefined,
          createdRfqId || undefined,
          rfqStatus || undefined,
        )
        break
      case "sow":
        text = generateSow(
          projectName,
          modules,
          diagnosticAnswers,
          buyerName || undefined,
          createdRfqId || undefined,
        )
        break
      case "nda":
        text = generateNda(
          projectName,
          buyerName || undefined,
          createdRfqId || undefined,
        )
        break
    }

    setGeneratedDocs((prev) => {
      const next = new Map(prev)
      next.set(type, text)
      return next
    })
    setExpandedDoc(type)
  }

  const handleCopy = async (type: DocType): Promise<void> => {
    const text = generatedDocs.get(type)
    if (!text) return
    await navigator.clipboard.writeText(text)
    toast.success(`${DOC_TYPES.find((d) => d.id === type)?.name} copied to clipboard`)
  }

  const handleCreateMarketplaceRfq = async (): Promise<void> => {
    if (!canCreateRfq) {
      toast.error(createRfqBlockedReason || "RFQ package is not ready yet.")
      return
    }
    setIsCreatingRfq(true)
    try {
      const res = await createCadLabRfqAction({
        projectName,
        modules,
        diagnosticAnswers: diagnosticAnswers || {},
        deadline: deadline || undefined,
        designBrief,
        assumptionNotes,
      })

      if ("error" in res) {
        toast.error(res.error)
        return
      }

      setCreatedRfqId(res.rfqId)
      if (projectId && onRfqLinked) {
        await onRfqLinked(res.rfqId)
      }
      toast.success("Marketplace RFQ created from drawing package")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create RFQ")
    } finally {
      setIsCreatingRfq(false)
    }
  }

  const procurementStage = !createdRfqId
    ? "draft"
    : rfqStatus === "Awarded"
      ? "awarded"
      : rfqResponseCount > 0
        ? "responses"
        : "rfq_created"
  const procurementFlow = [
    { key: "draft", label: "Draft package" },
    { key: "rfq_created", label: "RFQ created" },
    { key: "responses", label: "Supplier responses" },
    { key: "awarded", label: "Awarded" },
  ]
  const currentStageIndex = procurementFlow.findIndex((step) => step.key === procurementStage)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileSignature className="h-4 w-4" />
          Contracting
          {generatedDocs.size > 0 && (
            <span className="text-xs font-normal text-status-success flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              {generatedDocs.size} document{generatedDocs.size !== 1 ? "s" : ""}{" "}
              generated
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Generate contract documents from project specifications. Fill in buyer
          details, then generate RFQ, SOW, or NDA templates.
        </p>

        <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-foreground">RFQ readiness score</p>
            <span
              className={cn(
                "text-xs font-semibold",
                rfqReadiness.totalScore >= 85
                  ? "text-status-success"
                  : rfqReadiness.totalScore >= 60
                    ? "text-status-warning"
                    : "text-status-error",
              )}
            >
              {rfqReadiness.totalScore}%
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                rfqReadiness.totalScore >= 85
                  ? "bg-status-success"
                  : rfqReadiness.totalScore >= 60
                    ? "bg-status-warning"
                    : "bg-status-error",
              )}
              style={{ width: `${rfqReadiness.totalScore}%` }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Generated: {rfqReadiness.generatedCount}/{modules.length} • Diagnostics: {rfqReadiness.diagnosticsComplete}/{modules.length} • Artifacts: {rfqReadiness.artifactComplete}/{modules.length} • Quote-ready: {rfqReadiness.quoteReadyModuleCount}/{modules.length}
          </p>
          {rfqReadiness.gaps.length > 0 && (
            <ul className="list-disc pl-4 space-y-1 text-[11px] text-muted-foreground">
              {rfqReadiness.gaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          )}
          {rfqReadiness.moduleDetails.some((module) => module.quoteReady === false) && (
            <div className="border-t pt-2 space-y-1">
              <p className="text-[11px] font-medium text-foreground">Module blockers</p>
              {rfqReadiness.moduleDetails
                .filter((module) => !module.quoteReady)
                .slice(0, 4)
                .map((module) => (
                  <p key={module.moduleId} className="text-[11px] text-muted-foreground">
                    {module.moduleName}: {module.generated ? "missing " : "not generated; missing "}
                    {module.missingArtifacts.join(", ")}
                  </p>
                ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border/70 bg-muted/30 p-3 space-y-2">
          <p className="text-xs font-semibold text-foreground">Procurement flow tracking</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {procurementFlow.map((step, index) => {
              const isActive = index <= currentStageIndex
              return (
                <span
                  key={step.key}
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-medium",
                    isActive
                      ? "border-status-success/40 bg-status-success-light text-status-success"
                      : "border-border bg-background text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
              )
            })}
          </div>
          {createdRfqId && (
            <p className="text-[11px] text-muted-foreground">
              RFQ <span className="font-mono">{createdRfqId.slice(0, 8)}…</span>
              {rfqStatus ? ` • Status: ${rfqStatus}` : ""}
              {rfqResponseCount > 0 ? ` • ${rfqResponseCount} response(s)` : ""}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-status-info/30 bg-status-info-light/20 p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold text-foreground">One-click supplier handoff</p>
            <p className="text-[11px] text-muted-foreground">
              Create a live Marketplace RFQ prefilled with module diagnostics and drawing artifacts.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              className="text-xs h-8"
              onClick={handleCreateMarketplaceRfq}
              disabled={isCreatingRfq || !canCreateRfq}
            >
              {isCreatingRfq ? "Creating RFQ..." : "Create Marketplace RFQ"}
            </Button>
            {createdRfqId && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-8"
                onClick={() => window.open(`/rfq/${createdRfqId}`, "_blank", "noopener,noreferrer")}
              >
                View RFQ
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}
          </div>
        </div>
        {!canCreateRfq && (
          <p className="text-[11px] text-status-warning -mt-1">
            {createRfqBlockedReason}
          </p>
        )}

        {createdRfqId && (
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-foreground">Suggested suppliers</p>
              <span className="text-[10px] text-muted-foreground">
                {isLoadingSuppliers ? "Refreshing…" : `${suggestedSuppliers.length} match(es)`}
              </span>
            </div>
            {suggestedSuppliers.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                No supplier matches yet. As responses arrive, this list will populate.
              </p>
            ) : (
              <div className="space-y-1.5">
                {suggestedSuppliers.map((supplier) => (
                  <div
                    key={supplier.provider_id}
                    className="flex items-start justify-between rounded-md border bg-background px-2.5 py-2"
                  >
                    <div>
                      <p className="text-xs font-medium text-foreground">
                        {supplier.full_name || "Unnamed supplier"}
                      </p>
                      {supplier.match_reasons.length > 0 && (
                        <p className="text-[10px] text-muted-foreground">
                          {supplier.match_reasons.slice(0, 2).join(" • ")}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] font-semibold text-status-info">
                      {supplier.match_score > 1
                        ? `${supplier.match_score.toFixed(0)}%`
                        : `${(supplier.match_score * 100).toFixed(0)}%`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Buyer details form */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="buyer-name" className="text-xs">
              Buyer / Company Name
            </Label>
            <Input
              id="buyer-name"
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              placeholder="Acme Corp"
              className="text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="deadline" className="text-xs">
              Quote Deadline
            </Label>
            <Input
              id="deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="special-terms" className="text-xs">
              Special Terms (optional)
            </Label>
            <Input
              id="special-terms"
              value={specialTerms}
              onChange={(e) => setSpecialTerms(e.target.value)}
              placeholder="ISO 9001 required, etc."
              className="text-sm"
            />
          </div>
        </div>

        {/* Document type cards */}
        <div className="space-y-2">
          {DOC_TYPES.map((doc) => {
            const Icon = doc.icon
            const isGenerated = generatedDocs.has(doc.id)
            const isExpanded = expandedDoc === doc.id
            const text = generatedDocs.get(doc.id)

            return (
              <div
                key={doc.id}
                className="border rounded-lg overflow-hidden"
              >
                {/* Doc header */}
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                        isGenerated
                          ? "bg-status-success-light"
                          : "bg-muted"
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4",
                          isGenerated
                            ? "text-status-success"
                            : "text-muted-foreground"
                        )}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {doc.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {doc.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isGenerated && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(doc.id)}
                        className="text-xs h-7"
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                      </Button>
                    )}
                    <Button
                      variant={isGenerated ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => handleGenerate(doc.id)}
                      className="text-xs h-7"
                    >
                      {isGenerated ? "Regenerate" : "Generate"}
                    </Button>
                    {isGenerated && (
                      <button
                        onClick={() =>
                          setExpandedDoc(isExpanded ? null : doc.id)
                        }
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded document preview */}
                {isExpanded && text && (
                  <div className="border-t p-4 bg-muted/10">
                    <pre className="text-xs font-mono whitespace-pre-wrap text-foreground max-h-[400px] overflow-auto">
                      {text}
                    </pre>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="text-[11px] text-muted-foreground border-t pt-3">
          Documents are templates populated from project data. Review and
          customise before sending to suppliers.
        </div>
      </CardContent>
    </Card>
  )
}
