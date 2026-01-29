'use client'

import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { CoverageSummary, STATUS_COLORS } from '@/types/org-blueprint'
import { CoverageRadarCompact } from './coverage-radar'
import Link from 'next/link'
import { 
    Building2, 
    AlertTriangle, 
    CheckCircle2, 
    ArrowRight,
    TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface BlueprintWidgetProps {
    summary: CoverageSummary | null
}

export function BlueprintWidget({ summary }: BlueprintWidgetProps) {
    if (!summary) {
        return (
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-slate-600" />
                                Org Blueprint
                            </CardTitle>
                            <CardDescription>Assess your organizational coverage</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="text-center py-6">
                        <Building2 className="h-10 w-10 mx-auto text-slate-300 mb-3" />
                        <p className="text-sm text-muted-foreground mb-4">
                            Start your organizational assessment to identify gaps and opportunities
                        </p>
                        <Link href="/org-blueprint">
                            <Button size="sm">
                                Start Assessment
                                <ArrowRight className="h-4 w-4 ml-1" />
                            </Button>
                        </Link>
                    </div>
                </CardContent>
            </Card>
        )
    }

    const hasGaps = summary.gaps > 0

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-base flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-slate-600" />
                            Org Blueprint
                        </CardTitle>
                        <CardDescription>Your organizational coverage</CardDescription>
                    </div>
                    {hasGaps ? (
                        <Badge variant="warning" className="gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {summary.gaps} gaps
                        </Badge>
                    ) : (
                        <Badge variant="success" className="gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            All covered
                        </Badge>
                    )}
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Radar Chart or Progress Bars based on space */}
                <div className="flex items-center justify-center">
                    <CoverageRadarCompact categories={summary.byCategory} size={140} />
                </div>

                {/* Status Summary */}
                <div className="grid grid-cols-4 gap-2 text-center">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.1 }}
                        className="p-2 rounded-lg bg-green-50"
                    >
                        <div className="text-lg font-bold text-green-700">{summary.covered}</div>
                        <div className="text-[10px] text-green-600 uppercase tracking-wider">Covered</div>
                    </motion.div>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2 }}
                        className="p-2 rounded-lg bg-yellow-50"
                    >
                        <div className="text-lg font-bold text-yellow-700">{summary.partial}</div>
                        <div className="text-[10px] text-yellow-600 uppercase tracking-wider">Partial</div>
                    </motion.div>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3 }}
                        className="p-2 rounded-lg bg-red-50"
                    >
                        <div className="text-lg font-bold text-red-700">{summary.gaps}</div>
                        <div className="text-[10px] text-red-600 uppercase tracking-wider">Gaps</div>
                    </motion.div>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.4 }}
                        className="p-2 rounded-lg bg-gray-50"
                    >
                        <div className="text-lg font-bold text-gray-500">{summary.notApplicable}</div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-wider">N/A</div>
                    </motion.div>
                </div>

                {/* Overall Progress */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Overall Coverage</span>
                        <span className="font-semibold">{summary.overallCoveragePercentage}%</span>
                    </div>
                    <Progress value={summary.overallCoveragePercentage} className="h-2" />
                </div>

                {/* View Full Assessment Link */}
                <Link href="/org-blueprint" className="block">
                    <Button variant="secondary" size="sm" className="w-full">
                        View Full Assessment
                        <ArrowRight className="h-4 w-4 ml-1" />
                    </Button>
                </Link>
            </CardContent>
        </Card>
    )
}

// Compact version for smaller spaces
export function BlueprintWidgetCompact({ summary }: BlueprintWidgetProps) {
    if (!summary) {
        return (
            <Link href="/org-blueprint">
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-slate-100 rounded-lg">
                                <Building2 className="h-5 w-5 text-slate-600" />
                            </div>
                            <div className="flex-1">
                                <p className="font-medium text-sm">Org Blueprint</p>
                                <p className="text-xs text-muted-foreground">Start assessment</p>
                            </div>
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                    </CardContent>
                </Card>
            </Link>
        )
    }

    return (
        <Link href="/org-blueprint">
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "p-2 rounded-lg",
                            summary.gaps > 0 ? "bg-amber-100" : "bg-green-100"
                        )}>
                            {summary.gaps > 0 ? (
                                <AlertTriangle className="h-5 w-5 text-amber-600" />
                            ) : (
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">Org Blueprint</p>
                            <div className="flex items-center gap-2">
                                <Progress value={summary.overallCoveragePercentage} className="h-1.5 flex-1" />
                                <span className="text-xs font-medium">{summary.overallCoveragePercentage}%</span>
                            </div>
                        </div>
                        {summary.gaps > 0 && (
                            <Badge variant="warning" className="text-xs">
                                {summary.gaps} gaps
                            </Badge>
                        )}
                    </div>
                </CardContent>
            </Card>
        </Link>
    )
}
