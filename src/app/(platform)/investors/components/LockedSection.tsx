/**
 * @file LockedSection.tsx
 *
 * @description Reusable tier-gated content component. Renders section title + lock icon,
 * blurred placeholder content, and an overlay card with upgrade CTA.
 */

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Lock } from 'lucide-react'

interface LockedSectionProps {
  title: string
  requiredTier: 'starter' | 'professional'
  featureDescription: string
  children: React.ReactNode
}

const TIER_NAMES: Record<string, string> = {
  starter: 'Startup Team',
  professional: 'Professional',
}

/**
 * Wraps content in a blur overlay with an upgrade CTA when the user's tier
 * is below the required level.
 */
export function LockedSection({ title, requiredTier, featureDescription, children }: LockedSectionProps) {
  const tierName = TIER_NAMES[requiredTier] ?? requiredTier

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          {title}
          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
        </h2>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Blurred placeholder content */}
          <div className="blur-[6px] select-none pointer-events-none" aria-hidden="true">
            {children}
          </div>

          {/* Upgrade overlay */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-card border border-border rounded-lg px-6 py-5 text-center shadow-sm max-w-xs">
              <Lock className="h-5 w-5 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground mb-1">
                Upgrade to {tierName}
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                {featureDescription}
              </p>
              <Button asChild size="sm" className="bg-international-orange hover:bg-international-orange-hover">
                <Link href="/pricing">View Plans</Link>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
