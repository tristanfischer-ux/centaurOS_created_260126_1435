import { Card, CardContent } from "@/components/ui/card"
import { FlaskConical } from "lucide-react"
import { listAdminTechniques } from "@/actions/admin-techniques"
import { TechniquesReviewTable } from "./techniques-review-table"

/**
 * Platform admin review surface for LLM-seeded manufacturing technique rows
 * (Phase 5E of Forge Source overhaul). Layout enforces admin-only via
 * `(ops)/ops/layout.tsx`; this page assumes the caller is authorised.
 *
 * Rows surfaced here live in `manufacturing_technique_enrichments` with
 * `reviewed=false` — hidden from the Forge DfM tab until approved. Approving
 * flips the flag; rejecting deletes the row.
 */
export default async function TechniquesReviewPage() {
  const unreviewedRes = await listAdminTechniques("unreviewed")
  const reviewedRes = await listAdminTechniques("reviewed")

  const unreviewedRows = "rows" in unreviewedRes ? unreviewedRes.rows : []
  const reviewedRows = "rows" in reviewedRes ? reviewedRes.rows : []
  const error = "error" in unreviewedRes ? unreviewedRes.error : "error" in reviewedRes ? reviewedRes.error : null

  return (
    <div className="space-y-6">
      <Card className="border-status-info/50 bg-gradient-to-r from-blue-50/80 to-blue-50/20 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <FlaskConical className="h-5 w-5 text-status-info shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-status-info-dark mb-1">
                Manufacturing technique review
              </p>
              <p className="text-status-info-dark/80">
                LLM-seeded rows land here with <code className="font-mono">reviewed=false</code> and are hidden from the Forge DfM tab until approved. Approve to surface a row; reject to delete it. Bulk-approve applies to all unreviewed <code className="font-mono">seed_llm_deepseek</code> rows at once.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Technique review</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {unreviewedRows.length} pending · {reviewedRows.length} live
          </p>
        </div>
      </div>

      {error ? (
        <div className="p-4 rounded-lg bg-status-error-light border border-destructive text-destructive text-sm">
          {error}
        </div>
      ) : (
        <TechniquesReviewTable
          unreviewed={unreviewedRows}
          reviewed={reviewedRows}
        />
      )}
    </div>
  )
}
