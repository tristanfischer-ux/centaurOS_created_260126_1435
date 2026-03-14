"use client"

import * as React from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn, getInitials } from "@/lib/utils"
import { Bot } from "lucide-react"

function formatRole(role: string): string {
  if (role === "AI_Agent") return "AI Agent"
  return role
}

/**
 * Role-based avatar colors for ForgeOS
 * Following the design philosophy: bright, airy, optimistic
 * Uses orange hierarchy: Founder (dark orange) > Executive (light orange) > Apprentice (neutral)
 */
export const ROLE_COLORS = {
  Founder: {
    bg: "bg-orange-100",
    text: "text-orange-700",
  },
  Executive: {
    bg: "bg-orange-50",
    text: "text-orange-600",
  },
  Apprentice: {
    bg: "bg-muted",
    text: "text-muted-foreground",
  },
  Supplier: {
    bg: "bg-blue-50",
    text: "text-blue-600",
  },
  AI_Agent: {
    bg: "bg-purple-100",
    text: "text-purple-600",
  },
  // Default for any other roles
  default: {
    bg: "bg-muted",
    text: "text-muted-foreground",
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
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl"
  /** Additional className for the Avatar root */
  className?: string
  /** Custom z-index for stacked avatars */
  style?: React.CSSProperties
  /** Show name/role tooltip on hover. Default true. */
  showTooltip?: boolean
}

const sizeClasses = {
  xs: "h-4 w-4",
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-10 w-10",
  xl: "h-14 w-14",
  "2xl": "h-28 w-28",
  "3xl": "h-32 w-32",
}

const textSizeClasses = {
  xs: "text-[6px]",
  sm: "text-[10px]",
  md: "text-xs",
  lg: "text-sm",
  xl: "text-xl",
  "2xl": "text-2xl",
  "3xl": "text-4xl",
}

const iconSizeClasses = {
  xs: "h-2 w-2",
  sm: "h-3 w-3",
  md: "h-3.5 w-3.5",
  lg: "h-4 w-4",
  xl: "h-6 w-6",
  "2xl": "h-12 w-12",
  "3xl": "h-16 w-16",
}

/**
 * UserAvatar - Standardized avatar component for ForgeOS
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
  style,
  showTooltip = true,
}: UserAvatarProps) {
  const isAI = role === "AI_Agent"
  const colors = getRoleColors(role)
  const initials = getInitials(name)
  const hasTooltipContent = showTooltip && (name != null || role != null)

  const avatarElement = (
    <Avatar
      className={cn(
        sizeClasses[size],
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

  if (hasTooltipContent) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{avatarElement}</TooltipTrigger>
        <TooltipContent side="top" className="text-center">
          <p className="font-medium">{name || "Unknown"}</p>
          {role != null && role !== "" && (
            <p className="text-muted-foreground">{formatRole(role)}</p>
          )}
        </TooltipContent>
      </Tooltip>
    )
  }

  return avatarElement
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
  /** Show name/role tooltips on hover. Default true. */
  showTooltip?: boolean
}

export function UserAvatarStack({
  users,
  max = 4,
  size = "md",
  className,
  showTooltip = true,
}: UserAvatarStackProps) {
  const visibleUsers = users.slice(0, max)
  const remainingUsers = users.slice(max)
  const remainingCount = remainingUsers.length

  const overflowIndicator = (
    <div
      className={cn(
        sizeClasses[size],
        "rounded-full bg-muted text-muted-foreground flex items-center justify-center",
        textSizeClasses[size],
        "font-medium"
      )}
      style={{ zIndex: 0 }}
    >
      +{remainingCount}
    </div>
  )

  return (
    <div className={cn("flex -space-x-2", className)}>
      {visibleUsers.map((user, index) => (
        <UserAvatar
          key={user.id || index}
          name={user.name}
          role={user.role}
          avatarUrl={user.avatarUrl}
          size={size}
          style={{ zIndex: 10 - index }}
          showTooltip={showTooltip}
        />
      ))}
      {remainingCount > 0 &&
        (showTooltip && remainingUsers.some((u) => u.name != null || u.role != null) ? (
          <Tooltip>
            <TooltipTrigger asChild>{overflowIndicator}</TooltipTrigger>
            <TooltipContent side="top" className="text-center max-w-[200px]">
              {remainingUsers.map((user, i) => (
                <p key={user.id ?? i} className="font-medium">
                  {user.name || "Unknown"}
                  {user.role != null && user.role !== "" && (
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      · {formatRole(user.role)}
                    </span>
                  )}
                </p>
              ))}
            </TooltipContent>
          </Tooltip>
        ) : (
          overflowIndicator
        ))}
    </div>
  )
}

export default UserAvatar
