/**
 * @file /saved page
 *
 * @description W39 fix (2026-04-28, v2): /saved is referenced in bookmarks,
 * email footers, and shared links. This stub renders a stable 200 response.
 *
 * DECISION: Render inline rather than redirect so the URL is stable and
 * active-nav highlighting works correctly. A full "Saved" section will
 * replace this stub when the feature ships.
 */

import Link from "next/link"
import { Bookmark } from "lucide-react"

export const metadata = {
  title: "Saved — ForgeOS",
}

export default function SavedPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
      <div className="rounded-full bg-muted p-4">
        <Bookmark className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">Saved items</h1>
        <p className="text-muted-foreground max-w-sm">
          Your saved brainstorm sessions, reports, and briefs will appear here.
          For now, you can find saved sessions in{" "}
          <Link href="/agents" className="text-international-orange underline-offset-4 hover:underline">
            Brainstorm
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
