'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { typography } from '@/lib/design-system'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  BlueprintGrid,
  CreateBlueprintDialog,
} from '@/components/blueprints'
import { archiveBlueprint, deleteBlueprint } from '@/actions/blueprints'
import type { Blueprint, BlueprintTemplate } from '@/types/blueprints'
import {
  Plus,
  Map,
  Target,
  Users,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'

interface BlueprintsViewProps {
  blueprints: Blueprint[]
  templates: BlueprintTemplate[]
}

export function BlueprintsView({ blueprints, templates }: BlueprintsViewProps) {
  const router = useRouter()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const handleArchive = async (id: string) => {
    const { error } = await archiveBlueprint(id)
    if (error) {
      toast.error('Failed to archive blueprint')
    } else {
      toast.success('Blueprint archived')
      router.refresh()
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmId) return

    setIsDeleting(deleteConfirmId)
    setDeleteConfirmId(null)
    const { error } = await deleteBlueprint(deleteConfirmId)
    setIsDeleting(null)

    if (error) {
      toast.error('Failed to delete blueprint')
    } else {
      toast.success('Blueprint deleted')
      router.refresh()
    }
  }

  const handleDelete = (id: string) => {
    setDeleteConfirmId(id)
  }

  const handleDuplicate = async (id: string) => {
    // TODO: Implement duplication
    toast.info('Duplication coming soon')
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Blueprints</h1>
          </div>
          <p className={typography.pageSubtitle}>
            Map your knowledge domains, expertise, and supply chain
          </p>
        </div>

        <Button
          onClick={() => setIsCreateOpen(true)}
          className="bg-international-orange hover:bg-international-orange/90"
        >
          <Plus className="mr-2 h-4 w-4" />
          New Blueprint
        </Button>
      </div>

      {/* Quick stats if we have blueprints */}
      {blueprints.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            icon={Map}
            label="Active Blueprints"
            value={blueprints.length}
          />
          <StatCard
            icon={Target}
            label="Total Gaps"
            value={blueprints.reduce((sum, b) => sum + (b.total_domains - b.covered_domains), 0)}
            variant="warning"
          />
          <StatCard
            icon={Sparkles}
            label="Avg Coverage"
            value={`${Math.round(blueprints.reduce((sum, b) => sum + b.coverage_score, 0) / blueprints.length)}%`}
          />
        </div>
      )}

      {/* Blueprint list or empty state */}
      {blueprints.length > 0 ? (
        <BlueprintGrid
          blueprints={blueprints}
          onArchive={handleArchive}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
        />
      ) : (
        <div className="space-y-8">
          <EmptyState
            title="No blueprints yet"
            description="Create your first blueprint to map the knowledge, expertise, and suppliers you need for your product."
            icon={<Map className="h-12 w-12" />}
            action={
              <Button
                onClick={() => setIsCreateOpen(true)}
                className="bg-international-orange hover:bg-international-orange/90"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create Your First Blueprint
              </Button>
            }
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
            <FeatureCard
              icon={Map}
              title="Knowledge Domains"
              description="Map what you need to know"
            />
            <FeatureCard
              icon={Users}
              title="Expertise Network"
              description="Track who can help"
            />
            <FeatureCard
              icon={Target}
              title="Gap Analysis"
              description="See what you're missing"
            />
          </div>
        </div>
      )}

      {/* Create dialog */}
      <CreateBlueprintDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        templates={templates}
      />

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Blueprint?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this blueprint? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// Stat card component
function StatCard({
  icon: Icon,
  label,
  value,
  variant = 'default',
}: {
  icon: React.ElementType
  label: string
  value: string | number
  variant?: 'default' | 'warning' | 'success'
}) {
  const colors = {
    default: 'text-foreground',
    warning: 'text-status-warning',
    success: 'text-status-success',
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className={`text-2xl font-bold ${colors[variant]}`}>{value}</p>
        </div>
      </div>
    </div>
  )
}

// Feature card for empty state
function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType
  title: string
  description: string
}) {
  return (
    <div className="text-center p-4">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-international-orange/10 mb-3">
        <Icon className="h-6 w-6 text-international-orange" />
      </div>
      <h3 className="font-medium">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1">{description}</p>
    </div>
  )
}
