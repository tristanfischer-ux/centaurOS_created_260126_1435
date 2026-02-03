'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Lightbulb, 
  Target, 
  Boxes, 
  ArrowLeft,
  ArrowRight,
  Clock,
  CheckSquare,
  CheckCircle2,
  Rocket,
  Users,
  BarChart3,
  FileText,
  CircuitBoard,
  Bot,
  Cpu,
  Radio,
  Pill,
  Smartphone,
  Server,
  Layers,
  ChevronDown,
  ChevronUp,
  Minus,
  Square,
  AlignJustify,
  Eye,
  BookOpen,
  Users2,
  Truck,
  Sparkles,
  ExternalLink
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { typography, spacing } from '@/lib/design-system'
import { cn } from '@/lib/utils'
import type { BlueprintTemplate, KnowledgeDomain, DomainCategory } from '@/types/blueprints'
import type { ObjectivePack } from '@/actions/packs'
import { getTemplateDomains } from '@/actions/blueprints'
import { toast } from 'sonner'
import { UsePackDialog } from '@/components/blueprints/use-pack-dialog'
import Link from 'next/link'

type CategoryId = 'business' | 'subsystems' | 'industry' | null

export type PackCardSize = 'small' | 'medium' | 'full'

interface Category {
  id: CategoryId
  title: string
  description: string
  icon: React.ElementType
  color: string
  stats: {
    label: string
    value: string
  }
}

// Icon mapping for pack categories
const getPackIcon = (iconName: string | null) => {
  const iconMap: Record<string, React.ElementType> = {
    'users': Users,
    'rocket': Rocket,
    'target': Target,
    'chart': BarChart3,
    'file': FileText,
    'boxes': Boxes,
    'check': CheckSquare,
  }
  return iconMap[iconName || 'target'] || Target
}

const getCategoryStats = (packs: ObjectivePack[], categoryFilters: string[]) => {
  const count = packs.filter(p => {
    const packCategory = p.category?.toLowerCase() || ''
    return categoryFilters.some(filter => packCategory.includes(filter))
  }).length
  return count.toString()
}

// Category filter mapping - includes all database categories
const CATEGORY_FILTERS = {
  business: ['sales', 'legal', 'compliance', 'hr', 'operations', 'finance', 'growth', 'startup', 'product', 'marketing'],
  subsystems: ['engineering', 'security', 'infrastructure'],
} as const

const categories = (packs: ObjectivePack[], templates: BlueprintTemplate[] = []): Category[] => {
  const industryCount = templates.filter(t => 
    ['robotics', 'rockets', 'satellites', 'ai-datacentre', 'pharmaceuticals', 'consumer-electronics', 'saas', 'mobile'].includes(t.product_category)
  ).length

  return [
    {
      id: 'business',
      title: 'Business Objectives Packs',
      description: 'Strategic objectives to grow your business, from operations and sales to legal and finance.',
      icon: Target,
      color: 'bg-electric-blue text-white',
      stats: {
        label: 'packs available',
        value: getCategoryStats(packs, [...CATEGORY_FILTERS.business]),
      },
    },
    {
      id: 'subsystems',
      title: 'Subsystems & Infrastructure',
      description: 'Build the foundations: hiring, accounting, tech stack, and operational systems.',
      icon: Boxes,
      color: 'bg-status-success text-white',
      stats: {
        label: 'packs available',
        value: getCategoryStats(packs, [...CATEGORY_FILTERS.subsystems]),
      },
    },
    {
      id: 'industry',
      title: 'Industry Sector',
      description: 'Technical knowledge domains and packs for specific industries: Robotics, Rockets, AI Infrastructure, Pharmaceuticals, and more.',
      icon: CircuitBoard,
      color: 'bg-chart-5 text-white',
      stats: {
        label: 'industries available',
        value: industryCount.toString(),
      },
    },
  ]
}

const getDifficultyColor = (difficulty: string) => {
  switch (difficulty) {
    case 'Easy':
      return 'bg-status-success-light text-status-success-dark'
    case 'Medium':
      return 'bg-status-warning-light text-status-warning-dark'
    case 'Hard':
      return 'bg-status-error-light text-status-error-dark'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

// Icon mapping for blueprint templates
const getTemplateIcon = (iconName: string) => {
  const iconMap: Record<string, React.ElementType> = {
    'rocket': Rocket,
    'bot': Bot,
    'satellite': Radio,
    'cpu': Cpu,
    'pill': Pill,
    'smartphone': Smartphone,
    'server': Server,
    'layers': Layers,
  }
  return iconMap[iconName] || CircuitBoard
}

// Helper to extract difficulty from metadata
const getDifficultyFromMetadata = (metadata: Record<string, unknown>): string => {
  const difficulty = metadata?.difficulty as string
  if (!difficulty) return 'intermediate'
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1)
}

// Domain category colors (from design system)
const getDomainCategoryColor = (category: DomainCategory | null) => {
  if (!category) return { bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-muted' }
  
  const colors: Record<DomainCategory, { bg: string; text: string; border: string }> = {
    Electronics: { bg: 'bg-status-info-light', text: 'text-status-info', border: 'border-status-info/30' },
    Mechanical: { bg: 'bg-status-warning-light', text: 'text-status-warning', border: 'border-status-warning/30' },
    Software: { bg: 'bg-chart-5/10', text: 'text-chart-5', border: 'border-chart-5/30' },
    Manufacturing: { bg: 'bg-status-success-light', text: 'text-status-success', border: 'border-status-success/30' },
    Regulatory: { bg: 'bg-status-error-light', text: 'text-destructive', border: 'border-destructive/30' },
    Business: { bg: 'bg-chart-2/10', text: 'text-chart-2', border: 'border-chart-2/30' },
    Operations: { bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-muted' },
  }
  
  return colors[category]
}

// Criticality badge color
const getCriticalityColor = (criticality: string) => {
  switch (criticality) {
    case 'critical':
      return 'bg-status-error-light text-status-error-dark'
    case 'important':
      return 'bg-status-warning-light text-status-warning-dark'
    case 'nice-to-have':
      return 'bg-status-info-light text-status-info-dark'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

/**
 * DomainCard - Displays a single knowledge domain with its details
 * Enhanced with learning resources, marketplace links, and AI summary
 */
function DomainCard({ domain, templateId }: { domain: KnowledgeDomain; templateId: string }) {
  const router = useRouter()
  const [showResources, setShowResources] = useState(false)
  const categoryColors = getDomainCategoryColor(domain.category)
  const criticalityColor = getCriticalityColor(domain.criticality)
  
  // Count sub-domains (children)
  const subDomainCount = domain.children?.length || 0
  
  // Show first 3 key questions
  const displayQuestions = domain.key_questions?.slice(0, 3) || []
  
  // Check if learning resources exist
  const hasLearningResources = domain.learning_resources && (
    (domain.learning_resources.courses?.length ?? 0) > 0 ||
    (domain.learning_resources.books?.length ?? 0) > 0 ||
    (domain.learning_resources.communities?.length ?? 0) > 0 ||
    (domain.learning_resources.tools?.length ?? 0) > 0
  )
  
  // Get marketplace links
  const expertSearchUrl = domain.marketplace_categories?.length > 0
    ? `/marketplace?category=${encodeURIComponent(domain.marketplace_categories[0])}&type=advice`
    : '/marketplace?category=People'
  const supplierSearchUrl = domain.supplier_categories?.length > 0
    ? `/marketplace?category=${encodeURIComponent(domain.supplier_categories[0])}&type=supplier`
    : '/marketplace?category=Products'
  
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between gap-4 mb-2">
          <div className="flex items-center gap-3 flex-1">
            <Badge className={cn(categoryColors.bg, categoryColors.text)}>
              {domain.category || 'General'}
            </Badge>
            {domain.criticality && (
              <Badge className={criticalityColor}>
                {domain.criticality}
              </Badge>
            )}
          </div>
        </div>
        <CardTitle className="text-xl">{domain.name}</CardTitle>
        {domain.description && (
          <p className="text-sm text-muted-foreground mt-2">
            {domain.description}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {/* AI Summary */}
        {domain.ai_summary && (
          <div className="mb-6 p-4 rounded-lg bg-chart-5/5 border border-chart-5/20">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-chart-5" />
              <h4 className="text-sm font-semibold text-chart-5">AI Summary</h4>
            </div>
            <p className="text-sm text-muted-foreground">{domain.ai_summary}</p>
          </div>
        )}
        
        {/* Sub-domains count */}
        {subDomainCount > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <Layers className="h-4 w-4" />
            <span>{subDomainCount} sub-domains</span>
          </div>
        )}
        
        {/* Key questions */}
        {displayQuestions.length > 0 && (
          <div className="mb-6">
            <h4 className="text-sm font-semibold mb-3">Key Questions:</h4>
            <div className="space-y-2">
              {displayQuestions.map((q, idx) => (
                <div key={idx} className="flex items-start gap-2 text-sm">
                  <span className="text-muted-foreground mt-1">•</span>
                  <span className="text-muted-foreground">{q.question}</span>
                </div>
              ))}
              {domain.key_questions && domain.key_questions.length > 3 && (
                <p className="text-sm text-muted-foreground font-medium">
                  +{domain.key_questions.length - 3} more questions
                </p>
              )}
            </div>
          </div>
        )}
        
        {/* Typical roles */}
        {domain.typical_roles && domain.typical_roles.length > 0 && (
          <div className="mb-6">
            <h4 className="text-sm font-semibold mb-2">Typical Roles:</h4>
            <div className="flex flex-wrap gap-2">
              {domain.typical_roles.slice(0, 3).map((role, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">
                  {role}
                </Badge>
              ))}
              {domain.typical_roles.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{domain.typical_roles.length - 3} more
                </Badge>
              )}
            </div>
          </div>
        )}
        
        {/* Learning time estimate */}
        {domain.learning_time_estimate && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
            <Clock className="h-4 w-4" />
            <span>Learning time: {domain.learning_time_estimate}</span>
          </div>
        )}
        
        {/* Learning Resources - Collapsible */}
        {hasLearningResources && (
          <div className="mb-6">
            <button
              onClick={() => setShowResources(!showResources)}
              className="flex items-center gap-2 text-sm font-semibold mb-3 hover:text-electric-blue transition-colors"
            >
              <BookOpen className="h-4 w-4" />
              Learning Resources
              {showResources ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            
            {showResources && (
              <div className="space-y-4 pl-6 border-l-2 border-muted">
                {/* Courses */}
                {domain.learning_resources.courses && domain.learning_resources.courses.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Courses</p>
                    <div className="space-y-1">
                      {domain.learning_resources.courses.slice(0, 3).map((resource, idx) => (
                        <a
                          key={idx}
                          href={resource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-electric-blue hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {resource.title}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Books */}
                {domain.learning_resources.books && domain.learning_resources.books.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Books</p>
                    <div className="space-y-1">
                      {domain.learning_resources.books.slice(0, 3).map((resource, idx) => (
                        <a
                          key={idx}
                          href={resource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-electric-blue hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {resource.title}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Communities */}
                {domain.learning_resources.communities && domain.learning_resources.communities.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Communities</p>
                    <div className="space-y-1">
                      {domain.learning_resources.communities.slice(0, 3).map((resource, idx) => (
                        <a
                          key={idx}
                          href={resource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-electric-blue hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {resource.title}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Tools */}
                {domain.learning_resources.tools && domain.learning_resources.tools.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Tools</p>
                    <div className="space-y-1">
                      {domain.learning_resources.tools.slice(0, 3).map((resource, idx) => (
                        <a
                          key={idx}
                          href={resource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-electric-blue hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {resource.title}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        {/* Marketplace Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <Button 
            variant="outline"
            size="sm"
            className="flex-1"
            asChild
          >
            <Link href={expertSearchUrl}>
              <Users2 className="h-4 w-4 mr-2" />
              Find Expert
            </Link>
          </Button>
          <Button 
            variant="outline"
            size="sm"
            className="flex-1"
            asChild
          >
            <Link href={supplierSearchUrl}>
              <Truck className="h-4 w-4 mr-2" />
              Find Supplier
            </Link>
          </Button>
        </div>
        
        {/* Explore Domain Tree button */}
        <Button 
          variant="default"
          className="w-full"
          onClick={() => router.push(`/blueprints/explore?template=${templateId}&domain=${domain.id}`)}
        >
          Explore Domain Tree
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </CardContent>
    </Card>
  )
}

/**
 * IndustryDetailView - Shows knowledge domains for a selected industry template
 */
function IndustryDetailView({ 
  selectedIndustry, 
  onBack 
}: { 
  selectedIndustry: BlueprintTemplate
  onBack: () => void 
}) {
  const router = useRouter()
  const [domains, setDomains] = useState<KnowledgeDomain[]>([])
  const [loadingDomains, setLoadingDomains] = useState(true)

  useEffect(() => {
    let mounted = true
    
    async function fetchDomains() {
      setLoadingDomains(true)
      try {
        const result = await getTemplateDomains(selectedIndustry.id)
        if (!mounted) return
        
        if (result.error) {
          toast.error('Failed to load knowledge domains')
          setLoadingDomains(false)
          return
        }
        // Show only top-level domains (depth = 0)
        const topLevel = result.data?.filter(d => d.depth === 0) || []
        setDomains(topLevel)
      } catch (error) {
        if (mounted) {
          toast.error('Failed to load knowledge domains')
        }
      } finally {
        if (mounted) {
          setLoadingDomains(false)
        }
      }
    }
    
    fetchDomains()
    
    return () => {
      mounted = false
    }
  }, [selectedIndustry.id])
  
  return (
    <div>
      {/* Back button and header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <Button
            variant="ghost"
            onClick={onBack}
            className="mb-4 -ml-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Industries
          </Button>
          
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>
              {selectedIndustry.name}
            </h1>
          </div>
          <p className={typography.pageSubtitle}>
            {selectedIndustry.description}
          </p>
        </div>
      </div>

      {/* Knowledge Domains */}
      <div className="mt-8">
        <h2 className="text-2xl font-semibold mb-6">Key Technical Domains</h2>
        
        {loadingDomains ? (
          <div className="grid grid-cols-1 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-6 w-48 bg-muted rounded" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="h-4 w-full bg-muted rounded" />
                    <div className="h-4 w-3/4 bg-muted rounded" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : domains.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-center">
                No knowledge domains available for this industry yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {domains.map((domain) => (
              <DomainCard 
                key={domain.id} 
                domain={domain} 
                templateId={selectedIndustry.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Call to action */}
      <div className="mt-12">
        <Card className="bg-electric-blue/5 border-electric-blue/20">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-semibold text-lg mb-2">
                  Ready to build with {selectedIndustry.name}?
                </h3>
                <p className="text-muted-foreground">
                  Create a blueprint to track your knowledge coverage and get expert guidance.
                </p>
              </div>
              <Button 
                className="shrink-0"
                onClick={() => router.push(`/blueprints?template=${selectedIndustry.id}`)}
              >
                Create Blueprint
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/**
 * PackCard - Card for objective packs with three size variants:
 * - Small: Compact row - icon, title, difficulty badge, task count, duration
 * - Medium: Standard card with description and sample tasks
 * - Full: Opens UsePackDialog modal
 */
interface PackCardProps {
  pack: ObjectivePack
  size?: PackCardSize
  onSizeChange?: (id: string, size: PackCardSize) => void
}

function PackCard({ pack, size = 'medium', onSizeChange }: PackCardProps) {
  const Icon = getPackIcon(pack.icon_name)
  const taskCount = pack.items?.length || 0
  const displayTasks = pack.items?.slice(0, 3) || []
  
  // Cycle through sizes on click
  const handleCardClick = useCallback((e: React.MouseEvent) => {
    // Don't expand if clicking on buttons or links
    if ((e.target as HTMLElement).closest('button, a')) return
    
    if (onSizeChange) {
      const nextSize: Record<PackCardSize, PackCardSize> = {
        'small': 'medium',
        'medium': 'full',
        'full': 'small'
      }
      onSizeChange(pack.id, nextSize[size])
    }
  }, [size, onSizeChange, pack.id])
  
  // Size toggle button
  const handleSizeToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (onSizeChange) {
      const nextSize: Record<PackCardSize, PackCardSize> = {
        'small': 'medium',
        'medium': 'full',
        'full': 'small'
      }
      onSizeChange(pack.id, nextSize[size])
    }
  }, [size, onSizeChange, pack.id])
  
  // For full size, render the modal trigger
  if (size === 'full') {
    return (
      <UsePackDialog 
        pack={pack}
        trigger={
          <Card 
            className={cn(
              "flex flex-col transition-all duration-200 hover:shadow-md cursor-pointer",
              "col-span-1 md:col-span-2"
            )}
          >
            <CardHeader>
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="p-3 rounded-lg bg-electric-blue/10">
                  <Icon className="h-6 w-6 text-electric-blue" />
                </div>
                <div className="flex items-center gap-2">
                  {pack.difficulty && (
                    <Badge className={cn("text-xs", getDifficultyColor(pack.difficulty))}>
                      {pack.difficulty}
                    </Badge>
                  )}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <CheckSquare className="h-3.5 w-3.5" />
                    <span>{taskCount} tasks</span>
                  </div>
                  {pack.estimated_duration && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{pack.estimated_duration}</span>
                    </div>
                  )}
                </div>
              </div>
              <CardTitle className="text-xl">{pack.title}</CardTitle>
              {pack.description && (
                <p className="text-sm text-muted-foreground mt-2 line-clamp-3">
                  {pack.description}
                </p>
              )}
            </CardHeader>
            <CardContent className="pt-0 flex flex-col gap-4">
              {/* Sample tasks */}
              {displayTasks.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-foreground">Tasks included:</p>
                  {displayTasks.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-status-success shrink-0 mt-0.5" />
                      <span className="text-muted-foreground line-clamp-1">{item.title}</span>
                    </div>
                  ))}
                  {taskCount > 3 && (
                    <p className="text-xs text-muted-foreground italic">
                      +{taskCount - 3} more tasks
                    </p>
                  )}
                </div>
              )}
              
              {/* View button */}
              <div className="flex items-center gap-2 text-sm text-electric-blue font-medium">
                <Eye className="h-4 w-4" />
                Click to view full details
              </div>
            </CardContent>
          </Card>
        }
      />
    )
  }
  
  return (
    <Card 
      className={cn(
        "flex flex-col transition-all duration-200 hover:shadow-md cursor-pointer",
        size === 'small' && "hover:border-electric-blue/50"
      )}
      onClick={handleCardClick}
    >
      {/* === SMALL SIZE: Compact view === */}
      {size === 'small' && (
        <>
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              {/* Small Avatar */}
              <div className="w-10 h-10 rounded-lg bg-electric-blue/10 flex items-center justify-center shrink-0">
                <Icon className="h-5 w-5 text-electric-blue" />
              </div>

              {/* Title + Badges */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  {pack.difficulty && (
                    <Badge className={cn("text-[9px] px-1.5 py-0", getDifficultyColor(pack.difficulty))}>
                      {pack.difficulty}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {taskCount} tasks
                  </span>
                </div>
                <h3 className="text-sm font-bold text-foreground truncate">
                  {pack.title}
                </h3>
              </div>

              {/* Duration */}
              {pack.estimated_duration && (
                <span className="text-xs text-muted-foreground shrink-0">
                  {pack.estimated_duration}
                </span>
              )}
            </div>
            
            {/* Expand indicator */}
            <div className="flex justify-center mt-2 pt-2 border-t border-muted">
              <button
                onClick={handleSizeToggle}
                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                <ChevronDown className="w-3 h-3" />
                More info
              </button>
            </div>
          </CardContent>
        </>
      )}

      {/* === MEDIUM SIZE: Standard view === */}
      {size === 'medium' && (
        <>
          <CardHeader>
            <div className="flex items-start justify-between gap-4 mb-2">
              <div className="p-2.5 rounded-lg bg-electric-blue/10">
                <Icon className="h-5 w-5 text-electric-blue" />
              </div>
              <div className="flex items-center gap-2">
                {pack.difficulty && (
                  <Badge className={cn("text-xs", getDifficultyColor(pack.difficulty))}>
                    {pack.difficulty}
                  </Badge>
                )}
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CheckSquare className="h-3.5 w-3.5" />
                  <span>{taskCount}</span>
                </div>
                <button
                  onClick={handleSizeToggle}
                  className="h-6 w-6 p-0 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
            </div>
            <CardTitle className="text-lg leading-tight">{pack.title}</CardTitle>
            
            {pack.estimated_duration && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                <Clock className="h-3.5 w-3.5" />
                <span>{pack.estimated_duration}</span>
              </div>
            )}
          </CardHeader>
          
          <CardContent className="flex-1 flex flex-col pt-0">
            {/* Description - 2 lines max */}
            {pack.description && (
              <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                {pack.description}
              </p>
            )}

            {/* Sample tasks */}
            {displayTasks.length > 0 && (
              <div className="space-y-1.5 mb-4">
                <p className="text-xs font-medium text-foreground mb-1">Tasks included:</p>
                {displayTasks.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="h-3.5 w-3.5 text-status-success shrink-0 mt-0.5" />
                    <span className="text-muted-foreground line-clamp-1">{item.title}</span>
                  </div>
                ))}
                {taskCount > 3 && (
                  <p className="text-xs text-muted-foreground italic">
                    +{taskCount - 3} more tasks
                  </p>
                )}
              </div>
            )}

            {/* Footer with price-style layout */}
            <div className="flex items-center justify-between pt-3 border-t border-muted mt-auto">
              <button
                onClick={handleSizeToggle}
                className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
              >
                <ChevronUp className="w-3 h-3" />
              </button>
              
              <UsePackDialog 
                pack={pack}
                trigger={
                  <Button size="sm" className="h-8 text-xs shadow-sm">
                    <Eye className="w-3 h-3 mr-1" />
                    View
                  </Button>
                }
              />
            </div>
          </CardContent>
        </>
      )}
    </Card>
  )
}

interface InspirationViewProps {
  templates?: BlueprintTemplate[]
  packs?: ObjectivePack[]
}

export function InspirationView({ templates = [], packs = [] }: InspirationViewProps) {
  const router = useRouter()
  // Default to 'business' category so packs show immediately
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>('business')
  const [selectedIndustry, setSelectedIndustry] = useState<BlueprintTemplate | null>(null)
  
  // Card size state
  const [defaultCardSize, setDefaultCardSize] = useState<PackCardSize>('medium')
  const [cardSizes, setCardSizes] = useState<Record<string, PackCardSize>>({})
  
  // Handle individual card size changes
  const handleCardSizeChange = useCallback((id: string, size: PackCardSize) => {
    setCardSizes(prev => ({ ...prev, [id]: size }))
  }, [])
  
  // Set all cards to a specific size
  const setAllCardsSize = useCallback((size: PackCardSize) => {
    setDefaultCardSize(size)
    setCardSizes({}) // Clear individual overrides
  }, [])

  // Filter packs by selected category using CATEGORY_FILTERS
  const filteredPacks = selectedCategory && selectedCategory !== 'industry'
    ? packs.filter(pack => {
        const packCategory = pack.category?.toLowerCase() || ''
        const filters = CATEGORY_FILTERS[selectedCategory as keyof typeof CATEGORY_FILTERS] || []
        return filters.some(filter => packCategory.includes(filter))
      })
    : []
  
  // Get category count dynamically
  const getCategoryPackCount = (categoryId: string): number => {
    const filters = CATEGORY_FILTERS[categoryId as keyof typeof CATEGORY_FILTERS] || []
    return packs.filter(pack => {
      const packCategory = pack.category?.toLowerCase() || ''
      return filters.some(filter => packCategory.includes(filter))
    }).length
  }
  
  // Handle category click from hero cards
  const handleCategoryClick = (categoryId: CategoryId) => {
    setSelectedCategory(categoryId)
    setSelectedIndustry(null)
  }

  // Get industry template count
  const industryTemplateCount = templates.filter(t => 
    ['robotics', 'rockets', 'satellites', 'ai-datacentre', 'pharmaceuticals', 'consumer-electronics', 'saas', 'mobile'].includes(t.product_category)
  ).length

  // Main view with hero cards and pack grid
  return (
    <div>
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>
              <Lightbulb className="h-8 w-8 mr-3 inline-block text-international-orange" />
              Inspiration
            </h1>
          </div>
          <p className={typography.pageSubtitle}>
            Get ideas on what to do next. Discover opportunities, find experts, and turn insights into action.
          </p>
        </div>
      </div>

      {/* Hero Category Cards - Marketplace Style */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8 mb-8">
        {/* Business Objectives Card - Electric Blue */}
        <div 
          onClick={() => handleCategoryClick('business')}
          className={cn(
            "group cursor-pointer transition-all duration-200 overflow-hidden rounded-xl border-2 bg-background",
            selectedCategory === 'business'
              ? "border-blue-500 shadow-lg bg-blue-50"
              : "border-border shadow-sm hover:border-blue-400 hover:bg-blue-50 hover:shadow-lg hover:-translate-y-1"
          )}
        >
          <div className="h-2 bg-blue-500" />
          <div className="p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200",
                selectedCategory === 'business' ? "bg-blue-100" : "bg-muted group-hover:bg-blue-100 group-hover:scale-110"
              )}>
                <Target className={cn(
                  "w-6 h-6 transition-colors duration-200",
                  selectedCategory === 'business' ? "text-blue-600" : "text-muted-foreground group-hover:text-blue-600"
                )} />
              </div>
              <Badge variant="secondary" className={cn("text-xs font-semibold", selectedCategory === 'business' && "bg-blue-100 text-blue-600")}>
                {getCategoryPackCount('business')} available
              </Badge>
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground mb-1">Business Objectives</h3>
              <p className={cn(
                "text-sm font-semibold transition-colors",
                selectedCategory === 'business' ? "text-blue-600" : "text-muted-foreground group-hover:text-blue-600"
              )}>
                Strategic Growth & Operations
              </p>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Strategic objectives to grow your business, from operations and sales to legal, finance, and product development.
            </p>
            <ul className="space-y-2">
              {['Sales playbooks and pricing strategy', 'Legal, compliance, and HR operations', 'Finance infrastructure and growth', 'Product launches and marketing'].map((benefit, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className={cn("w-4 h-4 mt-0.5 shrink-0", selectedCategory === 'business' ? "text-blue-600" : "text-status-success")} />
                  <span className="text-muted-foreground">{benefit}</span>
                </li>
              ))}
            </ul>
            <button className={cn(
              "w-full flex items-center justify-between px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200",
              selectedCategory === 'business'
                ? "bg-blue-500 hover:bg-blue-600 text-white shadow-md"
                : "bg-muted text-muted-foreground group-hover:bg-blue-500 group-hover:text-white"
            )}>
              {selectedCategory === 'business' ? 'Browsing Business' : 'Explore Business'}
              <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
            </button>
          </div>
        </div>

        {/* Subsystems Card - Status Success Green */}
        <div 
          onClick={() => handleCategoryClick('subsystems')}
          className={cn(
            "group cursor-pointer transition-all duration-200 overflow-hidden rounded-xl border-2 bg-background",
            selectedCategory === 'subsystems'
              ? "border-emerald-500 shadow-lg bg-emerald-50"
              : "border-border shadow-sm hover:border-emerald-400 hover:bg-emerald-50 hover:shadow-lg hover:-translate-y-1"
          )}
        >
          <div className="h-2 bg-emerald-500" />
          <div className="p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200",
                selectedCategory === 'subsystems' ? "bg-emerald-100" : "bg-muted group-hover:bg-emerald-100 group-hover:scale-110"
              )}>
                <Boxes className={cn(
                  "w-6 h-6 transition-colors duration-200",
                  selectedCategory === 'subsystems' ? "text-emerald-600" : "text-muted-foreground group-hover:text-emerald-600"
                )} />
              </div>
              <Badge variant="secondary" className={cn("text-xs font-semibold", selectedCategory === 'subsystems' && "bg-emerald-100 text-emerald-600")}>
                {getCategoryPackCount('subsystems')} available
              </Badge>
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground mb-1">Subsystems & Infrastructure</h3>
              <p className={cn(
                "text-sm font-semibold transition-colors",
                selectedCategory === 'subsystems' ? "text-emerald-600" : "text-muted-foreground group-hover:text-emerald-600"
              )}>
                Technical Foundations
              </p>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Build the technical foundations: engineering systems, security infrastructure, and operational subsystems.
            </p>
            <ul className="space-y-2">
              {['Control systems and embedded software', 'AI/ML capabilities and compute', 'Manufacturing and assembly processes', 'Security audits and compliance'].map((benefit, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className={cn("w-4 h-4 mt-0.5 shrink-0", selectedCategory === 'subsystems' ? "text-emerald-600" : "text-status-success")} />
                  <span className="text-muted-foreground">{benefit}</span>
                </li>
              ))}
            </ul>
            <button className={cn(
              "w-full flex items-center justify-between px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200",
              selectedCategory === 'subsystems'
                ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-md"
                : "bg-muted text-muted-foreground group-hover:bg-emerald-500 group-hover:text-white"
            )}>
              {selectedCategory === 'subsystems' ? 'Browsing Subsystems' : 'Explore Subsystems'}
              <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
            </button>
          </div>
        </div>

        {/* Industry Sector Card - Purple */}
        <div 
          onClick={() => handleCategoryClick('industry')}
          className={cn(
            "group cursor-pointer transition-all duration-200 overflow-hidden rounded-xl border-2 bg-background",
            selectedCategory === 'industry'
              ? "border-purple-500 shadow-lg bg-purple-50"
              : "border-border shadow-sm hover:border-purple-400 hover:bg-purple-50 hover:shadow-lg hover:-translate-y-1"
          )}
        >
          <div className="h-2 bg-purple-500" />
          <div className="p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200",
                selectedCategory === 'industry' ? "bg-purple-100" : "bg-muted group-hover:bg-purple-100 group-hover:scale-110"
              )}>
                <CircuitBoard className={cn(
                  "w-6 h-6 transition-colors duration-200",
                  selectedCategory === 'industry' ? "text-purple-600" : "text-muted-foreground group-hover:text-purple-600"
                )} />
              </div>
              <Badge variant="secondary" className={cn("text-xs font-semibold", selectedCategory === 'industry' && "bg-purple-100 text-purple-600")}>
                {industryTemplateCount} industries
              </Badge>
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground mb-1">Industry Sector</h3>
              <p className={cn(
                "text-sm font-semibold transition-colors",
                selectedCategory === 'industry' ? "text-purple-600" : "text-muted-foreground group-hover:text-purple-600"
              )}>
                Domain Knowledge & Expertise
              </p>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Technical knowledge domains and blueprints for specific industries: Robotics, Rockets, AI Infrastructure, and more.
            </p>
            <ul className="space-y-2">
              {['Robotics and autonomous systems', 'Rockets and aerospace engineering', 'AI infrastructure and compute', 'Pharmaceuticals and consumer electronics'].map((benefit, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className={cn("w-4 h-4 mt-0.5 shrink-0", selectedCategory === 'industry' ? "text-purple-600" : "text-status-success")} />
                  <span className="text-muted-foreground">{benefit}</span>
                </li>
              ))}
            </ul>
            <button className={cn(
              "w-full flex items-center justify-between px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200",
              selectedCategory === 'industry'
                ? "bg-purple-500 hover:bg-purple-600 text-white shadow-md"
                : "bg-muted text-muted-foreground group-hover:bg-purple-500 group-hover:text-white"
            )}>
              {selectedCategory === 'industry' ? 'Browsing Industries' : 'Explore Industries'}
              <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
            </button>
          </div>
        </div>
      </div>

      {/* Content based on selected category */}
      {selectedCategory === 'industry' ? (
        selectedIndustry ? (
          <IndustryDetailView 
            selectedIndustry={selectedIndustry} 
            onBack={() => setSelectedIndustry(null)} 
          />
        ) : (
          // Industry template grid
          <div>
            {/* Results count and size controls */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">
                Showing {templates.filter(t => ['robotics', 'rockets', 'satellites', 'ai-datacentre', 'pharmaceuticals', 'consumer-electronics', 'saas', 'mobile'].includes(t.product_category)).length} templates
              </p>
              <div className="flex items-center gap-3">
                {/* Card size controls */}
                <div className="bg-muted p-1 rounded-md flex items-center" title="Card detail level">
                  <Button
                    variant={defaultCardSize === 'small' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setAllCardsSize('small')}
                    className={cn(
                      "h-8 w-8 p-0",
                      defaultCardSize === 'small' && 'shadow-sm'
                    )}
                    title="Compact cards"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={defaultCardSize === 'medium' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setAllCardsSize('medium')}
                    className={cn(
                      "h-8 w-8 p-0",
                      defaultCardSize === 'medium' && 'shadow-sm'
                    )}
                    title="Standard cards"
                  >
                    <Square className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={defaultCardSize === 'full' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setAllCardsSize('full')}
                    className={cn(
                      "h-8 w-8 p-0",
                      defaultCardSize === 'full' && 'shadow-sm'
                    )}
                    title="Detailed cards"
                  >
                    <AlignJustify className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Template grid */}
            <div className={cn(
              "grid gap-4 lg:gap-6 animate-fade-in",
              defaultCardSize === 'full' 
                ? "grid-cols-1 lg:grid-cols-2" 
                : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            )}>
              {templates
                .filter(t => ['robotics', 'rockets', 'satellites', 'ai-datacentre', 'pharmaceuticals', 'consumer-electronics', 'saas', 'mobile'].includes(t.product_category))
                .map((template) => {
                  const Icon = getTemplateIcon(template.icon)
                  const difficulty = getDifficultyFromMetadata(template.metadata)
                  const size = defaultCardSize
                  
                  // Render full-size card with detail modal
                  if (size === 'full') {
                    return (
                      <Card 
                        key={template.id}
                        className="flex flex-col transition-all duration-200 hover:shadow-md cursor-pointer col-span-1 md:col-span-2"
                        onClick={() => setSelectedIndustry(template)}
                      >
                        <CardHeader>
                          <div className="flex items-start justify-between gap-4 mb-2">
                            <div className="p-3 rounded-lg bg-purple-100">
                              <Icon className="h-6 w-6 text-purple-600" />
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className={cn("text-xs", getDifficultyColor(difficulty))}>
                                {difficulty}
                              </Badge>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Layers className="h-3.5 w-3.5" />
                                <span>{template.estimated_domains} domains</span>
                              </div>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <CheckSquare className="h-3.5 w-3.5" />
                                <span>{template.estimated_questions} questions</span>
                              </div>
                            </div>
                          </div>
                          <CardTitle className="text-xl">{template.name}</CardTitle>
                          <p className="text-sm text-muted-foreground mt-2 line-clamp-3">
                            {template.description}
                          </p>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="flex items-center gap-2 text-sm text-purple-600 font-medium">
                            <Eye className="h-4 w-4" />
                            Click to view blueprint details
                          </div>
                        </CardContent>
                      </Card>
                    )
                  }

                  // Render small card
                  if (size === 'small') {
                    return (
                      <Card 
                        key={template.id}
                        className="flex flex-col transition-all duration-200 hover:shadow-md cursor-pointer hover:border-purple-500/50"
                        onClick={() => setSelectedIndustry(template)}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                              <Icon className="h-5 w-5 text-purple-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <Badge className={cn("text-[9px] px-1.5 py-0", getDifficultyColor(difficulty))}>
                                  {difficulty}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {template.estimated_domains} domains
                                </span>
                              </div>
                              <h3 className="text-sm font-bold text-foreground truncate">
                                {template.name}
                              </h3>
                            </div>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {template.estimated_questions} Q
                            </span>
                          </div>
                          <div className="flex justify-center mt-2 pt-2 border-t border-muted">
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <ChevronDown className="w-3 h-3" />
                              More info
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  }

                  // Render medium card (default)
                  return (
                    <Card 
                      key={template.id}
                      className="flex flex-col transition-all duration-200 hover:shadow-md cursor-pointer hover:border-purple-500/50"
                      onClick={() => setSelectedIndustry(template)}
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <div className="p-2.5 rounded-lg bg-purple-100">
                            <Icon className="h-5 w-5 text-purple-600" />
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={cn("text-xs", getDifficultyColor(difficulty))}>
                              {difficulty}
                            </Badge>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Layers className="h-3.5 w-3.5" />
                              <span>{template.estimated_domains}</span>
                            </div>
                            <button className="h-6 w-6 p-0 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                              <ChevronDown className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <CardTitle className="text-lg leading-tight">{template.name}</CardTitle>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                          <CheckSquare className="h-3.5 w-3.5" />
                          <span>{template.estimated_questions} questions</span>
                        </div>
                      </CardHeader>
                      
                      <CardContent className="flex-1 flex flex-col pt-0">
                        <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                          {template.description}
                        </p>

                        <div className="flex items-center justify-between pt-3 border-t border-muted mt-auto">
                          <button className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors">
                            <ChevronUp className="w-3 h-3" />
                          </button>
                          
                          <Button size="sm" className="h-8 text-xs shadow-sm bg-purple-600 hover:bg-purple-700">
                            <Eye className="w-3 h-3 mr-1" />
                            View
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
            </div>
          </div>
        )
      ) : (
        // Business or Subsystems - show pack grid
        <div>
          {/* Results count and size controls */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              Showing {filteredPacks.length} packs
            </p>
            <div className="flex items-center gap-3">
              {/* Card size controls */}
              <div className="bg-muted p-1 rounded-md flex items-center" title="Card detail level">
                <Button
                  variant={defaultCardSize === 'small' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setAllCardsSize('small')}
                  className={cn(
                    "h-8 w-8 p-0",
                    defaultCardSize === 'small' && 'shadow-sm'
                  )}
                  title="Compact cards"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Button
                  variant={defaultCardSize === 'medium' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setAllCardsSize('medium')}
                  className={cn(
                    "h-8 w-8 p-0",
                    defaultCardSize === 'medium' && 'shadow-sm'
                  )}
                  title="Standard cards"
                >
                  <Square className="h-4 w-4" />
                </Button>
                <Button
                  variant={defaultCardSize === 'full' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setAllCardsSize('full')}
                  className={cn(
                    "h-8 w-8 p-0",
                    defaultCardSize === 'full' && 'shadow-sm'
                  )}
                  title="Detailed cards (opens modal)"
                >
                  <AlignJustify className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Pack grid */}
          {filteredPacks.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-muted-foreground text-center">
                  No objective packs available for this category yet.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className={cn(
              "grid gap-4 lg:gap-6 animate-fade-in",
              defaultCardSize === 'full' 
                ? "grid-cols-1 lg:grid-cols-2" 
                : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            )}>
              {filteredPacks.map(pack => (
                <PackCard
                  key={pack.id}
                  pack={pack}
                  size={cardSizes[pack.id] || defaultCardSize}
                  onSizeChange={handleCardSizeChange}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
