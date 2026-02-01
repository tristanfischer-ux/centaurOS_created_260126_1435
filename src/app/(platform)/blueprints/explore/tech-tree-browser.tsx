'use client'

import { useState } from 'react'
import Link from 'next/link'
import { typography } from '@/lib/design-system'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { DomainActionPanel } from '@/components/blueprints/domain-action-panel'
import type { BlueprintTemplate, DomainTreeNode, DomainCategory } from '@/types/blueprints'
import { DOMAIN_CATEGORY_COLORS } from '@/types/blueprints'
import {
  ChevronRight,
  ChevronDown,
  Rocket,
  Bot,
  CircuitBoard,
  Cloud,
  Smartphone,
  Layers,
  Search,
  ArrowLeft,
  Plus,
  Expand,
  Shrink,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface TemplateWithTree {
  template: BlueprintTemplate
  domains: DomainTreeNode[]
}

interface TechTreeBrowserProps {
  templatesWithTrees: TemplateWithTree[]
}

// Icon mapping for templates
const TEMPLATE_ICONS: Record<string, React.ElementType> = {
  rockets: Rocket,
  robotics: Bot,
  'consumer-electronics': CircuitBoard,
  saas: Cloud,
  mobile: Smartphone,
}

function getTemplateIcon(category: string): React.ElementType {
  return TEMPLATE_ICONS[category] || Layers
}

// Count total domains recursively
function countDomains(nodes: DomainTreeNode[]): number {
  let count = 0
  for (const node of nodes) {
    count += 1
    if (node.children.length > 0) {
      count += countDomains(node.children)
    }
  }
  return count
}

export function TechTreeBrowser({ templatesWithTrees }: TechTreeBrowserProps) {
  const [expandedTemplates, setExpandedTemplates] = useState<Set<string>>(new Set())
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set())
  const [selectedDomain, setSelectedDomain] = useState<{
    domain: DomainTreeNode
    templateName: string
    path: string
  } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const toggleTemplate = (templateId: string) => {
    setExpandedTemplates((prev) => {
      const next = new Set(prev)
      if (next.has(templateId)) {
        next.delete(templateId)
      } else {
        next.add(templateId)
      }
      return next
    })
  }

  const toggleDomain = (domainId: string) => {
    setExpandedDomains((prev) => {
      const next = new Set(prev)
      if (next.has(domainId)) {
        next.delete(domainId)
      } else {
        next.add(domainId)
      }
      return next
    })
  }

  const expandAllTemplates = () => {
    setExpandedTemplates(new Set(templatesWithTrees.map((t) => t.template.id)))
  }

  const collapseAllTemplates = () => {
    setExpandedTemplates(new Set())
    setExpandedDomains(new Set())
  }

  const handleDomainClick = (domain: DomainTreeNode, templateName: string, path: string) => {
    setSelectedDomain({ domain, templateName, path })
  }

  // Filter templates and domains by search query
  const filteredTemplates = templatesWithTrees.filter((t) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    
    // Check template name
    if (t.template.name.toLowerCase().includes(query)) return true
    
    // Check if any domain matches (recursive)
    const checkDomains = (domains: DomainTreeNode[]): boolean => {
      for (const domain of domains) {
        if (domain.name.toLowerCase().includes(query)) return true
        if (domain.description?.toLowerCase().includes(query)) return true
        if (checkDomains(domain.children)) return true
      }
      return false
    }
    
    return checkDomains(t.domains)
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Link href="/blueprints" className="hover:text-foreground transition-colors flex items-center gap-1">
              <ArrowLeft className="h-4 w-4" />
              Blueprints
            </Link>
          </div>
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Explore Tech Trees</h1>
          </div>
          <p className={typography.pageSubtitle}>
            Browse all technology domains. Click any to learn more and take action.
          </p>
        </div>

        <Button asChild className="bg-international-orange hover:bg-international-orange/90">
          <Link href="/blueprints">
            <Plus className="mr-2 h-4 w-4" />
            Create Blueprint
          </Link>
        </Button>
      </div>

      {/* Search and Controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search domains..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={expandAllTemplates}>
            <Expand className="h-4 w-4 mr-1" />
            Expand All
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAllTemplates}>
            <Shrink className="h-4 w-4 mr-1" />
            Collapse All
          </Button>
        </div>
      </div>

      {/* Tech Trees */}
      <div className="space-y-4">
        {filteredTemplates.map(({ template, domains }) => {
          const Icon = getTemplateIcon(template.product_category)
          const isExpanded = expandedTemplates.has(template.id)
          const domainCount = countDomains(domains)

          return (
            <Card key={template.id} className="overflow-hidden">
              {/* Template Header */}
              <button
                onClick={() => toggleTemplate(template.id)}
                className="w-full flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors text-left"
              >
                <div className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-lg shrink-0",
                  isExpanded ? "bg-international-orange/10" : "bg-muted"
                )}>
                  <Icon className={cn(
                    "h-5 w-5",
                    isExpanded ? "text-international-orange" : "text-muted-foreground"
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-foreground">{template.name}</h2>
                    <Badge variant="secondary" className="shrink-0">
                      {domainCount} domains
                    </Badge>
                  </div>
                  {template.description && (
                    <p className="text-sm text-muted-foreground truncate mt-0.5">
                      {template.description}
                    </p>
                  )}
                </div>
                {isExpanded ? (
                  <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                )}
              </button>

              {/* Domain Tree */}
              {isExpanded && domains.length > 0 && (
                <CardContent className="pt-0 pb-4">
                  <div className="border-t pt-4">
                    <DomainTreeList
                      domains={domains}
                      depth={0}
                      expandedDomains={expandedDomains}
                      onToggle={toggleDomain}
                      onSelect={(domain, path) => handleDomainClick(domain, template.name, path)}
                      searchQuery={searchQuery}
                    />
                  </div>
                </CardContent>
              )}
            </Card>
          )
        })}

        {filteredTemplates.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No matching domains found for &quot;{searchQuery}&quot;</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Domain Action Panel */}
      <DomainActionPanel
        domain={selectedDomain?.domain || null}
        templateName={selectedDomain?.templateName || ''}
        path={selectedDomain?.path || ''}
        open={!!selectedDomain}
        onOpenChange={(open) => !open && setSelectedDomain(null)}
      />
    </div>
  )
}

// Recursive domain tree list component
interface DomainTreeListProps {
  domains: DomainTreeNode[]
  depth: number
  expandedDomains: Set<string>
  onToggle: (id: string) => void
  onSelect: (domain: DomainTreeNode, path: string) => void
  searchQuery: string
  parentPath?: string
}

function DomainTreeList({
  domains,
  depth,
  expandedDomains,
  onToggle,
  onSelect,
  searchQuery,
  parentPath = '',
}: DomainTreeListProps) {
  return (
    <div className={cn(depth > 0 && "ml-6 border-l border-muted pl-4")}>
      {domains.map((domain) => {
        const isExpanded = expandedDomains.has(domain.id)
        const hasChildren = domain.children.length > 0
        const path = parentPath ? `${parentPath} > ${domain.name}` : domain.name
        
        // Highlight if matches search
        const matchesSearch = searchQuery && (
          domain.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          domain.description?.toLowerCase().includes(searchQuery.toLowerCase())
        )

        const categoryColors = domain.category 
          ? DOMAIN_CATEGORY_COLORS[domain.category as DomainCategory]
          : null

        return (
          <div key={domain.id}>
            <div
              className={cn(
                "flex items-center gap-2 py-2 px-2 rounded-md transition-colors group",
                "hover:bg-muted cursor-pointer",
                matchesSearch && "bg-yellow-50 hover:bg-yellow-100"
              )}
            >
              {/* Expand/Collapse button */}
              {hasChildren ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggle(domain.id)
                  }}
                  className="p-0.5 hover:bg-muted-foreground/10 rounded"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              ) : (
                <div className="w-5" /> // Spacer
              )}

              {/* Domain content - clickable */}
              <div
                onClick={() => onSelect(domain, path)}
                className="flex-1 flex items-center gap-2 min-w-0"
              >
                <span className="font-medium text-foreground truncate">{domain.name}</span>
                
                {/* Category badge for top-level */}
                {depth === 0 && categoryColors && (
                  <Badge 
                    variant="secondary" 
                    className={cn("text-[10px] shrink-0", categoryColors.bg, categoryColors.text)}
                  >
                    {domain.category}
                  </Badge>
                )}

                {/* Child count */}
                {hasChildren && (
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {domain.children.length}
                  </Badge>
                )}

                {/* Criticality indicator */}
                {domain.criticality === 'critical' && (
                  <span className="text-[10px] text-destructive font-medium shrink-0">Critical</span>
                )}
              </div>

              {/* Hover hint */}
              <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                Click for details
              </span>
            </div>

            {/* Children */}
            {isExpanded && hasChildren && (
              <DomainTreeList
                domains={domain.children}
                depth={depth + 1}
                expandedDomains={expandedDomains}
                onToggle={onToggle}
                onSelect={onSelect}
                searchQuery={searchQuery}
                parentPath={path}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
