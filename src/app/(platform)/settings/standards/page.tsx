"use client"

/**
 * @file settings/standards/page.tsx — Standards verification admin page.
 *
 * Lists all design standards in the system with verification status.
 * Admins can mark AI-generated standards as verified after review.
 */

import { useState, useEffect, useCallback } from "react"
import { ShieldCheck, AlertTriangle, Search, CheckCircle2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  const [filter, setFilter] = useState<"all" | "unverified" | "verified">("all")

  const loadStandards = useCallback(async () => {
    setLoading(true)
    try {
      const { searchStandards, getStandardsByDomain } = await import("@/actions/design-standards")
      if (search.trim()) {
        const { data } = await searchStandards(search)
        setStandards((data ?? []) as unknown as StandardRow[])
      } else {
        // Load all — fetch each domain
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

  useEffect(() => {
    loadStandards()
  }, [loadStandards])

  const filtered = standards.filter(s => {
    if (filter === "unverified") return !s.verified
    if (filter === "verified") return s.verified
    return true
  })

  const verifiedCount = standards.filter(s => s.verified).length
  const unverifiedCount = standards.filter(s => !s.verified).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Design Standards Library</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {standards.length} standards across {new Set(standards.map(s => s.industry_domain)).size} domains — {verifiedCount} verified, {unverifiedCount} pending review
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search standards..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "unverified", "verified"] as const).map(f => (
            <Button
              key={f}
              variant={filter === f ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilter(f)}
              className="text-xs"
            >
              {f === "all" ? `All (${standards.length})` : f === "unverified" ? `Pending (${unverifiedCount})` : `Verified (${verifiedCount})`}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading standards...</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(s => (
            <Card key={s.id}>
              <CardContent className="py-3 px-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-foreground">{s.standard_code}</span>
                      <Badge variant={s.verified ? "success" : "warning"} className="text-[10px]">
                        {s.verified ? "Verified" : "Pending"}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {s.industry_domain.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{s.standard_name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{s.issuing_body} — {s.source}</p>
                  </div>
                  {!s.verified && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-xs shrink-0"
                      onClick={async () => {
                        try {
                          const { createClient } = await import("@/lib/supabase/client")
                          const supabase = createClient()
                          await supabase.from("design_standards").update({ verified: true }).eq("id", s.id)
                          setStandards(prev => prev.map(x => x.id === s.id ? { ...x, verified: true } : x))
                          toast.success(`Verified: ${s.standard_code}`)
                        } catch {
                          toast.error("Failed to verify")
                        }
                      }}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Verify
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
