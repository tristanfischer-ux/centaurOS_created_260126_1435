import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function getInitials(name: string | null | undefined): string {
    if (!name) return "??"
    const trimmed = name.trim()
    if (trimmed.length === 0) return "??"
    const parts = trimmed.split(/\s+/).filter(part => part.length > 0)
    if (parts.length === 0) return "??"
    if (parts.length === 1) {
        const firstPart = parts[0]
        return firstPart.substring(0, Math.min(2, firstPart.length)).toUpperCase() || "??"
    }
    const firstInitial = parts[0][0] || ""
    const lastInitial = parts[parts.length - 1][0] || ""
    return (firstInitial + lastInitial).toUpperCase() || "??"
}

export function formatStatus(status: string): string {
    return status.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}
