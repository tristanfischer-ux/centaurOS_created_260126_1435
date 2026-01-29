"use client"

import { useState, useMemo } from "react"
import { ApplicationStatus, ProviderApplication } from "@/actions/admin"
import { ApplicationCard } from "@/components/admin/ApplicationCard"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { 
    ClipboardList, 
    Filter, 
    CheckCircle2
} from "lucide-react"

type FilterStatus = ApplicationStatus | 'all'

const statusFilters: { value: FilterStatus; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'under_review', label: 'Under Review' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
]

interface ApplicationsViewProps {
    initialApplications: ProviderApplication[]
}

export function ApplicationsView({ initialApplications }: ApplicationsViewProps) {
    const [filter, setFilter] = useState<FilterStatus>('pending')
    
    // Filter applications client-side
    const filteredApplications = useMemo(() => {
        if (filter === 'all') {
            return initialApplications
        }
        return initialApplications.filter(app => app.status === filter)
    }, [initialApplications, filter])
    
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h2 className="text-xl font-semibold text-foreground">
                        Supplier Applications
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Review and manage provider applications
                    </p>
                </div>
            </div>
            
            {/* Filters */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-muted-foreground" />
                        <CardTitle className="text-base">Filter by Status</CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-2">
                        {statusFilters.map((statusFilter) => (
                            <Button
                                key={statusFilter.value}
                                variant={filter === statusFilter.value ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setFilter(statusFilter.value)}
                            >
                                {statusFilter.label}
                                {statusFilter.value !== 'all' && (
                                    <Badge variant="secondary" className="ml-2">
                                        {initialApplications.filter(a => a.status === statusFilter.value).length}
                                    </Badge>
                                )}
                            </Button>
                        ))}
                    </div>
                </CardContent>
            </Card>
            
            {/* Applications List */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <ClipboardList className="h-5 w-5 text-muted-foreground" />
                            <CardTitle>Applications</CardTitle>
                        </div>
                        <Badge variant="secondary">
                            {filteredApplications.length} {filter === 'all' ? 'total' : filter}
                        </Badge>
                    </div>
                    <CardDescription>
                        {filter === 'pending' 
                            ? 'Applications awaiting initial review'
                            : filter === 'under_review'
                            ? 'Applications currently being reviewed'
                            : filter === 'approved'
                            ? 'Approved applications'
                            : filter === 'rejected'
                            ? 'Rejected applications'
                            : 'All applications'
                        }
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {filteredApplications.length > 0 ? (
                        <div className="space-y-3">
                            {filteredApplications.map((app) => (
                                <ApplicationCard
                                    key={app.id}
                                    id={app.id}
                                    companyName={app.company_name}
                                    category={app.category}
                                    status={app.status}
                                    submittedAt={app.submitted_at}
                                    applicantName={app.user?.full_name}
                                />
                            ))}
                        </div>
                    ) : (
                        <EmptyState
                            icon={<CheckCircle2 className="h-10 w-10" />}
                            title={filter === 'pending' 
                                ? "No pending applications" 
                                : `No ${filter} applications`
                            }
                            description={filter === 'pending'
                                ? "All applications have been reviewed."
                                : "No applications match this filter."
                            }
                        />
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
