"use client"

import * as React from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn, getInitials } from "@/lib/utils"
import { Bot } from "lucide-react"

/**
 * Role-based avatar colors for CentaurOS
 * Following the design philosophy: bright, airy, optimistic
 */
export const ROLE_COLORS = {
  Founder: {
    bg: "bg-orange-100",
    text: "text-orange-700",
    border: "border-orange-200",
  },
  Executive: {
    bg: "bg-blue-100",
    text: "text-blue-700",
    border: "border",
  },
  Apprentice: {
    bg: "bg-green-100",
    text: "text-green-700",
    border: "border-green-200",
  },
  AI_Agent: {
    bg: "bg-purple-100",
    text: "text-purple-600",
    border: "border-purple-200",
  },
  // Default for any other roles
  default: {
    bg: "bg-muted",
    text: "text-muted-foreground",
    border: "border",
  },
} as const

export type UserRole = keyof typeof ROLE_COLORS | string

export function getRoleColors(role: string | null | undefined) {
  if (!role) return ROLE_COLORS.default
  return ROLE_COLORS[role as keyof typeof ROLE_COLORS] || ROLE_COLORS.default
}

export interface UserAvatarProps {
  /** User's full name for generating initials */
  name: string | null | undefined
  /** User's role for color coding */
  role?: string | null
  /** Optional avatar image URL */
  avatarUrl?: string | null
  /** Size variant */
  size?: "xs" | "sm" | "md" | "lg" | "xl"
  /** Additional className for the Avatar root */
  className?: string
  /** Whether to show a border */
  showBorder?: boolean
  /** Custom z-index for stacked avatars */
  style?: React.CSSProperties
}

const sizeClasses = {
  xs: "h-4 w-4",
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-10 w-10",
  xl: "h-14 w-14",
}

const textSizeClasses = {
  xs: "text-[6px]",
  sm: "text-[10px]",
  md: "text-xs",
  lg: "text-sm",
  xl: "text-xl",
}

const iconSizeClasses = {
  xs: "h-2 w-2",
  sm: "h-3 w-3",
  md: "h-3.5 w-3.5",
  lg: "h-4 w-4",
  xl: "h-6 w-6",
}

/**
 * UserAvatar - Standardized avatar component for CentaurOS
 * 
 * Features:
 * - Consistent initials (first name + last name)
 * - Role-based color coding (Founder=orange, Executive=blue, Apprentice=green, AI=purple)
 * - Multiple size variants
 * - Support for avatar images with fallback
 * 
 * @example
 * ```tsx
 * <UserAvatar name="John Smith" role="Executive" size="md" />
 * <UserAvatar name="AI Assistant" role="AI_Agent" size="lg" />
 * <UserAvatar name="Jane Doe" role="Founder" avatarUrl="/images/jane.jpg" />
 * ```
 */
export function UserAvatar({
  name,
  role,
  avatarUrl,
  size = "md",
  className,
  showBorder = false,
  style,
}: UserAvatarProps) {
  const isAI = role === "AI_Agent"
  const colors = getRoleColors(role)
  const initials = getInitials(name)

  return (
    <Avatar
      className={cn(
        sizeClasses[size],
        showBorder && `border-2 border-white ring-1 ${colors.border}`,
        className
      )}
      style={style}
    >
      {/* AI Agent special avatar */}
      {isAI && (
        <AvatarImage 
          src="/images/ai-agent-avatar.png" 
          className="object-cover" 
          alt="AI Agent"
        />
      )}
      
      {/* User avatar image */}
      {!isAI && avatarUrl && (
        <AvatarImage 
          src={avatarUrl} 
          alt={name || "User"} 
        />
      )}
      
      {/* Fallback with initials */}
      <AvatarFallback
        className={cn(
          textSizeClasses[size],
          "font-medium",
          colors.bg,
          colors.text
        )}
      >
        {isAI ? (
          <Bot className={iconSizeClasses[size]} />
        ) : (
          initials
        )}
      </AvatarFallback>
    </Avatar>
  )
}

/**
 * UserAvatarStack - Display multiple avatars in a stacked layout
 * 
 * @example
 * ```tsx
 * <UserAvatarStack 
 *   users={[
 *     { name: "John", role: "Executive" },
 *     { name: "Jane", role: "Founder" }
 *   ]} 
 *   max={3}
 * />
 * ```
 */
export interface UserAvatarStackProps {
  users: Array<{
    id?: string
    name: string | null | undefined
    role?: string | null
    avatarUrl?: string | null
  }>
  /** Maximum avatars to show before +N indicator */
  max?: number
  /** Size of avatars */
  size?: UserAvatarProps["size"]
  /** Additional className */
  className?: string
}

export function UserAvatarStack({
  users,
  max = 4,
  size = "md",
  className,
}: UserAvatarStackProps) {
  const visibleUsers = users.slice(0, max)
  const remainingCount = users.length - max

  return (
    <div className={cn("flex -space-x-2", className)}>
      {visibleUsers.map((user, index) => (
        <UserAvatar
          key={user.id || index}
          name={user.name}
          role={user.role}
          avatarUrl={user.avatarUrl}
          size={size}
          showBorder
          style={{ zIndex: 10 - index }}
        />
      ))}
      {remainingCount > 0 && (
        <div
          className={cn(
            sizeClasses[size],
            "rounded-full bg-slate-200 text-muted-foreground flex items-center justify-center border-2 border-white",
            textSizeClasses[size],
            "font-medium"
          )}
          style={{ zIndex: 0 }}
        >
          +{remainingCount}
        </div>
      )}
    </div>
  )
}

export default UserAvatar
