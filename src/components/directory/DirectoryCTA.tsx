/**
 * DirectoryCTA - Call-to-action banner for the public directory.
 *
 * @description Encourages visitors to sign up as an expert or hire one.
 * Appears at the bottom of directory pages and individual profiles.
 *
 * @component
 *
 * @example
 * <DirectoryCTA variant="hire" />
 * <DirectoryCTA variant="list" />
 */

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowRight, Users, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DirectoryCTAProps {
    /** Which CTA to show */
    variant: 'hire' | 'list' | 'both'
    /** Additional CSS classes */
    className?: string
}

export function DirectoryCTA({ variant, className }: DirectoryCTAProps) {
    if (variant === 'both') {
        return (
            <div className={cn('grid grid-cols-1 gap-6 md:grid-cols-2', className)}>
                <CTACard
                    icon={Users}
                    title="Looking for an expert?"
                    description="Tell us what you need and we'll match you with vetted fractional executives who fit your budget, industry, and timeline."
                    buttonText="Find Your Expert"
                    buttonHref="/login"
                />
                <CTACard
                    icon={Sparkles}
                    title="Are you a fractional executive?"
                    description="Join our growing directory. Get discovered by companies who need your expertise. Free to list, with premium options available."
                    buttonText="List Your Profile"
                    buttonHref="/join/expert"
                />
            </div>
        )
    }

    if (variant === 'hire') {
        return (
            <div className={className}>
                <CTACard
                    icon={Users}
                    title="Ready to hire this expert?"
                    description="Sign up to book a discovery call, request a proposal, or start a trial engagement. It takes less than 2 minutes."
                    buttonText="Get Started Free"
                    buttonHref="/login"
                    wide
                />
            </div>
        )
    }

    return (
        <div className={className}>
            <CTACard
                icon={Sparkles}
                title="Join the Fractional Forge directory"
                description="Get discovered by companies looking for your expertise. Create your profile in minutes and start receiving leads."
                buttonText="List Your Profile"
                buttonHref="/join/expert"
                wide
            />
        </div>
    )
}

function CTACard({
    icon: Icon,
    title,
    description,
    buttonText,
    buttonHref,
    wide = false,
}: {
    icon: typeof Users
    title: string
    description: string
    buttonText: string
    buttonHref: string
    wide?: boolean
}) {
    return (
        <Card className={cn('overflow-hidden', wide && 'mx-auto max-w-3xl')}>
            <CardContent className="p-8">
                <div className={cn('flex flex-col items-center text-center', wide && 'sm:flex-row sm:text-left sm:gap-8')}>
                    <div className="mb-4 flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-international-orange/10 sm:mb-0">
                        <Icon className="h-7 w-7 text-international-orange" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-lg font-semibold text-foreground">
                            {title}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                            {description}
                        </p>
                    </div>
                    <div className="mt-4 sm:mt-0">
                        <Link href={buttonHref}>
                            <Button size="lg" className="gap-1.5">
                                {buttonText}
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </Link>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
