/**
 * Email Channel
 * 
 * Handles sending email notifications.
 * Currently a stub - can be integrated with Resend, SendGrid, or AWS SES.
 */

import { EmailOptions, EmailTemplate, ChannelSendResult } from '../types'

// Email templates for common notifications
const EMAIL_TEMPLATES: Record<EmailTemplate, (data: Record<string, unknown>) => { subject: string; html: string }> = {
    new_rfq: (data) => ({
        subject: `New RFQ: ${data.title || 'Manufacturing Request'}`,
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #1a1a1a;">New Request for Quote</h2>
                <p>A new RFQ matching your capabilities has been posted:</p>
                <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
                    <h3 style="margin: 0 0 8px 0; color: #333;">${data.title || 'Untitled'}</h3>
                    <p style="margin: 0; color: #666;">${data.specifications || 'No specifications provided'}</p>
                    ${data.budgetRange ? `<p style="margin: 8px 0 0 0; color: #888;">Budget: ${data.budgetRange}</p>` : ''}
                </div>
                ${data.actionUrl ? `<a href="${data.actionUrl}" style="display: inline-block; background: #0066cc; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">View RFQ</a>` : ''}
                <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
                <p style="color: #888; font-size: 12px;">You're receiving this because you're registered as a supplier on CentaurOS Marketplace.</p>
            </div>
        `
    }),
    
    booking_request: (data) => ({
        subject: `New Booking Request: ${data.serviceName || 'Service'}`,
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #1a1a1a;">New Booking Request</h2>
                <p>You have received a new booking request:</p>
                <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
                    <h3 style="margin: 0 0 8px 0; color: #333;">${data.serviceName || 'Service'}</h3>
                    <p style="margin: 0; color: #666;">From: ${data.requesterName || 'A customer'}</p>
                    ${data.requestedDate ? `<p style="margin: 8px 0 0 0; color: #888;">Requested Date: ${data.requestedDate}</p>` : ''}
                    ${data.notes ? `<p style="margin: 8px 0 0 0; color: #666;">Notes: ${data.notes}</p>` : ''}
                </div>
                ${data.actionUrl ? `<a href="${data.actionUrl}" style="display: inline-block; background: #0066cc; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">Review Booking</a>` : ''}
            </div>
        `
    }),
    
    payment_received: (data) => ({
        subject: `Payment Received: ${data.amount || 'Order'}`,
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #1a1a1a;">Payment Received!</h2>
                <p>Good news! Payment has been received for your order:</p>
                <div style="background: #e8f5e9; padding: 16px; border-radius: 8px; margin: 16px 0;">
                    <h3 style="margin: 0 0 8px 0; color: #2e7d32;">${data.amount || 'Amount'}</h3>
                    <p style="margin: 0; color: #666;">Order: ${data.orderTitle || data.orderId || 'N/A'}</p>
                    ${data.paymentMethod ? `<p style="margin: 8px 0 0 0; color: #888;">Payment Method: ${data.paymentMethod}</p>` : ''}
                </div>
                <p>The funds will be transferred to your account according to the escrow terms.</p>
                ${data.actionUrl ? `<a href="${data.actionUrl}" style="display: inline-block; background: #2e7d32; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">View Order</a>` : ''}
            </div>
        `
    }),
    
    order_status_update: (data) => ({
        subject: `Order Update: ${data.status || 'Status Changed'}`,
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #1a1a1a;">Order Status Update</h2>
                <p>The status of your order has been updated:</p>
                <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
                    <h3 style="margin: 0 0 8px 0; color: #333;">Order: ${data.orderTitle || data.orderId || 'N/A'}</h3>
                    <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
                        ${data.previousStatus ? `<span style="color: #888; text-decoration: line-through;">${data.previousStatus}</span><span style="color: #888;">→</span>` : ''}
                        <span style="background: #0066cc; color: white; padding: 4px 12px; border-radius: 4px; font-weight: 500;">${data.status || 'Updated'}</span>
                    </div>
                    ${data.message ? `<p style="margin: 12px 0 0 0; color: #666;">${data.message}</p>` : ''}
                </div>
                ${data.actionUrl ? `<a href="${data.actionUrl}" style="display: inline-block; background: #0066cc; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">View Order Details</a>` : ''}
            </div>
        `
    }),
    
    generic: (data) => ({
        subject: String(data.subject || data.title || 'Notification from CentaurOS'),
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #1a1a1a;">${data.title || 'Notification'}</h2>
                <p style="color: #666;">${data.body || data.message || ''}</p>
                ${data.actionUrl ? `<a href="${data.actionUrl}" style="display: inline-block; background: #0066cc; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 16px;">View Details</a>` : ''}
                <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
                <p style="color: #888; font-size: 12px;">This email was sent by CentaurOS Marketplace.</p>
            </div>
        `
    })
}

/**
 * Send an email notification
 * 
 * NOTE: This is currently a stub. To enable email sending:
 * 1. Install an email provider SDK (e.g., `npm install resend`)
 * 2. Add the API key to environment variables
 * 3. Implement the actual sending logic below
 */
export async function sendEmail(options: EmailOptions): Promise<ChannelSendResult> {
    const { to, subject, body, template = 'generic', templateData = {} } = options

    try {
        // Generate email content from template
        const templateFn = EMAIL_TEMPLATES[template]
        const { subject: templateSubject, html } = templateFn({
            subject,
            title: subject,
            body,
            ...templateData
        })

        // ============================================
        // STUB: Replace with actual email sending
        // ============================================
        // Example with Resend:
        // 
        // import { Resend } from 'resend'
        // const resend = new Resend(process.env.RESEND_API_KEY)
        // 
        // const { data, error } = await resend.emails.send({
        //     from: 'CentaurOS <noreply@centauros.io>',
        //     to: [to],
        //     subject: templateSubject,
        //     html: html
        // })
        // 
        // if (error) {
        //     return { success: false, error: error.message }
        // }
        // ============================================

        // Log email for development
        console.log('[EMAIL STUB] Would send email:', {
            to,
            subject: templateSubject,
            template,
            bodyPreview: body.substring(0, 100) + '...'
        })

        // Return success for stub (in production, this would only return after actual send)
        return { success: true }

    } catch (err) {
        console.error('Error sending email:', err)
        return { 
            success: false, 
            error: err instanceof Error ? err.message : 'Failed to send email' 
        }
    }
}

/**
 * Send templated email for specific marketplace events
 */
export async function sendTemplatedEmail(
    to: string,
    template: EmailTemplate,
    data: Record<string, unknown>
): Promise<ChannelSendResult> {
    const templateFn = EMAIL_TEMPLATES[template]
    const { subject } = templateFn(data)
    
    return sendEmail({
        to,
        subject,
        body: '', // Body is generated from template
        template,
        templateData: data
    })
}

/**
 * Queue email for digest (medium priority notifications)
 * This is a stub - would integrate with a job queue in production
 */
export async function queueEmailForDigest(
    userId: string,
    subject: string,
    body: string,
    metadata?: Record<string, unknown>
): Promise<ChannelSendResult> {
    console.log('[EMAIL DIGEST STUB] Queued for digest:', { userId, subject })
    
    // In production, this would:
    // 1. Store the notification in a queue table
    // 2. A scheduled job would batch and send digests
    
    return { success: true }
}
