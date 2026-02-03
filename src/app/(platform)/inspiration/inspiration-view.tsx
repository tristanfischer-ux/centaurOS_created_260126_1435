'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Lightbulb, 
  Target, 
  Boxes, 
  ArrowLeft,
  Clock,
  CheckSquare,
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
  Layers
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

type CategoryId = 'business' | 'product' | 'subsystems' | 'industry' | null

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

const getCategoryStats = (packs: ObjectivePack[], categoryFilter: string) => {
  const count = packs.filter(p => {
    const packCategory = p.category?.toLowerCase() || ''
    return packCategory.includes(categoryFilter)
  }).length
  return count.toString()
}

const categories = (packs: ObjectivePack[]): Category[] => [
  {
    id: 'business',
    title: 'Business Objectives Packs',
    description: 'Strategic objectives to grow your business, from operations and sales to legal and finance.',
    icon: Target,
    color: 'bg-electric-blue text-white',
    stats: {
      label: 'packs available',
      value: getCategoryStats(packs, 'business'),
    },
  },
  {
    id: 'product',
    title: 'Product Development',
    description: 'Launch products, run experiments, and build what customers actually want.',
    icon: Rocket,
    color: 'bg-international-orange text-white',
    stats: {
      label: 'packs available',
      value: getCategoryStats(packs, 'product'),
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
      value: getCategoryStats(packs, 'subsystems'),
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
      value: '8',
    },
  },
]

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

interface InspirationViewProps {
  templates?: BlueprintTemplate[]
  packs?: ObjectivePack[]
}

export function InspirationView({ templates = [], packs = [] }: InspirationViewProps) {
  const router = useRouter()
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>(null)
  const [selectedIndustry, setSelectedIndustry] = useState<BlueprintTemplate | null>(null)
  const [domains, setDomains] = useState<KnowledgeDomain[]>([])
  const [loadingDomains, setLoadingDomains] = useState(false)

  // Filter packs by selected category
  const filteredPacks = selectedCategory && selectedCategory !== 'industry'
    ? packs.filter(pack => {
        const packCategory = pack.category?.toLowerCase() || ''
        return packCategory.includes(selectedCategory)
      })
    : []

  // Handle industry category selection
  if (selectedCategory === 'industry') {
    if (!selectedIndustry) {
      // Show industry template grid
      const industryTemplates = templates.filter(t => 
        ['robotics', 'rockets', 'satellites', 'ai-datacentre', 'pharmaceuticals', 'consumer-electronics', 'saas', 'mobile'].includes(t.product_category)
      )
      
      return (
        <div>
          {/* Back button and header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
            <div className="min-w-0 flex-1">
              <Button
                variant="ghost"
                onClick={() => setSelectedCategory(null)}
                className="mb-4 -ml-2"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Categories
              </Button>
              
              <div className={typography.pageHeader}>
                <div className={typography.pageHeaderAccent} />
                <h1 className={typography.h1}>
                  Industry Sector
                </h1>
              </div>
              <p className={typography.pageSubtitle}>
                Technical knowledge domains and packs for specific industries: Robotics, Rockets, AI Infrastructure, Pharmaceuticals, and more.
              </p>
            </div>
          </div>

          {/* Industry template grid */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {industryTemplates.map((template) => {
              const Icon = getTemplateIcon(template.icon)
              const difficulty = getDifficultyFromMetadata(template.metadata)
              
              return (
                <Card 
                  key={template.id} 
                  className="cursor-pointer transition-all hover:shadow-lg hover:border-international-orange/50 group"
                  onClick={() => setSelectedIndustry(template)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="p-3 rounded-lg bg-chart-5/10">
                        <Icon className="h-6 w-6 text-chart-5" />
                      </div>
                      <Badge className={getDifficultyColor(difficulty)}>
                        {difficulty}
                      </Badge>
                    </div>
                    <CardTitle className="text-xl group-hover:text-international-orange transition-colors">
                      {template.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-6">
                      {template.description}
                    </p>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Layers className="h-4 w-4" />
                        <span>{template.estimated_domains} domains</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CheckSquare className="h-4 w-4" />
                        <span>{template.estimated_questions} questions</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )
    }
    
    // Industry detail view - show knowledge domains
    return <IndustryDetailView />
  }
  
  // Industry Detail View Component
  function IndustryDetailView() {
    useEffect(() => {
      if (!selectedIndustry) return
      
      async function fetchDomains() {
        setLoadingDomains(true)
        try {
          const result = await getTemplateDomains(selectedIndustry!.id)
          if (result.error) {
            toast.error('Failed to load knowledge domains')
            return
          }
          // Show only top-level domains (depth = 0)
          const topLevel = result.data?.filter(d => d.depth === 0) || []
          setDomains(topLevel)
        } catch (error) {
          toast.error('Failed to load knowledge domains')
        } finally {
          setLoadingDomains(false)
        }
      }
      
      fetchDomains()
    }, [selectedIndustry])
    
    if (!selectedIndustry) return null
    
    return (
      <div>
        {/* Back button and header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="min-w-0 flex-1">
            <Button
              variant="ghost"
              onClick={() => {
                setSelectedIndustry(null)
                setDomains([])
              }}
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
  
  // Domain Card Component
  function DomainCard({ domain, templateId }: { domain: KnowledgeDomain; templateId: string }) {
    const categoryColors = getDomainCategoryColor(domain.category)
    const criticalityColor = getCriticalityColor(domain.criticality)
    
    // Count sub-domains (children)
    const subDomainCount = domain.children?.length || 0
    
    // Show first 3 key questions
    const displayQuestions = domain.key_questions?.slice(0, 3) || []
    
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
          
          {/* Action button */}
          <Button 
            variant="outline"
            className="w-full"
            onClick={() => router.push(`/blueprints/explore?template=${templateId}&domain=${domain.id}`)}
          >
            Explore Domain Tree
            <ArrowLeft className="h-4 w-4 ml-2 rotate-180" />
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (selectedCategory) {
    const categoryList = categories(packs)
    const category = categoryList.find(c => c.id === selectedCategory)
    
    return (
      <div>
        {/* Back button and header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="min-w-0 flex-1">
            <Button
              variant="ghost"
              onClick={() => setSelectedCategory(null)}
              className="mb-4 -ml-2"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Categories
            </Button>
            
            <div className={typography.pageHeader}>
              <div className={typography.pageHeaderAccent} />
              <h1 className={typography.h1}>
                {category?.title}
              </h1>
            </div>
            <p className={typography.pageSubtitle}>
              {category?.description}
            </p>
          </div>
        </div>

        {/* Objective packs grid */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredPacks.map((pack) => {
            const Icon = getPackIcon(pack.icon_name)
            const taskCount = pack.items?.length || 0
            const displayTasks = pack.items?.slice(0, 3) || []
            
            return (
              <Card key={pack.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className={cn(
                      "p-3 rounded-lg",
                      "bg-electric-blue/10"
                    )}>
                      <Icon className="h-6 w-6 text-electric-blue" />
                    </div>
                    {pack.difficulty && (
                      <Badge className={getDifficultyColor(pack.difficulty)}>
                        {pack.difficulty}
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="text-xl">{pack.title}</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <p className="text-sm text-muted-foreground mb-6">
                    {pack.description}
                  </p>

                  {/* Stats */}
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6">
                    {pack.estimated_duration && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4" />
                        <span>{pack.estimated_duration}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <CheckSquare className="h-4 w-4" />
                      <span>{taskCount} tasks</span>
                    </div>
                  </div>

                  {/* Sample tasks */}
                  {displayTasks.length > 0 && (
                    <div className="space-y-2 mb-6">
                      {displayTasks.map((item, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-sm">
                          <span className="text-muted-foreground">•</span>
                          <span className="text-muted-foreground">{item.title}</span>
                        </div>
                      ))}
                      {taskCount > 3 && (
                        <p className="text-sm text-muted-foreground font-medium">
                          +{taskCount - 3} more tasks
                        </p>
                      )}
                    </div>
                  )}

                  <UsePackDialog 
                    pack={pack}
                    trigger={
                      <Button className="w-full mt-auto">
                        Use This Pack
                      </Button>
                    }
                  />
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    )
  }

  // Category selection view
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

      {/* What are Objective Packs? */}
      <Card className="mt-8 bg-electric-blue/5 border-electric-blue/20">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-electric-blue/10 shrink-0">
              <Target className="h-6 w-6 text-electric-blue" />
            </div>
            <div>
              <h3 className="font-semibold text-lg mb-2">What are Objective Packs?</h3>
              <p className="text-muted-foreground mb-4">
                Pre-built objectives with tasks designed by experienced founders. Pick a pack, customize it, 
                and start executing. Each pack includes tasks assigned to the right roles—you, your apprentice, 
                or an expert.
              </p>
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-international-orange" />
                  <span className="text-foreground font-medium">Creates objectives with tasks</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-electric-blue" />
                  <span className="text-foreground font-medium">Role-assigned tasks</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-status-success" />
                  <span className="text-foreground font-medium">Links to marketplace experts</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category selection */}
      <div className="mt-8">
        <h2 className="text-2xl font-semibold mb-6">Choose a Category</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {categories(packs).map((category) => {
            const Icon = category.icon
            return (
              <Card
                key={category.id}
                className="cursor-pointer transition-all hover:shadow-lg hover:border-international-orange/50 group"
                onClick={() => setSelectedCategory(category.id)}
              >
                <CardHeader>
                  <div className={cn(
                    "w-16 h-16 rounded-lg mb-4 flex items-center justify-center",
                    category.color
                  )}>
                    <Icon className="h-8 w-8" />
                  </div>
                  <CardTitle className="text-xl group-hover:text-international-orange transition-colors">
                    {category.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-6">
                    {category.description}
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-foreground">
                      {category.stats.value}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {category.stats.label}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
