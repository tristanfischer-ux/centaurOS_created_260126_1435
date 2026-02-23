"use client"

/**
 * @file templates/page.tsx — Browsable STEP/STL template library.
 *
 * @description Gallery of real-world open-source STEP and STL template files
 * from KiCad, FreeCAD, and NASA. Users can browse by category, search by name,
 * and download or use templates as starting points for CAD Lab projects.
 *
 * @security Public read — templates are open-source community files.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import {
  Search,
  Download,
  Box,
  Cpu,
  Wrench,
  Rocket,
  Building2,
  Zap,
  Wind,
  Heart,
  Package,
  ShoppingBag,
  Layers,
  ExternalLink,
  FileBox,
  ChevronRight,
  SlidersHorizontal,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { FORGE_ROUTES } from "@/lib/forge-routes"
import { createClient } from "@/lib/supabase/client"

// ── Types ────────────────────────────────────────────────────────────

interface StepTemplate {
  id: string
  slug: string
  name: string
  category: string
  subcategory: string | null
  description: string | null
  source_repo: string
  license: string
  step_url: string | null
  stl_url: string | null
  thumbnail_url: string | null
  file_size_bytes: number | null
  tags: string[]
  is_assembly: boolean
}

// ── Category config ──────────────────────────────────────────────────

interface CategoryConfig {
  label: string
  icon: LucideIcon
  description: string
}

const CATEGORIES: Record<string, CategoryConfig> = {
  all: { label: "All Templates", icon: Layers, description: "Browse the entire library" },
  electronics: { label: "Electronics", icon: Cpu, description: "Connectors, ICs, LEDs, capacitors, resistors" },
  mechanical: { label: "Mechanical", icon: Wrench, description: "Bearings, fasteners, pipes, profiles" },
  aerospace: { label: "Aerospace", icon: Rocket, description: "NASA spacecraft, satellites, rovers" },
  architectural: { label: "Architectural", icon: Building2, description: "Concrete blocks, construction parts" },
  electrical: { label: "Electrical", icon: Zap, description: "Motors, switches, hotends" },
  hvac: { label: "HVAC", icon: Wind, description: "Ducts, reductions, bends" },
  medical: { label: "Medical", icon: Heart, description: "Respirators, ventilator parts" },
  industrial: { label: "Industrial", icon: Package, description: "Palettes, furniture, appliances" },
  consumer: { label: "Consumer", icon: ShoppingBag, description: "Sports equipment, everyday objects" },
  general: { label: "General", icon: Box, description: "Generic objects and parts" },
}

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  kicad: { label: "KiCad", color: "bg-status-info-light text-status-info-dark" },
  freecad: { label: "FreeCAD", color: "bg-status-success-light text-status-success-dark" },
  nasa: { label: "NASA", color: "bg-status-warning-light text-status-warning-dark" },
}

const LICENSE_LABELS: Record<string, string> = {
  "CC-BY-SA-4.0": "CC BY-SA 4.0",
  LGPL: "LGPL",
  "public-domain": "Public Domain",
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Main page ────────────────────────────────────────────────────────

const PAGE_SIZE = 60

export default function TemplateLibraryPage(): React.ReactElement {
  const [templates, setTemplates] = useState<StepTemplate[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [page, setPage] = useState(0)

  // Debounce search input so we don't fire a Supabase query on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const fetchTemplates = useCallback(async (category: string, search: string, pageNum: number): Promise<void> => {
    setIsLoading(true)
    const supabase = createClient()

    let query = supabase
      .from("step_templates")
      .select("id, slug, name, category, subcategory, description, source_repo, license, step_url, stl_url, thumbnail_url, file_size_bytes, tags, is_assembly", { count: "exact" })

    if (category !== "all") {
      query = query.eq("category", category)
    }

    if (search.trim()) {
      query = query.ilike("name", `%${search.trim()}%`)
    }

    query = query
      .order("category", { ascending: true })
      .order("name", { ascending: true })
      .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1)

    const { data, error, count } = await query

    if (error) {
      console.error("[TemplateLibrary] fetch error:", error.message)
      setIsLoading(false)
      return
    }

    setTemplates((data as StepTemplate[]) ?? [])
    setTotalCount(count ?? 0)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchTemplates(activeCategory, debouncedSearch, page)
  }, [activeCategory, debouncedSearch, page, fetchTemplates])

  const handleCategoryChange = (cat: string): void => {
    setActiveCategory(cat)
    setPage(0)
  }

  const handleSearch = (value: string): void => {
    setSearchQuery(value)
    setPage(0)
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const availableCategories = useMemo(() => {
    return Object.entries(CATEGORIES)
  }, [])

  const downloadUrl = (template: StepTemplate): string | null => {
    return template.step_url || template.stl_url || null
  }

  return (
    <div className="space-y-6">
      {/* ── Breadcrumb ── */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
        <Link
          href={FORGE_ROUTES.home}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          The Forge
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        <Link
          href={FORGE_ROUTES.cadLab}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          Pipeline
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-foreground font-medium">Template Library</span>
      </nav>

      {/* ── Header ── */}
      <div className="pb-4 border-b border-muted">
        <div className="flex items-center gap-3">
          <div className="h-8 w-1 rounded-full bg-international-orange" />
          <h1 className="text-2xl font-bold text-foreground">Template Library</h1>
          <Badge variant="secondary" className="font-mono">
            {totalCount.toLocaleString()} templates
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-2 ml-[19px]">
          Real-world STEP and STL files from open-source repositories. Use these as starting points for your designs.
        </p>
      </div>

      {/* ── Search + filter bar ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates by name..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {activeCategory !== "all" ? CATEGORIES[activeCategory]?.label ?? activeCategory : "All categories"}
          </span>
        </div>
      </div>

      {/* ── Category tabs ── */}
      <div className="flex flex-wrap gap-2">
        {availableCategories.map(([key, config]) => {
          const Icon = config.icon
          const isActive = activeCategory === key
          return (
            <button
              key={key}
              onClick={() => handleCategoryChange(key)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-international-orange text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {config.label}
            </button>
          )
        })}
      </div>

      {/* ── Source legend ── */}
      <div className="flex items-center gap-4 text-xs">
        <span className="text-muted-foreground font-medium">Sources:</span>
        {Object.entries(SOURCE_LABELS).map(([key, { label, color }]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className={cn("px-2 py-0.5 rounded-full font-medium", color)}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── Template grid ── */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="h-40 w-full" />
              <CardContent className="pt-4 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-6 w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16">
          <FileBox className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground">No templates found</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {searchQuery
              ? `No results for "${searchQuery}". Try a different search term.`
              : "No templates in this category yet."}
          </p>
          {searchQuery && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => handleSearch("")}
            >
              Clear search
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => {
            const url = downloadUrl(template)
            const source = SOURCE_LABELS[template.source_repo]
            const fileType = template.step_url ? "STEP" : template.stl_url ? "STL" : "—"
            const CategoryIcon = CATEGORIES[template.category]?.icon ?? Box

            return (
              <Card
                key={template.id}
                className="group overflow-hidden hover:border-international-orange/30 transition-colors"
              >
                {/* Thumbnail area */}
                <div className="relative h-40 bg-muted flex items-center justify-center overflow-hidden">
                  {template.thumbnail_url ? (
                    <Image
                      src={template.thumbnail_url}
                      alt={template.name}
                      fill
                      className="object-contain p-2 group-hover:scale-105 transition-transform duration-200"
                      unoptimized
                    />
                  ) : (
                    <CategoryIcon className="h-12 w-12 text-muted-foreground/40 group-hover:text-international-orange/40 transition-colors" />
                  )}
                  {/* Source badge overlay */}
                  {source && (
                    <span className={cn("absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full font-medium", source.color)}>
                      {source.label}
                    </span>
                  )}
                </div>

                <CardContent className="pt-4 space-y-2.5">
                  {/* Name + category */}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate" title={template.name}>
                      {template.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {template.category}
                      {template.subcategory ? ` / ${template.subcategory}` : ""}
                    </p>
                  </div>

                  {/* Meta badges */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="text-xs">
                      {fileType}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatFileSize(template.file_size_bytes)}
                    </span>
                    {template.license && (
                      <span className="text-xs text-muted-foreground">
                        {LICENSE_LABELS[template.license] ?? template.license}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  {url && (
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-1.5"
                        asChild
                      >
                        <a href={url} download target="_blank" rel="noopener noreferrer">
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </a>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5"
                        asChild
                      >
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
          >
            Next
          </Button>
        </div>
      )}

      {/* ── Attribution footer ── */}
      <div className="border-t border-muted pt-6 text-xs text-muted-foreground space-y-1">
        <p className="font-medium">Open-source attribution</p>
        <p>KiCad 3D Library — CC BY-SA 4.0 — gitlab.com/kicad/libraries/kicad-packages3D</p>
        <p>FreeCAD Parts Library — LGPL — github.com/FreeCAD/FreeCAD-library</p>
        <p>NASA 3D Resources — Public Domain — github.com/nasa/NASA-3D-Resources</p>
      </div>
    </div>
  )
}
