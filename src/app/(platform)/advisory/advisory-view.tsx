"use client"

import { useState, useMemo, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { 
    Search, 
    Filter, 
    ChevronDown, 
    X, 
    MessageSquare,
    CheckCircle2,
    Clock,
    Shield,
    LayoutGrid,
    List,
    HelpCircle,
    GraduationCap,
    Cpu,
    Factory,
    FileText,
    ExternalLink,
    BookOpen
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { EmptyState } from "@/components/ui/empty-state"
import { QuestionCard, Question, VerificationStatus } from "@/components/advisory/question-card"
import { AskModal } from "@/components/advisory/ask-modal"
import { StatusLegend } from "@/components/advisory/status-legend"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface Member {
    id: string
    full_name: string
    role: string
    email?: string
}

interface AdvisoryViewProps {
    questions: Question[]
    members: Member[]
    currentUserId: string
    currentUserRole?: string
    foundryId?: string
}

const CATEGORIES = [
    "All",
    "Finance",
    "Legal", 
    "Sales",
    "Operations",
    "HR",
    "Technology",
    "Strategy",
    "General",
]

const STATUS_OPTIONS = [
    { value: "all", label: "All Status", icon: null },
    { value: "verified", label: "Verified", icon: CheckCircle2 },
    { value: "endorsed", label: "Endorsed", icon: Shield },
    { value: "unverified", label: "Needs Review", icon: Clock },
]

const VISIBILITY_OPTIONS = [
    { value: "all", label: "All Questions" },
    { value: "public", label: "Public" },
    { value: "foundry", label: "Private to Foundry" },
]

const RESOURCES = [
    {
        id: "getting-started",
        title: "Getting Started Guide",
        description: "Learn the fundamentals of the Centaur OS platform and how to maximize your productivity.",
        icon: GraduationCap,
        category: "Guide",
        href: "/help"
    },
    {
        id: "ai-tools",
        title: "AI Tools & Integrations",
        description: "Explore the AI agents and automation tools available to enhance your workflow.",
        icon: Cpu,
        category: "Documentation",
        href: "/help"
    },
    {
        id: "manufacturing",
        title: "Manufacturing Network",
        description: "Connect with vetted manufacturing partners and service providers in the marketplace.",
        icon: Factory,
        category: "Network",
        href: "/marketplace"
    },
    {
        id: "best-practices",
        title: "Best Practices",
        description: "Proven methodologies for task delegation, approval workflows, and team coordination.",
        icon: FileText,
        category: "Guide",
        href: "/help"
    },
    {
        id: "community-guidelines",
        title: "Community Guidelines",
        description: "Standards and expectations for Guild members to ensure productive collaboration.",
        icon: Shield,
        category: "Policy",
        href: "/help"
    },
]

export function AdvisoryView({ 
    questions, 
    members, 
    currentUserId, 
    currentUserRole,
    foundryId 
}: AdvisoryViewProps) {
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
    const [searchQuery, setSearchQuery] = useState("")
    const [debouncedSearch, setDebouncedSearch] = useState("")
    const [showFilters, setShowFilters] = useState(false)
    
    // Filter state
    const [categoryFilter, setCategoryFilter] = useState("All")
    const [statusFilter, setStatusFilter] = useState<string>("all")
    const [visibilityFilter, setVisibilityFilter] = useState<string>("all")
    
    // Tab state
    const [activeTab, setActiveTab] = useState<"all" | "my" | "needs-verification">("all")
    
    // Filter presets saved to localStorage
    const [activePreset, setActivePreset] = useState<string | null>(null)

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchQuery)
        }, 300)
        return () => clearTimeout(timer)
    }, [searchQuery])

    // Load saved preset
    useEffect(() => {
        const saved = localStorage.getItem('advisory-active-preset')
        if (saved) setActivePreset(saved)
    }, [])

    // Save preset changes
    useEffect(() => {
        if (activePreset) {
            localStorage.setItem('advisory-active-preset', activePreset)
        } else {
            localStorage.removeItem('advisory-active-preset')
        }
    }, [activePreset])

    // Filter presets
    const filterPresets = [
        { 
            id: 'verified', 
            label: 'Verified Only', 
            filter: (q: Question) => q.verification_status === 'verified'
        },
        { 
            id: 'trending', 
            label: 'Trending', 
            filter: (q: Question) => q.upvotes > 15 || q.views > 100
        },
        { 
            id: 'recent', 
            label: 'Recent', 
            filter: (q: Question) => {
                const hourAgo = Date.now() - 24 * 60 * 60 * 1000
                return new Date(q.created_at).getTime() > hourAgo
            }
        },
    ]

    // Filter logic
    const filteredQuestions = useMemo(() => {
        let filtered = [...questions]

        // Tab filter
        if (activeTab === "my") {
            filtered = filtered.filter(q => q.asker.id === currentUserId)
        } else if (activeTab === "needs-verification") {
            filtered = filtered.filter(q => q.verification_status === "unverified" || q.verification_status === "endorsed")
        }

        // Preset filter
        if (activePreset) {
            const preset = filterPresets.find(p => p.id === activePreset)
            if (preset) {
                filtered = filtered.filter(preset.filter)
            }
        }

        // Search filter
        if (debouncedSearch.trim()) {
            const query = debouncedSearch.toLowerCase()
            filtered = filtered.filter(q => 
                q.title.toLowerCase().includes(query) ||
                q.body.toLowerCase().includes(query) ||
                q.category.toLowerCase().includes(query) ||
                q.asker.full_name.toLowerCase().includes(query)
            )
        }

        // Category filter
        if (categoryFilter !== "All") {
            filtered = filtered.filter(q => q.category === categoryFilter)
        }

        // Status filter
        if (statusFilter !== "all") {
            filtered = filtered.filter(q => q.verification_status === statusFilter)
        }

        // Visibility filter
        if (visibilityFilter !== "all") {
            filtered = filtered.filter(q => q.visibility === visibilityFilter)
        }

        return filtered
    }, [questions, activeTab, activePreset, debouncedSearch, categoryFilter, statusFilter, visibilityFilter, currentUserId, filterPresets])

    // Sort by most recent by default
    const sortedQuestions = useMemo(() => {
        return [...filteredQuestions].sort((a, b) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
    }, [filteredQuestions])

    const hasActiveFilters = categoryFilter !== "All" || statusFilter !== "all" || visibilityFilter !== "all" || debouncedSearch.trim() !== ""

    const clearFilters = () => {
        setCategoryFilter("All")
        setStatusFilter("all")
        setVisibilityFilter("all")
        setSearchQuery("")
        setActivePreset(null)
    }

    const handleAskQuestion = async (data: {
        title: string
        body: string
        category: string
        visibility: "public" | "foundry"
        getAiAnswer: boolean
    }) => {
        // In production, this would call a server action to create the question
        toast.success("Question submitted! (Mock - implement server action)")
        return { questionId: "new-question-id" }
    }

    const isExecutive = currentUserRole === "Executive" || currentUserRole === "Founder"

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-muted">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3 mb-1">
                            <div className="h-8 w-1 bg-orange-600 rounded-full shadow-[0_0_8px_rgba(234,88,12,0.6)]" />
                            <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight flex items-center gap-3">
                                Advisory Forum
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-50 text-orange-700 text-sm font-medium rounded-full">
                                    <span className="font-semibold">{questions.length}</span>
                                    <span className="text-xs uppercase tracking-wider">questions</span>
                                </span>
                            </h1>
                        </div>
                        <p className="text-muted-foreground mt-1 text-sm font-medium pl-4">
                            AI-powered insights verified by human experts through democratic workflow
                        </p>
                    </div>
                    <AskModal onSubmit={handleAskQuestion} />
                </div>

                {/* Status Legend */}
                <StatusLegend className="pt-4 pb-2" />

                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as typeof activeTab)} className="w-full">
                    <TabsList className="grid w-full max-w-md grid-cols-3">
                        <TabsTrigger value="all" className="gap-1.5">
                            <MessageSquare className="h-4 w-4" />
                            All Questions
                        </TabsTrigger>
                        <TabsTrigger value="my" className="gap-1.5">
                            My Questions
                        </TabsTrigger>
                        {isExecutive && (
                            <TabsTrigger value="needs-verification" className="gap-1.5">
                                <Clock className="h-4 w-4" />
                                Needs Review
                            </TabsTrigger>
                        )}
                    </TabsList>
                </Tabs>

                {/* Search and Filters */}
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="search"
                                placeholder="Search questions, topics, or authors..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 w-full"
                            />
                        </div>
                        <Button 
                            variant="secondary" 
                            onClick={() => setShowFilters(!showFilters)}
                            className={cn(showFilters && "bg-muted")}
                        >
                            <Filter className="h-4 w-4 mr-2" />
                            Filters
                            {hasActiveFilters && (
                                <Badge className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                                    !
                                </Badge>
                            )}
                            <ChevronDown className={cn("h-4 w-4 ml-2 transition-transform", showFilters && "rotate-180")} />
                        </Button>
                    </div>

                    {/* Filter Presets */}
                    <div className="flex gap-2 flex-wrap">
                        {filterPresets.map(preset => (
                            <button
                                key={preset.id}
                                onClick={() => setActivePreset(activePreset === preset.id ? null : preset.id)}
                                className={cn(
                                    "px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200",
                                    activePreset === preset.id
                                        ? "bg-foreground text-background"
                                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                                )}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>

                    {/* Expanded Filters */}
                    <AnimatePresence>
                        {showFilters && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="p-4 border rounded-lg bg-muted space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-medium text-sm">Filter Questions</h3>
                                        {hasActiveFilters && (
                                            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs">
                                                <X className="h-3 w-3 mr-1" /> Clear all
                                            </Button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-medium text-muted-foreground">Category</label>
                                            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                                <SelectTrigger className="h-9">
                                                    <SelectValue placeholder="All Categories" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {CATEGORIES.map(cat => (
                                                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-medium text-muted-foreground">Status</label>
                                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                                <SelectTrigger className="h-9">
                                                    <SelectValue placeholder="All Status" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {STATUS_OPTIONS.map(opt => (
                                                        <SelectItem key={opt.value} value={opt.value}>
                                                            <span className="flex items-center gap-2">
                                                                {opt.icon && <opt.icon className="h-3.5 w-3.5" />}
                                                                {opt.label}
                                                            </span>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-medium text-muted-foreground">Visibility</label>
                                            <Select value={visibilityFilter} onValueChange={setVisibilityFilter}>
                                                <SelectTrigger className="h-9">
                                                    <SelectValue placeholder="All Questions" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {VISIBILITY_OPTIONS.map(opt => (
                                                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Active filter badges */}
                    {hasActiveFilters && (
                        <div className="flex flex-wrap gap-2">
                            {categoryFilter !== "All" && (
                                <Badge variant="secondary" className="gap-1">
                                    {categoryFilter}
                                    <X className="h-3 w-3 cursor-pointer" onClick={() => setCategoryFilter("All")} />
                                </Badge>
                            )}
                            {statusFilter !== "all" && (
                                <Badge variant="secondary" className="gap-1">
                                    {STATUS_OPTIONS.find(o => o.value === statusFilter)?.label}
                                    <X className="h-3 w-3 cursor-pointer" onClick={() => setStatusFilter("all")} />
                                </Badge>
                            )}
                            {visibilityFilter !== "all" && (
                                <Badge variant="secondary" className="gap-1">
                                    {VISIBILITY_OPTIONS.find(o => o.value === visibilityFilter)?.label}
                                    <X className="h-3 w-3 cursor-pointer" onClick={() => setVisibilityFilter("all")} />
                                </Badge>
                            )}
                            {debouncedSearch && (
                                <Badge variant="secondary" className="gap-1">
                                    &quot;{debouncedSearch}&quot;
                                    <X className="h-3 w-3 cursor-pointer" onClick={() => setSearchQuery("")} />
                                </Badge>
                            )}
                        </div>
                    )}
                </div>

                {/* Results and View Toggle */}
                <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                        Showing {sortedQuestions.length} {sortedQuestions.length === 1 ? 'question' : 'questions'}
                        {hasActiveFilters && ' (filtered)'}
                    </p>
                    <div className="flex items-center gap-2">
                        <div className="bg-muted p-1 flex items-center">
                            <Button
                                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => setViewMode('grid')}
                                className={cn(viewMode === 'grid' ? 'shadow-sm h-8 w-8 p-0' : 'h-8 w-8 p-0')}
                            >
                                <LayoutGrid className="h-4 w-4" />
                            </Button>
                            <Button
                                variant={viewMode === 'list' ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => setViewMode('list')}
                                className={cn(viewMode === 'list' ? 'shadow-sm h-8 w-8 p-0' : 'h-8 w-8 p-0')}
                            >
                                <List className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Questions Grid/List */}
            {sortedQuestions.length === 0 ? (
                <div className="border-2 border-dashed border rounded-lg bg-muted/50">
                    <EmptyState
                        icon={<HelpCircle className="h-12 w-12" />}
                        title={hasActiveFilters ? "No questions match your filters" : activeTab === "my" ? "You haven't asked any questions yet" : "No questions yet"}
                        description={
                            hasActiveFilters 
                                ? "Try adjusting your filters or search terms."
                                : activeTab === "my"
                                    ? "Ask your first question to get AI-powered insights verified by experts."
                                    : "Be the first to ask a question and get AI-powered insights."
                        }
                        action={
                            hasActiveFilters ? (
                                <Button variant="link" onClick={clearFilters} className="text-electric-blue">
                                    Reset Filters
                                </Button>
                            ) : (
                                <AskModal 
                                    onSubmit={handleAskQuestion}
                                    trigger={
                                        <Button className="gap-2">
                                            <MessageSquare className="h-4 w-4" />
                                            Ask a Question
                                        </Button>
                                    }
                                />
                            )
                        }
                    />
                </div>
            ) : viewMode === 'grid' ? (
                <motion.div 
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ staggerChildren: 0.05 }}
                >
                    {sortedQuestions.map((question, index) => (
                        <motion.div
                            key={question.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                        >
                            <QuestionCard question={question} />
                        </motion.div>
                    ))}
                </motion.div>
            ) : (
                <motion.div 
                    className="space-y-3"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                >
                    {sortedQuestions.map((question, index) => (
                        <motion.div
                            key={question.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.03 }}
                        >
                            <QuestionCard question={question} />
                        </motion.div>
                    ))}
                </motion.div>
            )}

            {/* Resources Section */}
            <div className="mt-12 pt-8 border-t border-muted">
                <div className="flex items-center gap-2 mb-4">
                    <BookOpen className="h-5 w-5 text-orange-600" />
                    <h2 className="text-lg font-semibold text-foreground">Resources</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-6">
                    Knowledge base and documentation to help you succeed.
                </p>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {RESOURCES.map(resource => (
                        <Card key={resource.id} className="p-5 bg-card hover:shadow-md transition-shadow group">
                            <div className="flex items-start gap-4">
                                <div className="p-2 bg-muted rounded-lg group-hover:bg-orange-50 transition-colors">
                                    <resource.icon className="h-5 w-5 text-muted-foreground group-hover:text-orange-600 transition-colors" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="font-medium text-foreground">{resource.title}</h3>
                                        <Badge variant="secondary" className="text-[10px]">
                                            {resource.category}
                                        </Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground mb-3">
                                        {resource.description}
                                    </p>
                                    <Button variant="ghost" size="sm" className="h-8 px-2 -ml-2 text-muted-foreground hover:text-orange-600" asChild>
                                        <a href={resource.href}>
                                            Learn more <ExternalLink className="ml-1 h-3 w-3" />
                                        </a>
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    )
}
