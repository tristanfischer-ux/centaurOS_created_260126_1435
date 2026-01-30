import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Mail, Briefcase, Shield, Award } from 'lucide-react'
import { Badge } from "@/components/ui/badge"
import { CompareToDialog } from './compare-to-dialog'

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const supabase = await createClient()

    // Fetch profile
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single()

    if (!profile) {
        notFound()
    }

    const foundry_id = profile.foundry_id

    if (!foundry_id) {
        return <div className="p-8 text-red-500">Error: This profile is not correctly associated with a Foundry.</div>
    }

    // Fetch assigned tasks for this profile
    const { data: tasks } = await supabase
        .from('tasks')
        .select('*')
        .eq('assignee_id', profile.id)
        .eq('foundry_id', foundry_id)
        .order('created_at', { ascending: false })

    // Fetch ALL profiles for comparison feature
    const { data: allProfiles } = await supabase
        .from('profiles')
        .select('*')
        .eq('foundry_id', foundry_id)

    // Fetch ALL tasks for metrics calculation
    const { data: allTasks } = await supabase
        .from('tasks')
        .select('assignee_id, status')
        .eq('foundry_id', foundry_id)

    // Calculate metrics for ALL members (for comparison)
    const allMembersWithMetrics = (allProfiles || [])?.map(p => {
        const memberTasks = (allTasks || []).filter(t => t.assignee_id === p.id)
        return {
            id: p.id,
            full_name: p.full_name || 'Unknown',
            email: p.email || '',
            role: p.role,
            activeTasks: memberTasks.filter(t => t.status === 'Accepted').length,
            completedTasks: memberTasks.filter(t => t.status === 'Completed').length,
            pendingTasks: memberTasks.filter(t => t.status === 'Pending').length,
            rejectedTasks: memberTasks.filter(t => t.status === 'Rejected').length,
        }
    })

    const currentMemberMetrics = allMembersWithMetrics.find(m => m.id === profile.id)

    if (!currentMemberMetrics) {
        // Fallback if not found in the list (e.g. newly joined)
        return <div className="p-8 text-amber-600 bg-amber-50 rounded-lg">Profile metadata sync in progress. Please refresh in a moment.</div>
    }

    return (
        <div className="space-y-8">
            {/* Header / Profile Card */}
            <div className="bg-background border border rounded-xl p-8 shadow-sm flex items-start gap-8">
                <div className="h-32 w-32 bg-muted rounded-full flex items-center justify-center text-4xl border-4 border-slate-50 shadow-inner">
                    {profile.role === 'AI_Agent' ? '🤖' : '👤'}
                </div>
                <div className="flex-1">
                    <div className="flex justify-between items-start">
                        <div>
                            <h1 className="text-3xl font-bold text-foreground">{profile.full_name}</h1>
                            <div className="flex items-center gap-2 mt-2 text-muted-foreground">
                                <Mail className="w-4 h-4" />
                                <span>{profile.email}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <CompareToDialog
                                currentMember={currentMemberMetrics}
                                allMembers={allMembersWithMetrics}
                            />
                            <Badge variant="secondary" className="text-lg px-4 py-1 bg-muted">
                                {profile.role}
                            </Badge>
                        </div>
                    </div>

                    {(() => {
                        const activeTasks = tasks?.filter(t => t.status === 'Pending' || t.status === 'Accepted') || []
                        const completedTasks = tasks?.filter(t => t.status === 'Completed') || []
                        return (
                            <div className="grid grid-cols-3 gap-6 mt-8 border-t border-slate-100 pt-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                        <Briefcase className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="text-sm text-muted-foreground">Active Tasks</div>
                                        <div className="font-semibold text-foreground">{activeTasks.length}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                                        <Shield className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="text-sm text-muted-foreground">Completed</div>
                                        <div className="font-semibold text-foreground">{completedTasks.length}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                                        <Award className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="text-sm text-muted-foreground">Reputation</div>
                                        <div className="font-semibold text-foreground">Good</div>
                                    </div>
                                </div>
                            </div>
                        )
                    })()}
                </div>
            </div>

            {/* Current Tasks */}
            {(() => {
                const activeTasks = tasks?.filter(t => t.status === 'Pending' || t.status === 'Accepted') || []
                return activeTasks.length > 0 ? (
                    <div>
                        <h2 className="text-xl font-bold text-foreground mb-4">Current Tasks</h2>
                        <div className="bg-background border border rounded-lg overflow-hidden">
                            {activeTasks.map(task => (
                                <div key={task.id} className="p-4 border-b border-slate-100 last:border-0 hover:bg-muted flex justify-between items-center">
                                    <div>
                                        <div className="font-medium text-foreground">{task.title}</div>
                                        <div className="text-sm text-muted-foreground truncate max-w-md">{task.description}</div>
                                    </div>
                                    <Badge variant={task.status === 'Accepted' ? 'default' : 'secondary'}>{task.status}</Badge>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null
            })()}

            {/* Completed Tasks */}
            {(() => {
                const completedTasks = tasks?.filter(t => t.status === 'Completed') || []
                return (
                    <div>
                        <h2 className="text-xl font-bold text-foreground mb-4">Completed Tasks</h2>
                        <div className="bg-background border border rounded-lg overflow-hidden">
                            {completedTasks.length === 0 ? (
                                <div className="p-8 text-center text-muted-foreground">No completed tasks yet.</div>
                            ) : (
                                completedTasks.map(task => (
                                    <div key={task.id} className="p-4 border-b border-slate-100 last:border-0 hover:bg-muted flex justify-between items-center">
                                        <div>
                                            <div className="font-medium text-foreground">{task.title}</div>
                                            <div className="text-sm text-muted-foreground truncate max-w-md">{task.description}</div>
                                        </div>
                                        <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200">Completed</Badge>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )
            })()}
        </div>
    )
}
