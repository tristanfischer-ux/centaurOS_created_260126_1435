/**
 * Email Channel
 *
 * Handles sending email notifications via Resend.
 * Falls back to console logging if RESEND_API_KEY is not configured.
 *
 * @description Sends transactional emails for notifications, invitations,
 * marketplace events, and other platform communications.
 *
 * @security
 * - All template data is sanitized to prevent XSS/HTML injection
 * - API key stored in environment variable, never logged
 * - From address uses verified domain
 *
 * @related
 * - src/lib/notifications/service.ts - Routes notifications to this channel
 * - src/actions/invitations.ts - Uses sendInvitationEmail
 */

import { EmailOptions, EmailTemplate, ChannelSendResult } from '../types'
import { escapeHtml } from '@/lib/security/sanitize'
import { Resend } from 'resend'

// Initialize Resend client (null if API key not configured)
const resend = process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY)
    : null

const FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS || 'ForgeOS <noreply@fractionalforge.app>'

/**
 * Security: Sanitize all string values in template data to prevent XSS
 */
function sanitizeTemplateData(data: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'string') {
            // Escape HTML entities in string values
            sanitized[key] = escapeHtml(value)
        } else if (Array.isArray(value)) {
            // Sanitize arrays of strings
            sanitized[key] = value.map(item => 
                typeof item === 'string' ? escapeHtml(item) : item
            )
        } else {
            sanitized[key] = value
        }
    }
    return sanitized
}

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
                <p style="color: #888; font-size: 12px;">You're receiving this because you're registered as a supplier on ForgeOS Marketplace.</p>
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
    
    team_invitation: (data) => ({
        subject: `You're invited to join ${data.foundryName || 'a company'} on ForgeOS`,
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 32px; border-radius: 8px 8px 0 0; text-align: center;">
                    <h1 style="margin: 0; color: white; font-size: 24px;">You're Invited!</h1>
                </div>
                <div style="background: #f8fafc; padding: 32px; border-radius: 0 0 8px 8px;">
                    <p style="color: #475569; font-size: 16px; margin: 0 0 24px 0;">
                        <strong>${data.invitedByName || 'Someone'}</strong> has invited you to join 
                        <strong>${data.foundryName || 'their company'}</strong> on ForgeOS as <strong>${data.role || 'a team member'}</strong>.
                    </p>
                    
                    <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 24px;">
                        <div style="display: flex; align-items: center; margin-bottom: 12px;">
                            <div style="width: 48px; height: 48px; background: #3b82f6; border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-right: 16px;">
                                <span style="color: white; font-size: 20px; font-weight: bold;">${(data.foundryName as string)?.charAt(0)?.toUpperCase() || 'C'}</span>
                            </div>
                            <div>
                                <h3 style="margin: 0; color: #1e293b; font-size: 18px;">${data.foundryName || 'Company'}</h3>
                                <p style="margin: 4px 0 0 0; color: #64748b; font-size: 14px;">Role: ${data.role || 'Team Member'}</p>
                            </div>
                        </div>
                    </div>
                    
                    ${data.customMessage ? `
                    <div style="background: #f1f5f9; padding: 16px; border-radius: 8px; margin-bottom: 24px; border-left: 4px solid #3b82f6;">
                        <p style="margin: 0; color: #475569; font-style: italic;">"${data.customMessage}"</p>
                        <p style="margin: 8px 0 0 0; color: #94a3b8; font-size: 13px;">— ${data.invitedByName || 'Your inviter'}</p>
                    </div>
                    ` : ''}
                    
                    <div style="text-align: center;">
                        <a href="${data.inviteUrl || '#'}" style="display: inline-block; background: #1e293b; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">Accept Invitation</a>
                    </div>
                    
                    <p style="color: #94a3b8; font-size: 13px; margin-top: 24px; text-align: center;">
                        This invitation expires on ${data.expiresAt ? new Date(data.expiresAt as string).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '7 days from now'}.
                    </p>
                </div>
                
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                
                <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0;">
                    If you didn't expect this invitation, you can safely ignore this email.<br/>
                    <a href="#" style="color: #64748b;">Unsubscribe from team invitations</a>
                </p>
            </div>
        `
    }),

    waitlist_admin_notification: (data) => ({
        subject: `New Waitlist Signup: ${data.email || 'Unknown'}`,
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #1a1a1a;">New Waitlist Signup</h2>
                <p style="color: #666;">Someone joined the Fractional Forge waitlist.</p>
                <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
                    <p style="margin: 0;"><strong>Email:</strong> ${data.email || '—'}</p>
                    <p style="margin: 8px 0 0 0;"><strong>Date:</strong> ${data.createdAt || '—'}</p>
                </div>
                <p style="margin-bottom: 12px;">Approve to send them an invite link, or reject to decline.</p>
                <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                    <a href="${data.approveUrl || '#'}" style="display: inline-block; background: #22c55e; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Approve</a>
                    <a href="${data.rejectUrl || '#'}" style="display: inline-block; background: #64748b; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">Reject</a>
                </div>
                <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
                <p style="color: #888; font-size: 12px;">Fractional Forge waitlist. Links expire in 7 days.</p>
            </div>
        `
    }),

    waitlist_approved: (data) => ({
        subject: "You're in! Your Fractional Forge invitation",
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); padding: 32px; border-radius: 8px 8px 0 0; text-align: center;">
                    <h1 style="margin: 0; color: white; font-size: 24px;">You're In!</h1>
                    <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9);">Your Fractional Forge invitation is ready</p>
                </div>
                <div style="background: #f8fafc; padding: 32px; border-radius: 0 0 8px 8px;">
                    <p style="color: #475569; font-size: 16px; margin: 0 0 24px 0;">
                        You've been approved to join Fractional Forge. Click below to create your account and get started.
                    </p>
                    <div style="text-align: center;">
                        <a href="${data.inviteUrl || '#'}" style="display: inline-block; background: #1e293b; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">Create Account</a>
                    </div>
                    <p style="color: #94a3b8; font-size: 13px; margin-top: 24px; text-align: center;">
                        This link is unique to you. If you didn't request access, you can ignore this email.
                    </p>
                </div>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0;">Fractional Forge — Private Beta</p>
            </div>
        `
    }),
    
    financial_alert: (data) => ({
        subject: String(data.title || 'Financial Alert'),
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #ff4500; padding: 16px 24px; border-radius: 8px 8px 0 0;">
                    <h2 style="margin: 0; color: white; font-size: 18px;">${data.title || 'Financial Alert'}</h2>
                </div>
                <div style="background: #f8fafc; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #e2e8f0; border-top: none;">
                    <p style="color: #475569; font-size: 15px; margin: 0 0 16px 0;">${data.body || ''}</p>
                    ${data.actionUrl ? `<a href="${data.actionUrl}" style="display: inline-block; background: #ff4500; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">View Details</a>` : ''}
                </div>
                <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
                <p style="color: #888; font-size: 12px;">You're receiving this because you enabled financial alerts on ForgeOS. <a href="${data.settingsUrl || '#'}" style="color: #888;">Manage preferences</a></p>
            </div>
        `
    }),

    finance_digest: (data) => ({
        subject: String(data.title || 'Your Financial Digest'),
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #ff4500 0%, #10b981 100%); padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
                    <h1 style="margin: 0; color: white; font-size: 22px;">${data.title || 'Financial Digest'}</h1>
                    <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">${data.period || ''}</p>
                </div>
                <div style="background: #f8fafc; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #e2e8f0; border-top: none;">
                    ${data.summaryHtml || '<p style="color: #475569;">No activity this period.</p>'}
                    ${data.actionUrl ? `<div style="text-align: center; margin-top: 24px;"><a href="${data.actionUrl}" style="display: inline-block; background: #ff4500; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">View Finance Dashboard</a></div>` : ''}
                </div>
                <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
                <p style="color: #888; font-size: 12px;">You're receiving this digest based on your ForgeOS alert preferences. <a href="${data.settingsUrl || '#'}" style="color: #888;">Manage preferences</a></p>
            </div>
        `
    }),

    generic: (data) => ({
        subject: String(data.subject || data.title || 'Notification from ForgeOS'),
        html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #1a1a1a;">${data.title || 'Notification'}</h2>
                <p style="color: #666;">${data.body || data.message || ''}</p>
                ${data.actionUrl ? `<a href="${data.actionUrl}" style="display: inline-block; background: #0066cc; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 16px;">View Details</a>` : ''}
                <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
                <p style="color: #888; font-size: 12px;">This email was sent by ForgeOS Marketplace.</p>
            </div>
        `
    })
}

/**
 * Send an email notification via Resend.
 * Falls back to console logging when RESEND_API_KEY is not set.
 *
 * @param options - Email options including recipient, subject, body, and template
 * @returns Success status with error message on failure
 */
export async function sendEmail(options: EmailOptions): Promise<ChannelSendResult> {
    const { to, subject, body, template = 'generic', templateData = {} } = options

    try {
        // SECURITY: Sanitize all template data to prevent XSS/HTML injection
        const sanitizedData = sanitizeTemplateData({
            subject,
            title: subject,
            body,
            ...templateData
        })

        // Generate email content from template
        const templateFn = EMAIL_TEMPLATES[template]
        const { subject: templateSubject, html } = templateFn(sanitizedData)

        // Send via Resend if configured
        if (resend) {
            const { error } = await resend.emails.send({
                from: FROM_ADDRESS,
                to: [to],
                subject: templateSubject,
                html: html,
            })

            if (error) {
                console.error('[Email] Resend send failed:', {
                    to,
                    subject: templateSubject,
                    template,
                    error: error.message,
                })
                return { success: false, error: error.message }
            }

            console.info('[Email] Sent successfully:', {
                to,
                subject: templateSubject,
                template,
            })

            return { success: true }
        }

        // Fallback: Log email for development when Resend is not configured
        console.info('[Email] No RESEND_API_KEY configured. Would send:', {
            to,
            subject: templateSubject,
            template,
            bodyPreview: body.substring(0, 100) + '...',
        })

        return { success: true }

    } catch (err) {
        console.error('[Email] Unexpected error:', {
            to,
            template,
            error: err instanceof Error ? err.message : 'Unknown error',
        })
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
    // Security: Sanitize data before passing to template
    const sanitizedData = sanitizeTemplateData(data)
    const templateFn = EMAIL_TEMPLATES[template]
    const { subject } = templateFn(sanitizedData)
    
    return sendEmail({
        to,
        subject,
        body: '', // Body is generated from template
        template,
        templateData: sanitizedData
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

/**
 * Send team invitation email
 */
export async function sendInvitationEmail(params: {
    to: string
    foundryName: string
    role: string
    invitedByName: string
    inviteUrl: string
    expiresAt: string
    customMessage?: string
}): Promise<ChannelSendResult> {
    return sendTemplatedEmail(params.to, 'team_invitation', {
        foundryName: params.foundryName,
        role: params.role,
        invitedByName: params.invitedByName,
        inviteUrl: params.inviteUrl,
        expiresAt: params.expiresAt,
        customMessage: params.customMessage,
    })
}
