'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { BusinessFunctionWithCoverage, updateFunctionStatus } from '@/actions/org-blueprint'
import { toast } from 'sonner'
import {
    CheckCircle2,
    AlertCircle,
    XCircle,
    MinusCircle,
    ChevronDown,
    StickyNote,
    ShoppingBag,
    Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'

type CoverageStatus = 'covered' | 'partial' | 'gap' | 'not_needed'

interface FunctionCardProps {
    businessFunction: BusinessFunctionWithCoverage
    onUpdate?: () => void
}

// Category colors
const CATEGORY_COLORS: Record<string, string> = {
    'finance': '#10b981',
    'legal': '#8b5cf6',
    'sales': '#f59e0b',
    'marketing': '#f97316',
    'product': '#6366f1',
    'operations': '#3b82f6',
    'people': '#ec4899',
    'customer': '#14b8a6',
    'strategy': '#64748b',
}

// Status colors
const STATUS_COLORS: Record<CoverageStatus, { bg: string; text: string; label: string }> = {
    'covered': { bg: 'bg-green-100', text: 'text-green-700', label: 'Covered' },
    'partial': { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Partial' },
    'gap': { bg: 'bg-red-100', text: 'text-red-700', label: 'Gap' },
    'not_needed': { bg: 'bg-gray-100', text: 'text-gray-500', label: 'N/A' },
}

const statusIcons: Record<CoverageStatus, React.ReactNode> = {
    covered: <CheckCircle2 className="h-4 w-4 text-green-600" />,
    partial: <AlertCircle className="h-4 w-4 text-yellow-600" />,
    gap: <XCircle className="h-4 w-4 text-red-600" />,
    not_needed: <MinusCircle className="h-4 w-4 text-gray-400" />,
}

export function FunctionCard({ businessFunction, onUpdate }: FunctionCardProps) {
    const [isNotesDialogOpen, setIsNotesDialogOpen] = useState(false)
    const [isUpdating, setIsUpdating] = useState(false)
    const [notes, setNotes] = useState(businessFunction.notes || '')
    const [coveredBy, setCoveredBy] = useState(businessFunction.covered_by || '')

    const statusConfig = STATUS_COLORS[businessFunction.coverage_status]
    const categoryColor = CATEGORY_COLORS[businessFunction.category] || '#64748b'

    const handleStatusChange = async (newStatus: CoverageStatus) => {
        setIsUpdating(true)
        try {
            const { error } = await updateFunctionStatus(
                businessFunction.function_id,
                newStatus,
                businessFunction.covered_by || undefined
            )
            if (error) {
                toast.error('Failed to update status')
            } else {
                toast.success('Status updated')
                onUpdate?.()
            }
        } finally {
            setIsUpdating(false)
        }
    }

    const handleSaveNotes = async () => {
        setIsUpdating(true)
        try {
            const newStatus = coveredBy ? 
                (businessFunction.coverage_status === 'gap' ? 'partial' : businessFunction.coverage_status) 
                : businessFunction.coverage_status

            const { error } = await updateFunctionStatus(
                businessFunction.function_id,
                newStatus,
                coveredBy || undefined,
                notes || undefined
            )
            if (error) {
                toast.error('Failed to save notes')
            } else {
                toast.success('Notes saved')
                setIsNotesDialogOpen(false)
                onUpdate?.()
            }
        } finally {
            setIsUpdating(false)
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            <Card className="h-full hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                                <div
                                    className="w-2 h-2 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: categoryColor }}
                                />
                                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider truncate capitalize">
                                    {businessFunction.category}
                                </span>
                            </div>
                            <CardTitle className="text-base">{businessFunction.name}</CardTitle>
                        </div>
                        <Badge className={cn(statusConfig.bg, statusConfig.text, 'shrink-0')}>
                            {statusIcons[businessFunction.coverage_status]}
                            <span className="ml-1">{statusConfig.label}</span>
                        </Badge>
                    </div>
                    {businessFunction.description && (
                        <CardDescription className="text-xs mt-2">
                            {businessFunction.description}
                        </CardDescription>
                    )}
                </CardHeader>
                <CardContent className="pt-0">
                    {/* Coverage info */}
                    {businessFunction.covered_by && (
                        <div className="mb-3 p-2 bg-muted/50 rounded-md">
                            <div className="flex items-center gap-2 text-sm">
                                <span className="text-muted-foreground">Covered by:</span>
                                <span className="font-medium truncate">{businessFunction.covered_by}</span>
                            </div>
                        </div>
                    )}

                    {/* Notes preview */}
                    {businessFunction.notes && (
                        <div className="mb-3 text-xs text-muted-foreground line-clamp-2">
                            <StickyNote className="h-3 w-3 inline mr-1" />
                            {businessFunction.notes}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="secondary" size="sm" disabled={isUpdating}>
                                    {isUpdating ? (
                                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                    ) : (
                                        statusIcons[businessFunction.coverage_status]
                                    )}
                                    <span className="ml-1">Status</span>
                                    <ChevronDown className="h-3.5 w-3.5 ml-1" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                <DropdownMenuLabel>Set Coverage Status</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleStatusChange('covered')}>
                                    <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                                    Covered
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleStatusChange('partial')}>
                                    <AlertCircle className="h-4 w-4 mr-2 text-yellow-600" />
                                    Partial Coverage
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleStatusChange('gap')}>
                                    <XCircle className="h-4 w-4 mr-2 text-red-600" />
                                    Gap
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleStatusChange('not_needed')}>
                                    <MinusCircle className="h-4 w-4 mr-2 text-gray-400" />
                                    Not Needed
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <Dialog open={isNotesDialogOpen} onOpenChange={setIsNotesDialogOpen}>
                            <DialogTrigger asChild>
                                <Button variant="ghost" size="sm">
                                    <StickyNote className="h-3.5 w-3.5 mr-1" />
                                    Notes
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>{businessFunction.name}</DialogTitle>
                                    <DialogDescription>
                                        Add details about how this function is covered
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                        <Label>Covered By</Label>
                                        <Input
                                            placeholder="e.g., John Smith, Acme Corp"
                                            value={coveredBy}
                                            onChange={(e) => setCoveredBy(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Notes</Label>
                                        <Textarea
                                            placeholder="Add any additional notes..."
                                            value={notes}
                                            onChange={(e) => setNotes(e.target.value)}
                                            rows={4}
                                        />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button variant="secondary" onClick={() => setIsNotesDialogOpen(false)}>
                                        Cancel
                                    </Button>
                                    <Button onClick={handleSaveNotes} disabled={isUpdating}>
                                        {isUpdating ? (
                                            <>
                                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                Saving...
                                            </>
                                        ) : (
                                            'Save'
                                        )}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>

                        {businessFunction.coverage_status === 'gap' && (
                            <Link href="/marketplace">
                                <Button variant="ghost" size="sm" className="text-primary">
                                    <ShoppingBag className="h-3.5 w-3.5 mr-1" />
                                    Find Provider
                                </Button>
                            </Link>
                        )}
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    )
}
