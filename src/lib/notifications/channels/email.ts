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
    
    rfq_new_match: (data) => ({
        subject: `New RFQ Match: ${data.title || 'Opportunity'}`,
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #1a1a1a;">🎯 New RFQ Matches Your Expertise</h2>
                <p>A new request for quote has been posted that matches your profile:</p>
                <div style="background: #e3f2fd; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #2196f3;">
                    <h3 style="margin: 0 0 8px 0; color: #333;">${data.title || 'Untitled'}</h3>
                    <p style="margin: 0; color: #666;">${data.category ? `Category: ${data.category}` : ''}</p>
                    ${data.budgetRange ? `<p style="margin: 4px 0 0 0; color: #666;">Budget: ${data.budgetRange}</p>` : ''}
                    ${data.matchScore ? `<p style="margin: 8px 0 0 0; color: #1976d2; font-weight: 500;">Match Score: ${data.matchScore}%</p>` : ''}
                    ${data.matchReasons ? `<p style="margin: 4px 0 0 0; color: #666; font-size: 13px;">Why you're a great fit: ${Array.isArray(data.matchReasons) ? data.matchReasons.join(', ') : data.matchReasons}</p>` : ''}
                </div>
                <p style="color: #666;">Act quickly to be among the first suppliers to respond!</p>
                ${data.actionUrl ? `<a href="${data.actionUrl}" style="display: inline-block; background: #2196f3; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">View RFQ & Respond</a>` : ''}
                <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
                <p style="color: #888; font-size: 12px;">You're receiving this because this RFQ matches your supplier profile.</p>
            </div>
        `
    }),
    
    rfq_urgent_match: (data) => ({
        subject: `⚡ URGENT: ${data.title || 'Time-Sensitive RFQ'}`,
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #fff3cd; padding: 12px; border-radius: 6px; border-left: 4px solid #ff9800; margin-bottom: 16px;">
                    <h2 style="margin: 0; color: #e65100; display: flex; align-items: center; gap: 8px;">⚡ URGENT RFQ - Respond Within ${data.responseWindow || '2 Hours'}</h2>
                </div>
                <p>An urgent request for quote needs immediate attention:</p>
                <div style="background: #fff8e1; padding: 16px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #ff9800;">
                    <h3 style="margin: 0 0 8px 0; color: #333;">${data.title || 'Untitled'}</h3>
                    <p style="margin: 0; color: #666;">${data.specifications || 'Quick turnaround required'}</p>
                    ${data.budgetRange ? `<p style="margin: 8px 0 0 0; color: #666;">Budget: ${data.budgetRange}</p>` : ''}
                    ${data.deadline ? `<p style="margin: 4px 0 0 0; color: #e65100; font-weight: 500;">Deadline: ${data.deadline}</p>` : ''}
                </div>
                <p style="color: #e65100; font-weight: 500;">⏱ First to respond may win automatically!</p>
                ${data.actionUrl ? `<a href="${data.actionUrl}" style="display: inline-block; background: #ff9800; color: white; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600;">Respond Now</a>` : ''}
                <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
                <p style="color: #888; font-size: 12px;">Urgent RFQs require immediate response for consideration.</p>
            </div>
        `
    }),
    
    rfq_priority_hold_won: (data) => ({
        subject: `🎉 You Have Priority Hold: ${data.title || 'RFQ'}`,
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #e8f5e9; padding: 16px; border-radius: 8px; border-left: 4px solid #4caf50; margin-bottom: 16px;">
                    <h2 style="margin: 0; color: #2e7d32;">🎉 Congratulations! You Have Priority Hold</h2>
                </div>
                <p>You were the first to respond, and you now have exclusive access to negotiate:</p>
                <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
                    <h3 style="margin: 0 0 8px 0; color: #333;">${data.title || 'Untitled'}</h3>
                    <p style="margin: 0; color: #666;">Your quoted price: ${data.quotedPrice || 'N/A'}</p>
                    ${data.expiresAt ? `<p style="margin: 8px 0 0 0; color: #d32f2f; font-weight: 500;">⏳ Priority hold expires: ${data.expiresAt}</p>` : ''}
                </div>
                <p>The buyer will review your quote and may award the RFQ to you during this priority window.</p>
                ${data.actionUrl ? `<a href="${data.actionUrl}" style="display: inline-block; background: #4caf50; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">View RFQ Status</a>` : ''}
                <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
                <p style="color: #888; font-size: 12px;">Priority hold gives you exclusive negotiation rights for a limited time.</p>
            </div>
        `
    }),
    
    rfq_awarded_to_you: (data) => ({
        subject: `🏆 You Won: ${data.title || 'RFQ Awarded'}`,
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 24px; border-radius: 8px; margin-bottom: 16px; text-align: center;">
                    <h2 style="margin: 0; color: white; font-size: 28px;">🏆 Congratulations!</h2>
                    <p style="margin: 8px 0 0 0; color: white; opacity: 0.9;">You've been awarded the RFQ</p>
                </div>
                <p>Great news! The buyer has selected you for their project:</p>
                <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
                    <h3 style="margin: 0 0 8px 0; color: #333;">${data.title || 'Untitled'}</h3>
                    <p style="margin: 0; color: #666;">Buyer: ${data.buyerName || 'N/A'}</p>
                    <p style="margin: 8px 0 0 0; color: #666;">Winning Quote: ${data.quotedPrice || 'N/A'}</p>
                    ${data.orderCreated ? `<p style="margin: 8px 0 0 0; color: #4caf50; font-weight: 500;">✓ Order automatically created</p>` : ''}
                </div>
                <div style="background: #e3f2fd; padding: 12px; border-radius: 6px; margin: 16px 0;">
                    <h4 style="margin: 0 0 8px 0; color: #1976d2;">Next Steps:</h4>
                    <ol style="margin: 0; padding-left: 20px; color: #666;">
                        <li>Review the order details</li>
                        <li>Confirm delivery timeline</li>
                        <li>Begin work once payment is secured</li>
                    </ol>
                </div>
                ${data.actionUrl ? `<a href="${data.actionUrl}" style="display: inline-block; background: #667eea; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">View Order Details</a>` : ''}
                <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
                <p style="color: #888; font-size: 12px;">Payment will be held in escrow and released upon delivery completion.</p>
            </div>
        `
    }),
    
    rfq_outbid: (data) => ({
        subject: `RFQ Update: ${data.title || 'Another Supplier Responded First'}`,
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #1a1a1a;">RFQ Status Update</h2>
                <p>Thank you for your interest in this RFQ:</p>
                <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
                    <h3 style="margin: 0 0 8px 0; color: #333;">${data.title || 'Untitled'}</h3>
                    <p style="margin: 0; color: #666;">Another supplier responded faster and ${data.awarded ? 'was awarded the project' : 'currently has priority hold'}.</p>
                </div>
                ${!data.awarded ? `<p style="color: #666;">You may still have a chance if the priority hold is released. We'll notify you if the RFQ reopens.</p>` : ''}
                <div style="background: #e3f2fd; padding: 12px; border-radius: 6px; margin: 16px 0;">
                    <h4 style="margin: 0 0 8px 0; color: #1976d2;">💡 Tips for Next Time:</h4>
                    <ul style="margin: 0; padding-left: 20px; color: #666;">
                        <li>Enable push notifications for instant alerts</li>
                        <li>Keep your profile and rates up to date</li>
                        <li>Respond quickly to urgent RFQs</li>
                    </ul>
                </div>
                ${data.similarRFQsUrl ? `<a href="${data.similarRFQsUrl}" style="display: inline-block; background: #0066cc; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">Browse Similar RFQs</a>` : ''}
                <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
                <p style="color: #888; font-size: 12px;">Keep an eye out for more opportunities that match your expertise.</p>
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
