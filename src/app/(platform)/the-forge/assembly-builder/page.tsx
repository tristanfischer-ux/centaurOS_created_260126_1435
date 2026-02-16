"use client"

/**
 * @file page.tsx — Assembly Builder template picker and entry point.
 *
 * @description Landing page for the RPG-style Assembly Builder. Users choose
 * a design skeleton (template) or describe their own to generate one via AI.
 * Templates show slot count, difficulty, and estimated cost. Clicking a
 * template creates a new assembly and redirects to the workbench.
 *
 * @related
 * - Workbench: src/app/(platform)/the-forge/assembly-builder/[assemblyId]/page.tsx
 * - Actions: src/actions/assembly-builder.ts
 * - Templates: supabase/migrations/20260216100000_assembly_templates.sql
 */

import { useState, useEffect, useCallback, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Loader2,
  Sparkles,
  ArrowLeft,
  Send,
  Layers,
  Wand2,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { typography } from "@/lib/design-system"
import { cn } from "@/lib/utils"

import { TemplateCard } from "@/components/assembly/template-card"
import {
  getAssemblyTemplates,
  createAssemblyFromTemplate,
  generateSkeletonFromDescription,
} from "@/actions/assembly-builder"

import type { AssemblyTemplate } from "@/actions/assembly-builder"

// ─── Category Tabs ───────────────────────────────────────────────────

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "drone", label: "Drones" },
  { id: "robot", label: "Robots" },
  { id: "satellite", label: "Satellites" },
  { id: "vehicle", label: "Vehicles" },
  { id: "iot", label: "IoT" },
] as const

// ─── Page Component ──────────────────────────────────────────────────

export default function AssemblyBuilderPage(): React.ReactNode {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [templates, setTemplates] = useState<AssemblyTemplate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState("all")
  const [description, setDescription] = useState("")
  const [loadingTemplateId, setLoadingTemplateId] = useState<string | null>(null)

  // ─── Load Templates ────────────────────────────────────────────────

  useEffect(() => {
    async function load(): Promise<void> {
      setIsLoading(true)
      try {
        const data = await getAssemblyTemplates()
        setTemplates(data)
      } catch (err) {
        console.error("[AssemblyBuilder] Failed to load templates:", err)
        toast.error("Failed to load templates")
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [])

  // ─── Filter Templates ──────────────────────────────────────────────

  const filteredTemplates =
    activeCategory === "all"
      ? templates
      : templates.filter((t) => t.category === activeCategory)

  // ─── Create From Template ──────────────────────────────────────────

  const handleSelectTemplate = useCallback(
    (template: AssemblyTemplate) => {
      setLoadingTemplateId(template.id)

      startTransition(async () => {
        const result = await createAssemblyFromTemplate(template.id)

        if ("error" in result) {
          toast.error(result.error)
          setLoadingTemplateId(null)
          return
        }

        router.push(`/the-forge/assembly-builder/${result.assemblyId}`)
      })
    },
    [router],
  )

  // ─── AI Description Submit ─────────────────────────────────────────

  const [isGenerating, setIsGenerating] = useState(false)

  const handleDescriptionSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!description.trim() || isGenerating) return

      setIsGenerating(true)
      toast.info("Generating your design skeleton...")

      startTransition(async () => {
        try {
          const result = await generateSkeletonFromDescription(description)

          if ("error" in result) {
            toast.error(result.error)
            setIsGenerating(false)
            return
          }

          toast.success("Skeleton generated! Loading workbench...")
          router.push(`/the-forge/assembly-builder/${result.assemblyId}`)
        } catch {
          toast.error("Something went wrong. Please try again.")
          setIsGenerating(false)
        }
      })
    },
    [description, isGenerating, router],
  )

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-muted">
        <div className="min-w-0 flex-1">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Assembly Builder</h1>
          </div>
          <p className={cn(typography.pageSubtitle, "mt-1")}>
            Pick a design skeleton and equip it with components from the library
          </p>
        </div>

        <Button variant="outline" asChild>
          <Link href="/the-forge">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Forge
          </Link>
        </Button>
      </div>

      {/* Describe Your Own (AI entry point) */}
      <div className="rounded-xl border border-international-orange/30 bg-gradient-to-r from-international-orange-light/30 via-background to-background p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1.5">
            <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-international-orange">
              <Wand2 className="h-3.5 w-3.5" />
              AI-Generated Skeleton
            </p>
            <h2 className="text-lg font-semibold text-foreground">
              Describe your design
            </h2>
            <p className="text-sm text-muted-foreground max-w-xl">
              Tell us what you want to build and we&apos;ll generate a custom
              schematic with the right component slots.
            </p>
          </div>

          <form
            onSubmit={handleDescriptionSubmit}
            className="flex items-center gap-2 w-full md:w-auto"
          >
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., A delivery drone that carries 2kg..."
              className="w-full md:w-80"
              aria-label="Describe your design"
            />
            <Button
              type="submit"
              disabled={!description.trim() || isPending || isGenerating}
              size="sm"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  Generate
                </>
              )}
            </Button>
          </form>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-2">
        {CATEGORIES.map((cat) => {
          const count =
            cat.id === "all"
              ? templates.length
              : templates.filter((t) => t.category === cat.id).length

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                activeCategory === cat.id
                  ? "bg-international-orange text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              {cat.label}
              {count > 0 && (
                <span className="ml-1 opacity-70">({count})</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Template Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : filteredTemplates.length === 0 ? (
        <EmptyState
          title="No templates available"
          description={
            activeCategory === "all"
              ? "Templates haven't been loaded yet. Check back soon."
              : `No ${activeCategory} templates available. Try another category.`
          }
          action={
            activeCategory !== "all" ? (
              <Button
                variant="secondary"
                onClick={() => setActiveCategory("all")}
              >
                Show all templates
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onSelect={handleSelectTemplate}
              isLoading={loadingTemplateId === template.id}
            />
          ))}
        </div>
      )}

      {/* Stats footer */}
      {!isLoading && templates.length > 0 && (
        <div className="flex items-center gap-4 pt-4 border-t border-muted">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Layers className="h-3.5 w-3.5" />
            <span>
              {templates.length} templates across{" "}
              {new Set(templates.map((t) => t.category)).size} categories
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            <span>256+ components in the library</span>
          </div>
        </div>
      )}
    </div>
  )
}
