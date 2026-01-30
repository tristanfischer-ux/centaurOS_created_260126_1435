'use client'

import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { 
    BusinessFunctionWithCoverage, 
    CoverageSummary,
    initializeBusinessFunctions 
} from '@/actions/org-blueprint'
import { BusinessFunctionCategory } from '@/types/org-blueprint'
import { toast } from 'sonner'
import {
    Building2,
    Search,
    Filter,
    X,
    Sparkles,
    AlertTriangle,
    CheckCircle2,
    Loader2,
    LayoutGrid,
    List,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { CoverageRadar } from '@/components/org-blueprint/coverage-radar'
import { AssessmentModal } from '@/components/org-blueprint/assessment-modal'

type CoverageStatus = 'covered' | 'partial' | 'gap' | 'not_needed'
type FunctionCategory = 'finance' | 'legal' | 'sales' | 'marketing' | 'product' | 'operations' | 'people' | 'customer' | 'strategy'

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

// FunctionCard component for grid view
function FunctionCard({ 
    businessFunction, 
    onUpdate 
}: { 
    businessFunction: BusinessFunctionWithCoverage
    onUpdate: () => void 
}) {
    const statusConfig = STATUS_COLORS[businessFunction.coverage_status]
    
    // Subtle left border color based on status
    const borderColorClass = businessFunction.coverage_status === 'covered' 
        ? 'border-l-green-500' 
        : businessFunction.coverage_status === 'partial'
        ? 'border-l-yellow-500'
        : businessFunction.coverage_status === 'gap'
        ? 'border-l-slate-300'
        : 'border-l-slate-200'
    
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn(
                "p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all bg-white border-l-4",
                borderColorClass
            )}
        >
            <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                    <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: CATEGORY_COLORS[businessFunction.category] }}
                    />
                    <span className="text-xs text-muted-foreground capitalize">
                        {businessFunction.category}
                    </span>
                </div>
                <Badge variant="secondary" className={cn('text-xs', statusConfig.text)}>
                    {statusConfig.label}
                </Badge>
            </div>
            
            <h3 className="font-medium text-sm mb-1 line-clamp-2">
                {businessFunction.name}
            </h3>
            
            {businessFunction.description && (
                <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                    {businessFunction.description}
                </p>
            )}
            
            {businessFunction.covered_by && (
                <div className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle2 className="h-3 w-3" />
                    <span className="truncate">{businessFunction.covered_by}</span>
                </div>
            )}
            
            {businessFunction.coverage_status === 'gap' && (
                <div className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                    <AlertTriangle className="h-3 w-3" />
                    <span>Coverage needed</span>
                </div>
            )}
        </motion.div>
    )
}

interface OrgBlueprintViewProps {
    functions: BusinessFunctionWithCoverage[]
    summary: CoverageSummary | null
}

export function OrgBlueprintView({ functions: initialFunctions, summary: initialSummary }: OrgBlueprintViewProps) {
    const router = useRouter()
    const [functions, setFunctions] = useState(initialFunctions)
    const [summary, setSummary] = useState(initialSummary)
    const [isInitializing, setIsInitializing] = useState(false)
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

    // Filter state
    const [searchQuery, setSearchQuery] = useState('')
    const [categoryFilter, setCategoryFilter] = useState<string>('all')
    const [statusFilter, setStatusFilter] = useState<CoverageStatus | 'all'>('all')
    const [selectedRadarCategory, setSelectedRadarCategory] = useState<BusinessFunctionCategory | null>(null)
    
    // Get unique categories from data
    const allCategories = useMemo(() => 
        [...new Set(functions.map(f => f.category))].sort(),
        [functions]
    )

    // Initialize functions if none exist
    const handleInitialize = async () => {
        setIsInitializing(true)
        try {
            const { error } = await initializeBusinessFunctions()
            if (error) {
                toast.error('Failed to initialize blueprint')
            } else {
                toast.success('Blueprint initialized!')
                router.refresh()
            }
        } finally {
            setIsInitializing(false)
        }
    }

    // Handle refresh after updates
    const handleRefresh = () => {
        router.refresh()
    }

    // Radar category click handler
    const handleRadarCategoryClick = (category: BusinessFunctionCategory) => {
        if (selectedRadarCategory === category) {
            setSelectedRadarCategory(null)
            setCategoryFilter('all')
        } else {
            setSelectedRadarCategory(category)
            setCategoryFilter(category)
        }
    }

    // Filter functions
    const filteredFunctions = useMemo(() => {
        let filtered = functions

        // Search filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase()
            filtered = filtered.filter(
                fn =>
                    fn.name.toLowerCase().includes(query) ||
                    fn.description?.toLowerCase().includes(query) ||
                    fn.covered_by?.toLowerCase().includes(query)
            )
        }

        // Category filter
        if (categoryFilter !== 'all') {
            filtered = filtered.filter(fn => fn.category === categoryFilter)
        }

        // Status filter
        if (statusFilter !== 'all') {
            filtered = filtered.filter(fn => fn.coverage_status === statusFilter)
        }

        return filtered
    }, [functions, searchQuery, categoryFilter, statusFilter])

    // Group filtered functions by category
    const groupedFunctions = useMemo(() => {
        const grouped: Record<string, BusinessFunctionWithCoverage[]> = {}
        allCategories.forEach(cat => {
            const catFunctions = filteredFunctions.filter(fn => fn.category === cat)
            if (catFunctions.length > 0) {
                grouped[cat] = catFunctions
            }
        })
        return grouped
    }, [filteredFunctions, allCategories])

    const hasActiveFilters = searchQuery.trim() || categoryFilter !== 'all' || statusFilter !== 'all'

    const clearFilters = () => {
        setSearchQuery('')
        setCategoryFilter('all')
        setStatusFilter('all')
        setSelectedRadarCategory(null)
    }

    // Empty state for new foundries
    if (functions.length === 0) {
        return (
            <div className="space-y-6">
                <div className="pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="h-8 w-1 bg-orange-600 rounded-full shadow-[0_0_8px_rgba(234,88,12,0.6)]" />
                        <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">
                            Org Blueprint
                        </h1>
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm font-medium pl-4">
                        Map your organizational capabilities and identify coverage gaps
                    </p>
                </div>

                <div className="flex items-center justify-center min-h-[400px]">
                    <div className="text-center max-w-md">
                        <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                            <Building2 className="h-8 w-8 text-primary" />
                        </div>
                        <h2 className="text-xl font-semibold mb-2">Get Started with Org Blueprint</h2>
                        <p className="text-muted-foreground mb-6">
                            Org Blueprint helps you understand your organizational coverage across key
                            business functions. Identify gaps and find providers to fill them.
                        </p>
                        <Button
                            size="lg"
                            onClick={handleInitialize}
                            disabled={isInitializing}
                        >
                            {isInitializing ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Setting up...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="h-4 w-4 mr-2" />
                                    Initialize Blueprint
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Quick Assessment Button */}
            <div className="flex justify-end">
                <AssessmentModal functions={functions} onComplete={handleRefresh}>
                    <Button className="bg-slate-900 hover:bg-slate-800 text-white font-medium shadow-md">
                        <Sparkles className="h-4 w-4 mr-2" />
                        Quick Assessment
                    </Button>
                </AssessmentModal>
            </div>

            {/* How it Works Banner */}
            <div className="bg-gradient-to-r from-slate-50 to-orange-50 border border-slate-200 rounded-lg p-5">
                <div className="flex items-start gap-4">
                    <div className="p-2 bg-orange-100 rounded-lg shrink-0">
                        <Building2 className="h-6 w-6 text-orange-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-slate-900 mb-1">What is Org Blueprint?</h3>
                        <p className="text-sm text-slate-600 mb-3">
                            Org Blueprint maps all the key business functions your company needs — from finance and legal to marketing and operations. 
                            It helps you see where you have coverage (internal team or external providers) and where you have gaps that need to be filled.
                        </p>
                        <div className="flex flex-wrap gap-4 text-xs">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                <span className="text-slate-600"><strong>Covered:</strong> Handled by your team</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                                <span className="text-slate-600"><strong>Partial:</strong> External provider</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full bg-slate-300"></div>
                                <span className="text-slate-600"><strong>Gap:</strong> Needs coverage</span>
                            </div>
                        </div>
                        <p className="text-xs text-slate-500 mt-3">
                            <strong>Tip:</strong> Click "Quick Assessment" to walk through each function and mark your coverage status. 
                            You can then browse the Marketplace to find providers for any gaps.
                        </p>
                    </div>
                </div>
            </div>

            {/* Summary Cards & Radar Chart */}
            {summary && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Status Summary Cards */}
                    <div className="lg:col-span-1 space-y-4">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                            Coverage Summary
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            <motion.button
                                onClick={() => setStatusFilter(statusFilter === 'covered' ? 'all' : 'covered')}
                                className={cn(
                                    "p-4 rounded-lg border-2 transition-all text-left",
                                    statusFilter === 'covered'
                                        ? "border-green-500 bg-green-50"
                                        : "border-transparent bg-green-50 hover:border-green-300"
                                )}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                <CheckCircle2 className="h-5 w-5 text-green-600 mb-2" />
                                <div className="text-2xl font-bold text-green-700">{summary.covered}</div>
                                <div className="text-xs text-green-600 uppercase tracking-wider">Covered</div>
                            </motion.button>
                            <motion.button
                                onClick={() => setStatusFilter(statusFilter === 'partial' ? 'all' : 'partial')}
                                className={cn(
                                    "p-4 rounded-lg border-2 transition-all text-left",
                                    statusFilter === 'partial'
                                        ? "border-yellow-500 bg-yellow-50"
                                        : "border-transparent bg-yellow-50 hover:border-yellow-300"
                                )}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                <AlertTriangle className="h-5 w-5 text-yellow-600 mb-2" />
                                <div className="text-2xl font-bold text-yellow-700">{summary.partial}</div>
                                <div className="text-xs text-yellow-600 uppercase tracking-wider">Partial</div>
                            </motion.button>
                            <motion.button
                                onClick={() => setStatusFilter(statusFilter === 'gap' ? 'all' : 'gap')}
                                className={cn(
                                    "p-4 rounded-lg border-2 transition-all text-left",
                                    statusFilter === 'gap'
                                        ? "border-red-500 bg-red-50"
                                        : "border-transparent bg-red-50 hover:border-red-300"
                                )}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                <AlertTriangle className="h-5 w-5 text-red-600 mb-2" />
                                <div className="text-2xl font-bold text-red-700">{summary.gaps}</div>
                                <div className="text-xs text-red-600 uppercase tracking-wider">Gaps</div>
                            </motion.button>
                            <motion.button
                                onClick={() => setStatusFilter(statusFilter === 'not_needed' ? 'all' : 'not_needed')}
                                className={cn(
                                    "p-4 rounded-lg border-2 transition-all text-left",
                                    statusFilter === 'not_needed'
                                        ? "border-gray-400 bg-gray-50"
                                        : "border-transparent bg-gray-50 hover:border-gray-300"
                                )}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                            >
                                <div className="h-5 w-5 rounded-full bg-gray-300 mb-2" />
                                <div className="text-2xl font-bold text-gray-600">{summary.notApplicable}</div>
                                <div className="text-xs text-gray-500 uppercase tracking-wider">N/A</div>
                            </motion.button>
                        </div>
                    </div>

                    {/* Radar Chart */}
                    <div className="lg:col-span-2 flex items-center justify-center p-4 bg-muted/30 rounded-lg">
                        <CoverageRadar
                            categories={summary.byCategory}
                            onCategoryClick={handleRadarCategoryClick}
                            selectedCategory={selectedRadarCategory}
                            size={320}
                        />
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search functions..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                    />
                </div>

                <Select
                    value={categoryFilter}
                    onValueChange={(val) => {
                        setCategoryFilter(val as FunctionCategory | 'all')
                        if (val === 'all') {
                            setSelectedRadarCategory(null)
                        }
                    }}
                >
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {allCategories.map(cat => (
                            <SelectItem key={cat} value={cat}>
                                <div className="flex items-center gap-2">
                                    <div
                                        className="w-2 h-2 rounded-full"
                                        style={{ backgroundColor: CATEGORY_COLORS[cat] || '#64748b' }}
                                    />
                                    <span className="capitalize">{cat}</span>
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select
                    value={statusFilter}
                    onValueChange={(val) => setStatusFilter(val as CoverageStatus | 'all')}
                >
                    <SelectTrigger className="w-[150px]">
                        <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="covered">Covered</SelectItem>
                        <SelectItem value="partial">Partial</SelectItem>
                        <SelectItem value="gap">Gaps</SelectItem>
                        <SelectItem value="not_needed">N/A</SelectItem>
                    </SelectContent>
                </Select>

                {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                        <X className="h-4 w-4 mr-1" />
                        Clear
                    </Button>
                )}

                <div className="ml-auto flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                        {filteredFunctions.length} functions
                    </span>
                    <div className="bg-muted p-1 flex items-center rounded-lg">
                        <Button
                            variant={viewMode === 'grid' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setViewMode('grid')}
                            className="h-8 w-8 p-0"
                        >
                            <LayoutGrid className="h-4 w-4" />
                        </Button>
                        <Button
                            variant={viewMode === 'list' ? 'default' : 'ghost'}
                            size="sm"
                            onClick={() => setViewMode('list')}
                            className="h-8 w-8 p-0"
                        >
                            <List className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* Function Cards */}
            {filteredFunctions.length === 0 ? (
                <EmptyState
                    icon={<Filter className="h-12 w-12" />}
                    title="No functions match your filters"
                    description="Try adjusting your filters to see more functions."
                    action={
                        <Button variant="secondary" onClick={clearFilters}>
                            Clear Filters
                        </Button>
                    }
                />
            ) : viewMode === 'grid' ? (
                <div className="space-y-8">
                    {Object.entries(groupedFunctions).map(([category, categoryFunctions]) => (
                        <motion.div
                            key={category}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="space-y-4"
                        >
                            <div className="flex items-center gap-3">
                                <div
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: CATEGORY_COLORS[category as FunctionCategory] }}
                                />
                                <h2 className="text-lg font-semibold">{category}</h2>
                                <Badge variant="secondary" className="text-xs">
                                    {categoryFunctions.length} functions
                                </Badge>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {categoryFunctions.map(fn => (
                                    <FunctionCard
                                        key={fn.id}
                                        businessFunction={fn}
                                        onUpdate={handleRefresh}
                                    />
                                ))}
                            </div>
                        </motion.div>
                    ))}
                </div>
            ) : (
                <div className="space-y-2">
                    {filteredFunctions.map(fn => {
                        const statusConfig = STATUS_COLORS[fn.coverage_status]
                        return (
                            <motion.div
                                key={fn.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex items-center gap-4 p-4 border rounded-lg hover:shadow-sm transition-shadow"
                            >
                                <div
                                    className="w-2 h-2 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: CATEGORY_COLORS[fn.category] }}
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium truncate">{fn.name}</span>
                                        <Badge className={cn(statusConfig.bg, statusConfig.text, 'text-xs')}>
                                            {statusConfig.label}
                                        </Badge>
                                    </div>
                                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                        <span>{fn.category}</span>
                                        {fn.covered_by && (
                                            <span>• {fn.covered_by}</span>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
