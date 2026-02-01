'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import type { DomainTreeNode, DomainCategory } from '@/types/blueprints'
import { DOMAIN_CATEGORY_COLORS } from '@/types/blueprints'
import {
  Target,
  CheckSquare,
  Users,
  Truck,
  Lightbulb,
  BookOpen,
  Clock,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface DomainActionPanelProps {
  domain: DomainTreeNode | null
  templateName: string
  path: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DomainActionPanel({
  domain,
  templateName,
  path,
  open,
  onOpenChange,
}: DomainActionPanelProps) {
  if (!domain) return null

  const categoryColors = domain.category 
    ? DOMAIN_CATEGORY_COLORS[domain.category as DomainCategory]
    : null

  // Build marketplace query params
  const expertSearchParams = domain.marketplace_categories?.length > 0
    ? `?category=${encodeURIComponent(domain.marketplace_categories[0])}&type=advice`
    : '?type=advice'
  
  const supplierSearchParams = domain.supplier_categories?.length > 0
    ? `?category=${encodeURIComponent(domain.supplier_categories[0])}&type=supplier`
    : '?type=supplier'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="text-left">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span>{templateName}</span>
            {path !== domain.name && (
              <>
                <ChevronRight className="h-3 w-3" />
                <span className="truncate">{path.replace(` > ${domain.name}`, '')}</span>
              </>
            )}
          </div>
          <SheetTitle className="text-xl flex items-center gap-2">
            {domain.name}
            {domain.criticality === 'critical' && (
              <Badge variant="destructive" className="text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Critical
              </Badge>
            )}
          </SheetTitle>
          {categoryColors && (
            <Badge 
              variant="secondary" 
              className={cn("w-fit", categoryColors.bg, categoryColors.text)}
            >
              {domain.category}
            </Badge>
          )}
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Description / Summary */}
          {domain.description && (
            <section>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
                <Lightbulb className="h-4 w-4 text-international-orange" />
                What You Need to Know
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {domain.description}
              </p>
            </section>
          )}

          {/* Key Questions */}
          {domain.key_questions && domain.key_questions.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                <BookOpen className="h-4 w-4 text-electric-blue" />
                Key Questions to Answer
              </h3>
              <ul className="space-y-2">
                {domain.key_questions.slice(0, 5).map((q, i) => (
                  <li key={q.id || i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="text-electric-blue font-medium shrink-0">•</span>
                    <span>{q.question}</span>
                  </li>
                ))}
                {domain.key_questions.length > 5 && (
                  <li className="text-xs text-muted-foreground italic">
                    +{domain.key_questions.length - 5} more questions
                  </li>
                )}
              </ul>
            </section>
          )}

          {/* Typical Roles */}
          {domain.typical_roles && domain.typical_roles.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
                <Users className="h-4 w-4 text-status-success" />
                Who Typically Handles This
              </h3>
              <div className="flex flex-wrap gap-2">
                {domain.typical_roles.map((role, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {role}
                  </Badge>
                ))}
              </div>
            </section>
          )}

          {/* Learning Time Estimate */}
          {domain.learning_time_estimate && (
            <section>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Estimated Learning Time
              </h3>
              <p className="text-sm text-muted-foreground">
                {domain.learning_time_estimate}
              </p>
            </section>
          )}

          <Separator />

          {/* Action Buttons */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-4">
              Take Action
            </h3>
            <div className="space-y-3">
              <Button asChild variant="outline" className="w-full justify-start h-auto py-3">
                <Link href={`/objectives?prefill=${encodeURIComponent(domain.name)}`}>
                  <Target className="h-4 w-4 mr-3 text-international-orange" />
                  <div className="text-left">
                    <div className="font-medium">Create Objective</div>
                    <div className="text-xs text-muted-foreground">Start tracking this as a goal</div>
                  </div>
                </Link>
              </Button>

              <Button asChild variant="outline" className="w-full justify-start h-auto py-3">
                <Link href={`/tasks?prefill=${encodeURIComponent(`Research: ${domain.name}`)}`}>
                  <CheckSquare className="h-4 w-4 mr-3 text-electric-blue" />
                  <div className="text-left">
                    <div className="font-medium">Create Task</div>
                    <div className="text-xs text-muted-foreground">Add a specific task to your list</div>
                  </div>
                </Link>
              </Button>

              <Button asChild variant="outline" className="w-full justify-start h-auto py-3">
                <Link href={`/marketplace${expertSearchParams}`}>
                  <Users className="h-4 w-4 mr-3 text-purple-600" />
                  <div className="text-left">
                    <div className="font-medium">Find Expert</div>
                    <div className="text-xs text-muted-foreground">Browse advisors with this expertise</div>
                  </div>
                </Link>
              </Button>

              <Button asChild variant="outline" className="w-full justify-start h-auto py-3">
                <Link href={`/marketplace${supplierSearchParams}`}>
                  <Truck className="h-4 w-4 mr-3 text-status-success" />
                  <div className="text-left">
                    <div className="font-medium">Find Supplier</div>
                    <div className="text-xs text-muted-foreground">Find manufacturers & component suppliers</div>
                  </div>
                </Link>
              </Button>
            </div>
          </section>

          {/* Learning Resources */}
          {domain.learning_resources && Object.keys(domain.learning_resources).length > 0 && (
            <>
              <Separator />
              <section>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                  Learning Resources
                </h3>
                <div className="space-y-2">
                  {domain.learning_resources.courses?.slice(0, 3).map((resource, i) => (
                    <ResourceItem key={i} type="Course" resource={resource} />
                  ))}
                  {domain.learning_resources.books?.slice(0, 3).map((resource, i) => (
                    <ResourceItem key={i} type="Book" resource={resource} />
                  ))}
                  {domain.learning_resources.articles?.slice(0, 3).map((resource, i) => (
                    <ResourceItem key={i} type="Article" resource={resource} />
                  ))}
                  {domain.learning_resources.communities?.slice(0, 2).map((resource, i) => (
                    <ResourceItem key={i} type="Community" resource={resource} />
                  ))}
                  {domain.learning_resources.tools?.slice(0, 2).map((resource, i) => (
                    <ResourceItem key={i} type="Tool" resource={resource} />
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// Resource item component
function ResourceItem({ 
  type, 
  resource 
}: { 
  type: string
  resource: { title: string; url?: string; description?: string } 
}) {
  const content = (
    <div className="flex items-start gap-2 text-sm">
      <Badge variant="outline" className="text-[10px] shrink-0">{type}</Badge>
      <div className="min-w-0">
        <span className={cn(
          "text-foreground",
          resource.url && "hover:underline"
        )}>
          {resource.title}
        </span>
        {resource.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {resource.description}
          </p>
        )}
      </div>
    </div>
  )

  if (resource.url) {
    return (
      <a 
        href={resource.url} 
        target="_blank" 
        rel="noopener noreferrer"
        className="block p-2 rounded hover:bg-muted transition-colors"
      >
        {content}
      </a>
    )
  }

  return <div className="p-2">{content}</div>
}
