/**
 * @file message-export-menu.tsx — Per-message export menu for specialist conversations.
 *
 * @description A dropdown menu attached to each assistant message that provides
 * export options: copy to clipboard, save as artifact, export as PDF, and send
 * to Google Drive. Self-contained component with no specialist-specific logic.
 *
 * @audit Extracted 2026-02-19 from src/app/(platform)/agents/brief-specialist-dialog.tsx
 *        (refactor step 8 of 8). No logic changes — component body is identical
 *        to the original.
 *
 * @example
 * ```tsx
 * <MessageExportMenu content={message.content} />
 * ```
 */

"use client"

import React, { useState, useCallback } from "react"
import { toast } from "sonner"
import { MoreVertical, Copy, FileIcon, ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { createArtifact, exportArtifactToGoogleDocs } from "@/actions/agent-artifacts"
import { exportAsPDF } from "@/lib/export-utils"

/**
 * Per-message export menu for specialist chat messages.
 *
 * @description Provides 4 export options for any message content:
 *   1. Copy text — copies to clipboard
 *   2. Save as artifact — persists to the Deliverables library
 *   3. Export as PDF — downloads as PDF file
 *   4. Send to Google Drive — creates artifact + opens in Google Docs
 *
 * @param props.content - The message text content to export
 */
export function MessageExportMenu({ content }: { content: string }): React.ReactElement {
    const [open, setOpen] = useState(false)

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(content)
            toast.success("Copied to clipboard")
            setOpen(false)
        } catch {
            toast.error("Failed to copy")
        }
    }, [content])

    const handleSaveAsArtifact = useCallback(async () => {
        const { error } = await createArtifact({
            title: "Message export",
            content,
            contentType: "document",
            metadata: { source: "specialist-message-export" },
        })
        if (error) {
            toast.error(error)
            return
        }
        toast.success("Saved to Deliverables")
        setOpen(false)
    }, [content])

    const handleExportPdf = useCallback(async () => {
        try {
            await exportAsPDF(content, "message-export.pdf")
            toast.success("PDF downloaded")
            setOpen(false)
        } catch {
            toast.error("Failed to export PDF")
        }
    }, [content])

    const handleGoogleDrive = useCallback(async () => {
        const { data: artifact, error: createErr } = await createArtifact({
            title: "Message export",
            content,
            contentType: "document",
            metadata: { source: "specialist-message-export" },
        })
        if (createErr || !artifact) {
            toast.error(createErr ?? "Failed to save")
            return
        }
        const { docUrl, error: driveErr } = await exportArtifactToGoogleDocs(artifact.id)
        if (driveErr) {
            toast.error(driveErr)
            return
        }
        if (docUrl) window.open(docUrl, "_blank")
        toast.success("Opened in Google Docs")
        setOpen(false)
    }, [content])

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Export message">
                    <MoreVertical className="h-3.5 w-3.5" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleCopy}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy text
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSaveAsArtifact}>
                    <FileIcon className="h-4 w-4 mr-2" />
                    Save as artifact
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPdf}>
                    <FileIcon className="h-4 w-4 mr-2" />
                    Export as PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleGoogleDrive}>
                    <ArrowRight className="h-4 w-4 mr-2" />
                    Send to Google Drive
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
