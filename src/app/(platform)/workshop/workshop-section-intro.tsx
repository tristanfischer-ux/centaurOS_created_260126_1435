/**
 * WorkshopSectionIntro — Client component for the "Workshop" section intro page.
 *
 * @description Wraps the shared SectionIntroPage with the "workshop" section data,
 * plus a "Start Building" CTA, Forge showcase examples, The Forge spotlight,
 * and team quick-view card.
 */

"use client"

import Link from "next/link"
import {
    Flame,
    ArrowRight,
    Boxes,
    Users,
    Plus,
    FileText,
    Cpu,
    Wrench,
    BookOpen,
} from "lucide-react"

import { SectionIntroPage } from "@/components/sidebar/SectionIntroPage"
import { getSectionById } from "@/lib/features/section-registry"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

const section = getSectionById("workshop")!

/** Static showcase items representing what The Forge produces */
const FORGE_SHOWCASE = [
    {
        name: "Reaction Wheel Assembly",
        stage: "Dossier",
        description: "Full engineering spec with 3D CAD, material BOM, and manufacturing steps",
        icon: Cpu,
    },
    {
        name: "Drone Frame v2",
        stage: "Concept",
        description: "Carbon fibre frame scanned from a napkin sketch into buildable specs",
        icon: Wrench,
    },
    {
        name: "EV Battery Enclosure",
        stage: "People",
        description: "Thermal-managed enclosure with supplier matches and cost estimates",
        icon: FileText,
    },
] as const

const STAGE_VARIANT: Record<string, "default" | "secondary" | "info"> = {
    Concept: "secondary",
    Dossier: "default",
    People: "info",
}

export function WorkshopSectionIntro(): React.ReactElement {
    return (
        <div className="space-y-0">
            <SectionIntroPage section={section} />

            {/* Start Building CTA */}
            <div className="px-4 sm:px-6 lg:px-8 pt-2">
                <Card className="border-2 border-international-orange/20 bg-gradient-to-br from-background to-international-orange/[0.03]">
                    <CardContent className="pt-6 pb-6">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-orange-50 shrink-0">
                                    <Flame className="h-6 w-6 text-international-orange" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-foreground">
                                        Ready to build something?
                                    </h3>
                                    <p className="text-sm text-muted-foreground">
                                        Describe any product idea and The Forge turns it into a full engineering dossier.
                                    </p>
                                </div>
                            </div>
                            <Link href="/the-forge/new">
                                <Button className="bg-international-orange hover:bg-international-orange-hover gap-2 min-w-[160px]">
                                    <Plus className="h-4 w-4" />
                                    Create a Concept
                                </Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* The Forge Showcase — examples of what it produces */}
            <div className="px-4 sm:px-6 lg:px-8 pt-8">
                <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-6">
                    What The Forge produces
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {FORGE_SHOWCASE.map((item) => {
                        const Icon = item.icon
                        return (
                            <Link key={item.name} href="/the-forge">
                                <Card className="group h-full hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer border">
                                    <CardContent className="pt-6">
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-orange-50 group-hover:bg-orange-100 transition-colors">
                                                <Icon className="h-5 w-5 text-international-orange" />
                                            </div>
                                            <Badge variant={STAGE_VARIANT[item.stage] ?? "secondary"}>
                                                {item.stage}
                                            </Badge>
                                        </div>
                                        <h3 className="text-sm font-semibold text-foreground mb-1 group-hover:text-international-orange transition-colors">
                                            {item.name}
                                        </h3>
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            {item.description}
                                        </p>
                                    </CardContent>
                                </Card>
                            </Link>
                        )
                    })}
                </div>
            </div>

            {/* The Forge Spotlight */}
            <div className="px-4 sm:px-6 lg:px-8 pt-6">
                <Link href="/the-forge" className="block group">
                    <Card className="border border-dashed border-electric-blue/20 hover:border-electric-blue/40 hover:shadow-md hover:-translate-y-0.5 transition-all bg-gradient-to-br from-background to-electric-blue/[0.02]">
                        <CardContent className="pt-5 pb-4 flex items-center gap-4">
                            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-electric-blue/10 shrink-0 group-hover:bg-electric-blue/20 transition-colors">
                                <Boxes className="h-5 w-5 text-electric-blue" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-foreground group-hover:text-electric-blue transition-colors">
                                    Design physical products? Try The Forge
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Turn any product idea into manufacturing-ready 3D CAD models
                                </p>
                            </div>
                            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-electric-blue transition-colors shrink-0" />
                        </CardContent>
                    </Card>
                </Link>
            </div>

            {/* Team Quick View */}
            <div className="px-4 sm:px-6 lg:px-8 pt-6">
                <Link href="/team" className="block group">
                    <Card className="hover:shadow-md hover:-translate-y-0.5 transition-all border">
                        <CardContent className="pt-5 pb-4 flex items-center gap-4">
                            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-orange-50 shrink-0 group-hover:bg-orange-100 transition-colors">
                                <Users className="h-5 w-5 text-international-orange" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-foreground group-hover:text-international-orange transition-colors">
                                    Manage your team
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    View team members, assign roles, and track capacity
                                </p>
                            </div>
                            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-international-orange transition-colors shrink-0" />
                        </CardContent>
                    </Card>
                </Link>
            </div>

            {/* Inspiration — techniques, tutorials, guidance */}
            <div className="px-4 sm:px-6 lg:px-8 pt-6 pb-4">
                <Link href="/learn" className="block group">
                    <Card className="hover:shadow-md hover:-translate-y-0.5 transition-all border">
                        <CardContent className="pt-5 pb-4 flex items-center gap-4">
                            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-electric-blue/10 shrink-0 group-hover:bg-electric-blue/20 transition-colors">
                                <BookOpen className="h-5 w-5 text-electric-blue" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-foreground group-hover:text-electric-blue transition-colors">
                                    Inspiration
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Techniques, tutorials, and expert guidance to level up your craft
                                </p>
                            </div>
                            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-electric-blue transition-colors shrink-0" />
                        </CardContent>
                    </Card>
                </Link>
            </div>
        </div>
    )
}
