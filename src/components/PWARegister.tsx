"use client"

import { useEffect } from "react"

// INTENT: Clean up stale service workers left by a previous caching SW deployment.
// DECISION: We unregister + clear caches directly from the page instead of
// registering a self-unregistering sw.js. The old approach caused an
// InvalidStateError race condition: sw.js would unregister itself, then on
// the next page load PWARegister would try to re-register it while the
// browser was still tearing down the old registration.
// See: Sentry JAVASCRIPT-NEXTJS-B (Feb 2026)
export function PWARegister(): null {
    useEffect(() => {
        if (!("serviceWorker" in navigator)) return

        navigator.serviceWorker
            .getRegistrations()
            .then((registrations) => {
                for (const registration of registrations) {
                    registration.unregister()
                }
            })
            .catch(() => {
                // Non-actionable — user's browser may not support getRegistrations
            })

        caches
            .keys()
            .then((names) =>
                Promise.all(names.map((name) => caches.delete(name)))
            )
            .catch(() => {
                // Non-actionable — caches API may not be available
            })
    }, [])

    return null
}
