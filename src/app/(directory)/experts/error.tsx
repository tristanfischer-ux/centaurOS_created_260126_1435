'use client'

/**
 * Error boundary for the /experts directory page.
 *
 * @description Catches render errors and shows a graceful fallback
 * instead of the generic "Something went wrong" page.
 */

export default function ExpertsError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    return (
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    Find Your Fractional Executive
                </h1>
                <p className="mt-2 max-w-2xl text-lg text-muted-foreground leading-relaxed">
                    Browse vetted CMOs, CFOs, CTOs, and more.
                </p>
            </div>

            <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-sm text-muted-foreground mb-4">
                    Unable to load the expert directory right now. Please try again.
                </p>
                <button
                    onClick={reset}
                    className="rounded-md bg-international-orange px-4 py-2 text-sm font-medium text-white hover:bg-international-orange/90"
                >
                    Try again
                </button>
            </div>
        </div>
    )
}
