'use client'

import { FeatureTip } from '@/components/onboarding'

interface FeatureTipWrapperProps {
    children: React.ReactNode
}

export function FeatureTipWrapper({ children }: FeatureTipWrapperProps) {
    return (
        <FeatureTip
            id="objectives-create"
            title="Set Strategic Objectives"
            description="Define high-level goals that align your team. Tasks cascade from objectives, making progress visible and measurable."
            align="right"
        >
            {children}
        </FeatureTip>
    )
}
