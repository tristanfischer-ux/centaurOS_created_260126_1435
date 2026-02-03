'use client'

/**
 * UniversalSubsystemsGrid - Displays universal subsystems in a filterable grid
 * 
 * @description Shows all cross-sector technical domains with their categories,
 * descriptions, and quick actions. Users can filter by category or search.
 * Clicking a subsystem opens the detail sheet.
 * 
 * @component
 */

import { useState, useMemo } from 'react'
import { Search, Filter } from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { UniversalSubsystem, DomainCategory } from '@/types/blueprints'
import { DOMAIN_CATEGORY_COLORS } from '@/types/blueprints'

interface UniversalSubsystemsGridProps {
  /** Array of universal subsystems to display */
  subsystems: UniversalSubsystem[]
  /** Called when a subsystem card is clicked */
  onSubsystemClick: (subsystem: UniversalSubsystem) => void
  /** Additional CSS classes */
  className?: string
}

// Category display order
const CATEGORY_ORDER: DomainCategory[] = [
  'Mechanical',
  'Electronics',
  'Software',
  'Manufacturing',
  'Regulatory',
  'Operations',
]

/**
 * Gets a Lucide icon component by name
 */
function getIconComponent(iconName: string): React.ComponentType<{ className?: string }> {
  const icons = LucideIcons as Record<string, React.ComponentType<{ className?: string }>>
  return icons[iconName] || icons.Box
}

/**
 * Subsystem card component
 */
function SubsystemCard({
  subsystem,
  onClick,
}: {
  subsystem: UniversalSubsystem
  onClick: () => void
}) {
  const Icon = getIconComponent(subsystem.icon_name)
  const categoryColors = DOMAIN_CATEGORY_COLORS[subsystem.category]
  
  return (
    <Card
      className={cn(
        'group cursor-pointer transition-all duration-200',
        'hover:shadow-md hover:border-international-orange/30',
        'border-l-4',
        categoryColors.border
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
              categoryColors.bg
            )}
          >
            <Icon className={cn('h-5 w-5', categoryColors.text)} />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-foreground truncate group-hover:text-international-orange transition-colors">
                {subsystem.name}
              </h3>
            </div>
            
            <p className="text-sm text-muted-foreground line-clamp-2">
              {subsystem.tagline}
            </p>
            
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary" className="text-xs">
                {subsystem.category}
              </Badge>
              {subsystem.key_questions.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {subsystem.key_questions.length} key questions
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function UniversalSubsystemsGrid({
  subsystems,
  onSubsystemClick,
  className,
}: UniversalSubsystemsGridProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<Set<DomainCategory>>(
    new Set(CATEGORY_ORDER)
  )
  
  // Filter subsystems by search and category
  const filteredSubsystems = useMemo(() => {
    return subsystems.filter((subsystem) => {
      // Category filter
      if (!selectedCategories.has(subsystem.category)) {
        return false
      }
      
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        return (
          subsystem.name.toLowerCase().includes(query) ||
          (subsystem.tagline?.toLowerCase().includes(query) ?? false) ||
          (subsystem.description?.toLowerCase().includes(query) ?? false)
        )
      }
      
      return true
    })
  }, [subsystems, searchQuery, selectedCategories])
  
  // Group by category for display
  const groupedSubsystems = useMemo(() => {
    const grouped: Partial<Record<DomainCategory, UniversalSubsystem[]>> = {}
    
    for (const category of CATEGORY_ORDER) {
      const items = filteredSubsystems.filter((s) => s.category === category)
      if (items.length > 0) {
        grouped[category] = items
      }
    }
    
    return grouped
  }, [filteredSubsystems])
  
  const toggleCategory = (category: DomainCategory) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }
  
  const selectAllCategories = () => {
    setSelectedCategories(new Set(CATEGORY_ORDER))
  }
  
  const clearAllCategories = () => {
    setSelectedCategories(new Set())
  }
  
  return (
    <div className={cn('space-y-6', className)}>
      {/* Header with search and filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search subsystems..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              Categories
              {selectedCategories.size < CATEGORY_ORDER.length && (
                <Badge variant="secondary" className="ml-1">
                  {selectedCategories.size}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="flex gap-2 px-2 py-1.5 border-b mb-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={selectAllCategories}
              >
                All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={clearAllCategories}
              >
                None
              </Button>
            </div>
            {CATEGORY_ORDER.map((category) => (
              <DropdownMenuCheckboxItem
                key={category}
                checked={selectedCategories.has(category)}
                onCheckedChange={() => toggleCategory(category)}
              >
                <span
                  className={cn(
                    'w-2 h-2 rounded-full mr-2',
                    DOMAIN_CATEGORY_COLORS[category].bg.replace('bg-', 'bg-')
                  )}
                  style={{
                    backgroundColor:
                      category === 'Electronics'
                        ? 'hsl(var(--status-info))'
                        : category === 'Mechanical'
                          ? 'hsl(var(--status-warning))'
                          : category === 'Software'
                            ? 'hsl(var(--chart-5))'
                            : category === 'Manufacturing'
                              ? 'hsl(var(--status-success))'
                              : category === 'Regulatory'
                                ? 'hsl(var(--destructive))'
                                : category === 'Operations'
                                  ? 'hsl(var(--muted-foreground))'
                                  : 'hsl(var(--chart-2))',
                  }}
                />
                {category}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      
      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        Showing {filteredSubsystems.length} of {subsystems.length} subsystems
      </div>
      
      {/* Grouped subsystem cards */}
      {Object.entries(groupedSubsystems).length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No subsystems match your filters</p>
          <Button
            variant="link"
            className="mt-2"
            onClick={() => {
              setSearchQuery('')
              selectAllCategories()
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedSubsystems).map(([category, items]) => (
            <div key={category}>
              <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{
                    backgroundColor:
                      category === 'Electronics'
                        ? 'hsl(var(--status-info))'
                        : category === 'Mechanical'
                          ? 'hsl(var(--status-warning))'
                          : category === 'Software'
                            ? 'hsl(var(--chart-5))'
                            : category === 'Manufacturing'
                              ? 'hsl(var(--status-success))'
                              : category === 'Regulatory'
                                ? 'hsl(var(--destructive))'
                                : category === 'Operations'
                                  ? 'hsl(var(--muted-foreground))'
                                  : 'hsl(var(--chart-2))',
                  }}
                />
                {category}
                <span className="text-sm font-normal text-muted-foreground">
                  ({items.length})
                </span>
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.map((subsystem) => (
                  <SubsystemCard
                    key={subsystem.id}
                    subsystem={subsystem}
                    onClick={() => onSubsystemClick(subsystem)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
