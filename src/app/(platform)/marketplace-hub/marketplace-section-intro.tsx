/**
 * MarketplaceSectionIntro — Client component for the "Marketplace" section intro page.
 *
 * @description Wraps the shared SectionIntroPage with the "marketplace" section data,
 * plus category quick-links, a search bar, and a featured/trending section.
 */

"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
    UserSearch,
    Store,
    Lightbulb,
    ArrowRight,
    Search,
    TrendingUp,
    Briefcase,
    Package,
    Palette,
} from "lucide-react"

import { SectionIntroPage } from "@/components/sidebar/SectionIntroPage"
import { getSectionById } from "@/lib/features/section-registry"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SpecialistBriefingHero } from "@/components/specialists/specialist-briefing-hero"

const section = getSectionById("marketplace")

/** Category quick-link definitions */
const CATEGORIES = [
    {
        title: "Find Experts",
        description: "Fractional executives, consultants, and specialists ready to help you move fast.",
        href: "/recruits",
        icon: UserSearch,
        accent: "bg-teal-50",
        accentText: "text-teal-600",
        accentHover: "group-hover:bg-teal-100",
    },
    {
        title: "Browse Products & Services",
        description: "Materials, components, and professional services. Compare, order, and track.",
        href: "/marketplace",
        icon: Store,
        accent: "bg-blue-50",
        accentText: "text-electric-blue",
        accentHover: "group-hover:bg-blue-100",
    },
    {
        title: "Browse Playbooks",
        description: "Find pre-built plans, project templates, and subsystems for your next initiative.",
        href: "/playbooks",
        icon: Lightbulb,
        accent: "bg-orange-50",
        accentText: "text-international-orange",
        accentHover: "group-hover:bg-orange-100",
    },
] as const

/** Static trending items for when no real data exists */
const TRENDING_ITEMS = [
    {
        name: "Fractional CTO",
        category: "People",
        badge: "Popular",
        icon: Briefcase,
    },
    {
        name: "3D Printing Services",
        category: "Services",
        badge: "Trending",
        icon: Package,
    },
    {
        name: "Product Design Consultancy",
        category: "Services",
        badge: "New",
        icon: Palette,
    },
    {
        name: "PCB Prototyping",
        category: "Products",
        badge: "Popular",
        icon: Package,
    },
] as const

const BADGE_VARIANT: Record<string, "default" | "secondary" | "info"> = {
    Popular: "default",
    Trending: "info",
    New: "secondary",
}

export function MarketplaceSectionIntro(): React.ReactElement | null {
    const router = useRouter()
    const [searchQuery, setSearchQuery] = useState("")

    if (!section) {
        console.error('[MarketplaceSectionIntro] Section "marketplace" not found in registry')
        return null
    }

    /** Navigate to marketplace with search query */
    function handleSearch(e: React.FormEvent): void {
        e.preventDefault()
        const trimmed = searchQuery.trim()
        if (trimmed) {
            router.push(`/marketplace?q=${encodeURIComponent(trimmed)}`)
        } else {
            router.push("/marketplace")
        }
    }

    return (
        <div className="space-y-0">
            <SectionIntroPage section={section} />

            {/* Search Bar */}
            <div className="px-4 sm:px-6 lg:px-8 pt-2">
                <Card className="border-2 border-teal-100 bg-gradient-to-br from-background to-teal-50/30">
                    <CardContent className="pt-6 pb-6">
                        <h3 className="text-lg font-semibold text-foreground mb-2">
                            What are you looking for?
                        </h3>
                        <p className="text-sm text-muted-foreground mb-4">
                            Search for talent, products, services, or anything else you need to move forward.
                        </p>
                        <form onSubmit={handleSearch} className="flex gap-3">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="e.g. CNC machining, fractional CFO, packaging design..."
                                    className="pl-10"
                                />
                            </div>
                            <Button type="submit" className="bg-teal-600 hover:bg-teal-700 gap-2">
                                <Search className="h-4 w-4" />
                                Search
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>

            {/* Chase's coaching tip */}
            <div className="px-4 sm:px-6 lg:px-8 pt-6">
                <SpecialistBriefingHero
                    specialistId="vp-supply-chain"
                    specialistName="Chase"
                    specialistTitle="Supply Chain"
                    narrative={null}
                    fallbackMessage="Find suppliers, hire talent, or discover playbooks. I'll help you compare options and match suppliers to your technical requirements."
                    isLoading={false}
                    severity="success"
                    context={{ type: 'general', title: 'Marketplace', description: 'Chase on the marketplace.', metadata: {} }}
                    storageKey="marketplace-intro"
                />
            </div>

            {/* Category Quick-Links */}
            <div className="px-4 sm:px-6 lg:px-8 pt-8">
                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-6">
                    Explore by category
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {CATEGORIES.map((cat) => {
                        const Icon = cat.icon
                        return (
                            <Link key={cat.title} href={cat.href}>
                                <Card className="group h-full hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer border">
                                    <CardContent className="pt-6">
                                        <div className={`flex items-center justify-center w-12 h-12 rounded-xl ${cat.accent} ${cat.accentHover} transition-colors mb-4`}>
                                            <Icon className={`h-6 w-6 ${cat.accentText}`} />
                                        </div>
                                        <h3 className={`text-base font-semibold text-foreground mb-1 ${cat.accentText.replace("text-", "group-hover:text-")} transition-colors`}>
                                            {cat.title}
                                        </h3>
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            {cat.description}
                                        </p>
                                    </CardContent>
                                </Card>
                            </Link>
                        )
                    })}
                </div>
            </div>

            {/* Trending / Featured */}
            <div className="px-4 sm:px-6 lg:px-8 pt-8 pb-4">
                <div className="flex items-center gap-2 mb-6">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
                        Popular right now
                    </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {TRENDING_ITEMS.map((item) => {
                        const Icon = item.icon
                        return (
                            <Link key={item.name} href="/marketplace">
                                <Card className="group hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer border h-full">
                                    <CardContent className="pt-5 pb-4">
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-muted group-hover:bg-teal-50 transition-colors">
                                                <Icon className="h-4 w-4 text-muted-foreground group-hover:text-teal-600 transition-colors" />
                                            </div>
                                            <Badge variant={BADGE_VARIANT[item.badge] ?? "secondary"} className="text-[10px]">
                                                {item.badge}
                                            </Badge>
                                        </div>
                                        <p className="text-sm font-semibold text-foreground group-hover:text-teal-600 transition-colors">
                                            {item.name}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {item.category}
                                        </p>
                                    </CardContent>
                                </Card>
                            </Link>
                        )
                    })}
                </div>
                <div className="mt-6 text-center">
                    <Link href="/marketplace" className="inline-flex items-center gap-2 text-sm font-medium text-teal-600 hover:text-teal-700 transition-colors">
                        Browse all listings
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                </div>
            </div>
        </div>
    )
}
