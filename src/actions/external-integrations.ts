'use server'

/**
 * @file external-integrations.ts -- Server actions for specialist external service integrations.
 *
 * @description Provides server actions that execute external service operations
 * after founder approval. Each action handles authentication, validation, and
 * execution for its respective service (Google Sheets, Google Calendar, Email).
 *
 * @security All actions require authenticated user with an active foundry.
 * Google operations require OAuth connection. Email uses Resend.
 *
 * @related
 * - src/lib/agents/tools/permission-guard.ts - Types for external actions
 * - src/components/specialists/external-action-card.tsx - UI that calls these actions
 * - src/lib/google/client.ts - Authenticated Google client factory
 * - src/actions/google-calendar.ts - Existing calendar actions (used as reference)
 */

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { getGoogleClient } from '@/lib/google/client'
import { google } from 'googleapis'
import { createCalendarEvent } from '@/lib/google/calendar'
import type { CalendarEventParams } from '@/lib/google/calendar'
import type {
    SheetPayload,
    CalendarPayload,
    EmailPayload,
    LinearIssuePayload,
    SlackMessagePayload,
    InvoiceDraftPayload,
    PitchDeckPayload,
} from '@/lib/agents/tools/permission-guard'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'

// ─── Google Sheets ──────────────────────────────────────────────────

/**
 * Create a Google Sheet with specified headers and rows.
 *
 * @param payload - Sheet creation payload with title, headers, and rows
 * @returns The spreadsheet URL or an error message
 *
 * @security Requires authenticated user with Google OAuth connected.
 * The drive scope may need to be upgraded to support sheet creation.
 */
export async function createGoogleSheet(
    payload: SheetPayload
): Promise<{ sheetUrl: string | null; error: string | null }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { sheetUrl: null, error: 'Not authenticated' }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { sheetUrl: null, error: 'No active foundry' }

    const client = await getGoogleClient(user.id, foundryId)
    if (!client) {
        return { sheetUrl: null, error: 'Google account not connected. Please connect in Settings > Google Apps.' }
    }

    // Validate payload
    if (!payload.title?.trim()) {
        return { sheetUrl: null, error: 'Sheet title is required' }
    }
    if (!Array.isArray(payload.headers) || payload.headers.length === 0) {
        return { sheetUrl: null, error: 'At least one header column is required' }
    }

    try {
        const sheets = google.sheets({ version: 'v4', auth: client })

        // Create the spreadsheet
        const createRes = await sheets.spreadsheets.create({
            requestBody: {
                properties: {
                    title: payload.title.trim(),
                },
                sheets: [
                    {
                        properties: {
                            title: 'Sheet1',
                            gridProperties: {
                                rowCount: Math.max(payload.rows?.length ?? 0, 1) + 1, // +1 for header
                                columnCount: payload.headers.length,
                            },
                        },
                    },
                ],
            },
        })

        const spreadsheetId = createRes.data.spreadsheetId
        if (!spreadsheetId) {
            return { sheetUrl: null, error: 'Failed to create Google Sheet' }
        }

        // Populate with headers and data rows
        const allRows = [payload.headers, ...(payload.rows ?? [])]
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `Sheet1!A1:${columnLetter(payload.headers.length)}${allRows.length}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: allRows,
            },
        })

        // Bold the header row
        const sheetId = createRes.data.sheets?.[0]?.properties?.sheetId ?? 0
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
                requests: [
                    {
                        repeatCell: {
                            range: {
                                sheetId,
                                startRowIndex: 0,
                                endRowIndex: 1,
                            },
                            cell: {
                                userEnteredFormat: {
                                    textFormat: { bold: true },
                                },
                            },
                            fields: 'userEnteredFormat.textFormat.bold',
                        },
                    },
                ],
            },
        })

        const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`

        console.info('[ExternalIntegrations] Google Sheet created:', {
            spreadsheetId,
            title: payload.title,
            headers: payload.headers.length,
            rows: payload.rows?.length ?? 0,
            userId: user.id,
        })

        return { sheetUrl, error: null }
    } catch (err) {
        const message = sanitizeErrorMessage(err)
        console.error('[ExternalIntegrations] Failed to create Google Sheet:', {
            error: message,
            userId: user.id,
        })

        // INTENT: Provide actionable error for scope issues
        if (message.includes('insufficient') || message.includes('scope') || message.includes('403')) {
            return {
                sheetUrl: null,
                error: 'Google Sheets access not granted. Please reconnect Google with Drive permissions in Settings > Google Apps.',
            }
        }

        return { sheetUrl: null, error: `Failed to create sheet: ${message}` }
    }
}

/**
 * Convert a column number (1-indexed) to a spreadsheet column letter.
 * @example columnLetter(1) => "A", columnLetter(27) => "AA"
 */
function columnLetter(col: number): string {
    let letter = ''
    let n = col
    while (n > 0) {
        n--
        letter = String.fromCharCode(65 + (n % 26)) + letter
        n = Math.floor(n / 26)
    }
    return letter
}

// ─── Google Calendar ────────────────────────────────────────────────

/**
 * Create a Google Calendar event from a specialist proposal.
 *
 * @param payload - Calendar event creation payload
 * @returns Event details or an error message
 *
 * @security Requires authenticated user with Google Calendar OAuth connected.
 */
export async function createCalendarEventFromProposal(
    payload: CalendarPayload
): Promise<{ eventUrl: string | null; meetLink: string | null; error: string | null }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { eventUrl: null, meetLink: null, error: 'Not authenticated' }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { eventUrl: null, meetLink: null, error: 'No active foundry' }

    const client = await getGoogleClient(user.id, foundryId)
    if (!client) {
        return { eventUrl: null, meetLink: null, error: 'Google account not connected. Please connect in Settings > Google Apps.' }
    }

    // Validate payload
    if (!payload.title?.trim()) {
        return { eventUrl: null, meetLink: null, error: 'Event title is required' }
    }
    if (!payload.startTime) {
        return { eventUrl: null, meetLink: null, error: 'Start time is required' }
    }
    if (!payload.endTime) {
        return { eventUrl: null, meetLink: null, error: 'End time is required' }
    }

    try {
        const eventParams: CalendarEventParams = {
            summary: payload.title.trim(),
            description: payload.description,
            startTime: payload.startTime,
            endTime: payload.endTime,
            attendees: payload.attendees,
        }

        const result = await createCalendarEvent(client, eventParams)

        if (!result.success) {
            return { eventUrl: null, meetLink: null, error: result.error || 'Failed to create calendar event' }
        }

        console.info('[ExternalIntegrations] Calendar event created:', {
            eventId: result.eventId,
            title: payload.title,
            userId: user.id,
        })

        return {
            eventUrl: result.htmlLink || null,
            meetLink: result.meetLink || null,
            error: null,
        }
    } catch (err) {
        const message = sanitizeErrorMessage(err)
        console.error('[ExternalIntegrations] Failed to create calendar event:', {
            error: message,
            userId: user.id,
        })
        return { eventUrl: null, meetLink: null, error: `Failed to create event: ${message}` }
    }
}

// ─── Email (via Resend) ─────────────────────────────────────────────

/**
 * Send a draft email via Resend on behalf of the user.
 *
 * @param payload - Email payload with to, subject, and body
 * @returns Success status or error
 *
 * @security Requires authenticated user. Email is sent via Resend
 * from the platform's noreply address. The "from" cannot be spoofed.
 */
export async function sendDraftEmail(
    payload: EmailPayload
): Promise<{ success: boolean; error: string | null }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { success: false, error: 'No active foundry' }

    // Validate payload
    if (!payload.to?.trim()) {
        return { success: false, error: 'Recipient email is required' }
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(payload.to.trim())) {
        return { success: false, error: `Invalid email address: ${payload.to}` }
    }
    if (!payload.subject?.trim()) {
        return { success: false, error: 'Email subject is required' }
    }
    if (!payload.body?.trim()) {
        return { success: false, error: 'Email body is required' }
    }

    try {
        // Import dynamically to avoid circular dependencies
        const { sendEmail } = await import('@/lib/notifications/channels/email')

        const result = await sendEmail({
            to: payload.to.trim(),
            subject: payload.subject.trim(),
            body: payload.body.trim(),
        })

        if (result.error) {
            console.error('[ExternalIntegrations] Failed to send email:', {
                error: result.error,
                to: payload.to,
                userId: user.id,
            })
            return { success: false, error: result.error }
        }

        console.info('[ExternalIntegrations] Email sent:', {
            to: payload.to,
            subject: payload.subject,
            userId: user.id,
        })

        return { success: true, error: null }
    } catch (err) {
        const message = sanitizeErrorMessage(err)
        console.error('[ExternalIntegrations] Failed to send email:', {
            error: message,
            userId: user.id,
        })
        return { success: false, error: `Failed to send email: ${message}` }
    }
}

// ─── Linear Issue Creation ──────────────────────────────────────────

/**
 * Create a Linear issue from a specialist proposal.
 *
 * @param payload - Linear issue details
 * @returns Issue URL or error
 *
 * @security Requires authenticated user. Delegates to Linear API via api key.
 */
export async function createLinearIssueFromProposal(
    payload: LinearIssuePayload
): Promise<{ issueUrl: string | null; error: string | null }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { issueUrl: null, error: 'Not authenticated' }

    if (!payload.title?.trim()) {
        return { issueUrl: null, error: 'Issue title is required' }
    }

    try {
        const { createLinearIssue } = await import('@/lib/agents/external-actions/linear')
        return await createLinearIssue(payload)
    } catch (err) {
        const message = sanitizeErrorMessage(err)
        return { issueUrl: null, error: `Failed to create Linear issue: ${message}` }
    }
}

// ─── Slack Message ──────────────────────────────────────────────────

/**
 * Send a Slack message from a specialist proposal.
 *
 * @param payload - Slack message details
 * @returns Success or error
 *
 * @security Requires authenticated user. Delegates to Slack Web API via bot token.
 */
export async function sendSlackMessageFromProposal(
    payload: SlackMessagePayload
): Promise<{ success: boolean; error: string | null }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    if (!payload.channel?.trim()) {
        return { success: false, error: 'Slack channel is required' }
    }
    if (!payload.message?.trim()) {
        return { success: false, error: 'Message content is required' }
    }

    try {
        const { sendSlackMessage } = await import('@/lib/agents/external-actions/slack')
        return await sendSlackMessage(payload)
    } catch (err) {
        const message = sanitizeErrorMessage(err)
        return { success: false, error: `Failed to send Slack message: ${message}` }
    }
}

// ─── Invoice Draft ──────────────────────────────────────────────────

/**
 * Create an invoice draft from a specialist proposal.
 *
 * @param payload - Invoice details
 * @returns Invoice ID or error
 *
 * @security Requires authenticated user with an active foundry.
 */
export async function createInvoiceDraftFromProposal(
    payload: InvoiceDraftPayload
): Promise<{ invoiceId: string | null; error: string | null }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { invoiceId: null, error: 'Not authenticated' }

    const foundryId = await getFoundryIdCached()
    if (!foundryId) return { invoiceId: null, error: 'No active foundry' }

    if (!payload.recipientName?.trim()) {
        return { invoiceId: null, error: 'Recipient name is required' }
    }
    if (!payload.items || payload.items.length === 0) {
        return { invoiceId: null, error: 'At least one line item is required' }
    }

    try {
        const { createInvoiceDraft } = await import('@/lib/agents/external-actions/invoice')
        return await createInvoiceDraft(payload, foundryId)
    } catch (err) {
        const message = sanitizeErrorMessage(err)
        return { invoiceId: null, error: `Failed to create invoice: ${message}` }
    }
}

// ─── Pitch Deck Generation ─────────────────────────────────────────

/**
 * Generate a PowerPoint pitch deck from a specialist proposal.
 *
 * @param payload - Deck structure with slides
 * @returns Download URL (data URI) or error
 *
 * @security Requires authenticated user. Generated deck is returned as base64 data URI.
 */
export async function generatePitchDeckFromProposal(
    payload: PitchDeckPayload
): Promise<{ downloadUrl: string | null; filename: string | null; error: string | null }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { downloadUrl: null, filename: null, error: 'Not authenticated' }

    if (!payload.title?.trim()) {
        return { downloadUrl: null, filename: null, error: 'Deck title is required' }
    }
    if (!payload.slides || payload.slides.length === 0) {
        return { downloadUrl: null, filename: null, error: 'At least one slide is required' }
    }

    try {
        const { generatePitchDeck } = await import('@/lib/agents/external-actions/pitch-deck')
        const result = await generatePitchDeck(payload)

        if (result.error || !result.base64) {
            return { downloadUrl: null, filename: null, error: result.error ?? 'Failed to generate deck' }
        }

        // Return as data URI for client-side download
        const downloadUrl = `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${result.base64}`
        return { downloadUrl, filename: result.filename, error: null }
    } catch (err) {
        const message = sanitizeErrorMessage(err)
        return { downloadUrl: null, filename: null, error: `Failed to generate deck: ${message}` }
    }
}
