"use client"

/**
 * @file settings/standards/page.tsx — Standards verification admin page.
 *
 * Lists all design standards with search, domain/source/status filters,
 * one-click and bulk verify, and expandable requirements markdown viewer.
 */

import { useState, useEffect, useCallback } from "react"
import { ShieldCheck, Search, CheckCircle2, ChevronDown, ChevronRight, Filter } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"

interface StandardRow {
  id: string
  standard_code: string
  standard_name: string
  issuing_body: string
  industry_domain: string
  source: string
  verified: boolean
  summary: string
}

export default function StandardsAdminPage() {
  const [standards, setStandards] = useState<StandardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "unverified" | "verified">("all")
  const [domainFilter, setDomainFilter] = useState<string>("all")
  const [sourceFilter, setSourceFilter] = useState<string>("all")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedDetail, setExpandedDetail] = useState<{ requirements_markdown: string; design_rules: unknown } | null>(null)

  const loadStandards = useCallback(async () => {
    setLoading(true)
    try {
      const { searchStandards, getStandardsByDomain } = await import("@/actions/design-standards")
      if (search.trim()) {
        const { data } = await searchStandards(search)
        setStandards((data ?? []) as unknown as StandardRow[])
      } else {
        const { getStandardsStats } = await import("@/actions/design-standards")
        const stats = await getStandardsStats()
        const domains = Object.keys(stats.byDomain)
        const all: StandardRow[] = []
        for (const domain of domains) {
          const { data } = await getStandardsByDomain(domain as never)
          if (data) all.push(...(data as unknown as StandardRow[]))
        }
        setStandards(all)
      }
    } catch (err) {
      console.error("Failed to load standards:", err)
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => { loadStandards() }, [loadStandards])

  const handleVerify = async (id: string) => {
    const { verifyStandard } = await import("@/actions/design-standards")
    const result = await verifyStandard(id)
    if (result.success) {
      setStandards(prev => prev.map(s => s.id === id ? { ...s, verified: true } : s))
      toast.success("Standard verified")
    } else {
      toast.error(result.error ?? "Verification failed")
    }
  }

  const handleBulkVerify = async () => {
    if (selected.size === 0) return
    const { bulkVerifyStandards } = await import("@/actions/design-standards")
    const result = await bulkVerifyStandards([...selected])
    if (result.success) {
      setStandards(prev => prev.map(s => selected.has(s.id) ? { ...s, verified: true } : s))
      setSelected(new Set())
      toast.success(`Verified ${result.count} standards`)
    } else {
      toast.error(result.error ?? "Bulk verification failed")
    }
  }

  const handleExpand = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); setExpandedDetail(null); return }
    setExpandedId(id)
    setExpandedDetail(null)
    const { getStandardDetail } = await import("@/actions/design-standards")
    const { data } = await getStandardDetail(id)
    if (data) setExpandedDetail({ requirements_markdown: data.requirements_markdown, design_rules: data.design_rules })
  }

  const domains = [...new Set(standards.map(s => s.industry_domain))].sort()
  const sources = [...new Set(standards.map(s => s.source))].sort()

  const filtered = standards.filter(s => {
    if (statusFilter === "unverified" && s.verified) return false
    if (statusFilter === "verified" && !s.verified) return false
    if (domainFilter !== "all" && s.industry_domain !== domainFilter) return false
    if (sourceFilter !== "all" && s.source !== sourceFilter) return false
    return true
  })

  const verifiedCount = standards.filter(s => s.verified).length
  const unverifiedCount = standards.filter(s => !s.verified).length
  const allFilteredSelected = filtered.length > 0 && filtered.every(s => selected.has(s.id))

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-international-orange" />
          <h1 className="text-2xl font-bold text-foreground">Design Standards Library</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {standards.length} standards across {domains.length} domains — {verifiedCount} verified, {unverifiedCount} pending review
        </p>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search standards..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-1">
          {(["all", "unverified", "verified"] as const).map(f => (
            <Button key={f} variant={statusFilter === f ? "default" : "ghost"} size="sm" onClick={() => setStatusFilter(f)} className="text-xs">
              {f === "all" ? `All (${standards.length})` : f === "unverified" ? `Pending (${unverifiedCount})` : `Verified (${verifiedCount})`}
            </Button>
          ))}
        </div>
        <select value={domainFilter} onChange={e => setDomainFilter(e.target.value)} className="text-xs border rounded px-2 py-1.5 bg-background text-foreground">
          <option value="all">All domains</option>
          {domains.map(d => <option key={d} value={d}>{d.replace(/_/g, " ")}</option>)}
        </select>
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} className="text-xs border rounded px-2 py-1.5 bg-background text-foreground">
          <option value="all">All sources</option>
          {sources.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Button size="sm" onClick={handleBulkVerify} className="gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Verify Selected
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading standards...</p>
      ) : (
        <div className="space-y-1">
          {/* Select all */}
          <div className="flex items-center gap-2 px-2 py-1">
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={() => {
                if (allFilteredSelected) setSelected(new Set())
                else setSelected(new Set(filtered.map(s => s.id)))
              }}
              className="rounded"
            />
            <span className="text-xs text-muted-foreground">{filtered.length} standards</span>
          </div>

          {filtered.map(s => (
            <Card key={s.id} className={selected.has(s.id) ? "ring-1 ring-international-orange" : ""}>
              <CardContent className="py-2.5 px-3">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => setSelected(prev => {
                      const next = new Set(prev)
                      next.has(s.id) ? next.delete(s.id) : next.add(s.id)
                      return next
                    })}
                    className="rounded mt-1"
                  />
                  <button onClick={() => handleExpand(s.id)} className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {expandedId === s.id ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                      <span className="font-mono text-sm font-semibold text-foreground">{s.standard_code}</span>
                      <Badge variant={s.verified ? "success" : "warning"} className="text-[10px]">
                        {s.verified ? "Verified" : "Pending"}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {s.industry_domain.replace(/_/g, " ")}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">{s.source}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{s.standard_name} — {s.issuing_body}</p>
                  </button>
                  {!s.verified && (
                    <Button variant="ghost" size="sm" className="gap-1 text-xs shrink-0" onClick={() => handleVerify(s.id)}>
                      <CheckCircle2 className="h-3 w-3" /> Verify
                    </Button>
                  )}
                </div>

                {/* Expanded detail */}
                {expandedId === s.id && (
                  <div className="mt-3 pl-6 border-t pt-3 space-y-2">
                    <p className="text-xs text-muted-foreground">{s.summary}</p>
                    {expandedDetail ? (
                      <div className="bg-muted rounded-lg p-3 max-h-[400px] overflow-y-auto">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Requirements</p>
                        <div className="text-xs text-foreground whitespace-pre-wrap font-mono leading-relaxed">
                          {expandedDetail.requirements_markdown}
                        </div>
                        {Array.isArray(expandedDetail.design_rules) && expandedDetail.design_rules.length > 0 && (
                          <div className="mt-3">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Design Rules</p>
                            {(expandedDetail.design_rules as Array<{ rule: string; section: string; criticality: string }>).map((r, i) => (
                              <p key={i} className="text-xs text-foreground">
                                <Badge variant={r.criticality === "mandatory" ? "destructive" : "secondary"} className="text-[9px] mr-1">{r.criticality}</Badge>
                                §{r.section}: {r.rule}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">Loading detail...</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
