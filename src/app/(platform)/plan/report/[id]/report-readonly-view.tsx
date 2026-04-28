/**
 * @file report-readonly-view.tsx — read-only render of a sent report.
 *
 * Phase 3 · Chunk C.2. Renders `reports_sent` as a clean review page:
 * header (target pill · sent_at · recipients count · opens / replies),
 * body (markdown), and a disabled "Resend" stub. V1 does not re-send.
 */

import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Markdown } from "@/components/ui/markdown"

import type { ReportsSentRow, ReportTarget } from "@/types/plan"

const TARGET_LABEL: Record<ReportTarget, string> = {
  weekly_team: "Weekly team",
  monthly_investor: "Monthly investor",
  quarterly_board: "Quarterly board",
  custom: "Custom",
}

export function ReportReadonlyView({
  report,
}: {
  report: ReportsSentRow
}): React.ReactNode {
  const recipientsCount = Array.isArray(report.recipients_json)
    ? report.recipients_json.length
    : 0

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/plan/report"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Report
        </Link>
      </div>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{TARGET_LABEL[report.target_type]}</Badge>
          {report.pressure_tested_before_send ? (
            <Badge variant="secondary">Pressure-tested</Badge>
          ) : null}
          <Badge variant="secondary" className="uppercase tracking-wide">
            Sent
          </Badge>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {report.subject_line}
        </h1>
        <p className="text-sm text-muted-foreground">
          Sent {formatWhen(report.sent_at)} · {recipientsCount} recipient
          {recipientsCount === 1 ? "" : "s"} ·{" "}
          {report.open_count} opens · {report.reply_count} replies
        </p>
      </header>

      <Card>
        <CardContent className="p-6">
          {report.body_markdown ? (
            <Markdown content={report.body_markdown} />
          ) : report.body_html ? (
            // body_html is author-provided; until the HTML sanitiser pipeline
            // lands (V2) we render it as preformatted text rather than raw
            // HTML — safe by default, readable for plain updates.
            <pre className="whitespace-pre-wrap font-sans text-sm text-foreground">
              {report.body_html}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">No body captured.</p>
          )}
        </CardContent>
      </Card>

      <footer className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Stored for your records. Analytics refresh when email dispatch
          lands.
        </p>
        <Button type="button" variant="outline" disabled>
          Resend (coming soon)
        </Button>
      </footer>
    </div>
  )
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}
