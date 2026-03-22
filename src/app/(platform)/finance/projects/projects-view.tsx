/**
 * @file projects-view.tsx — Client component for project-level P&L tracking
 *
 * @description Shows all projects with revenue, expenses, margin,
 * and allows creating new projects and navigating to detail views.
 */

'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { FolderKanban, Plus, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/types/payments'
import { createProject } from '@/actions/finance-projects'
import type { ProjectStatus, ProjectPnL } from '@/types/finance'

const STATUS_VARIANTS: Record<ProjectStatus, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  active: 'success',
  completed: 'secondary',
  on_hold: 'warning',
  cancelled: 'destructive',
}

interface ProjectsViewProps {
  initialData: ProjectPnL[]
}

export function ProjectsView({ initialData }: ProjectsViewProps) {
  const [data, setData] = useState(initialData)
  const [showCreate, setShowCreate] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Create form state
  const [name, setName] = useState('')
  const [clientName, setClientName] = useState('')

  const handleCreate = () => {
    if (!name.trim()) {
      setError('Project name is required')
      return
    }

    setError(null)
    startTransition(async () => {
      const result = await createProject({
        name: name.trim(),
        clientName: clientName.trim() || undefined,
      })

      if (result.error) {
        setError(result.error)
        return
      }

      setName('')
      setClientName('')
      setShowCreate(false)

      if (result.data) {
        setData(prev => [{
          project: result.data!,
          totalRevenue: 0,
          totalExpenses: 0,
          netProfit: 0,
          marginPct: 0,
          transactionCount: 0,
        }, ...prev])
      }
    })
  }

  // Compute totals
  const totalRevenue = data.reduce((sum, p) => sum + p.totalRevenue, 0)
  const totalExpenses = data.reduce((sum, p) => sum + p.totalExpenses, 0)
  const totalProfit = totalRevenue - totalExpenses

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-international-orange/10 flex items-center justify-center">
            <FolderKanban className="h-5 w-5 text-international-orange" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">Projects</h1>
            <p className="text-sm text-muted-foreground">Track per-project profitability and P&L</p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-international-orange hover:bg-international-orange/90">
          <Plus className="h-4 w-4 mr-2" />
          New Project
        </Button>
      </div>

      {/* Summary KPIs */}
      {data.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Total Revenue</p>
              <p className="text-lg font-semibold text-status-success">{formatCurrency(totalRevenue)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Total Expenses</p>
              <p className="text-lg font-semibold text-foreground">{formatCurrency(totalExpenses)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Total Profit</p>
              <p className={`text-lg font-semibold ${totalProfit >= 0 ? 'text-status-success' : 'text-destructive'}`}>
                {formatCurrency(totalProfit)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Projects List */}
      {data.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <FolderKanban className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No projects yet</p>
            <p className="text-xs text-muted-foreground mt-1">Create a project to start tracking per-project profitability</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">All Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 overflow-x-auto">
              {/* Header row */}
              <div className="grid grid-cols-7 min-w-[600px] text-xs font-medium text-muted-foreground pb-2 border-b border-border">
                <span className="col-span-2">Project</span>
                <span className="text-right">Revenue</span>
                <span className="text-right">Expenses</span>
                <span className="text-right">Profit</span>
                <span className="text-right">Margin</span>
                <span className="text-right">Status</span>
              </div>
              {data.map((item) => (
                <Link
                  key={item.project.id}
                  href={`/finance/projects/${item.project.id}`}
                  className="grid grid-cols-7 min-w-[600px] items-center text-sm py-3 border-b border-border last:border-0 hover:bg-muted/50 transition-colors rounded-sm group"
                >
                  <div className="col-span-2">
                    <p className="font-medium text-foreground group-hover:text-international-orange transition-colors">
                      {item.project.name}
                    </p>
                    {item.project.clientName && (
                      <p className="text-xs text-muted-foreground">{item.project.clientName}</p>
                    )}
                  </div>
                  <span className="text-right text-status-success">{formatCurrency(item.totalRevenue)}</span>
                  <span className="text-right text-muted-foreground">{formatCurrency(item.totalExpenses)}</span>
                  <span className={`text-right font-medium ${item.netProfit >= 0 ? 'text-status-success' : 'text-destructive'}`}>
                    {formatCurrency(item.netProfit)}
                  </span>
                  <span className="text-right">
                    <span className="inline-flex items-center gap-1">
                      {item.marginPct > 0 ? (
                        <TrendingUp className="h-3 w-3 text-status-success" />
                      ) : item.marginPct < 0 ? (
                        <TrendingDown className="h-3 w-3 text-destructive" />
                      ) : null}
                      <span className={item.marginPct >= 0 ? 'text-status-success' : 'text-destructive'}>
                        {item.marginPct}%
                      </span>
                    </span>
                  </span>
                  <span className="text-right flex items-center justify-end gap-2">
                    <Badge variant={STATUS_VARIANTS[item.project.status as ProjectStatus]}>
                      {item.project.status}
                    </Badge>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Project Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                placeholder="e.g. Widget Redesign"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-name">Client Name (optional)</Label>
              <Input
                id="client-name"
                placeholder="e.g. Acme Corp"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={isPending}
              className="bg-international-orange hover:bg-international-orange/90"
            >
              {isPending ? 'Creating...' : 'Create Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
