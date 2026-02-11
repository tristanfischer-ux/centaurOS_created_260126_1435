/**
 * @file xray-v2-view.tsx — Main X-Ray v2 "Product Dossier" view
 *
 * @description Single-page scrollable product dossier that tells the story
 * of a product decomposition: idea → blueprint → architecture → modules →
 * timeline → risks → team → supply chain → diagnostic.
 *
 * Reuses the same server actions and services as X-Ray v1 but presents
 * information in a narrative-driven layout with prominent blueprint images.
 *
 * @related
 * - Server actions: src/actions/xray.ts
 * - Schema: src/app/(platform)/product-xray/services/xray-schema.ts
 */

"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"

import { typography } from "@/lib/design-system"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

import {
  scanIdeaAction,
  deriveProcessClassAction,
  updateScanSpecAction,
  matchPeopleAction,
  matchSuppliersAction,
  generateImagesAction,
} from "@/actions/xray"

import { ScanHero } from "./components/scan-hero"
import { SystemBlueprint } from "./components/system-blueprint"
import { ExecutiveDashboard } from "./components/executive-dashboard"
import { ArchitectureMap } from "./components/architecture-map"
import { ModuleExplorer } from "./components/module-explorer"
import { TimelineView } from "./components/timeline-view"
import { RiskRegister } from "./components/risk-register"
import { TeamMap } from "./components/team-map"
import { SupplyChain } from "./components/supply-chain"
import { DiagnosticCenter } from "./components/diagnostic-center"

import type { XRaySpec, ModuleSpec } from "../product-xray/services/xray-schema"
import type { PersonMatch } from "../product-xray/services/people"
import type { SupplierMatch } from "../product-xray/services/suppliers"

// ─── localStorage persistence ─────────────────────────────────────────

const STORAGE_KEY = "xray-v2-workbench-state"

interface PersistedState {
  spec: XRaySpec
  scanId?: string
  savedAt: string
}

function readPersistedState(): PersistedState | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedState
    if (parsed && typeof parsed.spec === "object") return parsed
    return null
  } catch {
    console.warn("[XRayV2] Failed to parse persisted state, starting fresh.")
    return null
  }
}

function writePersistedState(state: PersistedState): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    console.warn("[XRayV2] Failed to persist state:", error instanceof Error ? error.message : "Unknown")
  }
}

// ─── Empty spec factory ───────────────────────────────────────────────

function newEmptySpec(idea: string): XRaySpec {
  return { idea, function: "", assumptions: [], materials: [], processes: [], validation: [], modules: [] }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function findGatingModule(modules: ModuleSpec[]): ModuleSpec | undefined {
  return modules.find((m) => m.isGatingModule) ?? modules.find((m) => m.id === "react")
}

function isGatingDiagComplete(spec: XRaySpec): boolean {
  const gating = findGatingModule(spec.modules)
  if (!gating) return true
  if (gating.diagnostic?.derivedProcessClass) return true
  return false
}

// ─── Main view ────────────────────────────────────────────────────────

/**
 * XRayV2View — The Product Dossier.
 *
 * @description Orchestrates the full X-Ray v2 page: scan workflow,
 * state management, image generation, people/supplier matching,
 * and renders all dossier sections in narrative order.
 */
export function XRayV2View(): React.ReactNode {
  const [spec, setSpecInternal] = useState<XRaySpec>(() => newEmptySpec(""))
  const [scanId, setScanId] = useState<string | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [isGeneratingImages, setIsGeneratingImages] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)

  // People / supplier matching state
  const [people, setPeople] = useState<PersonMatch[]>([])
  const [isPeopleLoading, setIsPeopleLoading] = useState(false)
  const [suppliersByModule, setSuppliersByModule] = useState<Record<string, SupplierMatch[]>>({})
  const [isSuppliersLoading, setIsSuppliersLoading] = useState(false)

  const specRef = useRef<XRaySpec | null>(null)

  // Persist on every spec change
  const setSpec = useCallback((next: XRaySpec) => {
    setSpecInternal(next)
    specRef.current = next
    writePersistedState({ spec: next, scanId: scanId ?? undefined, savedAt: new Date().toISOString() })
  }, [scanId])

  // Restore from localStorage
  useEffect(() => {
    const persisted = readPersistedState()
    if (persisted) {
      setSpecInternal(persisted.spec)
      specRef.current = persisted.spec
      if (persisted.scanId) setScanId(persisted.scanId)
    }
    setIsHydrated(true)
  }, [])

  // Persist scanId changes
  useEffect(() => {
    if (!isHydrated || !specRef.current) return
    writePersistedState({ spec: specRef.current, scanId: scanId ?? undefined, savedAt: new Date().toISOString() })
  }, [scanId, isHydrated])

  // ── Persist spec to DB when scanId exists ───────────────────────────
  const persistSpec = useCallback(async (nextSpec: XRaySpec): Promise<void> => {
    if (!scanId) return
    try {
      await updateScanSpecAction(scanId, nextSpec)
    } catch (error) {
      console.warn("[XRayV2] Failed to persist spec:", error instanceof Error ? error.message : "Unknown")
    }
  }, [scanId])

  // ── Scan ────────────────────────────────────────────────────────────
  const handleScan = useCallback(async (idea: string): Promise<void> => {
    const trimmed = (idea || "").trim() || "New machine concept"
    setIsScanning(true)
    try {
      const result = await scanIdeaAction(trimmed)
      if ("error" in result) { toast.error(result.error); return }
      setScanId(result.scanId)
      setSpec(result.spec)
      toast.success(`Scan complete: ${result.spec.modules.length} modules identified`)

      // Trigger image generation in background
      setIsGeneratingImages(true)
      toast.info("Generating AI blueprint images...")
      generateImagesAction(result.scanId)
        .then((imgResult) => {
          if ("spec" in imgResult) {
            setSpec(imgResult.spec)
            const successCount = imgResult.spec.modules.filter(m => m.imageStatus === "complete").length
            if (successCount > 0) toast.success(`Generated ${successCount}/${imgResult.spec.modules.length} blueprint images`)
            if (imgResult.spec.systemImageStatus === "complete") toast.success("System diagram generated")
          } else {
            toast.error(imgResult.error || "Image generation failed")
          }
        })
        .catch((err) => {
          toast.error("Image generation failed")
          console.error("[XRayV2] Image error:", err)
        })
        .finally(() => setIsGeneratingImages(false))
    } catch (error) {
      toast.error("Scan failed. Check that OPENAI_API_KEY is configured.")
      console.error("[XRayV2] Scan error:", error instanceof Error ? error.message : "Unknown")
    } finally {
      setIsScanning(false)
    }
  }, [setSpec])

  // ── Generate images manually ────────────────────────────────────────
  const handleGenerateImages = useCallback((): void => {
    if (!scanId) { toast.error("Scan first"); return }
    setIsGeneratingImages(true)
    toast.info("Generating AI blueprint images...")
    generateImagesAction(scanId)
      .then((imgResult) => {
        if ("spec" in imgResult) {
          setSpec(imgResult.spec)
          const successCount = imgResult.spec.modules.filter(m => m.imageStatus === "complete").length
          if (successCount > 0) toast.success(`Generated ${successCount} blueprint images`)
          if (imgResult.spec.systemImageStatus === "complete") toast.success("System diagram generated")
        } else {
          toast.error(imgResult.error || "Image generation failed")
        }
      })
      .catch((err) => {
        toast.error("Image generation failed")
        console.error("[XRayV2] Image error:", err)
      })
      .finally(() => setIsGeneratingImages(false))
  }, [scanId, setSpec])

  // ── Diagnostic ──────────────────────────────────────────────────────
  const handleDeriveProcessClass = useCallback(async (moduleId: string, answers: Record<string, string>): Promise<void> => {
    if (!scanId) return
    try {
      const result = await deriveProcessClassAction(scanId, moduleId, answers)
      if ("error" in result) { toast.error(result.error); return }
      setSpec(result.spec)
      toast.success("Process class derived")
    } catch (error) {
      toast.error("Failed to derive process class")
      console.error("[XRayV2] Diagnostic error:", error instanceof Error ? error.message : "Unknown")
    }
  }, [scanId, setSpec])

  // ── Module update (interview / diagnostic save) ─────────────────────
  const handleModuleUpdate = useCallback((updated: ModuleSpec): void => {
    const next = { ...spec, modules: spec.modules.map((m) => (m.id === updated.id ? updated : m)) }
    setSpec(next)
    persistSpec(next)
  }, [spec, setSpec, persistSpec])

  // ── People matching ─────────────────────────────────────────────────
  const loadPeople = useCallback((forceRefresh = false): void => {
    if (spec.modules.length === 0) return
    setIsPeopleLoading(true)
    matchPeopleAction(scanId, spec.modules, forceRefresh)
      .then((result) => {
        if ("people" in result) setPeople(result.people)
        else console.error("[XRayV2] People error:", result.error)
      })
      .catch((err) => console.error("[XRayV2] People error:", err))
      .finally(() => setIsPeopleLoading(false))
  }, [scanId, spec.modules])

  // ── Supplier matching ───────────────────────────────────────────────
  const loadSuppliers = useCallback((forceRefresh = false): void => {
    const diagComplete = isGatingDiagComplete(spec)
    if (!diagComplete || spec.modules.length === 0) return
    setIsSuppliersLoading(true)
    matchSuppliersAction(scanId, spec.modules, diagComplete, forceRefresh)
      .then((result) => {
        if ("suppliersByModule" in result) setSuppliersByModule(result.suppliersByModule)
        else console.error("[XRayV2] Supplier error:", result.error)
      })
      .catch((err) => console.error("[XRayV2] Supplier error:", err))
      .finally(() => setIsSuppliersLoading(false))
  }, [scanId, spec])

  // ── Supplier assignment ─────────────────────────────────────────────
  const handleAssignSupplier = useCallback((moduleId: string, supplierName: string): void => {
    const next = { ...spec, modules: spec.modules.map((m) => (m.id === moduleId ? { ...m, supplier: supplierName } : m)) }
    setSpec(next)
    persistSpec(next)
  }, [spec, setSpec, persistSpec])

  // Auto-load people/suppliers when modules change
  useEffect(() => {
    if (!isHydrated || spec.modules.length === 0) return
    loadPeople(false)
    if (isGatingDiagComplete(spec)) loadSuppliers(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, spec.modules.length])

  const hasModules = spec.modules.length > 0
  const diagComplete = isGatingDiagComplete(spec)

  if (!isHydrated) {
    return (
      <div className="space-y-8">
        <PageHeader />
        <div className="h-96 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading workbench...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <PageHeader />

      {/* Section 1: Scan Hero */}
      <ScanHero
        idea={spec.idea}
        functionStatement={spec.function}
        isScanning={isScanning}
        onScan={handleScan}
        onIdeaChange={(idea) => setSpec({ ...spec, idea })}
      />

      {isScanning && <ScanningPlaceholder />}

      {!isScanning && hasModules && (
        <>
          {/* Section 2: System Blueprint (Hero Image) */}
          <SystemBlueprint
            systemImageUrl={spec.systemImageUrl}
            systemImageStatus={spec.systemImageStatus}
            isGeneratingImages={isGeneratingImages}
            hasImages={spec.modules.some(m => m.imageStatus === "complete")}
            onGenerateImages={handleGenerateImages}
            canGenerate={!!scanId}
          />

          {/* Section 3: Executive Dashboard */}
          <ExecutiveDashboard spec={spec} />

          {/* Section 4: Architecture Map */}
          <ArchitectureMap spec={spec} />

          {/* Section 5: Module Explorer (with blueprint images) */}
          <ModuleExplorer
            spec={spec}
            onModuleUpdate={handleModuleUpdate}
            scanId={scanId}
            onDeriveProcessClass={handleDeriveProcessClass}
          />

          {/* Section 6: Timeline */}
          <TimelineView spec={spec} />

          {/* Section 7: Risk Register */}
          <RiskRegister spec={spec} />

          {/* Section 8: Team Map */}
          <TeamMap
            spec={spec}
            people={people}
            isPeopleLoading={isPeopleLoading}
            onRefreshPeople={() => loadPeople(true)}
          />

          {/* Section 9: Supply Chain */}
          <SupplyChain
            spec={spec}
            diagComplete={diagComplete}
            suppliersByModule={suppliersByModule}
            isSuppliersLoading={isSuppliersLoading}
            onRefreshSuppliers={() => loadSuppliers(true)}
            onAssignSupplier={handleAssignSupplier}
          />

          {/* Section 10: Diagnostic Center */}
          <DiagnosticCenter
            spec={spec}
            scanId={scanId}
            onModuleUpdate={handleModuleUpdate}
            onDeriveProcessClass={handleDeriveProcessClass}
          />
        </>
      )}
    </div>
  )
}

// ─── Page Header ─────────────────────────────────────────────────────

function PageHeader(): React.ReactNode {
  return (
    <div className="pb-4 border-b border-muted">
      <div className={typography.pageHeader}>
        <div className={typography.pageHeaderAccent} />
        <h1 className={typography.h1}>Product X-Ray</h1>
      </div>
      <p className={cn(typography.pageSubtitle, "mt-1")}>
        AI-powered product decomposition — scan an idea into a buildable engineering dossier.
      </p>
    </div>
  )
}

// ─── Scanning Placeholder ────────────────────────────────────────────

function ScanningPlaceholder(): React.ReactNode {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-[300px] rounded-xl bg-muted/40 flex items-center justify-center">
        <p className="text-sm text-muted-foreground font-medium">Scanning your idea with AI...</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-muted/30" />
        ))}
      </div>
      <div className="h-48 rounded-xl bg-muted/30" />
    </div>
  )
}
