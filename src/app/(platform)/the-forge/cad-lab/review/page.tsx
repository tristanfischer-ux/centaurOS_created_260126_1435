"use client"

/**
 * @file review/page.tsx — The Forge: Review stage (Stage 3).
 *
 * @description Complete factory-ready review package with engineering documentation,
 * DFM analysis, diagnostics, supply chain specifications, cost estimates,
 * BOM, raw materials breakdown, supplier mapping, expert discipline matching,
 * factory conversation guide, and contracting (RFQ/SOW/NDA).
 *
 * Always accessible — shows a progressive welcome state when no data exists yet.
 */

import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import {
  ClipboardCheck,
  ArrowLeft,
  CheckCircle2,
  Download,
  Box,
  ChevronDown,
  ChevronRight,
  Layers,
  FileText,
  Ruler,
  Scale,
  AlertTriangle,
  HelpCircle,
} from "lucide-react"

import { FORGE_ROUTES } from "@/lib/forge-routes"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import { CadLabReviewPackage } from "@/components/cad/cad-lab-review-package"
import { CadLabPeople } from "@/components/cad/cad-lab-people"
import { CadLabDrawingPackage } from "@/components/cad/cad-lab-drawing-package"
import { CadLabAnalysisDashboard } from "@/components/cad/cad-lab-analysis-dashboard"
import { CadLabDiagnostics } from "@/components/cad/cad-lab-diagnostics"
import { CadLabSupplyChain } from "@/components/cad/cad-lab-supply-chain"
import { CadLabCostEstimate } from "@/components/cad/cad-lab-cost-estimate"
import { CadLabContracting } from "@/components/cad/cad-lab-contracting"
import { CadLabFactoryGuide } from "@/components/cad/cad-lab-factory-guide"
import { CadLabRequirementsMap } from "@/components/cad/cad-lab-requirements-map"
import { CadLabBom } from "@/components/cad/cad-lab-bom"
import { CadLabRawMaterials } from "@/components/cad/cad-lab-raw-materials"
import { CadLabTimeline } from "@/components/cad/cad-lab-timeline"
import { CadLabRiskRegister } from "@/components/cad/cad-lab-risk-register"
import { CadLabExecutiveSummary } from "@/components/cad/cad-lab-executive-summary"
import { useRegisterScreenContext } from "@/contexts/screen-context"
import { AskSpecialistButton } from "@/components/specialists/ask-specialist-button"

import { matchCadLabModuleSuppliers } from "@/actions/cad-lab-supplier-match"
import type { CadLabSupplierMatch } from "@/actions/cad-lab-supplier-match"
import type { CadLabResult } from "@/lib/cad-lab-types"
import { useCadLab } from "../cad-lab-context"

export default function CadLabReviewPage(): React.ReactNode {
  const router = useRouter()
  const {
    modules, generatedModuleCount, subject, hasResearch,
    editableReport, diagnosticAnswers, setDiagnosticAnswers,
    aiPrefilled, designBrief, assumptionNotes,
    activeProjectId, linkedRfqId,
    systemIllustrationUrl, researchResult,
    handleDownload,
  } = useCadLab()

  const [showBuildContext, setShowBuildContext] = useState(false)
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null)

  useRegisterScreenContext(
    useMemo(() => {
      const parts: string[] = [`Viewing the Review stage for "${subject}".`]
      parts.push(`Supplier-ready documentation for ${modules.length} modules (${generatedModuleCount} generated).`)
      // Diagnostics completion
      const diagTotal = modules.length * 6 // 6 diagnostic categories per module
      const diagCompleted = diagnosticAnswers
        ? Object.values(diagnosticAnswers).reduce((s, ma) => s + (ma ? Object.keys(ma).length : 0), 0)
        : 0
      if (diagTotal > 0) parts.push(`Diagnostics: ${diagCompleted}/${diagTotal} completed.`)
      // DFM issues summary
      const dfmIssueCount = modules.reduce((s, m) => {
        const r = m.result as CadLabResult | undefined
        return s + (r?.dfm?.issues?.length ?? 0)
      }, 0)
      if (dfmIssueCount > 0) parts.push(`${dfmIssueCount} DFM issues across all modules.`)
      // RFQ status
      parts.push(linkedRfqId ? "RFQ linked to project." : "No RFQ linked yet.")
      // Design brief parameters
      const briefParts: string[] = []
      if (designBrief.useCase) briefParts.push(`Use case: ${designBrief.useCase}`)
      if (designBrief.targetProcess) briefParts.push(`Process: ${designBrief.targetProcess}`)
      if (designBrief.targetMaterial) briefParts.push(`Material: ${designBrief.targetMaterial}`)
      if (briefParts.length > 0) parts.push(`Design brief: ${briefParts.join(", ")}.`)
      return {
        pageTitle: `The Forge — Review: ${subject}`,
        summary: parts.join(" "),
        entities: modules.slice(0, 15).map((m) => ({
          type: "module",
          title: m.name,
          status: m.status === "generated" ? "CAD generated" : "pending",
        })),
      }
    }, [subject, modules, generatedModuleCount, diagnosticAnswers, linkedRfqId, designBrief]),
  )

  // INTENT: Progressive disclosure — Review is always accessible, but shows
  // a welcome card when no data exists yet instead of blocking the page.
  const hasAnyData = modules.length > 0 || hasResearch || !!researchResult

  // ── Tab navigation state ──
  const TAB_GROUPS = useMemo(() => [
    {
      group: "Engineering",
      sections: [
        { id: "review-package", label: "Review" },
        { id: "dfm-analysis", label: "DFM" },
        { id: "risk-register", label: "Risks" },
      ],
    },
    {
      group: "Manufacturing",
      sections: [
        { id: "diagnostics", label: "Diagnostics" },
        { id: "requirements-map", label: "Requirements" },
        { id: "bill-of-materials", label: "BOM" },
        { id: "raw-materials", label: "Materials" },
      ],
    },
    {
      group: "Commercial",
      sections: [
        { id: "cost-estimate", label: "Cost" },
        { id: "supply-chain", label: "Supply Chain" },
        { id: "timeline", label: "Timeline" },
      ],
    },
    {
      group: "Engagement",
      sections: [
        { id: "experts", label: "Experts" },
        { id: "factory-guide", label: "Factory" },
        { id: "contracting", label: "Contracts" },
      ],
    },
    {
      group: "Exports",
      sections: [
        { id: "drawing-exports", label: "Exports" },
      ],
    },
  ], [])

  // ── I1: Tab state from URL ──
  const searchParams = useSearchParams()
  const validTabs = useMemo(() => TAB_GROUPS.map((g) => g.group), [TAB_GROUPS])
  const [activeTab, setActiveTab] = useState(() => {
    const param = searchParams.get("tab")
    return param && validTabs.includes(param) ? param : "Engineering"
  })
  const [activeSubSection, setActiveSubSection] = useState<string | null>(null)
  const tabContentRef = useRef<HTMLDivElement>(null)

  // ── B4: Supplier matching state (lifted from CadLabSupplyChain) ──
  const [supplierMatches, setSupplierMatches] = useState<Map<string, CadLabSupplierMatch[]>>(new Map())
  const [loadingModules, setLoadingModules] = useState<Set<string>>(new Set())
  const [matchAllLoading, setMatchAllLoading] = useState(false)

  const handleMatchModule = useCallback(async (mod: { id: string; name: string; purpose: string; keyParts: string[]; description?: string }) => {
    const diag = diagnosticAnswers?.[mod.id] || {}
    setLoadingModules((prev) => new Set(prev).add(mod.id))
    try {
      const results = await matchCadLabModuleSuppliers({
        id: mod.id,
        name: mod.name,
        purpose: mod.purpose,
        keyParts: mod.keyParts,
        description: mod.description,
        process: diag.mfg_process || null,
        material: diag.material || null,
      })
      setSupplierMatches((prev) => new Map(prev).set(mod.id, results))
    } catch (err) {
      console.error("[SupplierMatch] Failed:", err)
      toast.error("Failed to match suppliers for this module")
    } finally {
      setLoadingModules((prev) => {
        const next = new Set(prev)
        next.delete(mod.id)
        return next
      })
    }
  }, [diagnosticAnswers])

  const handleMatchAll = useCallback(async () => {
    setMatchAllLoading(true)
    await Promise.allSettled(modules.map((mod) => handleMatchModule(mod)))
    setMatchAllLoading(false)
  }, [modules, handleMatchModule])

  // Active tab's sections for sub-nav
  const activeTabGroup = useMemo(
    () => TAB_GROUPS.find((g) => g.group === activeTab),
    [TAB_GROUPS, activeTab],
  )

  const handleTabClick = useCallback((group: string) => {
    setActiveTab(group)
    setActiveSubSection(null)
    // Sync tab to URL without pushing history
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", group)
    router.replace(`?${params.toString()}`, { scroll: false })
    // Scroll to top of tab content
    tabContentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [router, searchParams])

  const handleSubSectionClick = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

  // Track active sub-section within current tab via IntersectionObserver
  useEffect(() => {
    if (!activeTabGroup) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSubSection(entry.target.id)
          }
        }
      },
      { rootMargin: "-20% 0px -70% 0px" },
    )
    for (const section of activeTabGroup.sections) {
      const el = document.getElementById(section.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [activeTabGroup])

  return (
    <div className="space-y-6">
      {/* Stage header */}
      <div id="review-header" className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="h-5 w-5 text-international-orange" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">Review Package</h2>
            <p className="text-xs text-muted-foreground">
              Supplier-ready documentation for {modules.length} modules
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground mr-0.5">Get advice:</span>
          <AskSpecialistButton
            context={{
              type: "general",
              title: subject,
              description: "Product in Review stage — DFM analysis and diagnostics",
              metadata: {
                status: `${generatedModuleCount}/${modules.length} modules generated`,
                notes: [
                  `${modules.reduce((s, m) => s + ((m.result as CadLabResult | undefined)?.dfm?.issues?.length ?? 0), 0)} DFM issues`,
                  Object.keys(diagnosticAnswers ?? {}).length > 0 && `Diagnostics: ${Object.keys(diagnosticAnswers ?? {}).length} modules answered`,
                ].filter(Boolean).join(". "),
              },
            }}
            specialistId="vp-manufacturing"
            specialistName="Fang"
            variant="chip"
            label="Manufacturing"
          />
          <AskSpecialistButton
            context={{
              type: "general",
              title: subject,
              description: "Product in Review stage — supplier selection, procurement, and cost",
              metadata: {
                status: `${generatedModuleCount} modules ready for supplier matching`,
                notes: [
                  `${modules.length} sub-assemblies`,
                  linkedRfqId ? "RFQ linked" : "No RFQ linked yet",
                ].filter(Boolean).join(". "),
              },
            }}
            specialistId="vp-supply-chain"
            specialistName="Chase"
            variant="chip"
            label="Supply Chain"
          />
          <AskSpecialistButton
            context={{
              type: "general",
              title: subject,
              description: "Product in Review stage — architecture review",
              metadata: {
                status: `${generatedModuleCount}/${modules.length} modules generated`,
                notes: `Reviewing engineering package for "${subject}" with ${modules.length} sub-assemblies.`,
              },
            }}
            specialistId="cto"
            specialistName="Max"
            variant="chip"
            label="Architecture"
          />
          <Button variant="ghost" size="sm" onClick={() => router.push(FORGE_ROUTES.cadLabBuild)} className="gap-1.5 text-xs">
            <ArrowLeft className="h-3 w-3" /> Back to Build
          </Button>
        </div>
      </div>

      {/* Welcome state when no data exists yet */}
      {!hasAnyData && (
        <Card>
          <CardContent className="pt-6">
            <EmptyState
              title="Your Review Dashboard"
              description="This dashboard will populate with BOM, cost breakdowns, supplier mapping, and rich visualizations as you progress through Concept and Build. Start by describing your product."
              action={
                <Button onClick={() => router.push(FORGE_ROUTES.cadLab)} className="gap-1.5">
                  <Box className="h-4 w-4" />
                  Go to Concept
                </Button>
              }
            />
          </CardContent>
        </Card>
      )}

      {/* ── Tab navigation ── */}
      {hasAnyData && (
        <nav className="sticky top-0 z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-2 bg-background border-b border-border overflow-x-auto">
          {/* Group tab pills */}
          <div className="flex items-center gap-1">
            {TAB_GROUPS.map((group) => (
              <button
                key={group.group}
                onClick={() => handleTabClick(group.group)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                  activeTab === group.group
                    ? "bg-international-orange-light text-international-orange"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {group.group}
              </button>
            ))}
          </div>
          {/* Sub-section pills within active tab */}
          {activeTabGroup && (
            <div className="flex items-center gap-0.5 mt-1">
              {activeTabGroup.sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => handleSubSectionClick(section.id)}
                  className={`px-2 py-1 text-xs rounded-md whitespace-nowrap transition-colors ${
                    activeSubSection === section.id
                      ? "text-international-orange font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  {section.label}
                </button>
              ))}
            </div>
          )}
        </nav>
      )}

      {/* ── Project Overview — system context + key metrics merged into one card ── */}
      <Card id="executive-summary" className="overflow-hidden">
        <div className="flex items-start gap-4 p-5">
          {/* System illustration thumbnail */}
          {systemIllustrationUrl && (
            <div className="w-24 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0 hidden sm:block border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={systemIllustrationUrl} alt="System overview" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-foreground">{subject}</h3>
            <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Layers className="h-3 w-3" /> {modules.length} modules
              </span>
              <span className="flex items-center gap-1">
                <Box className="h-3 w-3" /> {generatedModuleCount} generated
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-status-success" /> {modules.reduce((s, m) => s + m.keyParts.length, 0)} components
              </span>
              {researchResult?.sources && (
                <span className="flex items-center gap-1">
                  <FileText className="h-3 w-3" /> {researchResult.sources.length} research sources
                </span>
              )}
            </div>
          </div>
        </div>
        {/* Executive metrics row */}
        {modules.length > 0 && (
          <div className="px-5 pb-5 border-t pt-4">
            <CadLabExecutiveSummary modules={modules} diagnosticAnswers={diagnosticAnswers} projectName={subject} bare />
          </div>
        )}
        {/* Collapsible: module overview with expandable detail cards */}
        <button
          onClick={() => setShowBuildContext(!showBuildContext)}
          className="flex items-center justify-between w-full px-5 py-2.5 border-t text-left hover:bg-muted/50 transition-colors"
        >
          <span className="text-xs font-medium text-muted-foreground">Module Overview</span>
          {showBuildContext
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          }
        </button>
        {showBuildContext && (
          <div className="px-5 pb-4 space-y-2 border-t pt-3">
            {modules.map((mod) => {
              const isExpanded = expandedModuleId === mod.id
              const r = mod.result as CadLabResult | undefined
              return (
                <div key={mod.id} className="rounded border border-muted overflow-hidden">
                  {/* Module row — clickable to expand */}
                  <button
                    onClick={() => setExpandedModuleId(isExpanded ? null : mod.id)}
                    className="flex items-center gap-3 text-xs p-2 w-full text-left hover:bg-muted/30 transition-colors"
                  >
                    {mod.imageUrl && mod.imageStatus === "complete" && (
                      <div className="h-12 w-12 rounded overflow-hidden bg-muted flex-shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={mod.imageUrl} alt="" className="h-full w-full object-cover" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground truncate">{mod.name}</p>
                      <p className="text-muted-foreground truncate">{mod.purpose}</p>
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      mod.status === "generated"
                        ? "bg-status-success-light text-status-success"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {mod.status === "generated" ? "CAD done" : mod.status}
                    </span>
                    {mod.result?.bbox && (
                      <span className="text-muted-foreground font-mono hidden sm:inline">
                        {mod.result.bbox.xLen}×{mod.result.bbox.yLen}×{mod.result.bbox.zLen}mm
                      </span>
                    )}
                    {isExpanded
                      ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    }
                  </button>

                  {/* Expanded detail panel */}
                  {isExpanded && (
                    <div className="border-t p-3 space-y-3 bg-muted/10">
                      {/* CAD isometric view — prefer persisted svgUrls, fall back to result data URI */}
                      {(mod.svgUrls?.iso || r?.svgIso) && (
                        <div className="w-full h-48 rounded-md bg-muted/30 border border-muted overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={mod.svgUrls?.iso ?? r?.svgIso} alt={`${mod.name} isometric`} className="w-full h-full object-contain" />
                        </div>
                      )}

                      {/* Key parts chips */}
                      {mod.keyParts.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {mod.keyParts.map((part, i) => (
                            <span key={i} className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-foreground">
                              {part}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Dimensions, mass, DFM status */}
                      {r && (
                        <div className="flex flex-wrap items-center gap-3 text-xs">
                          {r.bbox && (
                            <span className="flex items-center gap-1 text-foreground">
                              <Ruler className="h-3 w-3 text-muted-foreground" />
                              {r.bbox.xLen.toFixed(0)}×{r.bbox.yLen.toFixed(0)}×{r.bbox.zLen.toFixed(0)} mm
                            </span>
                          )}
                          {r.massGrams != null && (
                            <span className="flex items-center gap-1 text-foreground">
                              <Scale className="h-3 w-3 text-muted-foreground" />
                              {r.massGrams.toFixed(1)} g
                            </span>
                          )}
                          {r.dfm && (() => {
                            const process = diagnosticAnswers?.[mod.id]?.mfg_process
                            const isPrint = !process || process.startsWith("FDM") || process.startsWith("SLA") || process.startsWith("SLS")
                            if (!isPrint) return null
                            return (
                              <span className={`flex items-center gap-1 ${r.dfm.printable ? "text-status-success" : "text-status-warning"}`}>
                                {r.dfm.printable
                                  ? <CheckCircle2 className="h-3 w-3" />
                                  : <AlertTriangle className="h-3 w-3" />
                                }
                                {r.dfm.printable ? "Printable" : `${r.dfm.issues.length} DFM issues`}
                              </span>
                            )
                          })()}
                        </div>
                      )}

                      {/* Description */}
                      {mod.description && (
                        <p className="text-xs text-muted-foreground leading-relaxed">{mod.description}</p>
                      )}

                      {/* Failure modes & unknowns (first 3, collapsible) */}
                      {(mod.failureModes.length > 0 || mod.unknowns.length > 0) && (
                        <div className="space-y-1.5">
                          {mod.failureModes.slice(0, 3).map((fm, i) => (
                            <div key={`fm-${i}`} className="flex items-start gap-1.5 text-[11px] text-status-warning">
                              <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                              <span>{fm}</span>
                            </div>
                          ))}
                          {mod.unknowns.slice(0, 3).map((u, i) => (
                            <div key={`u-${i}`} className="flex items-start gap-1.5 text-[11px] text-status-info">
                              <HelpCircle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                              <span>{u}</span>
                            </div>
                          ))}
                          {(mod.failureModes.length > 3 || mod.unknowns.length > 3) && (
                            <p className="text-[10px] text-muted-foreground">
                              +{Math.max(0, mod.failureModes.length - 3) + Math.max(0, mod.unknowns.length - 3)} more
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* ── Tab content ── */}
      <div ref={tabContentRef} className="space-y-6">
        <AnimatePresence mode="wait">
          {/* Engineering tab */}
          {activeTab === "Engineering" && (
            <motion.div key="Engineering" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
              <div id="review-package">
                <p className="text-[11px] text-muted-foreground mb-2">Analysis carried forward from Build stage</p>
                <CadLabReviewPackage modules={modules} projectName={subject} researchReport={editableReport} diagnosticAnswers={diagnosticAnswers} />
              </div>
              <div id="dfm-analysis">
                <p className="text-[11px] text-muted-foreground mb-2">Analysis carried forward from Build stage</p>
                <CadLabAnalysisDashboard modules={modules} projectName={subject} diagnosticAnswers={diagnosticAnswers} />
              </div>
              <div id="risk-register">
                <CadLabRiskRegister modules={modules} />
              </div>
            </motion.div>
          )}

          {/* Manufacturing tab */}
          {activeTab === "Manufacturing" && (
            <motion.div key="Manufacturing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
              <div id="diagnostics">
                <CadLabDiagnostics
                  modules={modules}
                  answers={diagnosticAnswers}
                  onAnswersChange={setDiagnosticAnswers}
                  aiPrefilled={aiPrefilled}
                  designBrief={designBrief}
                />
              </div>
              <div id="requirements-map">
                <CadLabRequirementsMap modules={modules} diagnosticAnswers={diagnosticAnswers} />
              </div>
              <div id="bill-of-materials">
                <CadLabBom modules={modules} diagnosticAnswers={diagnosticAnswers} projectName={subject} />
                {modules.length > 0 && (
                  <div className="mt-3 flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 gap-1.5"
                      onClick={() => router.push(FORGE_ROUTES.cadLabPartsBom)}
                    >
                      <Layers className="h-3 w-3" />
                      View Structured BOM
                    </Button>
                  </div>
                )}
              </div>
              <div id="raw-materials">
                <CadLabRawMaterials modules={modules} diagnosticAnswers={diagnosticAnswers} />
              </div>
            </motion.div>
          )}

          {/* Commercial tab */}
          {activeTab === "Commercial" && (
            <motion.div key="Commercial" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
              <div id="cost-estimate">
                <CadLabCostEstimate modules={modules} diagnosticAnswers={diagnosticAnswers} />
              </div>
              <div id="supply-chain">
                <CadLabSupplyChain
                  modules={modules}
                  diagnosticAnswers={diagnosticAnswers}
                  supplierMatches={supplierMatches}
                  loadingModules={loadingModules}
                  matchAllLoading={matchAllLoading}
                  onMatchModule={handleMatchModule}
                  onMatchAll={handleMatchAll}
                />
              </div>
              <div id="timeline">
                <CadLabTimeline modules={modules} />
              </div>
            </motion.div>
          )}

          {/* Engagement tab */}
          {activeTab === "Engagement" && (
            <motion.div key="Engagement" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-6">
              <div id="experts">
                <p className="text-[11px] text-muted-foreground mb-2">Specialist matching based on Build modules</p>
                <CadLabPeople modules={modules} diagnosticAnswers={diagnosticAnswers} />
              </div>
              <div id="factory-guide">
                <CadLabFactoryGuide modules={modules} diagnosticAnswers={diagnosticAnswers} />
              </div>
              <div id="contracting">
                <CadLabContracting
                  modules={modules}
                  projectName={subject}
                  diagnosticAnswers={diagnosticAnswers}
                  projectId={activeProjectId}
                  linkedRfqId={linkedRfqId}
                  designBrief={designBrief}
                  assumptionNotes={assumptionNotes}
                />
              </div>
            </motion.div>
          )}

          {/* Exports tab */}
          {activeTab === "Exports" && (
            <motion.div key="Exports" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <div id="drawing-exports">
                <CadLabDrawingPackage modules={modules} projectName={subject} diagnosticAnswers={diagnosticAnswers} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Pipeline Complete */}
      <Card className="border-status-success/30 bg-gradient-to-r from-status-success-light/20 to-background">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-status-success-light">
                <CheckCircle2 className="h-5 w-5 text-status-success" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Pipeline Complete
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Your engineering package for &quot;{subject}&quot; is ready. Copy the review package to share with stakeholders, or go back to Build to download STEP + STL files.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="default"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  for (const mod of modules) {
                    const r = mod.result as CadLabResult | undefined
                    if (!r) continue
                    if (r.stepData) handleDownload(`${mod.name}.step`, r.stepData, false)
                    else if (r.stepUrl) {
                      const link = document.createElement("a")
                      link.href = r.stepUrl
                      link.download = `${mod.name}.step`
                      link.click()
                    }
                    if (r.stlData) handleDownload(`${mod.name}.stl`, r.stlData, true)
                    else if (r.stlUrl) {
                      const link = document.createElement("a")
                      link.href = r.stlUrl
                      link.download = `${mod.name}.stl`
                      link.click()
                    }
                  }
                }}
              >
                <Download className="h-4 w-4" />
                Download All STEP + STL
              </Button>
              <Button variant="outline" onClick={() => router.push(FORGE_ROUTES.cadLabBuild)} className="gap-1.5">
                Back to Build
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
