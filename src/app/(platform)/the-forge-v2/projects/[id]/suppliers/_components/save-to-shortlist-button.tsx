/**
 * @file save-to-shortlist-button.tsx
 *
 * @description "Save to shortlist" button rendered on each SupplierMatchInsightCard.
 * Optimistic state: button immediately shows "Saved" on click while the server
 * action runs. On error it reverts and surfaces the message.
 *
 * Uses saveSupplierToShortlist (project-supplier-shortlists.ts). A green
 * outline variant when already saved, to let founders navigate to the
 * shortlist without re-adding.
 */

"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react"
import { saveSupplierToShortlist, removeSupplierFromShortlist } from "@/actions/project-supplier-shortlists"
import { cn } from "@/lib/utils"

interface Props {
  projectId: string
  supplierId: string
  supplierName: string
  /** Pass true when the parent page already knows this supplier is saved. */
  initialSaved?: boolean
}

export function SaveToShortlistButton({
  projectId,
  supplierId,
  supplierName,
  initialSaved = false,
}: Props) {
  const [saved, setSaved] = useState(initialSaved)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    setErrorMessage(null)
    const next = !saved
    setSaved(next) // optimistic

    startTransition(async () => {
      const result = next
        ? await saveSupplierToShortlist({ projectId, supplierId, supplierName })
        : await removeSupplierFromShortlist({ projectId, supplierId })

      if (!result.success) {
        setSaved(!next) // revert
        setErrorMessage(result.error ?? "Something went wrong. Try again.")
      }
    })
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant={saved ? "outline" : "secondary"}
        className={cn(
          "h-8 gap-1.5 text-xs transition-colors",
          saved && "border-success text-success hover:bg-success/10"
        )}
        onClick={handleClick}
        disabled={isPending}
        aria-pressed={saved}
        aria-label={
          saved
            ? `Remove ${supplierName} from shortlist`
            : `Save ${supplierName} to shortlist`
        }
      >
        {isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : saved ? (
          <BookmarkCheck className="h-3 w-3" />
        ) : (
          <Bookmark className="h-3 w-3" />
        )}
        {saved ? "Saved to shortlist" : "Save to shortlist"}
      </Button>
      {errorMessage && (
        <p className="text-[11px] text-destructive" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  )
}
