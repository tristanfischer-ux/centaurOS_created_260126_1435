'use client'

/**
 * TechniquesView — Project-scoped saved techniques and annotations.
 *
 * Renders the list of manufacturing techniques a founder has saved to this
 * project, with per-technique annotation notes (edit-in-place).
 *
 * Sections:
 *   1. Breadcrumb
 *   2. Page header + save count + link to browser
 *   3. Saved technique cards (or empty state)
 *      Each card: technique title + category + annotation panel (edit-in-place)
 *                 + remove button
 */

import { useState, useCallback, useTransition } from 'react'
import Link from 'next/link'
import {
  BookOpen,
  ChevronRight,
  Trash2,
  PenLine,
  Check,
  X,
  MessageSquare,
  Plus,
  Factory,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { typography } from '@/lib/design-system'
import { toast } from 'sonner'
import {
  removeProjectTechnique,
  addAnnotation,
  updateAnnotation,
  deleteAnnotation,
  getAnnotations,
  type ProjectTechnique,
  type ProjectTechniqueAnnotation,
} from '@/actions/project-techniques'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TechniquesViewProps {
  project: {
    id: string
    name: string
  }
  savedTechniques: ProjectTechnique[]
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TechniquesView({ project, savedTechniques }: TechniquesViewProps) {
  const [techniques, setTechniques] = useState<ProjectTechnique[]>(savedTechniques)

  const handleRemove = useCallback(
    async (techniqueId: string) => {
      const result = await removeProjectTechnique(project.id, techniqueId)
      if (result.error) {
        toast.error('Could not remove technique')
        return
      }
      setTechniques(prev => prev.filter(t => t.technique_id !== techniqueId))
      toast.success('Technique removed from project')
    },
    [project.id],
  )

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href="/the-forge-v2" className="hover:text-foreground transition-colors">
          The Forge
        </Link>
        <ChevronRight className="h-3 w-3" />
        <Link href={`/the-forge-v2/projects/${project.id}`} className="hover:text-foreground transition-colors">
          {project.name}
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground font-medium">Techniques</span>
      </nav>

      {/* Page header */}
      <div className="pb-4 border-b border-muted">
        <div className={typography.pageHeader}>
          <div className={typography.pageHeaderAccent} />
          <h1 className={typography.h1}>
            <Factory className="h-7 w-7 mr-3 inline-block text-international-orange" />
            Saved Techniques
          </h1>
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className={cn(typography.pageSubtitle)}>
            Manufacturing techniques saved to {project.name}. Add notes specific to this build.
          </p>
          <Link href="/learn">
            <Button variant="outline" size="sm" className="gap-2">
              <BookOpen className="h-4 w-4" />
              Browse techniques
            </Button>
          </Link>
        </div>
        {techniques.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            {techniques.length} technique{techniques.length !== 1 ? 's' : ''} saved
          </p>
        )}
      </div>

      {/* Content */}
      {techniques.length === 0 ? (
        <Card className="border-2 border-dashed">
          <CardContent className="py-12">
            <EmptyState
              icon={<Factory className="h-12 w-12" />}
              title="No techniques saved yet"
              description="Browse the techniques explorer and save relevant processes to this project — injection moulding, computer numerical control, additive manufacturing, and more."
              action={
                <Link href="/learn">
                  <Button className="gap-2">
                    <BookOpen className="h-4 w-4" />
                    Open Techniques Explorer
                  </Button>
                </Link>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {techniques.map(technique => (
            <SavedTechniqueCard
              key={technique.technique_id}
              technique={technique}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SavedTechniqueCard
// ---------------------------------------------------------------------------

interface SavedTechniqueCardProps {
  technique: ProjectTechnique
  onRemove: (techniqueId: string) => Promise<void>
}

function SavedTechniqueCard({ technique, onRemove }: SavedTechniqueCardProps) {
  const [annotations, setAnnotations] = useState<ProjectTechniqueAnnotation[]>([])
  const [annotationsLoaded, setAnnotationsLoaded] = useState(false)
  const [showAnnotations, setShowAnnotations] = useState(false)
  const [newNote, setNewNote] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [isPending, startTransition] = useTransition()

  const loadAnnotations = useCallback(async () => {
    if (annotationsLoaded) return
    const result = await getAnnotations(technique.id)
    if (!result.error) {
      setAnnotations(result.data)
      setAnnotationsLoaded(true)
    }
  }, [technique.id, annotationsLoaded])

  const toggleAnnotations = useCallback(async () => {
    if (!showAnnotations && !annotationsLoaded) {
      await loadAnnotations()
    }
    setShowAnnotations(prev => !prev)
  }, [showAnnotations, annotationsLoaded, loadAnnotations])

  const handleAddNote = useCallback(() => {
    if (!newNote.trim()) return
    startTransition(async () => {
      const result = await addAnnotation(technique.id, newNote.trim())
      if (result.error) {
        toast.error('Could not save note')
        return
      }
      if (result.data) {
        setAnnotations(prev => [...prev, result.data!])
        setNewNote('')
        toast.success('Note saved')
      }
    })
  }, [technique.id, newNote])

  const handleUpdateNote = useCallback((annotationId: string) => {
    if (!editingText.trim()) return
    startTransition(async () => {
      const result = await updateAnnotation(annotationId, editingText.trim())
      if (result.error) {
        toast.error('Could not update note')
        return
      }
      if (result.data) {
        setAnnotations(prev => prev.map(a => (a.id === annotationId ? result.data! : a)))
        setEditingId(null)
        setEditingText('')
        toast.success('Note updated')
      }
    })
  }, [editingText])

  const handleDeleteNote = useCallback((annotationId: string) => {
    startTransition(async () => {
      const result = await deleteAnnotation(annotationId)
      if (result.error) {
        toast.error('Could not delete note')
        return
      }
      setAnnotations(prev => prev.filter(a => a.id !== annotationId))
      toast.success('Note deleted')
    })
  }, [])

  const startEdit = useCallback((annotation: ProjectTechniqueAnnotation) => {
    setEditingId(annotation.id)
    setEditingText(annotation.note)
  }, [])

  const cancelEdit = useCallback(() => {
    setEditingId(null)
    setEditingText('')
  }, [])

  const savedAt = new Date(technique.created_at).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground leading-snug">
              {technique.technique_title}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Saved {savedAt}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={toggleAnnotations}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted"
              aria-label="Toggle notes panel"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Notes{annotations.length > 0 ? ` (${annotations.length})` : ''}</span>
            </button>
            <button
              onClick={() => onRemove(technique.technique_id)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              aria-label="Remove technique from project"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Annotation panel (toggle) */}
        {showAnnotations && (
          <div className="border-t border-muted pt-4 space-y-3">
            <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Project notes
            </p>

            {/* Existing annotations */}
            {annotations.length === 0 && !annotationsLoaded && (
              <p className="text-xs text-muted-foreground">Loading notes...</p>
            )}
            {annotations.length === 0 && annotationsLoaded && (
              <p className="text-xs text-muted-foreground">
                No notes yet. Add your first note below.
              </p>
            )}
            {annotations.map(annotation => (
              <div
                key={annotation.id}
                className="group rounded-lg bg-muted/50 p-3 space-y-2"
              >
                {editingId === annotation.id ? (
                  <>
                    <textarea
                      value={editingText}
                      onChange={e => setEditingText(e.target.value)}
                      className="w-full text-sm border border-border rounded-md bg-card p-2 resize-none focus:outline-none focus:ring-2 focus:ring-international-orange/30 focus:border-international-orange min-h-[80px]"
                      placeholder="Update your note..."
                      aria-label="Edit note"
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 text-xs gap-1"
                        disabled={isPending || !editingText.trim()}
                        onClick={() => handleUpdateNote(annotation.id)}
                      >
                        <Check className="h-3 w-3" />
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs gap-1"
                        onClick={cancelEdit}
                      >
                        <X className="h-3 w-3" />
                        Cancel
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-foreground flex-1 leading-relaxed whitespace-pre-wrap">
                      {annotation.note}
                    </p>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        onClick={() => startEdit(annotation)}
                        className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Edit note"
                      >
                        <PenLine className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteNote(annotation.id)}
                        className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
                        aria-label="Delete note"
                        disabled={isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground">
                  {new Date(annotation.updated_at).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>
            ))}

            {/* New note input */}
            <div className="space-y-2">
              <textarea
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                className="w-full text-sm border border-border rounded-md bg-card p-2 resize-none focus:outline-none focus:ring-2 focus:ring-international-orange/30 focus:border-international-orange min-h-[72px]"
                placeholder={`Add a note about this technique for ${technique.technique_title}...`}
                aria-label="New project note"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                disabled={isPending || !newNote.trim()}
                onClick={handleAddNote}
              >
                <Plus className="h-3 w-3" />
                Add note
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
