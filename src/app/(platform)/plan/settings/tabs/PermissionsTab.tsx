'use client'

/**
 * @file PermissionsTab.tsx — Plan settings · Permissions (client component).
 *
 * PLAN-SCHEMA §16.3 · Access-change audit UI.
 *
 * Shows a per-member access delta table: current role, Phase 3 role,
 * actions lost, actions gained. Before applying, a banner prompts the
 * founder to confirm. After applying (`foundries.phase3_role_matrix_applied_at`
 * is non-null) the banner collapses into a success state + timestamp.
 *
 * Only a founder / co_founder can click the apply button — the server
 * action double-checks. Other members see the table read-only.
 */

import { useState, useTransition } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react'

import { applyPhase3RoleMatrix } from '@/actions/plan/permissions'
import type { AccessDeltaRow } from '@/actions/plan/permissions.types'

export interface PermissionsTabProps {
    initialAppliedAt: string | null
    initialAppliedBy: string | null
    initialRows: AccessDeltaRow[]
}

export function PermissionsTab({
    initialAppliedAt,
    initialAppliedBy,
    initialRows,
}: PermissionsTabProps) {
    const [appliedAt, setAppliedAt] = useState<string | null>(initialAppliedAt)
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    // Heuristic: "callerCanApply" is inferred from the caller's own row in
    // the delta (if they map to founder/co_founder under Phase 3, they're
    // eligible). The server action independently enforces — we only use this
    // to hide the button for clearly-ineligible members.
    const callerCanApply = initialRows.some(
        (r) => r.phase3Role === 'founder' || r.phase3Role === 'co_founder',
    )

    const notApplied = appliedAt === null

    function handleApply() {
        setError(null)
        startTransition(async () => {
            const res = await applyPhase3RoleMatrix()
            if (res.success) {
                setAppliedAt(res.data.appliedAt)
            } else {
                setError(res.error)
            }
        })
    }

    return (
        <div className="space-y-6 pt-4">
            {notApplied ? (
                <Card className="border-status-warning-light bg-status-warning-light/20">
                    <CardContent className="flex items-start gap-3 p-4">
                        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-status-warning-dark" />
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <p className="text-sm font-semibold text-foreground">
                                    Phase 3 introduces a refined permissions model
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    Review the per-member changes below, then apply when
                                    ready. This is the only setting that switches your
                                    foundry from permissive Plan (everyone can do
                                    everything) to matrix-enforced Plan. Until you apply,
                                    nothing changes.
                                </p>
                            </div>
                            {error ? (
                                <p className="flex items-center gap-1.5 text-xs text-rose-600">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    {error}
                                </p>
                            ) : null}
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="default"
                                    size="sm"
                                    onClick={handleApply}
                                    disabled={!callerCanApply || isPending}
                                    className="gap-1.5"
                                >
                                    {isPending ? 'Applying…' : 'Apply Phase 3 role matrix'}
                                </Button>
                                {!callerCanApply ? (
                                    <span className="text-xs text-muted-foreground">
                                        Only a founder can apply this change.
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <Card className="border-emerald-200 bg-emerald-50/40">
                    <CardContent className="flex items-start gap-3 p-4">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                        <div className="space-y-1">
                            <p className="text-sm font-semibold text-foreground">
                                Phase 3 role matrix applied
                            </p>
                            <p className="text-sm text-muted-foreground">
                                Applied on {new Date(appliedAt).toLocaleString('en-GB')}.
                                The delta table below shows the state at apply time.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Per-member access delta</CardTitle>
                </CardHeader>
                <CardContent>
                    {initialRows.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            No active members in this foundry yet.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Member</TableHead>
                                        <TableHead>Current role</TableHead>
                                        <TableHead>Phase 3 role</TableHead>
                                        <TableHead>Actions lost</TableHead>
                                        <TableHead>Actions gained</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {initialRows.map((row) => (
                                        <TableRow key={row.userId}>
                                            <TableCell className="align-top">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium text-foreground">
                                                        {row.fullName ?? row.email ?? row.userId}
                                                    </span>
                                                    {row.email && row.fullName ? (
                                                        <span className="text-xs text-muted-foreground">
                                                            {row.email}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </TableCell>
                                            <TableCell className="align-top">
                                                <Badge variant="outline" size="sm">
                                                    {row.currentRole}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="align-top">
                                                <Badge
                                                    variant={row.phase3Role === 'none' ? 'destructive' : 'outline'}
                                                    size="sm"
                                                >
                                                    {row.phase3Role === 'none'
                                                        ? 'No Plan access'
                                                        : row.phase3Role}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="align-top">
                                                {row.actionsLost.length === 0 ? (
                                                    <span className="text-xs text-muted-foreground">
                                                        None
                                                    </span>
                                                ) : (
                                                    <ul className="flex flex-wrap gap-1.5">
                                                        {row.actionsLost.map((a) => (
                                                            <li key={a}>
                                                                <Badge
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="text-[11px] text-rose-700 border-rose-200"
                                                                >
                                                                    {a}
                                                                </Badge>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </TableCell>
                                            <TableCell className="align-top">
                                                {row.actionsGained.length === 0 ? (
                                                    <span className="text-xs text-muted-foreground">
                                                        None
                                                    </span>
                                                ) : (
                                                    <ul className="flex flex-wrap gap-1.5">
                                                        {row.actionsGained.map((a) => (
                                                            <li key={a}>
                                                                <Badge
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="text-[11px] text-emerald-700 border-emerald-200"
                                                                >
                                                                    {a}
                                                                </Badge>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground">
                Phase 3 ships against the current 5-role enum. The 9-role expansion
                (co_founder, CTO, advisor, contractor, read-only observer, fractional
                exec) ships in a later focused PR. Until then, members not covered by
                the legacy enum show as &ldquo;No Plan access&rdquo; in the table above
                and keep their current legacy behaviour.
            </p>
        </div>
    )
}
