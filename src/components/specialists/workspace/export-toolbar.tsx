"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Download, Share2, Copy, Loader2, ExternalLink } from "lucide-react"
import { toast } from "sonner"
import { createArtifact } from "@/actions/agent-artifacts"
import { createArtifactShareLink, exportArtifactToGoogleDocs } from "@/actions/agent-artifacts"
import { exportAsPDF, exportAsDOCX } from "@/lib/export-utils"
import { cn } from "@/lib/utils"
import type { WorkspaceTab } from "./workspace-toolbar"
import type { PresentationData } from "./presentation-view"
import type { ChartConfig } from "./chart-builder"

interface ExportToolbarProps {
  activeTab: WorkspaceTab
  documentContent: string
  presentationData: PresentationData | null
  chartConfig: ChartConfig | null
  className?: string
}

export function ExportToolbar({
  activeTab,
  documentContent,
  presentationData,
  chartConfig,
  className,
}: ExportToolbarProps): React.ReactElement {
  const [isSharing, setIsSharing] = useState(false)
  const [isSavingToDrive, setIsSavingToDrive] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const getExportContent = (): string => {
    if (activeTab === "document") return documentContent
    if (activeTab === "presentation" && presentationData) {
      return `# ${presentationData.title}\n\n${presentationData.slides
        .map((s, i) => `## Slide ${i + 1}: ${s.title}\n\n${s.subtitle ? s.subtitle + "\n\n" : ""}${(s.bullets || []).map((b) => `- ${b}`).join("\n")}`)
        .join("\n\n")}`
    }
    if (activeTab === "chart" && chartConfig?.data?.length) {
      return `# ${chartConfig.title ?? "Chart"}\n\nData: ${JSON.stringify(chartConfig.data)}`
    }
    return ""
  }

  const content = getExportContent()
  const hasContent = content.length > 0

  const handleCopy = async () => {
    if (!hasContent) {
      toast.error("Nothing to copy")
      return
    }
    try {
      await navigator.clipboard.writeText(content)
      toast.success("Copied to clipboard")
    } catch {
      toast.error("Failed to copy")
    }
  }

  const handleExportPDF = async () => {
    if (!hasContent) {
      toast.error("Add content first")
      return
    }
    setIsExporting(true)
    try {
      await exportAsPDF(content, "workspace-export.pdf")
      toast.success("Downloaded PDF")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed")
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportDOCX = async () => {
    if (!hasContent) {
      toast.error("Add content first")
      return
    }
    setIsExporting(true)
    try {
      await exportAsDOCX(content, "workspace-export.docx")
      toast.success("Downloaded DOCX")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed")
    } finally {
      setIsExporting(false)
    }
  }

  const handleShare = async () => {
    if (!hasContent) {
      toast.error("Add content first")
      return
    }
    setIsSharing(true)
    try {
      const { data: artifact, error: createErr } = await createArtifact({
        title: "Shared from workspace",
        content,
        contentType: "document",
      })
      if (createErr || !artifact) {
        toast.error(createErr ?? "Failed to save")
        return
      }
      const { shareUrl, error: shareErr } = await createArtifactShareLink(artifact.id, 7)
      if (shareErr || !shareUrl) {
        toast.error(shareErr ?? "Failed to create link")
        return
      }
      await navigator.clipboard.writeText(shareUrl)
      toast.success("Share link copied to clipboard (expires in 7 days)")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to share")
    } finally {
      setIsSharing(false)
    }
  }

  const handleGoogleDrive = async () => {
    if (!hasContent) {
      toast.error("Add content first")
      return
    }
    setIsSavingToDrive(true)
    try {
      const { data: artifact, error: createErr } = await createArtifact({
        title: "Workspace export",
        content,
        contentType: "document",
      })
      if (createErr || !artifact) {
        toast.error(createErr ?? "Failed to save")
        return
      }
      const { docUrl, error: driveErr } = await exportArtifactToGoogleDocs(artifact.id)
      if (driveErr || !docUrl) {
        toast.error(driveErr ?? "Failed to save to Google Drive")
        return
      }
      toast.success("Saved to Google Drive")
      window.open(docUrl, "_blank")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save to Drive")
    } finally {
      setIsSavingToDrive(false)
    }
  }

  return (
    <div className={cn("flex items-center gap-2 px-3 py-2 border-t bg-background", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={!hasContent || isExporting} className="gap-2">
            {isExporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Download
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={handleExportPDF} disabled={!hasContent}>
            PDF
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleExportDOCX} disabled={!hasContent}>
            Word (DOCX)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="outline" size="sm" disabled={!hasContent} onClick={handleCopy} className="gap-2">
        <Copy className="h-3.5 w-3.5" />
        Copy
      </Button>
      <Button variant="outline" size="sm" disabled={!hasContent || isSharing} onClick={handleShare} className="gap-2">
        {isSharing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
        Share link
      </Button>
      <Button variant="outline" size="sm" disabled={!hasContent || isSavingToDrive} onClick={handleGoogleDrive} className="gap-2">
        {isSavingToDrive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
        Google Drive
      </Button>
    </div>
  )
}
