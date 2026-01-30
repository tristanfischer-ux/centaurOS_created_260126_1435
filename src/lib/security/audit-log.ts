/**
 * Security Audit Logging Module
 * 
 * Provides structured logging for security-relevant events.
 * These logs should be monitored for security incidents.
 */

import { sanitizeForLogging } from './sanitize'

export type SecurityEventType =
    | 'LOGIN_SUCCESS'
    | 'LOGIN_FAILURE'
    | 'LOGOUT'
    | 'SIGNUP_SUCCESS'
    | 'SIGNUP_FAILURE'
    | 'PASSWORD_RESET_REQUEST'
    | 'PASSWORD_CHANGE'
    | 'ROLE_CHANGE'
    | 'PERMISSION_DENIED'
    | 'RATE_LIMIT_EXCEEDED'
    | 'INVALID_TOKEN'
    | 'SUSPICIOUS_ACTIVITY'
    | 'DATA_ACCESS'
    | 'DATA_MODIFICATION'
    | 'DATA_DELETION'
    | 'PAYMENT_INITIATED'
    | 'PAYMENT_COMPLETED'
    | 'PAYMENT_FAILED'
    | 'REFUND_REQUESTED'
    | 'ADMIN_ACTION'

export interface SecurityEvent {
    type: SecurityEventType
    timestamp: string
    userId?: string
    email?: string
    ipAddress?: string
    userAgent?: string
    resource?: string
    action?: string
    success: boolean
    details?: Record<string, unknown>
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
}

/**
 * Get severity level for event type
 */
function getSeverity(type: SecurityEventType, success: boolean): SecurityEvent['severity'] {
    const severityMap: Record<SecurityEventType, { success: SecurityEvent['severity']; failure: SecurityEvent['severity'] }> = {
        LOGIN_SUCCESS: { success: 'LOW', failure: 'LOW' },
        LOGIN_FAILURE: { success: 'LOW', failure: 'MEDIUM' },
        LOGOUT: { success: 'LOW', failure: 'LOW' },
        SIGNUP_SUCCESS: { success: 'LOW', failure: 'LOW' },
        SIGNUP_FAILURE: { success: 'LOW', failure: 'MEDIUM' },
        PASSWORD_RESET_REQUEST: { success: 'MEDIUM', failure: 'MEDIUM' },
        PASSWORD_CHANGE: { success: 'MEDIUM', failure: 'HIGH' },
        ROLE_CHANGE: { success: 'HIGH', failure: 'HIGH' },
        PERMISSION_DENIED: { success: 'LOW', failure: 'MEDIUM' },
        RATE_LIMIT_EXCEEDED: { success: 'LOW', failure: 'MEDIUM' },
        INVALID_TOKEN: { success: 'LOW', failure: 'HIGH' },
        SUSPICIOUS_ACTIVITY: { success: 'HIGH', failure: 'CRITICAL' },
        DATA_ACCESS: { success: 'LOW', failure: 'MEDIUM' },
        DATA_MODIFICATION: { success: 'MEDIUM', failure: 'HIGH' },
        DATA_DELETION: { success: 'HIGH', failure: 'HIGH' },
        PAYMENT_INITIATED: { success: 'MEDIUM', failure: 'MEDIUM' },
        PAYMENT_COMPLETED: { success: 'LOW', failure: 'HIGH' },
        PAYMENT_FAILED: { success: 'LOW', failure: 'MEDIUM' },
        REFUND_REQUESTED: { success: 'MEDIUM', failure: 'HIGH' },
        ADMIN_ACTION: { success: 'HIGH', failure: 'HIGH' },
    }

    return severityMap[type]?.[success ? 'success' : 'failure'] || 'MEDIUM'
}

/**
 * Log a security event
 * 
 * In production, this should integrate with a proper logging service
 * (e.g., DataDog, Splunk, CloudWatch) for monitoring and alerting.
 */
export async function logSecurityEvent(params: {
    type: SecurityEventType
    userId?: string
    email?: string
    ipAddress?: string
    userAgent?: string
    resource?: string
    action?: string
    success: boolean
    details?: Record<string, unknown>
}): Promise<void> {
    const { type, userId, email, ipAddress, userAgent, resource, action, success, details } = params

    // Sanitize any PII in details
    const sanitizedDetails = details ? 
        Object.fromEntries(
            Object.entries(details).map(([key, value]) => [
                key,
                typeof value === 'string' ? sanitizeForLogging(value) : value
            ])
        ) : undefined

    const event: SecurityEvent = {
        type,
        timestamp: new Date().toISOString(),
        userId,
        email: email ? sanitizeForLogging(email) : undefined,
        ipAddress,
        userAgent: userAgent?.slice(0, 200), // Truncate long user agents
        resource,
        action,
        success,
        details: sanitizedDetails,
        severity: getSeverity(type, success),
    }

    // Log to console with structured format
    const logMessage = `[SECURITY] [${event.severity}] ${event.type}: ${JSON.stringify({
        userId: event.userId,
        ip: event.ipAddress,
        resource: event.resource,
        success: event.success,
        timestamp: event.timestamp,
    })}`

    if (event.severity === 'CRITICAL' || event.severity === 'HIGH') {
        console.error(logMessage)
    } else if (event.severity === 'MEDIUM') {
        console.warn(logMessage)
    } else {
        console.log(logMessage)
    }

    // TODO: In production, integrate with a proper logging service
    // Example integrations:
    // - DataDog: await datadogLogs.log(event)
    // - CloudWatch: await cloudwatch.putLogEvents(...)
    // - Database: await supabase.from('security_audit_log').insert(event)
}

/**
 * Helper to log failed login attempts
 */
export async function logFailedLogin(
    email: string,
    ipAddress: string,
    userAgent?: string,
    reason?: string
): Promise<void> {
    await logSecurityEvent({
        type: 'LOGIN_FAILURE',
        email,
        ipAddress,
        userAgent,
        success: false,
        details: { reason },
    })
}

/**
 * Helper to log successful login
 */
export async function logSuccessfulLogin(
    userId: string,
    email: string,
    ipAddress: string,
    userAgent?: string
): Promise<void> {
    await logSecurityEvent({
        type: 'LOGIN_SUCCESS',
        userId,
        email,
        ipAddress,
        userAgent,
        success: true,
    })
}

/**
 * Helper to log permission denied
 */
export async function logPermissionDenied(
    userId: string,
    resource: string,
    action: string,
    ipAddress?: string
): Promise<void> {
    await logSecurityEvent({
        type: 'PERMISSION_DENIED',
        userId,
        resource,
        action,
        ipAddress,
        success: false,
    })
}

/**
 * Helper to log role changes
 */
export async function logRoleChange(
    targetUserId: string,
    changedByUserId: string,
    oldRole: string,
    newRole: string,
    ipAddress?: string
): Promise<void> {
    await logSecurityEvent({
        type: 'ROLE_CHANGE',
        userId: targetUserId,
        success: true,
        details: {
            changedBy: changedByUserId,
            oldRole,
            newRole,
        },
        ipAddress,
    })
}

/**
 * Helper to log admin actions
 */
export async function logAdminAction(
    adminUserId: string,
    action: string,
    resource: string,
    ipAddress?: string,
    details?: Record<string, unknown>
): Promise<void> {
    await logSecurityEvent({
        type: 'ADMIN_ACTION',
        userId: adminUserId,
        resource,
        action,
        success: true,
        details,
        ipAddress,
    })
}
