'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { typography } from '@/lib/design-system'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CoverageBar,
  CoverageScore,
  DomainTreeView,
  DomainListView,
  NextActionCard,
  DomainDetailPanel,
} from '@/components/blueprints'
import { VisualBlueprintView } from '@/components/blueprints/visual'
import {
  updateDomainCoverage,
  addExpertise,
  removeExpertise,
} from '@/actions/blueprints'
import type {
  Blueprint,
  DomainCoverageWithDetails,
  BlueprintSummary,
  NextAction,
  BlueprintMilestone,
  BlueprintSupplier,
  CoverageStatus,
} from '@/types/blueprints'
import { PROJECT_STAGES, DOMAIN_CATEGORY_COLORS, DomainCategory } from '@/types/blueprints'
import {
  ChevronRight,
  Settings,
  Play,
  ListTree,
  List,
  Target,
  Users,
  Building2,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Filter,
  Eye,
  EyeOff,
  Sparkles,
  Map,
} from 'lucide-react'
import { toast } from 'sonner'

interface BlueprintDetailViewProps {
  blueprint: Blueprint
  coverage: DomainCoverageWithDetails[]
  summary: BlueprintSummary | null
  nextAction: NextAction | null
  milestones: BlueprintMilestone[]
  suppliers: BlueprintSupplier[]
}

export function BlueprintDetailView({
  blueprint,
  coverage,
  summary,
  nextAction,
  milestones,
  suppliers,
}: BlueprintDetailViewProps) {
  const router = useRouter()
  const [selectedDomain, setSelectedDomain] = useState<DomainCoverageWithDetails | null>(null)
  const [viewMode, setViewMode] = useState<'visual' | 'tree' | 'list'>('visual')
  const [showAllDomains, setShowAllDomains] = useState(false)
  const [statusFilter, setStatusFilter] = useState<CoverageStatus | 'all'>('all')
  const [isUpdating, setIsUpdating] = useState(false)

  const stageName = PROJECT_STAGES.find(s => s.value === blueprint.project_stage)?.label || blueprint.project_stage

  const handleUpdateStatus = async (status: CoverageStatus, notes?: string) => {
    if (!selectedDomain) return

    setIsUpdating(true)
    const { error } = await updateDomainCoverage(selectedDomain.id, { status, notes })
    setIsUpdating(false)

    if (error) {
      toast.error('Failed to update status')
    } else {
      toast.success('Status updated')
      router.refresh()
    }
  }

  const handleAddExpertise = () => {
    // TODO: Open add expertise dialog
    toast.info('Add expertise dialog coming soon')
  }

  const handleRemoveExpertise = async (expertiseId: string) => {
    const { error } = await removeExpertise(expertiseId)
    if (error) {
      toast.error('Failed to remove expertise')
    } else {
      toast.success('Expertise removed')
      router.refresh()
    }
  }

  // Filter coverage based on status filter
  const filteredCoverage = statusFilter === 'all'
    ? coverage
    : coverage.filter(c => c.status === statusFilter)

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
        <Link 
          href="/blueprints" 
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          Blueprints
        </Link>
        <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-foreground font-medium truncate max-w-[200px]">
          {blueprint.name}
        </span>
      </nav>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>{blueprint.name}</h1>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="secondary">{stageName}</Badge>
            {blueprint.critical_gaps > 0 && (
              <Badge variant="destructive">
                {blueprint.critical_gaps} critical gap{blueprint.critical_gaps !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/blueprints/${blueprint.id}/assess`}>
            <Button variant="secondary">
              <Play className="mr-2 h-4 w-4" />
              Run Assessment
            </Button>
          </Link>
          <Link href={`/blueprints/${blueprint.id}/settings`}>
            <Button variant="ghost" size="icon" aria-label="Blueprint settings">
              <Settings className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          icon={Target}
          label="Coverage"
          value={<CoverageScore score={summary?.coverage_percentage || 0} size="sm" showLabel={false} />}
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Covered"
          value={summary?.covered || 0}
          color="emerald"
        />
        <SummaryCard
          icon={Circle}
          label="Partial"
          value={summary?.partial || 0}
          color="amber"
        />
        <SummaryCard
          icon={AlertTriangle}
          label="Gaps"
          value={summary?.gaps || 0}
          color="rose"
        />
      </div>

      {/* Coverage bar */}
      <Card>
        <CardContent className="pt-6">
          <CoverageBar
            covered={summary?.covered || 0}
            partial={summary?.partial || 0}
            gaps={summary?.gaps || 0}
            notNeeded={summary?.not_needed || 0}
            showLabels
          />
        </CardContent>
      </Card>

      {/* Next Action (prominent) */}
      {nextAction && nextAction.type === 'gap' && (
        <NextActionCard
          action={nextAction}
          onAction={(action) => {
            if (action === 'self_assign' && nextAction.domain) {
              setSelectedDomain(nextAction.domain)
            }
          }}
        />
      )}

      {/* Main Content Tabs */}
      <Tabs defaultValue="domains" className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="domains">
              <ListTree className="mr-2 h-4 w-4" />
              Domains
            </TabsTrigger>
            <TabsTrigger value="expertise">
              <Users className="mr-2 h-4 w-4" />
              Expertise
            </TabsTrigger>
            <TabsTrigger value="suppliers">
              <Building2 className="mr-2 h-4 w-4" />
              Suppliers
            </TabsTrigger>
            <TabsTrigger value="milestones">
              <Calendar className="mr-2 h-4 w-4" />
              Milestones
            </TabsTrigger>
          </TabsList>

          {/* View controls */}
          <div className="flex items-center gap-4">
            {/* Status filter */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as CoverageStatus | 'all')}
              >
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Domains</SelectItem>
                  <SelectItem value="gap">Gaps Only</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="covered">Covered</SelectItem>
                  <SelectItem value="not_needed">Not Needed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* View mode toggle */}
            <div className="flex items-center gap-1 border rounded-md p-1">
              <Button
                variant={viewMode === 'visual' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('visual')}
                className={viewMode === 'visual' ? 'bg-international-orange hover:bg-international-orange/90' : ''}
              >
                <Sparkles className="h-4 w-4 mr-1" />
                Visual
              </Button>
              <Button
                variant={viewMode === 'tree' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('tree')}
              >
                <ListTree className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>

            {/* Show all toggle */}
            <div className="flex items-center gap-2">
              <Switch
                id="show-all"
                checked={showAllDomains}
                onCheckedChange={setShowAllDomains}
              />
              <Label htmlFor="show-all" className="text-sm cursor-pointer">
                {showAllDomains ? (
                  <span className="flex items-center gap-1">
                    <Eye className="h-4 w-4" /> Show All
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <EyeOff className="h-4 w-4" /> Relevant Only
                  </span>
                )}
              </Label>
            </div>
          </div>
        </div>

        <TabsContent value="domains">
          {viewMode === 'visual' ? (
            <VisualBlueprintView
              blueprintId={blueprint.id}
              templateSlug={blueprint.template?.product_category || 'rocket'}
              templateName={blueprint.template?.name || blueprint.name}
              // Extract domains from coverage data for auto-layout
              domains={coverage.map(c => c.domain).filter(Boolean)}
              coverage={coverage}
              onCreateObjective={(title, description) => {
                toast.info('Creating objective: ' + title)
                // TODO: Implement objective creation
              }}
            />
          ) : (
            <Card>
              <CardContent className="pt-6">
                {viewMode === 'tree' ? (
                  <DomainTreeView
                    coverage={filteredCoverage}
                    onSelect={setSelectedDomain}
                    selected={selectedDomain?.id}
                    showAllDomains={showAllDomains}
                    filterStatus={statusFilter === 'all' ? undefined : statusFilter}
                  />
                ) : (
                  <DomainListView
                    coverage={filteredCoverage}
                    onSelect={setSelectedDomain}
                  />
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="expertise">
          <Card>
            <CardHeader>
              <CardTitle>Expertise Network</CardTitle>
            </CardHeader>
            <CardContent>
              <ExpertiseByCategory coverage={coverage} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suppliers">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Supply Chain</CardTitle>
              <Button variant="secondary" size="sm">
                Add Supplier
              </Button>
            </CardHeader>
            <CardContent>
              {suppliers.length > 0 ? (
                <div className="space-y-2">
                  {suppliers.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted"
                    >
                      <div>
                        <p className="font-medium">{s.supplier?.name || 'Unknown'}</p>
                        <p className="text-sm text-muted-foreground">{s.role}</p>
                      </div>
                      <Badge variant={s.status === 'active' ? 'success' : 'secondary'}>
                        {s.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center py-8 text-muted-foreground">
                  No suppliers added yet
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="milestones">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Milestones</CardTitle>
              <Button variant="secondary" size="sm">
                Add Milestone
              </Button>
            </CardHeader>
            <CardContent>
              {milestones.length > 0 ? (
                <div className="space-y-4">
                  {milestones.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center gap-4 p-3 rounded-lg bg-muted"
                    >
                      <div className={cn(
                        'h-10 w-10 rounded-full flex items-center justify-center',
                        m.status === 'complete' && 'bg-status-success-light text-status-success',
                        m.status === 'in_progress' && 'bg-status-info-light text-status-info',
                        m.status === 'blocked' && 'bg-status-error-light text-destructive',
                        m.status === 'upcoming' && 'bg-muted text-muted-foreground'
                      )}>
                        <Target className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{m.name}</p>
                        {m.target_date && (
                          <p className="text-sm text-muted-foreground">
                            Target: {new Date(m.target_date).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <Badge variant={
                        m.status === 'complete' ? 'success' :
                        m.status === 'blocked' ? 'destructive' :
                        'secondary'
                      }>
                        {m.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center py-8 text-muted-foreground">
                  No milestones added yet
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Domain detail panel (Sheet) */}
      <Sheet open={!!selectedDomain} onOpenChange={(open) => !open && setSelectedDomain(null)}>
        <SheetContent side="right" className="w-[480px] sm:max-w-[480px] overflow-y-auto">
          {selectedDomain && (
            <DomainDetailPanel
              coverage={selectedDomain}
              onClose={() => setSelectedDomain(null)}
              onUpdateStatus={handleUpdateStatus}
              onAddExpertise={handleAddExpertise}
              onRemoveExpertise={handleRemoveExpertise}
              isUpdating={isUpdating}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

// Summary card component
function SummaryCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType
  label: string
  value: React.ReactNode
  color?: 'emerald' | 'amber' | 'rose'
}) {
  const colorClasses = {
    emerald: 'text-status-success',
    amber: 'text-status-warning',
    rose: 'text-destructive',
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            <Icon className={cn(
              'h-5 w-5',
              color ? colorClasses[color] : 'text-muted-foreground'
            )} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <div className={cn('text-2xl font-bold', color && colorClasses[color])}>
              {value}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// Expert info type
interface ExpertInfo {
  name: string
  domains: string[]
  level: string
}

// Expertise grouped by category
function ExpertiseByCategory({ coverage }: { coverage: DomainCoverageWithDetails[] }) {
  // Group covered domains by who covers them
  const expertiseMap: Record<string, ExpertInfo[]> = {}

  for (const item of coverage) {
    if (!item.expertise || item.expertise.length === 0) continue

    for (const exp of item.expertise) {
      const name = exp.profile?.full_name || exp.external_contact?.name || 'Unknown'
      const key = exp.profile_id || name

      if (!expertiseMap[key]) {
        expertiseMap[key] = []
      }

      const existing = expertiseMap[key]
      const domainName = item.domain?.name || item.domain_name || 'Unknown'
      
      // Add domain if not already in list
      const existingPerson = existing.find(e => e.name === name)
      if (existingPerson) {
        if (!existingPerson.domains.includes(domainName)) {
          existingPerson.domains.push(domainName)
        }
      } else {
        existing.push({
          name,
          domains: [domainName],
          level: exp.expertise_level || 'competent',
        })
      }
    }
  }

  const experts: ExpertInfo[] = Object.values(expertiseMap).flat()

  if (experts.length === 0) {
    return (
      <p className="text-center py-8 text-muted-foreground">
        No expertise assigned yet. Select domains to add expertise.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {experts.map((exp, idx) => (
        <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-muted">
          <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center">
            <Users className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="font-medium">{exp.name}</p>
              <Badge variant="secondary" className="text-xs">
                {exp.level}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {exp.domains.join(', ')}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
