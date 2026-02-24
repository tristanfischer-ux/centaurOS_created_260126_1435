/**
 * @file permission-guard.ts -- Permission guard for specialist external actions.
 *
 * @description Defines the types and validation for external actions that
 * specialists can propose. All external actions require founder approval.
 *
 * External action types:
 *   - create_google_sheet: Creates a Google Sheet with headers and rows
 *   - create_calendar_event: Schedules a Google Calendar event
 *   - draft_email: Drafts an email via Resend
 *
 * @security Write actions are NEVER auto-executed. They always create proposals
 * that require explicit user confirmation via the PROPOSED_EXTERNAL_ACTION UI.
 *
 * @related
 * - src/app/api/agents/execute/route.ts - Adds external action instructions to system prompt
 * - src/app/(platform)/agents/brief-specialist-dialog.tsx - Parses and renders proposals
 * - src/components/specialists/external-action-card.tsx - Approval card UI
 */

// ─── Types ──────────────────────────────────────────────────────────

export type ExternalActionType =
    | "create_google_sheet"
    | "create_calendar_event"
    | "draft_email"
    | "create_linear_issue"
    | "send_slack_message"
    | "draft_invoice"
    | "generate_pitch_deck"

/**
 * A structured proposal for an external service action, parsed from
 * PROPOSED_EXTERNAL_ACTION blocks in specialist output.
 */
export interface ProposedExternalAction {
    type: ExternalActionType
    title: string
    description: string
    payload: Record<string, unknown>
}

/** Payload shape for Google Sheets creation. */
export interface SheetPayload {
    title: string
    headers: string[]
    rows: string[][]
}

/** Payload shape for Google Calendar event creation. */
export interface CalendarPayload {
    title: string
    startTime: string
    endTime: string
    description?: string
    attendees?: string[]
}

/** Payload shape for email drafting. */
export interface EmailPayload {
    to: string
    subject: string
    body: string
}

/** Payload shape for Linear issue creation. */
export interface LinearIssuePayload {
    title: string
    description: string
    priority?: "urgent" | "high" | "medium" | "low" | "none"
    labels?: string[]
    teamName?: string
}

/** Payload shape for Slack message sending. */
export interface SlackMessagePayload {
    channel: string
    message: string
    threadTs?: string
}

/** Payload shape for invoice draft creation. */
export interface InvoiceDraftPayload {
    recipientName: string
    recipientEmail?: string
    items: Array<{ description: string; quantity: number; unitPrice: number }>
    currency?: string
    dueDate?: string
    notes?: string
}

/** Payload shape for pitch deck generation. */
export interface PitchDeckPayload {
    title: string
    subtitle?: string
    slides: Array<{ title: string; bullets?: string[]; content?: string }>
    companyName?: string
}

// ─── Validation ─────────────────────────────────────────────────────

const VALID_EXTERNAL_TYPES: ExternalActionType[] = [
    "create_google_sheet",
    "create_calendar_event",
    "draft_email",
    "create_linear_issue",
    "send_slack_message",
    "draft_invoice",
    "generate_pitch_deck",
]

/**
 * Validates a parsed JSON object as a ProposedExternalAction.
 *
 * @description Performs structural validation: checks for required fields
 * (type, title, payload) and ensures the type is one of the allowed
 * external action types. Does not validate payload contents -- that
 * happens at execution time in the ExternalActionCard.
 *
 * @param parsed - Unknown value parsed from JSON
 * @returns Validated ProposedExternalAction or null if invalid
 */
export function validateExternalAction(parsed: unknown): ProposedExternalAction | null {
    if (!parsed || typeof parsed !== "object") return null
    const action = parsed as Record<string, unknown>

    if (typeof action.type !== "string" || !VALID_EXTERNAL_TYPES.includes(action.type as ExternalActionType)) {
        return null
    }
    if (typeof action.title !== "string") return null
    if (!action.payload || typeof action.payload !== "object") return null

    return {
        type: action.type as ExternalActionType,
        title: action.title,
        description: (typeof action.description === "string" ? action.description : ""),
        payload: action.payload as Record<string, unknown>,
    }
}
