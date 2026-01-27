"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { LayoutDashboard, Users, CheckSquare, Calendar, ShoppingBag } from "lucide-react"

const navigation = [
    { name: "Objectives", href: "/objectives", icon: LayoutDashboard },
    { name: "Roster", href: "/team", icon: Users },
    { name: "Tasks", href: "/tasks", icon: CheckSquare },
    { name: "Timeline", href: "/timeline", icon: Calendar },
    { name: "Marketplace", href: "/marketplace", icon: ShoppingBag },
]

export function MobileNav() {
    const pathname = usePathname()

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 md:hidden pb-safe">
            <div className="flex justify-around items-center h-16">
                {navigation.map((item) => {
                    const isActive = pathname.startsWith(item.href)
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                "flex flex-col items-center justify-center w-full min-h-[44px] h-full space-y-1 touch-action-manipulation",
                                isActive ? "text-amber-600" : "text-slate-400 hover:text-slate-600"
                            )}
                        >
                            <item.icon className={cn("h-5 w-5", isActive && "fill-current")} />
                            <span className="text-[10px] font-medium">{item.name}</span>
                        </Link>
                    )
                })}
            </div>
        </div>
    )
}
