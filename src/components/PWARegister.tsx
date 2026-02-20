"use client"

import { useEffect } from "react"

// INTENT: Register the cleanup service worker that clears stale caches from
// a previous caching SW. The sw.js file is a self-unregistering stub — once
// it activates and purges caches, it removes itself. This prevents chunk
// mismatch errors (e.g. "Can't find variable: members") caused by old SWs
// serving JS from previous deployments alongside new deployment HTML.
export function PWARegister() {
    useEffect(() => {
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker
                .register("/sw.js", { updateViaCache: "none" })
                .then((reg) => {
                    reg.update()
                })
                .catch(() => {
                    // Silent — sw.js is a cleanup stub, failures are not actionable
                })
        }
    }, [])

    return null
}
