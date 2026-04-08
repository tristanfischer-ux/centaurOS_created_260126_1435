'use client'

/**
 * Error boundary for the preview page.
 * Shows a clean redirect back to review queue instead of "Something went wrong".
 */

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

export default function PreviewError() {
    return (
        <div className="max-w-5xl space-y-6">
            <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-sm text-muted-foreground mb-4">
                    This content may have already been published or is no longer available for review.
                </p>
                <Link href="/review">
                    <Button variant="secondary" size="sm">
                        <ArrowLeft className="h-4 w-4 mr-1" />
                        Back to Review Queue
                    </Button>
                </Link>
            </div>
        </div>
    )
}
