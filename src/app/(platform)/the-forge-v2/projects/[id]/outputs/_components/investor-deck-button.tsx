"use client"

/**
 * @file investor-deck-button.tsx — Client wrapper that calls the
 * exportProjectHandoffMarkdown server action, decodes the base64 payload,
 * and triggers a browser download. Used on the Outputs gallery.
 */

import { useTransition } from "react"
import { FileDown, Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { exportProjectHandoffMarkdown } from "@/actions/cad-lab-projects"

interface InvestorDeckButtonProps {
    projectId: string
}

export function InvestorDeckButton({ projectId }: InvestorDeckButtonProps): React.ReactElement {
    const [isPending, startTransition] = useTransition()

    const handleDownload = () => {
        startTransition(async () => {
            const result = await exportProjectHandoffMarkdown(projectId)
            if ("error" in result) {
                toast.error(result.error)
                return
            }
            // Decode base64 → blob → trigger download. atob throws
            // InvalidCharacterError on malformed input — guard it so a server
            // regression surfaces as a toast, not an unhandled client crash.
            let url: string | null = null
            try {
                const binary = atob(result.contentBase64)
                const bytes = new Uint8Array(binary.length)
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
                const blob = new Blob([bytes], { type: 'text/markdown;charset=utf-8' })
                url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = result.filename
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                toast.success(`Handoff document downloaded (${(result.bytes / 1024).toFixed(1)} KB)`)
            } catch (err) {
                console.error("[FORGE-V2] investor-deck download failed:", err)
                toast.error("Couldn't build the handoff document — please try again in a moment.")
            } finally {
                if (url) URL.revokeObjectURL(url)
            }
        })
    }

    return (
        <Button
            size="sm"
            variant="outline"
            onClick={handleDownload}
            disabled={isPending}
            className="gap-1.5 ml-auto"
        >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            <span>{isPending ? "Generating…" : "Generate handoff"}</span>
            <FileDown className="h-3.5 w-3.5" />
        </Button>
    )
}
