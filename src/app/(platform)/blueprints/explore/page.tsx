import { Suspense } from 'react'
import { getBlueprintTemplates, getDomainTree } from '@/actions/blueprints'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { TechTreeBrowser } from './tech-tree-browser'
import { Skeleton } from '@/components/ui/skeleton'
import type { BlueprintTemplate, DomainTreeNode } from '@/types/blueprints'

export const metadata = {
  title: 'Explore Tech Trees | CentaurOS',
  description: 'Browse all technology trees. See what you need to know to build rockets, robots, electronics, and more.',
}

interface TemplateWithTree {
  template: BlueprintTemplate
  domains: DomainTreeNode[]
}

async function getTemplatesWithTrees(): Promise<TemplateWithTree[]> {
  const { data: templates, error } = await getBlueprintTemplates()
  
  if (error || !templates) {
    console.error('Error fetching templates:', error)
    return []
  }

  // Fetch domain trees for each template in parallel
  const templatesWithTrees = await Promise.all(
    templates.map(async (template) => {
      const { data: domains } = await getDomainTree(template.id)
      return {
        template,
        domains: domains || [],
      }
    })
  )

  // Sort by use_count descending, then by name
  return templatesWithTrees.sort((a, b) => {
    if (b.template.use_count !== a.template.use_count) {
      return b.template.use_count - a.template.use_count
    }
    return a.template.name.localeCompare(b.template.name)
  })
}

function LoadingSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  )
}

export default async function ExploreTechTreesPage() {
  const [templatesWithTrees, foundryId] = await Promise.all([
    getTemplatesWithTrees(),
    getFoundryIdCached(),
  ])

  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <TechTreeBrowser 
        templatesWithTrees={templatesWithTrees} 
        foundryId={foundryId || undefined}
      />
    </Suspense>
  )
}
