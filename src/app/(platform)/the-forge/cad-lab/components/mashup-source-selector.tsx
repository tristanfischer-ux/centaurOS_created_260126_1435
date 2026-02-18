"use client"

/**
 * Mashup source selector — pick 2+ STEP sources from template library or URLs.
 *
 * @description Lets user browse step_templates with category/subcategory filtering
 * and search, or add custom step_urls. Displays selected sources with remove.
 */

import { useEffect, useMemo, useState, useCallback } from "react"
import { Plus, X, Box, Loader2, Search, FileBox, Shapes } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { createClient } from "@/lib/supabase/client"
import type { MashupSourceInput } from "@/lib/cad-lab-types"
import { cn } from "@/lib/utils"

interface StepTemplateRow {
  id: string
  slug: string
  name: string
  category: string
  subcategory: string | null
  step_url: string | null
  stl_url: string | null
  thumbnail_url: string | null
  description: string | null
}

interface MashupSourceSelectorProps {
  selected: MashupSourceInput[]
  onSelectedChange: (sources: MashupSourceInput[]) => void
  maxSources?: number
  className?: string
}

const ALL_CATEGORY = "all"

const CATEGORY_LABELS: Record<string, string> = {
  robotics: "Robots",
  electronics: "Electronics",
  mechanical: "Mechanical",
  aerospace: "Aerospace",
  architectural: "Architectural",
  electrical: "Electrical",
  general: "General",
  furniture: "Furniture",
  hvac: "HVAC",
  industrial: "Industrial",
  medical: "Medical",
  consumer: "Consumer",
} satisfies Record<string, string>

function categoryLabel(raw: string): string {
  return CATEGORY_LABELS[raw] ?? raw.charAt(0).toUpperCase() + raw.slice(1)
}

function fileFormat(t: StepTemplateRow): "STEP" | "STL" {
  return t.step_url ? "STEP" : "STL"
}

export function MashupSourceSelector({
  selected,
  onSelectedChange,
  maxSources = 5,
  className,
}: MashupSourceSelectorProps): React.ReactElement {
  const [templates, setTemplates] = useState<StepTemplateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [browseOpen, setBrowseOpen] = useState(false)
  const [customUrl, setCustomUrl] = useState("")
  const [customName, setCustomName] = useState("")

  const [activeCategory, setActiveCategory] = useState<string>(ALL_CATEGORY)
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from("step_templates")
      .select("id, slug, name, category, subcategory, step_url, stl_url, thumbnail_url, description")
      .order("name")
      .limit(1000)
      .then(({ data, error }) => {
        setLoading(false)
        if (error) {
          console.warn("[MashupSourceSelector] step_templates fetch failed:", error.message)
          return
        }
        setTemplates((data as StepTemplateRow[]) ?? [])
      })
  }, [])

  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of templates) {
      counts.set(t.category, (counts.get(t.category) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => ({ id: cat, label: categoryLabel(cat), count }))
  }, [templates])

  const subcategories = useMemo(() => {
    if (activeCategory === ALL_CATEGORY) return []
    const counts = new Map<string, number>()
    for (const t of templates) {
      if (t.category !== activeCategory || !t.subcategory) continue
      counts.set(t.subcategory, (counts.get(t.subcategory) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([sub, count]) => ({ id: sub, label: sub.replace(/-/g, " "), count }))
  }, [templates, activeCategory])

  const filtered = useMemo(() => {
    let result = templates

    if (activeCategory !== ALL_CATEGORY) {
      result = result.filter((t) => t.category === activeCategory)
    }
    if (activeSubcategory) {
      result = result.filter((t) => t.subcategory === activeSubcategory)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.subcategory ?? "").toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q)
      )
    }

    return result
  }, [templates, activeCategory, activeSubcategory, searchQuery])

  const handleCategoryChange = useCallback((cat: string) => {
    setActiveCategory(cat)
    setActiveSubcategory(null)
  }, [])

  const addFromTemplate = (t: StepTemplateRow): void => {
    const url = t.step_url ?? t.stl_url
    if (!url) return
    if (selected.length >= maxSources) return
    const name = t.slug.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || t.slug
    if (selected.some((s) => (s.name || "").replace(/[^a-zA-Z0-9_-]/g, "_") === name)) return
    onSelectedChange([
      ...selected,
      {
        name: name || t.name,
        step_url: url,
        description: t.description ?? t.name,
      },
    ])
    setBrowseOpen(false)
  }

  const addCustom = (): void => {
    const url = customUrl.trim()
    const name = (customName.trim() || "custom").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "custom"
    if (!url) return
    if (selected.length >= maxSources) return
    if (selected.some((s) => (s.name || "").replace(/[^a-zA-Z0-9_-]/g, "_") === name)) return
    onSelectedChange([
      ...selected,
      { name, step_url: url, description: "Custom STEP file" },
    ])
    setCustomUrl("")
    setCustomName("")
    setBrowseOpen(false)
  }

  const remove = (index: number): void => {
    onSelectedChange(selected.filter((_, i) => i !== index))
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Source STEPs ({selected.length} / {maxSources})</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setBrowseOpen(true)}
          disabled={selected.length >= maxSources}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add source
        </Button>
      </div>

      {selected.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {selected.map((s, i) => (
            <Card key={`${s.name}-${i}`} className="flex flex-row items-center gap-3 p-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-muted">
                <Box className="h-6 w-6 text-muted-foreground" />
              </div>
              <CardContent className="flex-1 min-w-0 p-0">
                <p className="text-sm font-medium truncate">{s.name}</p>
                {s.description && (
                  <p className="text-xs text-muted-foreground truncate">{s.description}</p>
                )}
              </CardContent>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove source"
                onClick={() => remove(i)}
              >
                <X className="h-4 w-4" />
              </Button>
            </Card>
          ))}
        </div>
      )}

      {selected.length < 2 && (
        <p className="text-sm text-muted-foreground">
          Add at least 2 sources to create a mashup.
        </p>
      )}

      <Dialog open={browseOpen} onOpenChange={setBrowseOpen}>
        <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col" size="lg">
          <DialogHeader>
            <DialogTitle>Add source STEP</DialogTitle>
            <DialogDescription>
              Browse the template library by category or enter a STEP file URL.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* Custom URL input */}
            <div>
              <Label className="text-sm font-medium">Custom STEP URL</Label>
              <div className="flex gap-2 mt-2">
                <Input
                  placeholder="https://... .step"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  className="flex-1"
                />
                <Input
                  placeholder="Name (optional)"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="w-32"
                />
                <Button type="button" onClick={addCustom} disabled={!customUrl.trim()}>
                  Add
                </Button>
              </div>
            </div>

            {/* Template library with filtering */}
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
              <Label className="text-sm font-medium mb-2">Template library</Label>

              {loading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  Loading templates…
                </div>
              ) : (
                <div className="flex-1 overflow-hidden flex flex-col min-h-0 space-y-3">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search templates…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>

                  {/* Category chips */}
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleCategoryChange(ALL_CATEGORY)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                        activeCategory === ALL_CATEGORY
                          ? "bg-international-orange text-white"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                      )}
                    >
                      All
                      <span className="opacity-70">{templates.length}</span>
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleCategoryChange(cat.id)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                          activeCategory === cat.id
                            ? "bg-international-orange text-white"
                            : "bg-muted text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {cat.label}
                        <span className="opacity-70">{cat.count}</span>
                      </button>
                    ))}
                  </div>

                  {/* Subcategory chips (when a category is selected) */}
                  {subcategories.length > 1 && (
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setActiveSubcategory(null)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                          !activeSubcategory
                            ? "bg-foreground/10 text-foreground"
                            : "bg-muted/60 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        All
                      </button>
                      {subcategories.map((sub) => (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => setActiveSubcategory(sub.id)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors capitalize",
                            activeSubcategory === sub.id
                              ? "bg-foreground/10 text-foreground"
                              : "bg-muted/60 text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {sub.label}
                          <span className="opacity-60">{sub.count}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Template list */}
                  <ul className="flex-1 overflow-y-auto space-y-1 border rounded-md p-2 min-h-0">
                    {filtered.length === 0 ? (
                      <li className="text-sm text-muted-foreground py-6 text-center">
                        No templates match your filters. Try a different category or search term.
                      </li>
                    ) : (
                      filtered.map((t) => {
                        const fmt = fileFormat(t)
                        return (
                          <li key={t.id}>
                            <button
                              type="button"
                              className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
                              onClick={() => addFromTemplate(t)}
                            >
                              <div className="h-8 w-8 shrink-0 rounded bg-muted flex items-center justify-center">
                                {fmt === "STEP" ? (
                                  <FileBox className="h-4 w-4 text-international-orange" />
                                ) : (
                                  <Shapes className="h-4 w-4 text-muted-foreground" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-medium truncate">{t.name}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {t.category}{t.subcategory ? ` / ${t.subcategory}` : ""}
                                </p>
                              </div>
                              <Badge
                                variant={fmt === "STEP" ? "default" : "secondary"}
                                className="shrink-0 text-[10px]"
                              >
                                {fmt}
                              </Badge>
                            </button>
                          </li>
                        )
                      })
                    )}
                  </ul>

                  {/* Count footer */}
                  <p className="text-[11px] text-muted-foreground text-right">
                    {filtered.length} template{filtered.length !== 1 ? "s" : ""}
                    {activeCategory !== ALL_CATEGORY && ` in ${categoryLabel(activeCategory)}`}
                  </p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
