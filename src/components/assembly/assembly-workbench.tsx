"use client"

/**
 * @file assembly-workbench.tsx — Main 3-panel workbench for the RPG assembly builder.
 *
 * @description The core experience: left catalog, center schematic, right stats.
 * Manages slot selection state, component assignment, and stat calculations.
 * Think of it like an RPG character equipment screen.
 *
 * @component
 * @example
 * <AssemblyWorkbench assemblyId="abc-123" />
 */

import { useState, useEffect, useCallback, useMemo, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Loader2,
  ArrowLeft,
  Save,
  Rocket,
  PoundSterling,
  ShieldCheck,
  Link2,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

import { ComponentCatalog } from "./component-catalog"
import { SchematicView } from "./schematic-view"
import { StatsPanel } from "./stats-panel"
import { SlotPopover } from "./slot-popover"

import {
  getAssembly,
  getComponentCatalog,
  assignComponentToSlot,
  removeComponentFromSlot,
  bridgeToCadLab,
  getAssemblyEnrichment,
} from "@/actions/assembly-builder"

import type {
  UserAssembly,
  CatalogComponent,
  CatalogStats,
  TemplateSlot,
  PlacedComponent,
  AssemblyEnrichment,
} from "@/actions/assembly-builder"

// ─── Props ───────────────────────────────────────────────────────────

interface AssemblyWorkbenchProps {
  /** The assembly ID to load and work on */
  assemblyId: string
}

// ─── Component ───────────────────────────────────────────────────────

/**
 * AssemblyWorkbench — The RPG-style assembly builder experience.
 *
 * @description Three-panel layout:
 * - Left: Component catalog (browse, search, filter)
 * - Center: 2D schematic with interactive slots
 * - Right: Live stats panel (weight, cost, power, BOM)
 *
 * Click a slot on the schematic to select it, then click a component
 * in the catalog to assign it. Stats update live.
 */
export function AssemblyWorkbench({
  assemblyId,
}: AssemblyWorkbenchProps): React.ReactNode {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Assembly state
  const [assembly, setAssembly] = useState<UserAssembly | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Catalog state
  const [components, setComponents] = useState<CatalogComponent[]>([])
  const [stats, setStats] = useState<CatalogStats>({
    total: 0,
    byTier: {},
    byCategory: {},
  })

  // Enrichment state (pricing, certs, compatibility from new tables)
  const [enrichment, setEnrichment] = useState<AssemblyEnrichment | null>(null)
  const [enrichmentLoading, setEnrichmentLoading] = useState(false)

  // Interaction state
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null)
  const [showSlotPopover, setShowSlotPopover] = useState(false)

  // ─── Load Data ───────────────────────────────────────────────────

  useEffect(() => {
    async function load(): Promise<void> {
      setIsLoading(true)
      try {
        const [assemblyResult, catalogResult] = await Promise.all([
          getAssembly(assemblyId),
          getComponentCatalog({ limit: 300 }),
        ])

        if ("error" in assemblyResult) {
          setError(assemblyResult.error)
          return
        }

        setAssembly(assemblyResult)
        setComponents(catalogResult.components)
        setStats(catalogResult.stats)
      } catch (err) {
        console.error("[AssemblyWorkbench] Failed to load:", err)
        setError("Failed to load assembly")
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [assemblyId])

  // ─── Fetch Enrichment Data ──────────────────────────────────────

  const placedNames = useMemo(
    () => (assembly?.placedComponents ?? []).map((p) => p.componentName).filter(Boolean),
    [assembly?.placedComponents],
  )

  useEffect(() => {
    if (placedNames.length === 0) {
      setEnrichment(null)
      return
    }

    let cancelled = false
    setEnrichmentLoading(true)

    void getAssemblyEnrichment(placedNames).then((result) => {
      if (cancelled) return
      setEnrichmentLoading(false)
      if ("error" in result) {
        console.warn("[AssemblyWorkbench] Enrichment fetch:", result.error)
        return
      }
      setEnrichment(result)
    })

    return () => {
      cancelled = true
    }
  }, [placedNames])

  // ─── Component Lookup Map ────────────────────────────────────────

  const componentLookup = useMemo(() => {
    const map = new Map<string, CatalogComponent>()
    for (const c of components) {
      map.set(c.slug, c)
    }
    return map
  }, [components])

  // ─── Active Slot ─────────────────────────────────────────────────

  const activeSlot = useMemo((): TemplateSlot | null => {
    if (!activeSlotId || !assembly) return null
    return assembly.slots.find((s) => s.id === activeSlotId) ?? null
  }, [activeSlotId, assembly])

  const activeSlotPlaced = useMemo((): PlacedComponent | null => {
    if (!activeSlotId || !assembly) return null
    return (
      assembly.placedComponents.find((p) => p.slotId === activeSlotId) ?? null
    )
  }, [activeSlotId, assembly])

  const activeSlotComponent = useMemo((): CatalogComponent | null => {
    if (!activeSlotPlaced?.geometryTypeSlug) return null
    return componentLookup.get(activeSlotPlaced.geometryTypeSlug) ?? null
  }, [activeSlotPlaced, componentLookup])

  // ─── Handlers ────────────────────────────────────────────────────

  const handleSlotClick = useCallback((slotId: string) => {
    setActiveSlotId((prev) => (prev === slotId ? null : slotId))
    setShowSlotPopover(true)
  }, [])

  const handleSelectComponent = useCallback(
    (component: CatalogComponent) => {
      if (!activeSlotId || !assembly) {
        toast.info("Select a slot on the schematic first")
        return
      }

      startTransition(async () => {
        const result = await assignComponentToSlot(
          assemblyId,
          activeSlotId,
          component.slug,
          component.name,
        )

        if ("error" in result) {
          toast.error(result.error)
          return
        }

        // Optimistic update
        setAssembly((prev) => {
          if (!prev) return prev
          const newPlaced = prev.placedComponents.filter(
            (p) => p.slotId !== activeSlotId,
          )
          newPlaced.push({
            id: `temp-${Date.now()}`,
            assemblyId,
            slotId: activeSlotId,
            geometryTypeSlug: component.slug,
            catalogueId: null,
            componentName: component.name,
            customParams: { slotId: activeSlotId },
            quantity: 1,
          })
          return { ...prev, placedComponents: newPlaced }
        })

        toast.success(`Assigned ${component.name} to slot`)
        setShowSlotPopover(false)
      })
    },
    [activeSlotId, assembly, assemblyId],
  )

  const handleRemoveComponent = useCallback(() => {
    if (!activeSlotId) return

    startTransition(async () => {
      const result = await removeComponentFromSlot(assemblyId, activeSlotId)

      if ("error" in result) {
        toast.error(result.error)
        return
      }

      // Optimistic update
      setAssembly((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          placedComponents: prev.placedComponents.filter(
            (p) => p.slotId !== activeSlotId,
          ),
        }
      })

      toast.success("Component removed")
      setShowSlotPopover(false)
    })
  }, [activeSlotId, assemblyId])

  const handleBrowseCompatible = useCallback(() => {
    setShowSlotPopover(false)
    // Slot is already active, catalog will auto-filter
  }, [])

  const handleClosePopover = useCallback(() => {
    setShowSlotPopover(false)
  }, [])

  // ─── Loading State ───────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-international-orange mx-auto" />
          <p className="text-sm text-muted-foreground">
            Loading assembly workbench...
          </p>
        </div>
      </div>
    )
  }

  if (error || !assembly) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <p className="text-sm text-destructive">{error ?? "Assembly not found"}</p>
          <Button variant="secondary" onClick={() => router.push("/the-forge/assembly-builder")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to templates
          </Button>
        </div>
      </div>
    )
  }

  // ─── Render ──────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/the-forge/assembly-builder")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {assembly.name}
            </h2>
            <p className="text-xs text-muted-foreground">
              {assembly.slots.length} slots ·{" "}
              {assembly.placedComponents.length} components placed
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
          >
            <Save className="h-3.5 w-3.5 mr-1.5" />
            Saved
          </Button>
          <Button
            size="sm"
            disabled={
              assembly.placedComponents.length === 0 || isPending
            }
            onClick={() => {
              startTransition(async () => {
                toast.info("Creating Forge project...")
                const result = await bridgeToCadLab(assemblyId)
                if ("error" in result) {
                  toast.error(result.error)
                  return
                }
                toast.success("Forge project created! Redirecting...")
                router.push("/the-forge/cad-lab")
              })
            }}
          >
            <Rocket className="h-3.5 w-3.5 mr-1.5" />
            Generate CAD
          </Button>
        </div>
      </div>

      {/* Three-panel layout */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Component Catalog */}
        <div className="w-72 border-r shrink-0 overflow-hidden">
          <ComponentCatalog
            components={components}
            stats={stats}
            activeSlot={activeSlot}
            onSelectComponent={handleSelectComponent}
          />
        </div>

        {/* Center: Schematic */}
        <div className="flex-1 relative bg-muted/20 overflow-hidden">
          <SchematicView
            slots={assembly.slots}
            placedComponents={assembly.placedComponents}
            activeSlotId={activeSlotId}
            onSlotClick={handleSlotClick}
            customSvg={assembly.schematicSvg}
          />

          {/* Slot popover overlay */}
          {showSlotPopover && activeSlot && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
              <SlotPopover
                slot={activeSlot}
                placedComponent={activeSlotPlaced}
                component={activeSlotComponent}
                onBrowse={handleBrowseCompatible}
                onRemove={handleRemoveComponent}
                onClose={handleClosePopover}
              />
            </div>
          )}

          {/* Hint when no slot selected */}
          {!activeSlotId && assembly.placedComponents.length === 0 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
              <p className="text-sm text-muted-foreground bg-background/90 rounded-full px-4 py-2 shadow-sm border">
                Click a slot on the schematic to start building
              </p>
            </div>
          )}
        </div>

        {/* Right: Stats Panel */}
        <div className="w-64 border-l shrink-0 overflow-hidden">
          <StatsPanel
            slots={assembly.slots}
            placedComponents={assembly.placedComponents}
            componentLookup={componentLookup}
            enrichment={enrichment}
            enrichmentLoading={enrichmentLoading}
          />
        </div>
      </div>

      {/* Cost Footer — live pricing from database */}
      <CostFooter
        placedComponents={assembly.placedComponents}
        componentLookup={componentLookup}
        enrichment={enrichment}
        enrichmentLoading={enrichmentLoading}
      />
    </div>
  )
}

// ─── Cost Footer ─────────────────────────────────────────────────────

/**
 * Persistent footer bar showing live pricing, certification summary,
 * and compatibility count from enrichment data.
 */
function CostFooter({
  placedComponents,
  componentLookup,
  enrichment,
  enrichmentLoading,
}: {
  placedComponents: PlacedComponent[]
  componentLookup: Map<string, CatalogComponent>
  enrichment: AssemblyEnrichment | null
  enrichmentLoading: boolean
}): React.ReactNode {
  if (placedComponents.length === 0) return null

  // Estimated cost from component catalog (embedded in geometry library)
  const estimatedTotal = placedComponents.reduce((sum, pc) => {
    if (!pc.geometryTypeSlug) return sum
    const comp = componentLookup.get(pc.geometryTypeSlug)
    const cost = (comp?.procurement?.typical_cost_gbp as number) ?? 0
    return sum + cost * pc.quantity
  }, 0)

  // Live cost from pricing table (lowest tier / MOQ=1 price)
  let liveCostAvailable = false
  let liveTotal = 0
  if (enrichment?.pricing?.length) {
    for (const pc of placedComponents) {
      const pricingRow = enrichment.pricing.find(
        (p) => p.component_name === pc.componentName,
      )
      if (pricingRow) {
        const tiers = Array.isArray(pricingRow.pricing_tiers)
          ? pricingRow.pricing_tiers
          : []
        // Take first tier's unit price
        const firstTier = tiers[0] as Record<string, unknown> | undefined
        const unitPrice =
          (firstTier?.unit_price as number) ??
          (firstTier?.price as number) ??
          0
        if (unitPrice > 0) {
          liveTotal += unitPrice * pc.quantity
          liveCostAvailable = true
        }
      }
    }
  }

  const certCount = enrichment?.certifications?.length ?? 0
  const compatCount = enrichment?.compatibility?.length ?? 0

  return (
    <div className="border-t px-4 py-2.5 bg-muted/30 flex items-center gap-6 text-xs shrink-0">
      {/* Estimated Cost */}
      <div className="flex items-center gap-2">
        <PoundSterling className="h-3.5 w-3.5 text-muted-foreground" />
        <div>
          <span className="text-muted-foreground">Est: </span>
          <span className="font-mono font-medium text-foreground">
            {estimatedTotal > 0 ? `£${estimatedTotal.toFixed(2)}` : "—"}
          </span>
        </div>
      </div>

      {/* Live Pricing (if available) */}
      {enrichmentLoading ? (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Loading market data...</span>
        </div>
      ) : liveCostAvailable ? (
        <div className="flex items-center gap-2">
          <div className="h-3 w-px bg-muted" />
          <span className="text-muted-foreground">Market: </span>
          <span className="font-mono font-medium text-international-orange">
            £{liveTotal.toFixed(2)}
          </span>
          <Badge variant="info" className="text-[9px] px-1.5 py-0">
            Live
          </Badge>
        </div>
      ) : null}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Certification count */}
      {certCount > 0 && (
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-status-success" />
          <span className="text-muted-foreground">
            {certCount} cert{certCount !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Compatibility count */}
      {compatCount > 0 && (
        <div className="flex items-center gap-1.5">
          <Link2 className="h-3.5 w-3.5 text-electric-blue" />
          <span className="text-muted-foreground">
            {compatCount} compat pair{compatCount !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Component count */}
      <div className="text-muted-foreground font-mono">
        {placedComponents.length} component{placedComponents.length !== 1 ? "s" : ""}
      </div>
    </div>
  )
}
