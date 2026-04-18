import { Card, CardContent } from "@/components/ui/card"
import { AlertCircle } from "lucide-react"
import { listSupplierCorrections } from "@/actions/admin-supplier-corrections"
import { SupplierCorrectionsTable } from "./supplier-corrections-table"

/**
 * Platform admin review surface for founder-submitted supplier corrections
 * (Task I). Layout enforces admin-only via `(ops)/ops/layout.tsx`; this page
 * assumes the caller is authorised.
 */
export default async function SupplierCorrectionsPage() {
  const pendingRes = await listSupplierCorrections("pending")
  const reviewedRes = await listSupplierCorrections("all")

  const pendingCount = "rows" in pendingRes ? pendingRes.rows.length : 0
  const error = "error" in pendingRes ? pendingRes.error : "error" in reviewedRes ? reviewedRes.error : null

  return (
    <div className="space-y-6">
      <Card className="border-status-info/50 bg-gradient-to-r from-blue-50/80 to-blue-50/20 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-status-info shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-status-info-dark mb-1">
                Supplier data corrections
              </p>
              <p className="text-status-info-dark/80">
                Founders can flag incorrect fields on marketplace listings. Approving writes the proposed value to the listing (text fields only). Rejecting preserves the entry for audit with an optional reviewer note.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Supplier corrections</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {pendingCount} pending review{pendingCount === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {error ? (
        <div className="p-4 rounded-lg bg-status-error-light border border-destructive text-destructive text-sm">
          {error}
        </div>
      ) : (
        <SupplierCorrectionsTable
          initialRows={"rows" in reviewedRes ? reviewedRes.rows : []}
        />
      )}
    </div>
  )
}
