'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  UserCheck,
  Users,
  ShieldCheck,
  ShieldAlert,
  Factory,
  FileCheck,
  Loader2,
  ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getPendingReviews, getReviewGateStats } from '@/actions/review-gates'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import type { ReviewGate, ReviewGateType } from '@/types/review-gates'

const GATE_ICONS: Record<ReviewGateType, React.ComponentType<{ className?: string }>> = {
  expert_review: UserCheck,
  peer_review: Users,
  quality_gate: ShieldCheck,
  safety_review: ShieldAlert,
  manufacturing_review: Factory,
  compliance_review: FileCheck,
}

const GATE_LABELS: Record<ReviewGateType, string> = {
  expert_review: 'Expert',
  peer_review: 'Peer',
  quality_gate: 'Quality',
  safety_review: 'Safety',
  manufacturing_review: 'Manufacturing',
  compliance_review: 'Compliance',
}

export function ReviewGateWidget() {
  const [gates, setGates] = useState<ReviewGate[]>([])
  const [stats, setStats] = useState<{ total: number; pending: number; approved: number; rejected: number } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setIsLoading(true)
    const [gatesResult, statsResult] = await Promise.all([
      getPendingReviews(),
      getReviewGateStats(),
    ])

    if (!gatesResult.error) setGates(gatesResult.data)
    if (!statsResult.error) setStats(statsResult.data)
    setIsLoading(false)
  }

  // Group gates by type
  const groupedGates = gates.reduce<Record<string, ReviewGate[]>>((acc, gate) => {
    const type = gate.gate_type
    if (!acc[type]) acc[type] = []
    acc[type].push(gate)
    return acc
  }, {})

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-status-info" />
              Review Gates
            </CardTitle>
            <CardDescription>Human reviews pending sign-off</CardDescription>
          </div>
          {stats && stats.pending > 0 && (
            <Badge
              variant="secondary"
              className="bg-status-warning-light text-status-warning"
            >
              {stats.pending} pending
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : gates.length === 0 ? (
          <div className="text-center py-6">
            <ShieldCheck className="h-8 w-8 mx-auto text-status-success/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              No pending reviews
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              All review gates are clear
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {Object.entries(groupedGates).map(([type, typeGates]) => {
              const Icon = GATE_ICONS[type as ReviewGateType]
              const label = GATE_LABELS[type as ReviewGateType]
              return (
                <div key={type} className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">
                      {label} ({typeGates.length})
                    </span>
                  </div>
                  {typeGates.slice(0, 3).map((gate) => (
                    <div
                      key={gate.id}
                      className="flex items-center justify-between py-1.5 px-2 rounded-md bg-muted/50"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {gate.title}
                        </p>
                        {gate.required_skills.length > 0 && (
                          <p className="text-[10px] text-muted-foreground">
                            {gate.required_skills.slice(0, 2).join(', ')}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] shrink-0',
                          gate.status === 'pending'
                            ? 'text-status-warning'
                            : 'text-status-info'
                        )}
                      >
                        {gate.status === 'pending' ? 'Needs Review' : 'In Review'}
                      </Badge>
                    </div>
                  ))}
                  {typeGates.length > 3 && (
                    <p className="text-[10px] text-muted-foreground pl-2">
                      +{typeGates.length - 3} more
                    </p>
                  )}
                </div>
              )
            })}
            <div className="pt-2">
              <Link href="/new-tasks">
                <Button variant="outline" size="sm" className="w-full h-8 text-xs">
                  View All Reviews
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Stats footer */}
        {stats && stats.total > 0 && (
          <div className="flex items-center justify-between pt-3 mt-3 border-t text-xs text-muted-foreground">
            <span>{stats.approved} approved</span>
            <span>{stats.rejected} rejected</span>
            <span>{stats.total} total</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
