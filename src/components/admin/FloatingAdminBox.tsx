'use client'

interface FloatingAdminBoxProps {
    foundryId: string | null
    isFounder: boolean
    hasAdminAccess: boolean
}

export function FloatingAdminBox({ foundryId, isFounder, hasAdminAccess }: FloatingAdminBoxProps) {
    // Only render for users with admin access
    if (!hasAdminAccess && !isFounder) {
        return null
    }

    // Placeholder - can be expanded later
    return null
}
