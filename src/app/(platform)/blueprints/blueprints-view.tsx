'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { typography } from '@/lib/design-system'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  BlueprintGrid,
  CreateBlueprintDialog,
  UsePackDialog,
} from '@/components/blueprints'
import { UniversalSubsystemsGrid } from '@/components/blueprints/universal-subsystems-grid'
import { SubsystemDetailDialog } from '@/components/blueprints/subsystem-detail-dialog'
import { CreateSubsystemObjectiveDialog } from '@/components/blueprints/create-subsystem-objective-dialog'
import { archiveBlueprint, deleteBlueprint } from '@/actions/blueprints'
import { getSubsystemObjectivePack } from '@/actions/universal-subsystems'
import { createAdvisoryQuestion } from '@/actions/advisory'
import type { Blueprint, BlueprintTemplate, UniversalSubsystem, SubsystemObjectivePack } from '@/types/blueprints'
import type { ObjectivePack } from '@/actions/packs'
import { QuestionCard, Question } from '@/components/advisory/question-card'
import { AskModal } from '@/components/advisory/ask-modal'
import { StatusLegend } from '@/components/advisory/status-legend'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Plus,
  Map,
  Target,
  Users,
  Sparkles,
  Rocket,
  ArrowRight,
  Zap,
  Truck,
  GraduationCap,
  CheckCircle2,
  Layers,
  LayoutDashboard,
  Cpu,
  Smartphone,
  Cloud,
  Lightbulb,
  CircuitBoard,
  Bot,
  MessageSquare,
  HelpCircle,
  ChevronDown,
  Search,
  Briefcase,
  Package,
  Clock,
  BarChart3,
  FileText,
  Store,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface BlueprintsViewProps {
  blueprints: Blueprint[]
  templates: BlueprintTemplate[]
  questions?: Question[]
  packs?: ObjectivePack[]
  universalSubsystems?: UniversalSubsystem[]
  currentUserId?: string
  currentUserRole?: string
}

export function BlueprintsView({ 
  blueprints, 
  templates,
  questions = [],
  packs = [],
  universalSubsystems = [],
  currentUserId: _currentUserId = '',
  currentUserRole: _currentUserRole,
}: BlueprintsViewProps) {
  // Note: _currentUserId and _currentUserRole are available for future "My Questions" filter
  const router = useRouter()
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  
  // Q&A State
  const [isQAOpen, setIsQAOpen] = useState(true)
  const [qaSearchQuery, setQaSearchQuery] = useState('')
  
  // Universal Subsystems State
  const [selectedSubsystem, setSelectedSubsystem] = useState<UniversalSubsystem | null>(null)
  const [selectedSubsystemPack, setSelectedSubsystemPack] = useState<SubsystemObjectivePack | null>(null)
  const [isSubsystemDialogOpen, setIsSubsystemDialogOpen] = useState(false)
  const [isCreateObjectiveOpen, setIsCreateObjectiveOpen] = useState(false)
  
  // Fetch objective pack when subsystem is selected
  useEffect(() => {
    async function fetchPack() {
      if (selectedSubsystem) {
        const pack = await getSubsystemObjectivePack(selectedSubsystem.id)
        setSelectedSubsystemPack(pack)
      } else {
        setSelectedSubsystemPack(null)
      }
    }
    fetchPack()
  }, [selectedSubsystem])
  
  // Handle subsystem click
  const handleSubsystemClick = (subsystem: UniversalSubsystem) => {
    setSelectedSubsystem(subsystem)
    setIsSubsystemDialogOpen(true)
  }
  
  // Handle create objective from subsystem
  const handleCreateObjective = (subsystem: UniversalSubsystem, pack: SubsystemObjectivePack) => {
    setSelectedSubsystem(subsystem)
    setSelectedSubsystemPack(pack)
    setIsSubsystemDialogOpen(false)
    setIsCreateObjectiveOpen(true)
  }
  
  // Group packs by category
  const packsByCategory = useMemo(() => {
    const grouped: Record<string, ObjectivePack[]> = {}
    packs.forEach(pack => {
      const category = pack.category || 'General'
      if (!grouped[category]) {
        grouped[category] = []
      }
      grouped[category].push(pack)
    })
    return grouped
  }, [packs])
  
  // Filter questions based on search
  const filteredQuestions = useMemo(() => {
    if (!qaSearchQuery.trim()) return questions
    const query = qaSearchQuery.toLowerCase()
    return questions.filter(q => 
      q.title.toLowerCase().includes(query) ||
      q.body.toLowerCase().includes(query) ||
      q.category.toLowerCase().includes(query)
    )
  }, [questions, qaSearchQuery])

  // Handle Q&A submission
  const handleAskQuestion = async (data: {
    title: string
    body: string
    category: string
    visibility: 'public' | 'foundry'
    getAiAnswer: boolean
  }) => {
    const result = await createAdvisoryQuestion({
      title: data.title,
      body: data.body,
      category: data.category,
      visibility: data.visibility === 'public' ? 'network' : 'foundry',
      getAiAnswer: data.getAiAnswer,
    })
    
    if (result.error) {
      toast.error(result.error)
      return { error: result.error }
    }
    
    toast.success(
      data.getAiAnswer 
        ? 'Question submitted! AI is generating an answer...' 
        : 'Question submitted successfully'
    )
    router.refresh()
    return { questionId: result.data?.id }
  }

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
    toast.info('Duplication coming soon')
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border">
        <div className="min-w-0 flex-1">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Inspiration</h1>
          </div>
          <p className={typography.pageSubtitle}>
            Get ideas on what to do next. Discover opportunities, find experts, and turn insights into action.
          </p>
        </div>
      </div>

      {/* ===== BUSINESS GUIDANCE SECTION ===== */}
      <section className="space-y-8">
          {/* Business Guidance Intro */}
          <Card className="bg-gradient-to-r from-blue-50 to-background border-blue-100">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-blue-100 rounded-xl shrink-0">
                  <Package className="h-6 w-6 text-electric-blue" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground mb-1">Objective Packs</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Pre-built objectives with tasks designed by experienced founders. Pick a pack, customize it, and start executing. 
                    Each pack includes tasks assigned to the right roles — you, your apprentice, or an AI agent.
                  </p>
                  <div className="flex flex-wrap gap-3 text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Target className="h-3.5 w-3.5 text-international-orange" />
                      <span>Creates objectives with tasks</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Users className="h-3.5 w-3.5 text-electric-blue" />
                      <span>Role-assigned tasks</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Store className="h-3.5 w-3.5 text-status-success" />
                      <span>Links to marketplace experts</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Packs Grid by Category */}
          {Object.keys(packsByCategory).length > 0 ? (
            <div className="space-y-8">
              {Object.entries(packsByCategory).map(([category, categoryPacks]) => (
                <section key={category} className="space-y-4">
                  <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <PackCategoryIcon category={category} />
                    {category}
                    <Badge variant="secondary" className="ml-2">
                      {categoryPacks.length} {categoryPacks.length === 1 ? 'pack' : 'packs'}
                    </Badge>
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {categoryPacks.map((pack) => (
                      <PackCard key={pack.id} pack={pack} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <Card className="border-2 border-dashed">
              <CardContent className="py-12">
                <EmptyState
                  icon={<Package className="h-12 w-12" />}
                  title="No objective packs yet"
                  description="Objective packs are pre-built objectives with tasks. They'll appear here as they become available."
                  action={
                    <Button asChild>
                      <Link href="/objectives">
                        Create Custom Objective
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          )}

          {/* Marketplace Upsell CTA */}
          <Card className="bg-gradient-to-r from-orange-50 to-background border-orange-100">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-orange-100 rounded-lg shrink-0">
                    <Store className="h-5 w-5 text-international-orange" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Need expert help?</h3>
                    <p className="text-sm text-muted-foreground">
                      Browse our marketplace to find advisors, agencies, and suppliers who can help execute your objectives.
                    </p>
                  </div>
                </div>
                <Button asChild className="bg-international-orange hover:bg-international-orange/90">
                  <Link href="/marketplace">
                    Browse Marketplace
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
      </section>

      {/* ===== PRODUCT GUIDANCE SECTION ===== */}
      <section className="space-y-8">
          {/* Product Tab Header Actions */}
          <div className="flex items-center justify-end gap-2">
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

          {/* ===== UNIVERSAL SUBSYSTEMS SECTION ===== */}
          {universalSubsystems.length > 0 && (
            <section className="space-y-4">
              {/* Section Header */}
              <Card className="bg-gradient-to-r from-orange-50 to-background border-orange-100">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-orange-100 rounded-xl shrink-0">
                      <Cpu className="h-6 w-6 text-international-orange" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground mb-1">Universal Subsystems</h3>
                      <p className="text-sm text-muted-foreground mb-3">
                        Technical domains that apply to any hardware or software product. Get detailed guidance,
                        key questions to answer, and create objectives with pre-built tasks. Every objective includes
                        tasks to find relevant experts and suppliers on the marketplace.
                      </p>
                      <div className="flex flex-wrap gap-3 text-xs">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Target className="h-3.5 w-3.5 text-international-orange" />
                          <span>Create objectives with 5-6 pre-built tasks</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Users className="h-3.5 w-3.5 text-electric-blue" />
                          <span>Auto-includes marketplace discovery tasks</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Lightbulb className="h-3.5 w-3.5 text-status-success" />
                          <span>Detailed primers & key questions</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Subsystems Grid */}
              <UniversalSubsystemsGrid
                subsystems={universalSubsystems}
                onSubsystemClick={handleSubsystemClick}
              />
            </section>
          )}

          {/* Section Divider */}
          {universalSubsystems.length > 0 && (
            <div className="flex items-center gap-4 py-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-sm text-muted-foreground font-medium">Company Blueprints</span>
              <div className="flex-1 h-px bg-border" />
            </div>
          )}

          {/* HERO: Visual Technology Tree Preview - Always Visible */}
      <Card className="overflow-hidden border-2 border shadow-xl">
        <CardContent className="p-0">
          <div className="bg-muted p-6 sm:p-8">
            <div className="text-center mb-6">
              <Badge variant="secondary" className="mb-3">
                Demo Example
              </Badge>
              <h2 className="text-xl sm:text-2xl font-display font-bold text-foreground mb-2">
                Your Product as a Technology Tree
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Every product is made of interconnected domains. See everything at once - what you know, what you need, and how to get there.
              </p>
            </div>
            
            {/* Mini Blueprint Canvas Preview - Rocket Example */}
            <div className="relative h-[360px] bg-[radial-gradient(circle,#e2e8f0_1px,transparent_1px)] [background-size:16px_16px] rounded-lg border border overflow-hidden">
              {/* Rocket silhouette hint */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.03]" viewBox="0 0 400 360">
                <path 
                  d="M200 20 C210 20, 230 40, 235 80 L240 140 L245 200 L260 220 L270 300 L240 300 L235 320 L200 330 L165 320 L160 300 L130 300 L140 220 L155 200 L160 140 L165 80 C170 40, 190 20, 200 20"
                  fill="#334155"
                />
              </svg>
              
              {/* Top: Avionics */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-44 p-3 bg-background rounded-xl border-2 border shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Electronics</span>
                  <CheckCircle2 className="h-4 w-4 text-status-success" />
                </div>
                <div className="font-semibold text-sm">Avionics Bay</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Flight computers, sensors</div>
              </div>
              
              {/* Left: FAA Compliance - Gap */}
              <div className="absolute top-28 left-4 sm:left-8 w-40 p-3 bg-background rounded-xl border-2 border-orange-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">Compliance</span>
                </div>
                <div className="font-semibold text-sm">FAA License</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Licensing, safety reviews</div>
                <div className="flex items-center gap-1 mt-1.5 text-xs text-international-orange font-medium">
                  <Sparkles className="h-3 w-3" />
                  Needs attention
                </div>
              </div>
              
              {/* Right: Communications - Covered */}
              <div className="absolute top-28 right-4 sm:right-8 w-40 p-3 bg-background rounded-xl border-2 border shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">Systems</span>
                  <CheckCircle2 className="h-4 w-4 text-status-success" />
                </div>
                <div className="font-semibold text-sm">Communications</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Telemetry, ground link</div>
              </div>
              
              {/* Middle Left: Structural - Partial */}
              <div className="absolute top-52 left-4 sm:left-16 w-40 p-3 bg-background rounded-xl border-2 border-blue-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Mechanical</span>
                  <div className="h-4 w-4 rounded-full bg-blue-100 flex items-center justify-center">
                    <div className="h-2 w-2 rounded-full bg-electric-blue" />
                  </div>
                </div>
                <div className="font-semibold text-sm">Structural Design</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Materials, loads</div>
                <div className="flex items-center gap-1 mt-1.5 text-xs text-electric-blue font-medium">
                  In progress
                </div>
              </div>
              
              {/* Middle Right: Ground Support */}
              <div className="absolute top-52 right-4 sm:right-16 w-40 p-3 bg-background rounded-xl border-2 border shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase text-green-600 bg-green-50 px-1.5 py-0.5 rounded">Operations</span>
                  <CheckCircle2 className="h-4 w-4 text-status-success" />
                </div>
                <div className="font-semibold text-sm">Ground Support</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Launch pad, operations</div>
              </div>
              
              {/* Bottom: Propulsion - Gap */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-44 p-3 bg-background rounded-xl border-2 border-orange-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Propulsion</span>
                </div>
                <div className="font-semibold text-sm">Rocket Engine</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Engines, fuel, thrust</div>
                <div className="flex items-center gap-1 mt-1.5 text-xs text-international-orange font-medium">
                  <Sparkles className="h-3 w-3" />
                  Needs attention
                </div>
              </div>

              {/* Connection lines */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 400 360">
                {/* Top to middle connections */}
                <line x1="200" y1="76" x2="200" y2="290" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.4" />
                <line x1="200" y1="76" x2="80" y2="140" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.4" />
                <line x1="200" y1="76" x2="320" y2="140" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.4" />
                {/* Middle connections */}
                <line x1="80" y1="200" x2="80" y2="220" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.4" />
                <line x1="320" y1="200" x2="320" y2="220" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.4" />
              </svg>
            </div>
            
            <div className="mt-4 space-y-2">
              <p className="text-center text-sm text-muted-foreground">
                Click any node to explore what you need to know, find experts who can help, and connect with suppliers
              </p>
              <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground bg-muted rounded-lg py-2 px-4 max-w-2xl mx-auto">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-status-success" />
                  <span>Covered</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-3.5 w-3.5 rounded-full bg-blue-100 flex items-center justify-center">
                    <div className="h-1.5 w-1.5 rounded-full bg-electric-blue" />
                  </div>
                  <span>In Progress (example)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-international-orange" />
                  <span>Needs Attention (example)</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* WHY PRODUCT MAPS MATTER - 3 Gradient Cards */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-international-orange" />
          Why Product Maps Matter
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="bg-gradient-to-br from-orange-50 to-background border-orange-100">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                  <Map className="h-5 w-5 text-international-orange" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-1">See the Full Picture</h3>
                  <p className="text-sm text-muted-foreground">
                    View every domain, skill, and component needed for your product. Click any node to dive deep into what you need to know.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-50 to-background border-blue-100">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                  <Users className="h-5 w-5 text-electric-blue" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-1">Find Experts & Suppliers</h3>
                  <p className="text-sm text-muted-foreground">
                    Each area connects to marketplace experts and manufacturers. Get advice, request quotes, and build your supply chain.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-background border-green-100">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                  <Target className="h-5 w-5 text-status-success" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-1">Turn Gaps into Action</h3>
                  <p className="text-sm text-muted-foreground">
                    Identify what needs attention and automatically create objectives with tasks. AI helps draft expert packets and RFQs.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* HOW IT ALL CONNECTS - Integration Flow */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Zap className="h-5 w-5 text-electric-blue" />
          How It All Connects
        </h2>
        <Card className="bg-muted/30">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground mb-6 text-center max-w-2xl mx-auto">
              Product Maps are the central hub connecting your team, suppliers, advisors, and work. Everything flows together.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <IntegrationCard
                icon={Users}
                title="Team Coverage"
                description="Assign team members to domains. See who covers what across your organization."
                linkText="Team → Skills"
                href="/team"
              />
              <IntegrationCard
                icon={Truck}
                title="Supplier Network"
                description="Connect manufacturers and suppliers. Request quotes, track lead times."
                linkText="Marketplace → Manufacturing"
                href="/marketplace?category=manufacturing"
              />
              <IntegrationCard
                icon={GraduationCap}
                title="Expert Advisors"
                description="Gaps connect to advisors. AI generates expert packets with the right questions."
                linkText="Marketplace → Advice"
                href="/marketplace?category=agencies"
              />
              <IntegrationCard
                icon={Target}
                title="Objectives & Tasks"
                description="Turn gaps into objectives with tasks. Assign to team, advisors, or AI agents."
                linkText="Objectives"
                href="/objectives"
              />
              <IntegrationCard
                icon={LayoutDashboard}
                title="Executive View"
                description="See coverage across all blueprints. Track milestones and organizational gaps."
                linkText="Today → Overview"
                href="/home"
              />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* TWO MAIN ACTION CARDS */}
      <section className="grid gap-6 md:grid-cols-2">
        {/* Browse Templates Card */}
        <Card className="relative overflow-hidden group hover:shadow-lg transition-all hover:border-electric-blue">
          <div className="absolute top-0 left-0 w-1 h-full bg-electric-blue" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center">
                <Layers className="h-6 w-6 text-electric-blue" />
              </div>
              <Badge variant="secondary" className="bg-blue-50 text-electric-blue border-blue-200">
                Explore
              </Badge>
            </div>
            <CardTitle className="text-xl mt-4">Browse Templates</CardTitle>
            <CardDescription className="text-sm">
              Start with a pre-built technology tree for your product type
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-status-success" />
                <span>Rockets, robotics, electronics, SaaS, mobile apps</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-status-success" />
                <span>30-70 domains per template with guided questions</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-status-success" />
                <span>Pre-mapped to relevant experts and suppliers</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-status-success" />
                <span>Customize and extend as needed</span>
              </div>
            </div>
            <Button 
              onClick={() => setIsCreateOpen(true)}
              className="w-full group-hover:bg-electric-blue group-hover:text-white transition-colors"
            >
              Browse Templates
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        {/* Your Product Maps Card */}
        <Card className="relative overflow-hidden group hover:shadow-lg transition-all hover:border-international-orange">
          <div className="absolute top-0 left-0 w-1 h-full bg-international-orange" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="h-12 w-12 rounded-xl bg-orange-100 flex items-center justify-center">
                <Map className="h-6 w-6 text-international-orange" />
              </div>
              <Badge variant="secondary" className="bg-orange-50 text-international-orange border-orange-200">
                {blueprints.length > 0 ? `${blueprints.length} Active` : 'Get Started'}
              </Badge>
            </div>
            <CardTitle className="text-xl mt-4">Your Product Maps</CardTitle>
            <CardDescription className="text-sm">
              {blueprints.length > 0 
                ? `You have ${blueprints.length} active product map${blueprints.length > 1 ? 's' : ''} with ${Math.round(blueprints.reduce((sum, b) => sum + b.coverage_score, 0) / blueprints.length)}% average coverage`
                : 'Create your first product map to visualize what you need'
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-international-orange" />
                <span>Visual canvas with clickable nodes</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-international-orange" />
                <span>Track coverage across all domains</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-international-orange" />
                <span>Connected suppliers and expertise</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-international-orange" />
                <span>Objectives and tasks linked to gaps</span>
              </div>
            </div>
            {blueprints.length > 0 ? (
              <Button asChild variant="default" className="w-full bg-international-orange hover:bg-international-orange/90">
                <Link href={`/blueprints/${blueprints[0].id}`}>
                  View Your Product Maps
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <Button 
                onClick={() => setIsCreateOpen(true)}
                variant="default" 
                className="w-full bg-international-orange hover:bg-international-orange/90"
              >
                Create Your First Product Map
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Product Map Grid/Stats - Only if user has maps */}
      {blueprints.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Map className="h-5 w-5 text-muted-foreground" />
            Your Active Product Maps
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
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
      )}

      {/* WHAT'S INSIDE EVERY BLUEPRINT - Always visible */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-international-orange" />
          What&apos;s Inside Every Blueprint
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <MagicCard
            icon={GraduationCap}
            title="Knowledge Tree"
            description="Drill into any domain to see branching areas of knowledge. See what you know and what you need to learn."
            color="blue"
            href="/blueprints/explore"
          />
          <MagicCard
            icon={Users}
            title="Expert Matching"
            description="When you find a gap, see marketplace experts who can help. Get pre-written messages to ask the right questions."
            color="purple"
            href="/marketplace?category=agencies"
          />
          <MagicCard
            icon={Truck}
            title="Supplier Connections"
            description="Physical products need physical suppliers. See who can provide components, get lead times, request quotes."
            color="emerald"
            href="/marketplace?category=manufacturing"
          />
          <MagicCard
            icon={Target}
            title="Objectives & Tasks"
            description="Turn any knowledge gap into an objective with actionable tasks. Everything stays connected to your blueprint."
            color="orange"
            href="/objectives"
          />
        </div>
      </section>

      {/* AVAILABLE TEMPLATES - Always visible */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Layers className="h-5 w-5 text-electric-blue" />
          Available Templates
        </h2>
        <p className="text-sm text-muted-foreground">
          Start with a pre-built technology tree tailored to your product type
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <TemplateCard
            icon={Rocket}
            name="Rockets & Launch Vehicles"
            description="Everything needed to build and launch a rocket"
            domains={68}
            examples={['Propulsion', 'Avionics', 'FAA Compliance', 'Launch Ops']}
            onClick={() => setIsCreateOpen(true)}
          />
          <TemplateCard
            icon={Bot}
            name="Robotics & Automation"
            description="Motors, sensors, control systems, and safety"
            domains={68}
            examples={['Motors', 'Sensors', 'SLAM', 'Safety Systems']}
            onClick={() => setIsCreateOpen(true)}
          />
          <TemplateCard
            icon={CircuitBoard}
            name="Consumer Electronics"
            description="Hardware design, compliance, and manufacturing"
            domains={47}
            examples={['PCB Design', 'FCC Certification', 'Battery Management']}
            onClick={() => setIsCreateOpen(true)}
          />
          <TemplateCard
            icon={Cloud}
            name="SaaS Platform"
            description="Cloud infrastructure, security, and compliance"
            domains={38}
            examples={['Cloud Infrastructure', 'Authentication', 'SOC 2']}
            onClick={() => setIsCreateOpen(true)}
          />
          <TemplateCard
            icon={Smartphone}
            name="Mobile Application"
            description="iOS, Android, and app store requirements"
            domains={29}
            examples={['iOS Development', 'Android', 'App Store Guidelines']}
            onClick={() => setIsCreateOpen(true)}
          />
          <Card 
            className="border-dashed border-2 hover:border-international-orange hover:bg-orange-50/50 transition-all cursor-pointer group"
            onClick={() => setIsCreateOpen(true)}
          >
            <CardContent className="flex flex-col items-center justify-center h-full min-h-[200px] text-center p-6">
              <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center mb-3 group-hover:bg-orange-100 transition-colors">
                <Plus className="h-6 w-6 text-muted-foreground group-hover:text-international-orange transition-colors" />
              </div>
              <h3 className="font-semibold text-foreground mb-1">Custom Blueprint</h3>
              <p className="text-sm text-muted-foreground">
                Start from scratch or describe your product for AI-generated domains
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Marketplace CTA for Product Guidance */}
      <Card className="bg-gradient-to-r from-blue-50 to-orange-50 border-blue-100">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-lg shrink-0">
                <Users className="h-5 w-5 text-electric-blue" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Find experts & suppliers</h3>
                <p className="text-sm text-muted-foreground">
                  Connect with advisors who've built similar products, and suppliers who can manufacture components.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link href="/marketplace?category=agencies">
                  <GraduationCap className="mr-2 h-4 w-4" />
                  Find Advisors
                </Link>
              </Button>
              <Button asChild className="bg-international-orange hover:bg-international-orange/90">
                <Link href="/marketplace?category=manufacturing">
                  <Truck className="mr-2 h-4 w-4" />
                  Find Suppliers
                </Link>
              </Button>
            </div>
          </div>
            </CardContent>
          </Card>
      </section>

      {/* ADVISORY Q&A SECTION */}
      <section className="space-y-4 mt-8 pt-8 border-t border-muted">
        <Collapsible open={isQAOpen} onOpenChange={setIsQAOpen}>
          <div className="flex items-center justify-between">
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <div className="h-10 w-10 rounded-lg bg-violet-100 flex items-center justify-center">
                  <MessageSquare className="h-5 w-5 text-violet-600" />
                </div>
                <div className="text-left">
                  <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    Advisory Q&A
                    <Badge variant="secondary" className="text-xs">
                      {questions.length} {questions.length === 1 ? 'question' : 'questions'}
                    </Badge>
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Get AI-powered insights verified by human experts
                  </p>
                </div>
                <ChevronDown className={cn(
                  "h-5 w-5 text-muted-foreground transition-transform ml-2",
                  isQAOpen && "rotate-180"
                )} />
              </button>
            </CollapsibleTrigger>
            <AskModal onSubmit={handleAskQuestion} />
          </div>

          <CollapsibleContent className="mt-6 space-y-4">
            {/* Status Legend */}
            <StatusLegend className="pb-4" />

            {/* Search */}
            {questions.length > 0 && (
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search questions..."
                    value={qaSearchQuery}
                    onChange={(e) => setQaSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {filteredQuestions.length} {filteredQuestions.length === 1 ? 'question' : 'questions'} 
                  {qaSearchQuery && ' found'}
                </p>
              </div>
            )}

            {/* Questions Grid */}
            {filteredQuestions.length === 0 ? (
              <Card className="border-2 border-dashed">
                <CardContent className="py-12">
                  <EmptyState
                    icon={<HelpCircle className="h-12 w-12" />}
                    title={qaSearchQuery ? "No questions match your search" : "No questions yet"}
                    description={
                      qaSearchQuery 
                        ? "Try adjusting your search terms."
                        : "Ask your first question to get AI-powered insights verified by experts."
                    }
                    action={
                      qaSearchQuery ? (
                        <Button variant="link" onClick={() => setQaSearchQuery('')} className="text-electric-blue">
                          Clear Search
                        </Button>
                      ) : (
                        <AskModal 
                          onSubmit={handleAskQuestion}
                          trigger={
                            <Button className="gap-2">
                              <MessageSquare className="h-4 w-4" />
                              Ask a Question
                            </Button>
                          }
                        />
                      )
                    }
                  />
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredQuestions.slice(0, 6).map((question) => (
                  <QuestionCard key={question.id} question={question} />
                ))}
              </div>
            )}

            {/* Show more indicator */}
            {filteredQuestions.length > 6 && (
              <div className="text-center pt-4">
                <p className="text-sm text-muted-foreground">
                  Showing 6 of {filteredQuestions.length} questions. Use search to find specific topics.
                </p>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </section>

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

      {/* Subsystem Detail Dialog */}
      <SubsystemDetailDialog
        subsystem={selectedSubsystem}
        objectivePack={selectedSubsystemPack}
        open={isSubsystemDialogOpen}
        onOpenChange={setIsSubsystemDialogOpen}
        onCreateObjective={handleCreateObjective}
      />

      {/* Create Objective from Subsystem Dialog */}
      <CreateSubsystemObjectiveDialog
        subsystem={selectedSubsystem}
        objectivePack={selectedSubsystemPack}
        open={isCreateObjectiveOpen}
        onOpenChange={setIsCreateObjectiveOpen}
      />
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

// Integration card for "How It All Connects" section
function IntegrationCard({
  icon: Icon,
  title,
  description,
  linkText,
  href,
}: {
  icon: React.ElementType
  title: string
  description: string
  linkText: string
  href?: string
}) {
  const content = (
    <div className={cn(
      "text-center p-4 rounded-lg bg-background border transition-shadow",
      href ? "hover:shadow-md hover:border-electric-blue cursor-pointer" : "hover:shadow-sm"
    )}>
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-muted mb-3">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <h4 className="font-semibold text-foreground text-sm mb-1">{title}</h4>
      <p className="text-xs text-muted-foreground mb-2 leading-relaxed">{description}</p>
      <span className="text-[10px] text-electric-blue font-medium flex items-center justify-center gap-1">
        {linkText}
        {href && <ArrowRight className="h-3 w-3" />}
      </span>
    </div>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }

  return content
}

// Magic card for features section
function MagicCard({
  icon: Icon,
  title,
  description,
  color,
  href,
}: {
  icon: React.ElementType
  title: string
  description: string
  color: 'blue' | 'purple' | 'emerald' | 'orange'
  href?: string
}) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    orange: 'bg-orange-50 text-international-orange border-orange-100',
  }

  const content = (
    <div className="flex gap-4 p-5 rounded-xl border bg-card hover:shadow-md transition-shadow cursor-pointer">
      <div className={`flex-shrink-0 h-12 w-12 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div className="flex-1">
        <h4 className="font-semibold text-foreground mb-1">{title}</h4>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        {href && (
          <span className="text-xs text-electric-blue mt-2 inline-flex items-center gap-1">
            Explore <ArrowRight className="h-3 w-3" />
          </span>
        )}
      </div>
    </div>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }

  return content
}

// Template card for "Available Templates" section
function TemplateCard({
  icon: Icon,
  name,
  description,
  domains,
  examples,
  onClick,
}: {
  icon: React.ElementType
  name: string
  description: string
  domains: number
  examples: string[]
  onClick: () => void
}) {
  return (
    <Card 
      className="hover:shadow-lg transition-all hover:border-electric-blue cursor-pointer group"
      onClick={onClick}
    >
      <CardContent className="pt-6">
        <div className="flex items-start gap-3 mb-3">
          <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 group-hover:bg-blue-100 transition-colors">
            <Icon className="h-5 w-5 text-electric-blue" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground mb-0.5 truncate">{name}</h3>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="mb-3">
          <span className="text-sm font-medium text-foreground">{domains} domains</span>
          <span className="text-xs text-muted-foreground ml-1">covering:</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {examples.map((example) => (
            <span
              key={example}
              className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
            >
              {example}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// Icon helper for pack categories
function PackCategoryIcon({ category }: { category: string }) {
  const iconMap: Record<string, React.ElementType> = {
    'Fundraising': BarChart3,
    'Operations': Briefcase,
    'Marketing': Target,
    'Product': Cpu,
    'Sales': Users,
    'Legal': FileText,
    'Finance': BarChart3,
    'General': Package,
  }
  const Icon = iconMap[category] || Package
  return <Icon className="h-5 w-5 text-muted-foreground" />
}

// Pack card for "Objective Packs" section
function PackCard({ pack }: { pack: ObjectivePack }) {
  const difficultyColors: Record<string, string> = {
    'beginner': 'bg-green-100 text-green-700',
    'intermediate': 'bg-blue-100 text-blue-700',
    'advanced': 'bg-purple-100 text-purple-700',
  }

  const iconMap: Record<string, React.ElementType> = {
    'rocket': Rocket,
    'target': Target,
    'users': Users,
    'briefcase': Briefcase,
    'chart': BarChart3,
    'document': FileText,
    'lightbulb': Lightbulb,
    'sparkles': Sparkles,
  }
  const Icon = (pack.icon_name && iconMap[pack.icon_name]) || Package

  return (
    <Card className="hover:shadow-lg transition-all hover:border-electric-blue group">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0 group-hover:bg-blue-100 transition-colors">
            <Icon className="h-5 w-5 text-electric-blue" />
          </div>
          {pack.difficulty && (
            <Badge 
              variant="secondary" 
              className={cn('text-[10px]', difficultyColors[pack.difficulty.toLowerCase()] || '')}
            >
              {pack.difficulty}
            </Badge>
          )}
        </div>
        <CardTitle className="text-base mt-3">{pack.title}</CardTitle>
        {pack.description && (
          <CardDescription className="text-sm line-clamp-2">
            {pack.description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Pack metadata */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {pack.estimated_duration && (
            <div className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              <span>{pack.estimated_duration}</span>
            </div>
          )}
          {pack.items && pack.items.length > 0 && (
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{pack.items.length} tasks</span>
            </div>
          )}
        </div>

        {/* Preview of tasks */}
        {pack.items && pack.items.length > 0 && (
          <div className="space-y-1">
            {pack.items.slice(0, 3).map((item, idx) => (
              <div key={item.id || idx} className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                <span className="truncate">{item.title}</span>
                <Badge variant="outline" className="text-[9px] ml-auto shrink-0">
                  {item.role === 'Executive' ? 'You' : item.role === 'Apprentice' ? 'Team' : 'AI'}
                </Badge>
              </div>
            ))}
            {pack.items.length > 3 && (
              <p className="text-[10px] text-muted-foreground pl-3">
                +{pack.items.length - 3} more tasks
              </p>
            )}
          </div>
        )}

        {/* Action button with dialog */}
        <UsePackDialog pack={pack} />
      </CardContent>
    </Card>
  )
}
