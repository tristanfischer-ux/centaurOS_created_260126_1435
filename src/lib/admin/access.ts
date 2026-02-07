import { createClient } from "@/lib/supabase/server"
import { AdminUser, AdminRole } from "@/types/admin.types"

export type { AdminRole, AdminUser }

// Type helper for tables not yet in generated types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedClient = any

/**
 * Check if a user has platform admin privileges.
 * 
 * @description Platform admin access is strictly controlled via:
 * 1. The admin_users table (primary source of truth)
 * 2. PLATFORM_SUPER_ADMIN_EMAIL env var (break-glass safety net)
 * 
 * @security Founder/Executive roles do NOT grant platform admin access.
 * Those roles grant access to the Company Admin hub (/admin) but NOT
 * to the platform operations dashboard (ops subdomain).
 */
export async function isAdmin(userId: string): Promise<boolean> {
    const supabase = await createClient() as UntypedClient
    
    // PRIMARY: Check admin_users table
    const { data, error } = await supabase
        .from('admin_users')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle()
    
    // RLS may block non-admins from querying this table entirely,
    // which is expected behavior - don't log it as an error
    if (error) {
        const isExpectedError = 
            error.code === 'PGRST301' || 
            error.code === '42501' ||
            (error.message && error.message.includes('infinite recursion'))
        
        if (!isExpectedError) {
            console.error('[AdminAccess] Error checking admin status:', error.message || error.code)
        }
        // Fall through to env var check
    }
    
    if (data) {
        return true
    }
    
    // SAFETY NET: Env var for platform owner (break glass)
    const superAdminEmail = process.env.PLATFORM_SUPER_ADMIN_EMAIL
    if (superAdminEmail) {
        const { data: { user } } = await supabase.auth.getUser()
        if (user?.email === superAdminEmail) {
            return true
        }
    }
    
    // SECURITY: No Founder/Executive fallback. Those roles grant Company
    // Admin access, not platform admin access.
    return false
}

/**
 * Get the admin role for a user
 */
export async function getAdminRole(userId: string): Promise<AdminRole | null> {
    const supabase = await createClient() as UntypedClient
    
    const { data, error } = await supabase
        .from('admin_users')
        .select('admin_role')
        .eq('user_id', userId)
        .maybeSingle()
    
    // RLS may block non-admins - this is expected, not an error
    if (error) {
        const isExpectedError = 
            error.code === 'PGRST301' || 
            error.code === '42501' ||
            (error.message && error.message.includes('infinite recursion'))
        
        if (!isExpectedError) {
            console.error('Error fetching admin role:', error.message || error.code)
        }
        return null
    }
    
    return data?.admin_role as AdminRole | null
}

/**
 * Get full admin user data
 */
export async function getAdminUser(userId: string): Promise<AdminUser | null> {
    const supabase = await createClient() as UntypedClient
    
    const { data, error } = await supabase
        .from('admin_users')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
    
    // RLS may block non-admins - this is expected, not an error
    if (error) {
        const isExpectedError = 
            error.code === 'PGRST301' || 
            error.code === '42501' ||
            (error.message && error.message.includes('infinite recursion'))
        
        if (!isExpectedError) {
            console.error('Error fetching admin user:', error.message || error.code)
        }
        return null
    }
    
    return data as AdminUser | null
}

/**
 * Middleware-like function for server actions that require admin access.
 * Returns the admin user if authorized, throws if not.
 */
export async function requireAdmin(): Promise<{
    userId: string
    adminUser: AdminUser
    supabase: UntypedClient
}> {
    const supabase = await createClient() as UntypedClient
    
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
        throw new Error('Not authenticated')
    }
    
    const { data: adminUser, error } = await supabase
        .from('admin_users')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()
    
    // RLS blocks non-admins, or there's a real error
    if (error) {
        const isExpectedError = 
            error.code === 'PGRST301' || 
            error.code === '42501' ||
            (error.message && error.message.includes('infinite recursion'))
        
        if (!isExpectedError) {
            console.error('Error checking admin access:', error.message || error.code)
        }
        throw new Error('Failed to verify admin access')
    }
    
    if (!adminUser) {
        throw new Error('Admin access required')
    }
    
    return {
        userId: user.id,
        adminUser: adminUser as AdminUser,
        supabase
    }
}

/**
 * Check if admin has specific permission
 */
export async function hasPermission(userId: string, permission: string): Promise<boolean> {
    const adminUser = await getAdminUser(userId)
    
    if (!adminUser) {
        return false
    }
    
    // Super admins have all permissions
    if (adminUser.admin_role === 'super_admin') {
        return true
    }
    
    // Check specific permission in the permissions JSONB
    return adminUser.permissions?.[permission] === true
}

/**
 * Role-based permission check
 */
export function canAccessFeature(role: AdminRole, feature: string): boolean {
    const rolePermissions: Record<AdminRole, string[]> = {
        super_admin: ['*'], // All access
        operations: ['applications', 'disputes', 'health', 'metrics'],
        support: ['applications', 'disputes'],
        finance: ['metrics', 'payments', 'disputes'],
        readonly: ['view_only']
    }
    
    const permissions = rolePermissions[role]
    
    if (permissions.includes('*')) {
        return true
    }
    
    return permissions.includes(feature)
}
