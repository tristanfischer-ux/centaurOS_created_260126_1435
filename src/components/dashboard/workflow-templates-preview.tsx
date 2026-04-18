'use client'

import Link from 'next/link'
import {
  Workflow,
  ChevronRight,
  ArrowRight,
  TrendingUp,
  Users,
  FileText,
  Shield,
  Rocket,
  BarChart3,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

interface WorkflowTemplatePreview {
  id: string
  name: string
  description: string
  category: string
  nodeCount: number
  icon: string
}

interface WorkflowTemplatesPreviewProps {
  templates: WorkflowTemplatePreview[]
}

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  startup: Rocket,
  fundraising: TrendingUp,
  operations: BarChart3,
  hiring: Users,
  legal: Shield,
  marketing: FileText,
}

const categoryColors: Record<string, { text: string; bg: string }> = {
  startup: { text: 'text-international-orange', bg: 'bg-international-orange/10' },
  fundraising: { text: 'text-emerald-600', bg: 'bg-emerald-50' },
  operations: { text: 'text-blue-600', bg: 'bg-blue-50' },
  hiring: { text: 'text-purple-600', bg: 'bg-purple-50' },
  legal: { text: 'text-slate-600', bg: 'bg-slate-50' },
  marketing: { text: 'text-pink-600', bg: 'bg-pink-50' },
}

/**
 * Workflow Templates Preview - Shows a few pre-built templates 
 * from the Agents page to entice users.
 * 
 * Language: "Workflow templates" and "Prompt chains" - no "AI" branding.
 * These are tools for getting work done faster, not technology showcases.
 */
export function WorkflowTemplatesPreview({ templates }: WorkflowTemplatesPreviewProps) {
  // Show top 3 templates
  const displayed = templates.slice(0, 3)

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-border overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-border bg-gradient-to-r from-orange-50/50 to-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-international-orange/10 rounded-lg">
              <Workflow className="w-5 h-5 text-international-orange" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Workflow Templates</h2>
              <p className="text-sm text-muted-foreground">Pre-built prompt chains to get things done</p>
            </div>
          </div>
        </div>
      </div>

      {/* Template Cards */}
      <div className="divide-y divide-slate-100">
        {displayed.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <Workflow className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-sm text-muted-foreground">
              Build prompt chains to automate repetitive work
            </p>
            <Link
              href="/agents"
              className="inline-block mt-3 text-sm text-international-orange hover:text-orange-700 font-medium"
            >
              Explore workflows
            </Link>
          </div>
        ) : (
          displayed.map((template) => (
            <TemplateCard key={template.id} template={template} />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-4 bg-slate-50 border-t border-border">
        <Link
          href="/agents"
          className="text-sm text-international-orange hover:text-orange-700 font-medium flex items-center gap-1 group w-fit"
        >
          View all templates
          <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </Link>
      </div>
    </div>
  )
}

function TemplateCard({ template }: { template: WorkflowTemplatePreview }) {
  const colors = categoryColors[template.category] || { text: 'text-slate-600', bg: 'bg-slate-50' }
  const CategoryIcon = categoryIcons[template.category] || Workflow

  return (
    <Link
      href="/agents"
      className="group flex items-start gap-4 p-4 hover:bg-slate-50 transition-colors"
    >
      {/* Icon */}
      <div className={cn(
        "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
        colors.bg
      )}>
        <CategoryIcon className={cn("w-5 h-5", colors.text)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground group-hover:text-international-orange transition-colors">
            {template.name}
          </h3>
          <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-international-orange transition-colors flex-shrink-0" />
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
          {template.description}
        </p>
        <div className="flex items-center gap-2 mt-2">
          <Badge variant="outline" className={cn("text-[10px]", colors.text)}>
            {template.nodeCount} steps
          </Badge>
          <span className="text-[10px] text-muted-foreground capitalize">
            {template.category}
          </span>
        </div>
      </div>
    </Link>
  )
}
