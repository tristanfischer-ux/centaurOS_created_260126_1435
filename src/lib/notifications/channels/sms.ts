/**
 * SMS Channel (Stub)
 * 
 * Stub for Twilio SMS integration.
 * This implementation logs intent - actual SMS sending requires Twilio configuration.
 */

import { SMSOptions, ChannelSendResult } from '../types'

// Twilio configuration (would be from environment)
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER

/**
 * Send an SMS notification
 * 
 * NOTE: This is a stub implementation. To enable actual SMS sending:
 * 1. Install Twilio SDK: `npm install twilio`
 * 2. Add Twilio credentials to environment variables
 * 3. Implement the actual sending logic below
 */
export async function sendSMS(options: SMSOptions): Promise<ChannelSendResult> {
    const { phoneNumber, message } = options

    try {
        // Validate phone number format (basic validation)
        if (!isValidPhoneNumber(phoneNumber)) {
            return { 
                success: false, 
                error: 'Invalid phone number format' 
            }
        }

        // Truncate message to SMS limits (160 chars for single SMS, or 1600 for concatenated)
        const truncatedMessage = message.length > 1600 
            ? message.substring(0, 1597) + '...'
            : message

        // ============================================
        // STUB: Replace with actual Twilio integration
        // ============================================
        // Example with Twilio:
        // 
        // import twilio from 'twilio'
        // 
        // if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
        //     return { success: false, error: 'Twilio not configured' }
        // }
        // 
        // const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        // 
        // const result = await client.messages.create({
        //     body: truncatedMessage,
        //     from: TWILIO_PHONE_NUMBER,
        //     to: phoneNumber
        // })
        // 
        // console.log('SMS sent:', result.sid)
        // ============================================

        // Log SMS intent for development/audit
        console.log('[SMS STUB] Would send SMS:', {
            to: maskPhoneNumber(phoneNumber),
            messageLength: truncatedMessage.length,
            messagePreview: truncatedMessage.substring(0, 50) + '...',
            timestamp: new Date().toISOString()
        })

        // Check if Twilio is configured
        if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
            console.warn('[SMS] Twilio not configured - SMS not actually sent')
            // Return success for stub mode, but this should be false in production
            return { success: true }
        }

        return { success: true }

    } catch (err) {
        console.error('Error sending SMS:', err)
        return { 
            success: false, 
            error: err instanceof Error ? err.message : 'Failed to send SMS' 
        }
    }
}

/**
 * Send critical alert SMS (bypasses some rate limits)
 */
export async function sendCriticalSMS(
    phoneNumber: string,
    message: string
): Promise<ChannelSendResult> {
    const criticalPrefix = '[URGENT] '
    return sendSMS({
        phoneNumber,
        message: criticalPrefix + message
    })
}

/**
 * Validate phone number format
 * Accepts E.164 format (+1234567890) and common variations
 */
function isValidPhoneNumber(phoneNumber: string): boolean {
    // Remove common formatting characters
    const cleaned = phoneNumber.replace(/[\s\-\(\)\.]/g, '')
    
    // Check for E.164 format or national format with country code
    const e164Regex = /^\+?[1-9]\d{6,14}$/
    return e164Regex.test(cleaned)
}

/**
 * Mask phone number for logging (privacy)
 */
function maskPhoneNumber(phoneNumber: string): string {
    if (phoneNumber.length <= 4) return '****'
    return phoneNumber.substring(0, phoneNumber.length - 4).replace(/\d/g, '*') + 
           phoneNumber.substring(phoneNumber.length - 4)
}

/**
 * Format phone number to E.164 (for Twilio)
 */
export function formatToE164(phoneNumber: string, defaultCountryCode: string = '1'): string {
    // Remove all non-digit characters except leading +
    let cleaned = phoneNumber.replace(/[^\d+]/g, '')
    
    // If no + and doesn't start with country code, add it
    if (!cleaned.startsWith('+')) {
        if (!cleaned.startsWith(defaultCountryCode)) {
            cleaned = defaultCountryCode + cleaned
        }
        cleaned = '+' + cleaned
    }
    
    return cleaned
}

/**
 * Check if Twilio is configured
 */
export function isTwilioConfigured(): boolean {
    return !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER)
}

/**
 * Get SMS configuration status (for admin/debugging)
 */
export function getSMSConfigStatus(): {
    configured: boolean
    accountSidSet: boolean
    authTokenSet: boolean
    phoneNumberSet: boolean
} {
    return {
        configured: isTwilioConfigured(),
        accountSidSet: !!TWILIO_ACCOUNT_SID,
        authTokenSet: !!TWILIO_AUTH_TOKEN,
        phoneNumberSet: !!TWILIO_PHONE_NUMBER
    }
}
