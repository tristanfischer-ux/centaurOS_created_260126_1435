'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CoverageBar, CoverageScore } from './coverage-indicator'
import type { Blueprint } from '@/types/blueprints'
import { PROJECT_STAGES } from '@/types/blueprints'
import {
  MoreHorizontal,
  Archive,
  Trash2,
  Copy,
  Settings,
  Cpu,
  Smartphone,
  Server,
  Cog,
  Stethoscope,
  Bot,
  Package,
} from 'lucide-react'

// Icon mapping for product categories
const categoryIcons: Record<string, React.ElementType> = {
  electronics: Cpu,
  'consumer-electronics': Smartphone,
  saas: Server,
  robotics: Bot,
  medical: Stethoscope,
  manufacturing: Cog,
  default: Package,
}

interface BlueprintCardProps {
  blueprint: Blueprint
  onArchive?: (id: string) => void
  onDelete?: (id: string) => void
  onDuplicate?: (id: string) => void
  className?: string
}

export function BlueprintCard({
  blueprint,
  onArchive,
  onDelete,
  onDuplicate,
  className,
}: BlueprintCardProps) {
  const templateCategory = (blueprint.template as any)?.product_category || 'default'
  const Icon = categoryIcons[templateCategory.toLowerCase()] || categoryIcons.default
  const stageName = PROJECT_STAGES.find(s => s.value === blueprint.project_stage)?.label || blueprint.project_stage

  return (
    <Card className={cn('group relative overflow-hidden transition-shadow hover:shadow-md', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate text-lg">
                <Link 
                  href={`/blueprints/${blueprint.id}`}
                  className="hover:text-international-orange transition-colors"
                >
                  {blueprint.name}
                </Link>
              </CardTitle>
              {blueprint.description && (
                <p className="text-sm text-muted-foreground truncate">
                  {blueprint.description}
                </p>
              )}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/blueprints/${blueprint.id}/settings`}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              {onDuplicate && (
                <DropdownMenuItem onClick={() => onDuplicate(blueprint.id)}>
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicate
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {onArchive && (
                <DropdownMenuItem onClick={() => onArchive(blueprint.id)}>
                  <Archive className="mr-2 h-4 w-4" />
                  Archive
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem
                  onClick={() => onDelete(blueprint.id)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Stage badge */}
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {stageName}
          </Badge>
          {blueprint.critical_gaps > 0 && (
            <Badge variant="destructive" className="text-xs">
              {blueprint.critical_gaps} critical gap{blueprint.critical_gaps !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>

        {/* Coverage score */}
        <div className="flex items-center justify-between">
          <CoverageScore score={blueprint.coverage_score} size="sm" />
          <span className="text-sm text-muted-foreground">
            {blueprint.covered_domains}/{blueprint.total_domains} domains
          </span>
        </div>

        {/* Coverage bar */}
        <CoverageBar
          covered={blueprint.covered_domains}
          partial={0} // Would need to add this to the blueprint type
          gaps={blueprint.total_domains - blueprint.covered_domains}
        />

        {/* Quick action */}
        <Link href={`/blueprints/${blueprint.id}`}>
          <Button variant="secondary" size="sm" className="w-full">
            View Blueprint
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}

// Grid layout for blueprint cards
interface BlueprintGridProps {
  blueprints: Blueprint[]
  onArchive?: (id: string) => void
  onDelete?: (id: string) => void
  onDuplicate?: (id: string) => void
  className?: string
}

export function BlueprintGrid({
  blueprints,
  onArchive,
  onDelete,
  onDuplicate,
  className,
}: BlueprintGridProps) {
  if (blueprints.length === 0) {
    return null
  }

  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6', className)}>
      {blueprints.map((blueprint) => (
        <BlueprintCard
          key={blueprint.id}
          blueprint={blueprint}
          onArchive={onArchive}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
        />
      ))}
    </div>
  )
}
