'use client'

/**
 * @file artifact-detail-dialog.tsx
 *
 * @description Full-detail dialog for viewing, editing, exporting, and managing
 * a single agent artifact. Supports inline markdown editing with live preview,
 * multi-format export (PDF, DOCX, Google Docs), email sending, Gamma deep-link,
 * and version history with restore.
 *
 * @dependencies
 * - @/actions/agent-artifacts — Server actions for CRUD, versioning, email, Google Docs
 * - @/lib/export-utils — Client-side PDF and DOCX export
 * - @/components/ui/markdown — Markdown renderer
 *
 * @security Only artifact owner can edit/delete (enforced by server-side RLS)
 */

import { useState, useCallback, useEffect } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Markdown } from '@/components/ui/markdown'
import { cn } from '@/lib/utils'

import {
  Copy,
  FileText,
  Download,
  Mail,
  Star,
  Pencil,
  Trash2,
  History,
  ExternalLink,
  Check,
  Loader2,
  Send,
  X,
} from 'lucide-react'

import type {
  AgentArtifactRow,
  AgentArtifactVersionRow,
} from '@/actions/agent-artifacts'

import {
  updateArtifactContent,
  toggleArtifactStar,
  deleteArtifact,
  exportArtifactToGoogleDocs,
  sendArtifactAsEmail,
  getArtifactVersions,
  restoreArtifactVersion,
} from '@/actions/agent-artifacts'

import { exportAsPDF, exportAsDOCX } from '@/lib/export-utils'

// ============================================================================
// TYPES
// ============================================================================

interface ArtifactDetailDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback when the dialog open state changes */
  onOpenChange: (open: boolean) => void
  /** The artifact to display, or null if none selected */
  artifact: AgentArtifactRow | null
  /** Called after the artifact is updated (edit, star toggle, etc.) */
  onUpdate?: (artifact: AgentArtifactRow) => void
  /** Called after the artifact is deleted */
  onDelete?: (artifactId: string) => void
}

/** Content type display labels */
const CONTENT_TYPE_LABELS: Record<string, string> = {
  document: 'Document',
  email: 'Email',
  report: 'Report',
  presentation: 'Presentation',
  checklist: 'Checklist',
} satisfies Record<string, string>

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * ArtifactDetailDialog — Full-featured artifact viewer, editor, and exporter.
 *
 * @description Shows the artifact's rendered markdown content with options to
 * edit inline, export to PDF/DOCX/Google Docs, send via email, open in Gamma
 * (for presentations), view version history, and delete.
 *
 * @component
 *
 * @example
 * <ArtifactDetailDialog
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   artifact={selectedArtifact}
 *   onUpdate={handleArtifactUpdate}
 *   onDelete={handleArtifactDelete}
 * />
 */
export function ArtifactDetailDialog({
  open,
  onOpenChange,
  artifact,
  onUpdate,
  onDelete,
}: ArtifactDetailDialogProps): React.ReactElement | null {
  // ---- State: Edit mode ----
  const [isEditing, setIsEditing] = useState<boolean>(false)
  const [editTitle, setEditTitle] = useState<string>('')
  const [editContent, setEditContent] = useState<string>('')
  const [isSaving, setIsSaving] = useState<boolean>(false)

  // ---- State: Actions ----
  const [isTogglingStarLoading, setIsTogglingStarLoading] = useState<boolean>(false)
  const [isDeleting, setIsDeleting] = useState<boolean>(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false)
  const [isCopied, setIsCopied] = useState<boolean>(false)
  const [isExportingPDF, setIsExportingPDF] = useState<boolean>(false)
  const [isExportingDOCX, setIsExportingDOCX] = useState<boolean>(false)
  const [isExportingGDocs, setIsExportingGDocs] = useState<boolean>(false)

  // ---- State: Email inline form ----
  const [showEmailForm, setShowEmailForm] = useState<boolean>(false)
  const [emailTo, setEmailTo] = useState<string>('')
  const [emailSubject, setEmailSubject] = useState<string>('')
  const [isSendingEmail, setIsSendingEmail] = useState<boolean>(false)

  // ---- State: Version history ----
  const [versions, setVersions] = useState<AgentArtifactVersionRow[]>([])
  const [isLoadingVersions, setIsLoadingVersions] = useState<boolean>(false)
  const [previewVersion, setPreviewVersion] = useState<AgentArtifactVersionRow | null>(null)
  const [isRestoringVersion, setIsRestoringVersion] = useState<boolean>(false)

  // ---- Reset state when artifact changes ----
  useEffect(() => {
    if (artifact) {
      setEditTitle(artifact.title)
      setEditContent(artifact.content)
    }
    setIsEditing(false)
    setShowDeleteConfirm(false)
    setShowEmailForm(false)
    setPreviewVersion(null)
    setVersions([])
  }, [artifact?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Handlers ----

  /**
   * Enter edit mode and populate fields with current artifact content.
   */
  const handleStartEditing = useCallback((): void => {
    if (!artifact) return
    setEditTitle(artifact.title)
    setEditContent(artifact.content)
    setIsEditing(true)
    setPreviewVersion(null)
  }, [artifact])

  /**
   * Cancel edit mode and discard unsaved changes.
   */
  const handleCancelEditing = useCallback((): void => {
    setIsEditing(false)
    if (artifact) {
      setEditTitle(artifact.title)
      setEditContent(artifact.content)
    }
  }, [artifact])

  /**
   * Save edited content via updateArtifactContent server action.
   * Creates a version snapshot automatically.
   */
  const handleSaveEdit = useCallback(async (): Promise<void> => {
    if (!artifact) return
    if (!editTitle.trim()) {
      toast.error('Title cannot be empty')
      return
    }

    setIsSaving(true)
    try {
      const { data, error } = await updateArtifactContent(
        artifact.id,
        editContent,
        editTitle,
        'Manual edit'
      )

      if (error) {
        toast.error(error)
        return
      }

      if (data) {
        toast.success('Saved successfully')
        setIsEditing(false)
        onUpdate?.(data)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save'
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }, [artifact, editTitle, editContent, onUpdate])

  /**
   * Toggle the starred status of the artifact.
   */
  const handleToggleStar = useCallback(async (): Promise<void> => {
    if (!artifact) return

    setIsTogglingStarLoading(true)
    try {
      const { isStarred, error } = await toggleArtifactStar(artifact.id)

      if (error) {
        toast.error(error)
        return
      }

      const updated: AgentArtifactRow = { ...artifact, is_starred: isStarred }
      onUpdate?.(updated)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update'
      toast.error(message)
    } finally {
      setIsTogglingStarLoading(false)
    }
  }, [artifact, onUpdate])

  /**
   * Copy markdown content to the clipboard.
   */
  const handleCopyContent = useCallback(async (): Promise<void> => {
    if (!artifact) return

    try {
      await navigator.clipboard.writeText(artifact.content)
      setIsCopied(true)
      toast.success('Copied to clipboard')
      setTimeout(() => setIsCopied(false), 2000)
    } catch {
      toast.error('Failed to copy to clipboard')
    }
  }, [artifact])

  /**
   * Export artifact content as a PDF file.
   */
  const handleExportPDF = useCallback(async (): Promise<void> => {
    if (!artifact) return

    setIsExportingPDF(true)
    try {
      await exportAsPDF(artifact.content, `${artifact.title}.pdf`)
      toast.success('PDF downloaded')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed'
      toast.error(message)
    } finally {
      setIsExportingPDF(false)
    }
  }, [artifact])

  /**
   * Export artifact content as a DOCX file.
   */
  const handleExportDOCX = useCallback(async (): Promise<void> => {
    if (!artifact) return

    setIsExportingDOCX(true)
    try {
      await exportAsDOCX(artifact.content, `${artifact.title}.docx`)
      toast.success('DOCX downloaded')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed'
      toast.error(message)
    } finally {
      setIsExportingDOCX(false)
    }
  }, [artifact])

  /**
   * Export artifact to Google Docs via server action.
   */
  const handleExportGoogleDocs = useCallback(async (): Promise<void> => {
    if (!artifact) return

    setIsExportingGDocs(true)
    try {
      const { docUrl, error } = await exportArtifactToGoogleDocs(artifact.id)

      if (error) {
        toast.error(error)
        return
      }

      if (docUrl) {
        window.open(docUrl, '_blank', 'noopener,noreferrer')
        toast.success('Opened in Google Docs')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed'
      toast.error(message)
    } finally {
      setIsExportingGDocs(false)
    }
  }, [artifact])

  /**
   * Open the artifact content in Gamma for presentation generation.
   * Only relevant for presentation-type artifacts.
   */
  const handleOpenInGamma = useCallback((): void => {
    if (!artifact) return

    const gammaUrl = `https://gamma.app/generate?text=${encodeURIComponent(artifact.content.slice(0, 8000))}&title=${encodeURIComponent(artifact.title)}`
    window.open(gammaUrl, '_blank', 'noopener,noreferrer')
  }, [artifact])

  /**
   * Show the inline email form, pre-filling the subject with the artifact title.
   */
  const handleShowEmailForm = useCallback((): void => {
    if (!artifact) return
    setEmailTo('')
    setEmailSubject(artifact.title)
    setShowEmailForm(true)
  }, [artifact])

  /**
   * Send the artifact via email using the server action.
   */
  const handleSendEmail = useCallback(async (): Promise<void> => {
    if (!artifact) return

    const recipients = emailTo
      .split(',')
      .map((e: string) => e.trim())
      .filter((e: string) => e.length > 0)

    if (recipients.length === 0) {
      toast.error('Please enter at least one email address')
      return
    }

    if (!emailSubject.trim()) {
      toast.error('Subject is required')
      return
    }

    setIsSendingEmail(true)
    try {
      const { error } = await sendArtifactAsEmail(
        artifact.id,
        recipients,
        emailSubject
      )

      if (error) {
        toast.error(error)
        return
      }

      toast.success(`Email sent to ${recipients.length} recipient${recipients.length > 1 ? 's' : ''}`)
      setShowEmailForm(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send'
      toast.error(message)
    } finally {
      setIsSendingEmail(false)
    }
  }, [artifact, emailTo, emailSubject])

  /**
   * Delete the artifact after confirmation.
   */
  const handleDeleteArtifact = useCallback(async (): Promise<void> => {
    if (!artifact) return

    setIsDeleting(true)
    try {
      const { error } = await deleteArtifact(artifact.id)

      if (error) {
        toast.error(error)
        return
      }

      toast.success('Output deleted')
      onOpenChange(false)
      onDelete?.(artifact.id)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete'
      toast.error(message)
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }, [artifact, onOpenChange, onDelete])

  /**
   * Load version history for the artifact.
   */
  const handleLoadVersions = useCallback(async (): Promise<void> => {
    if (!artifact) return

    setIsLoadingVersions(true)
    try {
      const { data, error } = await getArtifactVersions(artifact.id)

      if (error) {
        toast.error(error)
        return
      }

      setVersions(data || [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load versions'
      toast.error(message)
    } finally {
      setIsLoadingVersions(false)
    }
  }, [artifact])

  /**
   * Restore the artifact to a previous version.
   *
   * @param versionId - UUID of the version to restore
   */
  const handleRestoreVersion = useCallback(async (versionId: string): Promise<void> => {
    if (!artifact) return

    setIsRestoringVersion(true)
    try {
      const { data, error } = await restoreArtifactVersion(artifact.id, versionId)

      if (error) {
        toast.error(error)
        return
      }

      if (data) {
        toast.success('Version restored')
        setPreviewVersion(null)
        onUpdate?.(data)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to restore'
      toast.error(message)
    } finally {
      setIsRestoringVersion(false)
    }
  }, [artifact, onUpdate])

  // ---- Early return if no artifact ----
  if (!artifact) return null

  const isPresentation = artifact.content_type === 'presentation'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="p-0">
        {/* Visually hidden description for accessibility */}
        <DialogDescription className="sr-only">
          Detail view for artifact: {artifact.title}
        </DialogDescription>

        {/* Inner flex container — explicit max-h so ScrollArea gets a constrained height
            regardless of the base DialogContent display/overflow styles */}
        <div className="flex flex-col max-h-[90vh] overflow-hidden">

        {/* ================================================================ */}
        {/* HEADER                                                           */}
        {/* ================================================================ */}
        <div className="px-6 pt-6 pb-4 border-b space-y-3">
          {/* Title row */}
          <div className="flex items-start gap-3 pr-8">
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <Input
                  value={editTitle}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditTitle(e.target.value)}
                  className="text-lg font-semibold"
                  placeholder="Output title"
                  autoFocus
                />
              ) : (
                <h2 className="text-lg font-semibold text-foreground truncate">
                  {previewVersion ? previewVersion.title : artifact.title}
                </h2>
              )}
            </div>
          </div>

          {/* Meta row: badges, date, actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" size="sm">
              {CONTENT_TYPE_LABELS[artifact.content_type] || artifact.content_type}
            </Badge>

            <Badge variant="secondary" size="sm">
              v{previewVersion ? previewVersion.version_number : artifact.version_number}
            </Badge>

            <span className="text-xs text-muted-foreground">
              {format(new Date(artifact.created_at), 'MMM d, yyyy')}
            </span>

            {previewVersion && (
              <Badge variant="warning" size="sm">
                Previewing v{previewVersion.version_number}
              </Badge>
            )}

            <div className="flex-1" />

            {/* Version history button */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLoadVersions}
                  aria-label="Version history"
                >
                  <History className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="px-4 py-3 border-b">
                  <p className="text-sm font-semibold text-foreground">Version History</p>
                  <p className="text-xs text-muted-foreground">
                    {versions.length} previous version{versions.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <ScrollArea className="max-h-64">
                  {isLoadingVersions ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : versions.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      No previous versions
                    </p>
                  ) : (
                    <div className="py-1">
                      {versions.map((version: AgentArtifactVersionRow) => (
                        <div
                          key={version.id}
                          className={cn(
                            'px-4 py-2.5 hover:bg-muted cursor-pointer transition-colors',
                            previewVersion?.id === version.id && 'bg-muted'
                          )}
                          onClick={() => setPreviewVersion(version)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              setPreviewVersion(version)
                            }
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-foreground">
                                Version {version.version_number}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(version.created_at), 'MMM d, yyyy h:mm a')}
                              </p>
                              {version.change_summary && (
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                  {version.change_summary}
                                </p>
                              )}
                            </div>
                            {previewVersion?.id === version.id && (
                              <Button
                                variant="default"
                                size="sm"
                                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                  e.stopPropagation()
                                  handleRestoreVersion(version.id)
                                }}
                                disabled={isRestoringVersion}
                                className="ml-2 shrink-0"
                              >
                                {isRestoringVersion ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  'Restore'
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
                {previewVersion && (
                  <div className="px-4 py-2 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() => setPreviewVersion(null)}
                    >
                      Back to current version
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>

            {/* Star toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleStar}
              disabled={isTogglingStarLoading}
              aria-label={artifact.is_starred ? 'Remove from starred' : 'Add to starred'}
            >
              <Star
                className={cn(
                  'h-4 w-4',
                  artifact.is_starred && 'fill-international-orange text-international-orange'
                )}
              />
            </Button>

            {/* Edit toggle */}
            <Button
              variant={isEditing ? 'secondary' : 'ghost'}
              size="sm"
              onClick={isEditing ? handleCancelEditing : handleStartEditing}
              aria-label={isEditing ? 'Cancel editing' : 'Edit output'}
            >
              {isEditing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* ================================================================ */}
        {/* BODY                                                             */}
        {/* ================================================================ */}
        {isEditing ? (
          /* ---- Edit mode: split view ---- */
          <div className="flex flex-1 min-h-0">
            {/* Left: textarea */}
            <div className="flex-1 flex flex-col border-r min-w-0">
              <div className="px-4 py-2 border-b">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Edit
                </p>
              </div>
              <textarea
                value={editContent}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditContent(e.target.value)}
                className="flex-1 w-full p-4 text-sm font-mono bg-background text-foreground resize-none focus:outline-none"
                placeholder="Write your content in markdown..."
                aria-label="Content editor"
              />
              <div className="px-4 py-3 border-t flex items-center gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSaveEdit}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="h-3 w-3" />
                      Save
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancelEditing}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
              </div>
            </div>

            {/* Right: live preview */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="px-4 py-2 border-b">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Preview
                </p>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-6">
                  <Markdown content={editContent} />
                </div>
              </ScrollArea>
            </div>
          </div>
        ) : (
          /* ---- View mode: rendered markdown ---- */
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-6">
              <Markdown
                content={previewVersion ? previewVersion.content : artifact.content}
              />
            </div>
          </ScrollArea>
        )}

        {/* ================================================================ */}
        {/* EMAIL INLINE FORM (Phase 2)                                      */}
        {/* ================================================================ */}
        {showEmailForm && (
          <div className="px-6 py-4 border-t bg-muted/50 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Send as Email</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowEmailForm(false)}
                aria-label="Close email form"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email-to" className="text-sm font-medium">
                To
                <span className="text-destructive ml-1" aria-label="required">*</span>
              </Label>
              <Input
                id="email-to"
                value={emailTo}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmailTo(e.target.value)}
                placeholder="email@example.com, another@example.com"
                aria-required
                aria-describedby="email-to-hint"
              />
              <p id="email-to-hint" className="text-xs text-muted-foreground">
                Separate multiple addresses with commas
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email-subject" className="text-sm font-medium">
                Subject
                <span className="text-destructive ml-1" aria-label="required">*</span>
              </Label>
              <Input
                id="email-subject"
                value={emailSubject}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmailSubject(e.target.value)}
                placeholder="Email subject"
                aria-required
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={handleSendEmail}
                disabled={isSendingEmail}
              >
                {isSendingEmail ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-3 w-3" />
                    Send Email
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowEmailForm(false)}
                disabled={isSendingEmail}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* FOOTER                                                           */}
        {/* ================================================================ */}
        <div className="px-6 py-4 border-t">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Copy */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyContent}
              aria-label="Copy content"
            >
              {isCopied ? (
                <Check className="h-4 w-4 text-status-success" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              <span className="ml-1">Copy</span>
            </Button>

            {/* Export PDF */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExportPDF}
              disabled={isExportingPDF}
              aria-label="Export as PDF"
            >
              {isExportingPDF ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span className="ml-1">PDF</span>
            </Button>

            {/* Export DOCX */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExportDOCX}
              disabled={isExportingDOCX}
              aria-label="Export as DOCX"
            >
              {isExportingDOCX ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              <span className="ml-1">DOCX</span>
            </Button>

            {/* Google Docs */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExportGoogleDocs}
              disabled={isExportingGDocs}
              aria-label="Open in Google Docs"
            >
              {isExportingGDocs ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              <span className="ml-1">Google Docs</span>
            </Button>

            {/* Email */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleShowEmailForm}
              aria-label="Send as email"
            >
              <Mail className="h-4 w-4" />
              <span className="ml-1">Email</span>
            </Button>

            {/* Gamma (presentations only) */}
            {isPresentation && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleOpenInGamma}
                aria-label="Open in Gamma"
              >
                <ExternalLink className="h-4 w-4" />
                <span className="ml-1">Gamma</span>
              </Button>
            )}

            <div className="flex-1" />

            {/* Delete */}
            {showDeleteConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Delete this saved output?</span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteArtifact}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    'Confirm'
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-destructive hover:text-destructive"
                aria-label="Delete saved output"
              >
                <Trash2 className="h-4 w-4" />
                <span className="ml-1">Delete</span>
              </Button>
            )}
          </div>
        </div>

        </div>{/* end inner flex container */}
      </DialogContent>
    </Dialog>
  )
}
