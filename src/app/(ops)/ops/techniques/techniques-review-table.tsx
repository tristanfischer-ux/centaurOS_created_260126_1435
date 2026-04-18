"use client"

import { useState, useTransition } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, XCircle, Loader2, ChevronDown } from "lucide-react"
import { toast } from "sonner"
import {
  approveTechnique,
  rejectTechnique,
  approveAllSeededTechniques,
  type AdminTechniqueRow,
} from "@/actions/admin-techniques"

interface Props {
  unreviewed: AdminTechniqueRow[]
  reviewed: AdminTechniqueRow[]
}

export function TechniquesReviewTable({ unreviewed, reviewed }: Props) {
  const [tab, setTab] = useState<"pending" | "live">("pending")
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)

  const rows = tab === "pending" ? unreviewed : reviewed

  const handleApprove = (id: string) => {
    setBusyId(id)
    startTransition(async () => {
      const res = await approveTechnique(id)
      setBusyId(null)
      if (res.ok) toast.success("Approved — now live in Forge DfM")
      else toast.error(res.error ?? "Approve failed")
    })
  }

  const handleReject = (id: string) => {
    if (!confirm("Delete this technique row? This cannot be undone.")) return
    setBusyId(id)
    startTransition(async () => {
      const res = await rejectTechnique(id)
      setBusyId(null)
      if (res.ok) toast.success("Rejected and deleted")
      else toast.error(res.error ?? "Reject failed")
    })
  }

  const handleApproveAll = () => {
    if (!confirm("Approve ALL unreviewed seed_llm_deepseek rows at once?")) return
    startTransition(async () => {
      const res = await approveAllSeededTechniques()
      if (res.ok) toast.success(`Approved ${res.approved} techniques`)
      else toast.error(res.error ?? "Bulk approve failed")
    })
  }

  return (
    <div className="space-y-4">
      {/* Tab switch */}
      <div className="flex items-center gap-2 border-b border-border">
        <button
          onClick={() => setTab("pending")}
          className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "pending"
              ? "border-international-orange text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Pending ({unreviewed.length})
        </button>
        <button
          onClick={() => setTab("live")}
          className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "live"
              ? "border-international-orange text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Live ({reviewed.length})
        </button>
        <div className="ml-auto">
          {tab === "pending" && unreviewed.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleApproveAll}
              disabled={pending}
              className="gap-1.5"
            >
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Bulk approve all seed rows
            </Button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {tab === "pending" ? "No techniques awaiting review." : "No reviewed techniques yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <TechniqueRow
              key={row.id}
              row={row}
              tab={tab}
              busy={busyId === row.id && pending}
              onApprove={() => handleApprove(row.id)}
              onReject={() => handleReject(row.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TechniqueRow({
  row,
  tab,
  busy,
  onApprove,
  onReject,
}: {
  row: AdminTechniqueRow
  tab: "pending" | "live"
  busy: boolean
  onApprove: () => void
  onReject: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const articleSnippet = (row.articleMarkdown ?? "").slice(0, 400)
  const articleFull = row.articleMarkdown ?? ""
  const hasMore = articleFull.length > articleSnippet.length

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-semibold text-foreground">
                {row.techniqueSlug}
              </span>
              {row.source && (
                <Badge variant="secondary" className="text-[10px]">
                  {row.source}
                </Badge>
              )}
              {row.reviewed ? (
                <Badge variant="success" className="text-[10px]">
                  Live
                </Badge>
              ) : (
                <Badge variant="warning" className="text-[10px]">
                  Pending
                </Badge>
              )}
              {row.embeddedAt && (
                <span className="text-[10px] text-muted-foreground">
                  Embedded {new Date(row.embeddedAt).toLocaleDateString()}
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
              {row.supplierCount != null && (
                <span>Suppliers: {row.supplierCount}</span>
              )}
              {row.typicalLeadTimeDays != null && (
                <span>Lead: {row.typicalLeadTimeDays}d</span>
              )}
              {row.contentHash && (
                <span className="font-mono truncate max-w-[80px]" title={row.contentHash}>
                  {row.contentHash.slice(0, 8)}…
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {tab === "pending" && (
              <Button
                size="sm"
                variant="default"
                className="gap-1 h-8 px-2"
                onClick={onApprove}
                disabled={busy}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Approve
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="gap-1 h-8 px-2 text-destructive hover:text-destructive"
              onClick={onReject}
              disabled={busy}
            >
              <XCircle className="h-3.5 w-3.5" />
              {tab === "pending" ? "Reject" : "Delete"}
            </Button>
          </div>
        </div>

        {articleFull && (
          <div className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {expanded ? articleFull : articleSnippet}
            {hasMore && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="ml-1 text-international-orange hover:underline inline-flex items-center gap-0.5"
              >
                {expanded ? "Show less" : "Show more"}
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`}
                />
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
