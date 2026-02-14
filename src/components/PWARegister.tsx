"use client"

import { useEffect } from "react"

/**
 * Registers the ForgeOS service worker for basic offline resilience.
 *
 * @description Defers registration until window load so first paint is not
 * delayed. Safely no-ops on unsupported browsers or insecure contexts.
 *
 * @returns {null} This component does not render UI
 */
export function PWARegister() {
    useEffect(() => {
        if (
            typeof window === "undefined" ||
            !("serviceWorker" in navigator) ||
            !window.isSecureContext
        ) {
            return
        }

        const registerServiceWorker = async (): Promise<void> => {
            try {
                // Some environments generate sw.js at build-time only.
                const workerProbe = await fetch("/sw.js", {
                    method: "HEAD",
                    cache: "no-store",
                })
                if (!workerProbe.ok) {
                    return
                }

                await navigator.serviceWorker.register("/sw.js", { scope: "/" })
            } catch (error) {
                console.error(
                    "[PWARegister] Service Worker registration failed:",
                    error instanceof Error ? error.message : "Unknown error"
                )
            }
        }

        window.addEventListener("load", registerServiceWorker)
        return (): void => window.removeEventListener("load", registerServiceWorker)
    }, [])

    return null
}
