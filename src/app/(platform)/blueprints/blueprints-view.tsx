'use client'

import { useState } from 'react'
import Link from 'next/link'
import { typography } from '@/lib/design-system'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { EmptyState } from '@/components/ui/empty-state'
import {
  Plus,
  Map,
  Target,
  Sparkles,
  ArrowRight,
  Layers,
  Lightbulb,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'

interface TeamMember {
  id: string
  full_name: string
  role: string
  email: string
  avatar_url?: string | null
}

interface BlueprintsViewProps {
  blueprints: Blueprint[]
  templates: BlueprintTemplate[]
  members?: TeamMember[]
}

export function BlueprintsView({
  blueprints,
  templates,
  members = [],
}: BlueprintsViewProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const handleArchive = async (id: string) => {
    const { error } = await archiveBlueprint(id)
    if (error) {
      toast.error('Failed to archive blueprint')
    } else {
      toast.success('Blueprint archived')
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
    }
  }

  const handleDelete = (id: string) => {
    setDeleteConfirmId(id)
  }

  const handleDuplicate = async (_id: string) => {
    toast.info('Duplication coming soon')
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border">
        <div className="min-w-0 flex-1">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Product Maps</h1>
          </div>
          <p className={typography.pageSubtitle}>
            Visualise every domain, skill, and component your product needs. Find gaps and turn them into action.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/blueprints/explore">
              <Layers className="mr-2 h-4 w-4" />
              Explore Tech Trees
            </Link>
          </Button>
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="bg-international-orange hover:bg-international-orange/90"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Product Map
          </Button>
        </div>
      </div>

      {/* Stats + Grid (when user has maps) */}
      {blueprints.length > 0 ? (
        <section className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              icon={Map}
              label="Active Maps"
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
          <BlueprintGrid
            blueprints={blueprints}
            onArchive={handleArchive}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
          />
        </section>
      ) : (
        <Card className="border-2 border-dashed">
          <CardContent className="py-16">
            <EmptyState
              icon={<Map className="h-14 w-14" />}
              title="No product maps yet"
              description="Product maps help you visualise all the knowledge domains your product needs, track coverage, and find experts to fill gaps."
              action={
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    onClick={() => setIsCreateOpen(true)}
                    className="bg-international-orange hover:bg-international-orange/90"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create Your First Map
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/blueprints/explore">
                      <Layers className="mr-2 h-4 w-4" />
                      Browse Tech Trees
                    </Link>
                  </Button>
                </div>
              }
            />
          </CardContent>
        </Card>
      )}

      {/* Inspiration CTA */}
      <Card className="bg-gradient-to-r from-blue-50 to-background border-blue-100">
        <CardContent className="py-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
              <Lightbulb className="h-5 w-5 text-electric-blue" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm">Looking for ideas?</h3>
              <p className="text-xs text-muted-foreground">
                Discover ideas, guidance, and expert recommendations to help build your product.
              </p>
            </div>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="shrink-0 border-electric-blue/30 text-electric-blue hover:bg-blue-50"
            >
              <Link href="/inspiration">
                Go to Inspiration
                <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

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
            <AlertDialogTitle>Delete Product Map?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this product map? This action cannot be undone.
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
