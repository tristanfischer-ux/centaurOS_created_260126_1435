"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { UserCircle, Settings, LogOut, ChevronDown } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { signOut } from "@/actions/auth"
import { useState } from "react"

/**
 * AccountPopover - User account menu triggered from the sidebar avatar area.
 *
 * @description Provides access to personal/account concerns (My Profile,
 * Account Settings, Sign Out) separate from company governance navigation.
 * This follows the standard SaaS pattern (Notion, Linear, Figma) of placing
 * account actions under the user avatar rather than in the main sidebar nav.
 *
 * @param {string} userName - Display name of the current user
 * @param {string} userRole - Role badge text (e.g. "Founder", "Executive")
 */

interface AccountPopoverProps {
    userName?: string
    userRole?: string
}

const accountLinks = [
    {
        name: "My Profile",
        href: "/my-profile",
        icon: UserCircle,
        description: "Marketplace profile and presence",
    },
    {
        name: "Settings",
        href: "/settings",
        icon: Settings,
        description: "Account and app settings",
    },
]

export function AccountPopover({ userName, userRole }: AccountPopoverProps) {
    const pathname = usePathname()
    const [open, setOpen] = useState(false)

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    className={cn(
                        "w-full flex items-center justify-between rounded-md px-2 py-2",
                        "hover:bg-muted transition-colors text-left",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-international-orange"
                    )}
                    aria-label="Account menu"
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="text-sm text-muted-foreground truncate">
                            {userName || "Loading..."}
                        </div>
                        <span className="text-[10px] text-international-orange font-mono uppercase px-1.5 py-0.5 bg-orange-50 border border-orange-200 font-semibold tracking-wide flex-shrink-0">
                            {userRole || "Member"}
                        </span>
                    </div>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 ml-2" />
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                side="bottom"
                sideOffset={4}
                className="w-64 p-2"
            >
                <div className="space-y-1">
                    {accountLinks.map((item) => {
                        const isActive =
                            pathname === item.href ||
                            pathname.startsWith(item.href + "/")
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                onClick={() => setOpen(false)}
                                className={cn(
                                    "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                                    isActive
                                        ? "bg-orange-50 text-international-orange font-semibold"
                                        : "text-foreground hover:bg-muted"
                                )}
                            >
                                <item.icon
                                    className={cn(
                                        "h-4 w-4 flex-shrink-0",
                                        isActive
                                            ? "text-international-orange"
                                            : "text-muted-foreground"
                                    )}
                                    aria-hidden="true"
                                />
                                <div className="min-w-0">
                                    <div className="font-medium">{item.name}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {item.description}
                                    </div>
                                </div>
                            </Link>
                        )
                    })}

                    {/* Separator */}
                    <div className="my-1 border-t border-border" />

                    {/* Sign Out */}
                    <form action={signOut}>
                        <button
                            type="submit"
                            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                        >
                            <LogOut className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                            <span className="font-medium">Sign Out</span>
                        </button>
                    </form>
                </div>
            </PopoverContent>
        </Popover>
    )
}
