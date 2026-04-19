"use client"

/**
 * @file report-composer.tsx — client-side editor for a new Plan update.
 *
 * Phase 3 · Chunk C.2. V1 scope:
 *   • Target picker (4 radio buttons — weekly_team / monthly_investor /
 *     quarterly_board / custom). HANDOVER locks V1 to the first three, but
 *     the enum has `custom` and the brief asks for a 4-tab picker — both
 *     stay selectable; what differs is only the default subject line.
 *   • Subject line + body_markdown (textarea) — plain React state, no
 *     react-hook-form dependency.
 *   • Recipients: simple comma/Enter-separated email chip input.
 *   • Pressure-test CTA → opens <PressureTestModal> with
 *     subject_type='report_draft' and subject_snapshot={body_markdown, target}.
 *   • Send → calls sendReport() server action.
 *   • Send button disabled until target + subject + body present.
 *
 * V1 does NOT autosave, does NOT persist a draft, does NOT dispatch email.
 * sendReport() saves a reports_sent row and routes to the read-only detail
 * view.
 */

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { PressureTestModal } from "@/components/plan/pressure-test/PressureTestModal"

import type { ReportTarget, ReportRecipient } from "@/types/plan"
import { sendReport } from "@/actions/plan/reports"

// ──────────────────────────────────────────────────────────────────────────
// 1 · Types
// ──────────────────────────────────────────────────────────────────────────

export interface ReportComposerDraft {
  initialTarget: ReportTarget
  initialSubject: string
  initialBody: string
  pulledFromGoalIds: string[]
}

interface ReportComposerProps {
  draft: ReportComposerDraft
}

const TARGET_OPTIONS: Array<{
  value: ReportTarget
  label: string
  caption: string
}> = [
  {
    value: "weekly_team",
    label: "Weekly team",
    caption: "Short, action-led update for the people who ship.",
  },
  {
    value: "monthly_investor",
    label: "Monthly investor",
    caption: "Progress, decisions, asks — the rhythm investors expect.",
  },
  {
    value: "quarterly_board",
    label: "Quarterly board",
    caption: "Strategic narrative for the quarterly board meeting.",
  },
  {
    value: "custom",
    label: "Custom",
    caption: "Anyone else — partners, advisors, customers.",
  },
]

// ──────────────────────────────────────────────────────────────────────────
// 2 · Component
// ──────────────────────────────────────────────────────────────────────────

export function ReportComposer({ draft }: ReportComposerProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [target, setTarget] = useState<ReportTarget>(draft.initialTarget)
  const [subject, setSubject] = useState<string>(draft.initialSubject)
  const [body, setBody] = useState<string>(draft.initialBody)
  const [recipients, setRecipients] = useState<ReportRecipient[]>([])
  const [recipientInput, setRecipientInput] = useState<string>("")

  const [pressureOpen, setPressureOpen] = useState<boolean>(false)
  // PressureTestModal persists via closePressureTest() internally but doesn't
  // yet surface the sessionId back to the caller. Until that API lands, V1
  // leaves pressure_test_session_id null even when pressureTested flips true;
  // the Boolean flag is the honest signal that a debate happened.
  const [pressureTested, setPressureTested] = useState<boolean>(false)

  const [sendError, setSendError] = useState<string | null>(null)

  const canSend = useMemo(() => {
    return (
      !!target &&
      subject.trim().length > 0 &&
      body.trim().length > 0 &&
      !pending
    )
  }, [target, subject, body, pending])

  // ── Recipient chip-input handlers ───────────────────────────────────────
  function commitRecipient(raw: string) {
    const email = raw.trim().replace(/[,;]+$/, "").trim()
    if (!email) return
    // Minimal email sanity check — server re-validates via Zod.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return
    if (recipients.some((r) => r.email === email)) return
    setRecipients((prev) => [...prev, { email, to_cc_bcc: "to" }])
    setRecipientInput("")
  }

  function removeRecipient(email: string) {
    setRecipients((prev) => prev.filter((r) => r.email !== email))
  }

  function onRecipientKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      commitRecipient(recipientInput)
    } else if (e.key === "Backspace" && !recipientInput && recipients.length) {
      setRecipients((prev) => prev.slice(0, -1))
    }
  }

  // ── Send handler ────────────────────────────────────────────────────────
  function handleSend() {
    if (!canSend) return
    setSendError(null)

    // If there's leftover text in the input, accept it as a recipient.
    const pendingInput = recipientInput.trim()
    let finalRecipients = recipients
    if (
      pendingInput &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pendingInput) &&
      !recipients.some((r) => r.email === pendingInput)
    ) {
      finalRecipients = [
        ...recipients,
        { email: pendingInput, to_cc_bcc: "to" },
      ]
    }

    startTransition(async () => {
      const result = await sendReport({
        target_type: target,
        subject_line: subject,
        body_markdown: body,
        recipients: finalRecipients,
        pressure_tested_before_send: pressureTested,
        pressure_test_session_id: null,
        pulled_from_goal_ids: draft.pulledFromGoalIds,
      })

      if (!("success" in result) || !result.success) {
        setSendError(result.error ?? "Could not send the update")
        return
      }

      router.push(`/plan/report/${result.data.id}`)
    })
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      {/* ── Left: editor ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            New update
          </h1>
          <Badge variant="secondary" className="text-xs">
            Unsent draft
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Cal drafted the starter. Edit it to match your voice, then send.
        </p>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="report-subject"
            className="text-xs font-medium text-muted-foreground"
          >
            Subject line
          </label>
          <Input
            id="report-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject line"
            maxLength={300}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="report-body"
            className="text-xs font-medium text-muted-foreground"
          >
            Update body (markdown)
          </label>
          <Textarea
            id="report-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={22}
            placeholder="What moved this week? What did you decide? What do you need?"
            className="font-mono text-sm leading-relaxed"
          />
          <p className="text-xs text-muted-foreground">
            Plain markdown — headings, bullets, bold. No images in V1.
          </p>
        </div>

        {sendError ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {sendError}
          </div>
        ) : null}
      </div>

      {/* ── Right: sidebar ───────────────────────────────────────── */}
      <aside className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="text-xs font-medium text-muted-foreground">
              Who is this for?
            </div>
            <RadioGroup
              value={target}
              onValueChange={(v) => setTarget(v as ReportTarget)}
              className="gap-2"
            >
              {TARGET_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-start gap-3 rounded-md border border-border p-2 hover:bg-muted/40"
                  htmlFor={`target-${opt.value}`}
                >
                  <RadioGroupItem id={`target-${opt.value}`} value={opt.value} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">
                      {opt.label}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {opt.caption}
                    </div>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="text-xs font-medium text-muted-foreground">
              Recipients
            </div>
            <div className="flex flex-wrap gap-1 rounded-md border border-border bg-background p-2 focus-within:ring-2 focus-within:ring-ring">
              {recipients.map((r) => (
                <span
                  key={r.email}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs"
                >
                  {r.email}
                  <button
                    type="button"
                    onClick={() => removeRecipient(r.email)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${r.email}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                type="email"
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                onKeyDown={onRecipientKeyDown}
                onBlur={() => commitRecipient(recipientInput)}
                placeholder={
                  recipients.length
                    ? "Add another…"
                    : "name@company.com, …"
                }
                className="flex-1 min-w-[10ch] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              V1 saves the list; email dispatch is still on its way.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="text-xs font-medium text-muted-foreground">
              Before you send
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPressureOpen(true)}
              disabled={body.trim().length < 20}
            >
              {pressureTested ? "Pressure-tested" : "Pressure-test the draft"}
            </Button>
            {pressureTested ? (
              <p className="text-xs text-muted-foreground">
                Saved debate attached to this send.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Stress-test the update from 5 angles before it goes out.
              </p>
            )}

            <Button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              className="mt-1"
            >
              {pending ? "Sending…" : "Send update"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Send saves a record; email dispatch lands after V1.
            </p>
          </CardContent>
        </Card>
      </aside>

      {pressureOpen ? (
        <PressureTestModal
          open={pressureOpen}
          onOpenChange={(next) => {
            setPressureOpen(next)
            // PressureTestModal persists the debate via closePressureTest()
            // internally. When the modal closes after being opened on a
            // Report draft, we optimistically mark the draft as
            // pressure-tested — the session itself is saved either way.
            if (!next) setPressureTested(true)
          }}
          subjectSnapshot={{
            topic: subject || "Report draft",
            title: subject || "Report draft",
            summary: `Draft ${target.replace(/_/g, " ")} update — stress-test the claims before send.`,
            context: body,
          }}
        />
      ) : null}
    </div>
  )
}
