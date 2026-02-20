'use server'

/**
 * @file huddle-report-email.ts
 *
 * @description Server action to send a huddle meeting report via email.
 * Uses the existing Resend email infrastructure with the generic template.
 *
 * @security Requires authenticated user. Recipients are validated for email format.
 */

import { createClient } from '@/lib/supabase/server'

/**
 * Sends a huddle meeting report to the specified recipients.
 *
 * @param recipients - Array of email addresses to send to
 * @param subject - Email subject line
 * @param markdownContent - Report content in markdown format
 * @returns Success or error result
 */
export async function sendHuddleReportEmail(
    recipients: string[],
    subject: string,
    markdownContent: string
): Promise<{ error: string | null }> {
    // AUTH: Verify user is authenticated
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { error: 'Not authenticated' }
    }

    // VALIDATION
    if (!recipients.length) {
        return { error: 'At least one recipient is required' }
    }
    if (!subject?.trim()) {
        return { error: 'Subject is required' }
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const invalidEmails = recipients.filter(e => !emailRegex.test(e))
    if (invalidEmails.length > 0) {
        return { error: `Invalid email addresses: ${invalidEmails.join(', ')}` }
    }

    // Convert markdown to simple HTML for email
    const htmlContent = markdownToSimpleHtml(markdownContent)

    const { sendEmail } = await import('@/lib/notifications/channels/email')

    const errors: string[] = []
    for (const recipient of recipients) {
        const result = await sendEmail({
            to: recipient,
            subject: subject.trim(),
            body: htmlContent,
        })

        if (result.error) {
            errors.push(`${recipient}: ${result.error}`)
        }
    }

    if (errors.length > 0) {
        console.error('[HuddleReport] Failed to send report email:', {
            failedCount: errors.length,
            totalRecipients: recipients.length,
            errors,
        })
        return { error: `Failed to send to ${errors.length} recipient(s)` }
    }

    console.info('[HuddleReport] Report sent:', {
        recipientCount: recipients.length,
        subject: subject.trim(),
    })

    return { error: null }
}

/**
 * Converts basic markdown to HTML suitable for email.
 * Handles headings, bold, lists, and horizontal rules.
 */
function markdownToSimpleHtml(markdown: string): string {
    const lines = markdown.split('\n')
    const htmlLines: string[] = ['<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">']

    let inList = false

    for (const line of lines) {
        const trimmed = line.trim()

        if (trimmed.startsWith('# ')) {
            if (inList) { htmlLines.push('</ul>'); inList = false }
            htmlLines.push(`<h1 style="color: #1a1a1a; margin: 24px 0 8px;">${trimmed.slice(2)}</h1>`)
        } else if (trimmed.startsWith('## ')) {
            if (inList) { htmlLines.push('</ul>'); inList = false }
            htmlLines.push(`<h2 style="color: #333; margin: 20px 0 8px; font-size: 18px;">${trimmed.slice(3)}</h2>`)
        } else if (trimmed.startsWith('- ')) {
            if (!inList) { htmlLines.push('<ul style="margin: 8px 0; padding-left: 20px;">'); inList = true }
            htmlLines.push(`<li style="margin: 4px 0; color: #444;">${formatInline(trimmed.slice(2))}</li>`)
        } else if (trimmed === '---') {
            if (inList) { htmlLines.push('</ul>'); inList = false }
            htmlLines.push('<hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />')
        } else if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
            if (inList) { htmlLines.push('</ul>'); inList = false }
            htmlLines.push(`<p style="margin: 4px 0; color: #666;"><strong>${trimmed.slice(2, -2)}</strong></p>`)
        } else if (trimmed.startsWith('*') && trimmed.endsWith('*')) {
            if (inList) { htmlLines.push('</ul>'); inList = false }
            htmlLines.push(`<p style="margin: 4px 0; color: #888; font-style: italic;">${trimmed.slice(1, -1)}</p>`)
        } else if (trimmed) {
            if (inList) { htmlLines.push('</ul>'); inList = false }
            htmlLines.push(`<p style="margin: 8px 0; color: #444; line-height: 1.6;">${formatInline(trimmed)}</p>`)
        }
    }

    if (inList) htmlLines.push('</ul>')
    htmlLines.push('</div>')

    return htmlLines.join('\n')
}

function formatInline(text: string): string {
    return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}
