/**
 * @file value-sections.tsx — Value proposition sections for the claim landing page.
 * HowItWorks, Advisory, Free, About — all static, no client interactivity.
 */

import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle2, Search, Users, Briefcase } from 'lucide-react'

// ─── How It Works ───────────────────────────────────────────────────────────────

export function HowItWorks() {
    const steps = [
        {
            number: '1',
            icon: Search,
            title: 'We research you',
            description: 'We add UK manufacturers from public data — websites, Companies House, certifications.',
        },
        {
            number: '2',
            icon: Users,
            title: 'Buyers find you',
            description: 'Engineers and procurement teams search by capability, material, and certification.',
        },
        {
            number: '3',
            icon: Briefcase,
            title: 'Work comes to you',
            description: 'Direct outreach from buyers, or advisory bookings for your manufacturing expertise.',
        },
    ]

    return (
        <section className="space-y-6">
            <h3 className="text-xl font-bold text-foreground text-center">
                How It Works
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {steps.map((step) => (
                    <Card key={step.number}>
                        <CardContent className="p-6 text-center space-y-3">
                            <div className="flex items-center justify-center h-10 w-10 rounded-full bg-international-orange/10 mx-auto">
                                <step.icon className="h-5 w-5 text-international-orange" />
                            </div>
                            <h4 className="font-semibold text-foreground">
                                {step.title}
                            </h4>
                            <p className="text-sm text-muted-foreground">
                                {step.description}
                            </p>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </section>
    )
}

// ─── Advisory Model ─────────────────────────────────────────────────────────────

export function AdvisoryModel() {
    return (
        <section className="space-y-4">
            <h3 className="text-xl font-bold text-foreground text-center">
                Get paid for what you already know
            </h3>
            <Card className="border-l-4 border-l-international-orange">
                <CardContent className="p-6 space-y-3">
                    <p className="text-foreground">
                        Your manufacturing knowledge is valuable beyond your shop floor.
                        Fractional Forge lets engineers book paid advisory sessions
                        with you — helping them with DFM, material selection, or process decisions.
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Per diem advisory leads to manufacturing work. Companies that
                        consult with you often send their production orders your way.
                    </p>
                </CardContent>
            </Card>
        </section>
    )
}

// ─── What's Free ────────────────────────────────────────────────────────────────

export function WhatsFree() {
    const items = [
        'Free to claim and update your listing',
        'Free for buyers to find and contact you',
        'No subscription, no commission, no hidden fees',
    ]

    return (
        <section className="space-y-4">
            <h3 className="text-xl font-bold text-foreground text-center">
                What&rsquo;s Free
            </h3>
            <div className="space-y-3">
                {items.map((item) => (
                    <div key={item} className="flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                        <p className="text-foreground">{item}</p>
                    </div>
                ))}
            </div>
        </section>
    )
}

// ─── About ──────────────────────────────────────────────────────────────────────

export function About() {
    return (
        <section className="space-y-4">
            <h3 className="text-xl font-bold text-foreground text-center">
                Built by someone who&rsquo;s done it
            </h3>
            <p className="text-sm text-muted-foreground text-center max-w-xl mx-auto">
                Fractional Forge was built by{' '}
                <a
                    href="https://www.linkedin.com/in/tristanfischer/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-international-orange hover:underline"
                >
                    Tristan Fischer
                </a>
                , who has spent years working with factories and manufacturers.
                The goal is simple: make it easier for great manufacturers to be found
                by the engineers and buyers who need them.
            </p>
        </section>
    )
}
