import { createClient } from '@/lib/supabase/server'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Markdown } from '@/components/ui/markdown'
import Link from 'next/link'
import { ChevronRight, FileText } from 'lucide-react'

export default async function ObjectiveDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const supabase = await createClient()

    // Fetch Objective
    const { data: objective, error } = await supabase
        .from('objectives')
        .select('*')
        .eq('id', id)
        .single()

    if (error || !objective) {
        return <div className="p-8 text-destructive">Objective not found.</div>
    }

    // Fetch Linked Tasks
    const { data: tasks } = await supabase
        .from('tasks')
        .select('*, assignee:profiles!assignee_id(id, full_name, role)')
        .eq('objective_id', id)
        .order('created_at', { ascending: false })

    return (
        <div className="space-y-8 max-w-5xl mx-auto">
            {/* Breadcrumb Navigation */}
            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
                <Link 
                    href="/objectives" 
                    className="text-muted-foreground hover:text-foreground transition-colors"
                >
                    Objectives
                </Link>
                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span className="text-foreground font-medium truncate max-w-[300px]">
                    {objective.title}
                </span>
            </nav>

            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">{objective.title}</h1>
                {objective.description && (
                    <p className="text-lg text-muted-foreground leading-relaxed max-w-3xl">{objective.description}</p>
                )}
                <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
                    <span>Created: {new Date(objective.created_at!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
            </div>

            {/* Extended Description */}
            {objective.extended_description && (
                <Card className="bg-muted/30 border-l-4 border-l-international-orange">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <FileText className="h-5 w-5 text-international-orange" />
                            Full Context & Instructions
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="prose prose-sm max-w-none">
                            <Markdown content={objective.extended_description} />
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Tasks Section */}
            <div className="pt-8 mt-4">
                <h2 className="text-xl font-semibold text-foreground mb-6 flex items-center">
                    Associated Tasks
                    <Badge variant="secondary" className="ml-3 rounded-full">{tasks?.length || 0}</Badge>
                </h2>

                <div className="grid gap-4 md:grid-cols-2">
                    {tasks?.map((task) => (
                        <Card key={task.id} className="bg-background hover:shadow-lg transition-all">
                            <CardHeader className="pb-2">
                                <div className="flex justify-between items-start">
                                    <Badge variant={
                                        task.status === 'Accepted' ? 'default' :
                                            task.status === 'Completed' ? 'secondary' :
                                                task.status === 'Rejected' ? 'destructive' : 'secondary'
                                    } className="mb-2">
                                        {task.status}
                                    </Badge>
                                    {task.assignee?.role === 'AI_Agent' && (
                                        <Badge variant="secondary" className="border-purple-200 text-purple-600 bg-purple-50">
                                            🤖 AI Agent
                                        </Badge>
                                    )}
                                </div>
                                <CardTitle className="text-lg text-foreground leading-tight">
                                    {task.title}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center gap-2 mt-2">
                                    <UserAvatar
                                        name={task.assignee?.full_name}
                                        role={task.assignee?.role}
                                        size="sm"
                                    />
                                    <span className="text-sm text-muted-foreground">
                                        {task.assignee?.full_name}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                    {(!tasks || tasks.length === 0) && (
                        <div className="col-span-full py-12 text-center text-muted-foreground bg-muted/50 rounded-lg">
                            No tasks linked to this objective yet.
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
