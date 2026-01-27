"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
// We'll replace these with Lucide icons later if needed, or maintain text/emoji
import { LayoutDashboard, Users, CheckSquare, Calendar, ShoppingBag, Settings } from "lucide-react"

const navigation = [
    { name: "Objectives", href: "/objectives", icon: LayoutDashboard },
    { name: "Roster", href: "/team", icon: Users },
    { name: "Tasks", href: "/tasks", icon: CheckSquare },
    { name: "Timeline", href: "/timeline", icon: Calendar },
    { name: "Marketplace", href: "/marketplace", icon: ShoppingBag },
    { name: "Settings", href: "/settings", icon: Settings },
]

export function Sidebar({ foundryName, foundryId, userName, userRole }: { foundryName?: string; foundryId?: string; userName?: string; userRole?: string }) {
    const pathname = usePathname()

    return (
        <div className="hidden md:flex h-screen w-64 flex-col bg-slate-50 text-slate-900 border-r border-slate-200">
            <div className="flex flex-col h-24 items-center justify-center border-b border-slate-200 bg-white">
                <div className="font-bold text-xl tracking-wider uppercase text-amber-600">
                    Centaur App
                </div>
                <div className="mt-2 text-center">
                    <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide px-2 truncate max-w-[200px]">
                        {foundryName || "Centaur Inc."}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                        {foundryId || "ID: Loading..."}
                    </div>
                    {/* Current User */}
                    <div className="mt-2 pt-2 border-t border-slate-200">
                        <div className="text-xs font-medium text-slate-900 truncate px-2">
                            {userName}
                        </div>
                        <div className="text-[10px] text-slate-500">
                            {userRole}
                        </div>
                    </div>
                </div>
            </div>
            <nav className="flex-1 space-y-1 px-2 py-4">
                {navigation.map((item) => {
                    const isActive = pathname.startsWith(item.href)
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                isActive
                                    ? "bg-white text-amber-600 shadow-sm border border-slate-200"
                                    : "text-slate-500 hover:bg-white hover:text-slate-900 hover:shadow-sm",
                                "group flex items-center rounded-md px-2 py-2 text-sm font-medium transition-all"
                            )}
                        >
                            <item.icon
                                className={cn(
                                    isActive ? "text-amber-500" : "text-slate-400 group-hover:text-amber-500",
                                    "mr-3 h-5 w-5 flex-shrink-0"
                                )}
                                aria-hidden="true"
                            />
                            {item.name}
                        </Link>
                    )
                })}
            </nav>
            <div className="border-t border-slate-200 p-4">
                <div className="flex items-center mb-2">
                    {/* Placeholder for user profile */}
                    <div className="h-8 w-8 rounded-full bg-slate-200"></div>
                    <div className="ml-3">
                        <p className="text-sm font-medium text-slate-900">User</p>
                        <p className="text-xs text-slate-500">Foundry Member</p>
                    </div>
                </div>
                <div className="text-[10px] text-slate-400 text-center font-mono">
                    v1.0.3
                </div>
            </div>
        </div>
    )
}
