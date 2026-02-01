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
  Rocket,
  ArrowRight,
  Zap,
  ShoppingCart,
  GraduationCap,
  CheckCircle2,
  MessageSquare,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
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
        <div className="space-y-12">
          {/* Hero Section */}
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-international-orange/20 to-international-orange/5 mb-6 shadow-lg shadow-international-orange/10">
              <Rocket className="h-10 w-10 text-international-orange" />
            </div>
            <h2 className="text-3xl font-display font-bold text-slate-900 mb-4">
              See Your Project as a Visual Blueprint
            </h2>
            <p className="text-lg text-slate-600 mb-8 leading-relaxed">
              Blueprints turn any idea into an interactive diagram. Click on any part to see 
              what you need to know, find experts who can help, and connect with suppliers 
              who have what you need.
            </p>
            <Button
              size="lg"
              onClick={() => setIsCreateOpen(true)}
              className="bg-international-orange hover:bg-international-orange/90 h-12 px-8 text-base"
            >
              <Sparkles className="mr-2 h-5 w-5" />
              Create Your First Blueprint
            </Button>
          </div>

          {/* Visual Demo Preview */}
          <Card className="max-w-4xl mx-auto overflow-hidden border-2 border-slate-200 shadow-xl">
            <CardContent className="p-0">
              <div className="bg-gradient-to-br from-slate-50 to-slate-100 p-8">
                {/* Mini Blueprint Canvas Preview */}
                <div className="relative h-[320px] bg-[radial-gradient(circle,#e2e8f0_1px,transparent_1px)] [background-size:16px_16px] rounded-lg border border-slate-200 overflow-hidden">
                  {/* Rocket silhouette hint */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-5" viewBox="0 0 400 320">
                    <path 
                      d="M200 20 C210 20, 230 40, 235 80 L240 140 L245 200 L260 220 L270 280 L240 280 L235 300 L200 310 L165 300 L160 280 L130 280 L140 220 L155 200 L160 140 L165 80 C170 40, 190 20, 200 20"
                      fill="#334155"
                    />
                  </svg>
                  
                  {/* Sample nodes */}
                  <div className="absolute top-8 left-1/2 -translate-x-1/2 w-44 p-3 bg-white rounded-xl border-2 border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold uppercase text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">System</span>
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div className="font-semibold text-sm">Avionics Bay</div>
                  </div>
                  
                  <div className="absolute top-28 left-8 w-40 p-3 bg-white rounded-xl border-2 border-orange-200 border-l-4 border-l-international-orange shadow-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold uppercase text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">Compliance</span>
                    </div>
                    <div className="font-semibold text-sm">FAA License</div>
                    <div className="flex items-center gap-1 mt-1 text-xs text-international-orange">
                      <Sparkles className="h-3 w-3" />
                      Needs attention
                    </div>
                  </div>
                  
                  <div className="absolute top-28 right-8 w-40 p-3 bg-white rounded-xl border-2 border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold uppercase text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">Component</span>
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div className="font-semibold text-sm">Communications</div>
                  </div>
                  
                  <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-44 p-3 bg-white rounded-xl border-2 border-orange-200 border-l-4 border-l-international-orange shadow-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold uppercase text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">System</span>
                    </div>
                    <div className="font-semibold text-sm">Rocket Engine</div>
                    <div className="flex items-center gap-1 mt-1 text-xs text-international-orange">
                      <Sparkles className="h-3 w-3" />
                      Needs attention
                    </div>
                  </div>

                  {/* Connection lines hint */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 400 320">
                    <line x1="200" y1="72" x2="200" y2="248" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.5" />
                    <line x1="200" y1="72" x2="88" y2="144" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.5" />
                    <line x1="200" y1="72" x2="312" y2="144" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.5" />
                  </svg>
                </div>
                
                <p className="text-center text-sm text-slate-500 mt-4">
                  Click any node to explore knowledge, find experts, and source suppliers
                </p>
              </div>
            </CardContent>
          </Card>

          {/* How it works - Flow */}
          <div className="max-w-4xl mx-auto">
            <h3 className="text-center text-lg font-semibold text-slate-700 mb-8">How Blueprints Work</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <FlowStep
                number={1}
                icon={Rocket}
                title="Choose Your Project"
                description="Select a rocket, robot, medical device, or describe your own idea"
              />
              <FlowStep
                number={2}
                icon={Map}
                title="See the Blueprint"
                description="View an interactive diagram with all components and requirements"
              />
              <FlowStep
                number={3}
                icon={GraduationCap}
                title="Identify Gaps"
                description="Click any part to see what you know and what you need to learn"
              />
              <FlowStep
                number={4}
                icon={Zap}
                title="Take Action"
                description="Connect with experts, source suppliers, and create objectives"
              />
            </div>
          </div>

          {/* Feature Cards - The Magic */}
          <div className="max-w-4xl mx-auto">
            <h3 className="text-center text-lg font-semibold text-slate-700 mb-8">The Magic Inside Every Blueprint</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <MagicCard
                icon={GraduationCap}
                title="Skills Tree"
                description="Drill into any domain to see a branching tree of skills. Mark what you know, identify what you need to learn, and track your progress."
                color="blue"
              />
              <MagicCard
                icon={Users}
                title="Expert Matching"
                description="When you find a gap, we instantly show you marketplace experts who can help. Get pre-written messages so you ask the right questions."
                color="purple"
              />
              <MagicCard
                icon={ShoppingCart}
                title="Supplier Connections"
                description="Physical products need physical suppliers. See who can provide components, get lead times, and request quotes directly."
                color="emerald"
              />
              <MagicCard
                icon={Target}
                title="Objectives & Tasks"
                description="Turn any knowledge gap into an objective with actionable tasks. Everything stays connected to your blueprint."
                color="orange"
              />
            </div>
          </div>

          {/* Final CTA */}
          <div className="text-center">
            <Button
              size="lg"
              onClick={() => setIsCreateOpen(true)}
              className="bg-international-orange hover:bg-international-orange/90 h-12 px-8 text-base"
            >
              <Plus className="mr-2 h-5 w-5" />
              Start Your Blueprint
            </Button>
            <p className="text-sm text-slate-500 mt-3">
              Takes 2 minutes to create. See your entire project visualized.
            </p>
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

// Flow step for how it works section
function FlowStep({
  number,
  icon: Icon,
  title,
  description,
}: {
  number: number
  icon: React.ElementType
  title: string
  description: string
}) {
  return (
    <div className="relative text-center p-4">
      {/* Step number */}
      <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-international-orange text-white text-xs font-bold flex items-center justify-center">
        {number}
      </div>
      <div className="pt-4">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 mb-3">
          <Icon className="h-7 w-7 text-slate-700" />
        </div>
        <h4 className="font-semibold text-slate-900 mb-1">{title}</h4>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
    </div>
  )
}

// Magic card for features section
function MagicCard({
  icon: Icon,
  title,
  description,
  color,
}: {
  icon: React.ElementType
  title: string
  description: string
  color: 'blue' | 'purple' | 'emerald' | 'orange'
}) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    orange: 'bg-orange-50 text-international-orange border-orange-100',
  }

  return (
    <div className="flex gap-4 p-5 rounded-xl border bg-white hover:shadow-md transition-shadow">
      <div className={`flex-shrink-0 h-12 w-12 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <h4 className="font-semibold text-slate-900 mb-1">{title}</h4>
        <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
      </div>
    </div>
  )
}