import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CreateObjectiveDialog } from './create-objective-dialog'
import { ObjectivesListView } from './objectives-list-view'
import { FeatureTipWrapper } from './feature-tip-wrapper'
import { TaskStatusLegend } from '@/components/objectives/task-status-legend'
import type { CompanyProfile } from '@/types/foundry'
import { CompanyProfilePrompt } from '@/components/settings/company-profile-prompt'

// Revalidate every 60 seconds
export const revalidate = 60

interface ObjectivesPageProps {
    searchParams: Promise<{ prefill?: string }>
}

export default async function ObjectivesPage({ searchParams }: ObjectivesPageProps) {
    const params = await searchParams
    const prefillText = params.prefill || undefined
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Fetch user profile to get foundry_id and role
    const { data: profile } = await supabase
        .from('profiles')
        .select('id, foundry_id, role')
        .eq('id', user.id)
        .single()

    if (!profile) {
        redirect('/login')
    }

    // Fetch foundry with purpose_data via RPC (bypasses RLS issue on foundries table)
    const { data: foundry } = await supabase.rpc('ensure_foundry_exists', {
        p_foundry_id: profile.foundry_id,
    })

    // Fetch objectives
    const { data: objectives, error } = await supabase
        .from('objectives')
        .select('id, title, description, extended_description, status, progress, parent_objective_id, creator_id, foundry_id, created_at, updated_at, is_private, is_strategic_goal')
        .eq('foundry_id', profile.foundry_id)
        .eq('is_ghost', false)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('[ObjectivesPage] Failed to fetch objectives:', {
            foundryId: profile.foundry_id,
            error: error.message,
            code: error.code,
        })
        return <div className="text-destructive">Error loading objectives</div>
    }

    // Type definitions for task joins
    interface TaskAssignee {
        full_name: string | null
        role: string | null
    }

    interface TaskComment {
        id: string
        is_system_log: boolean | null
    }

    interface TaskFile {
        id: string
        file_name: string
        file_size: number | null
        created_at: string | null
    }

    // Fetch tasks with assignee info for all objectives
    // Include task_assignees (multi-assignee) alongside legacy assignee_id for consistent display
    const { data: tasks } = await supabase
        .from('tasks')
        .select(`
            id,
            title,
            description,
            task_number,
            status,
            assignee_id,
            end_date,
            objective_id,
            foundry_id,
            is_private,
            assignee:profiles!tasks_assignee_id_fkey(full_name, role),
            task_assignees(profile:profiles(full_name, role)),
            task_comments(id, is_system_log),
            task_files(id, file_name, file_size, created_at)
        `)
        .eq('is_ghost', false)
        .is('deleted_at', null)
        .not('objective_id', 'is', null)
        .order('end_date', { ascending: true })

    // Group tasks by objective
    const objectivesWithTasks = objectives?.map(obj => ({
        ...obj,
        tasks: tasks?.filter(t => t.objective_id === obj.id).map(t => ({
            ...t,
            assignee: t.assignee as TaskAssignee | null,
            // Map task_assignees junction table to flat assignees array
            assignees: ((t.task_assignees as { profile: TaskAssignee | null }[] | null) || [])
                .map(ta => ta.profile)
                .filter((p): p is TaskAssignee => p !== null),
            notesCount: (t.task_comments as TaskComment[] | null)?.filter(c => !c.is_system_log).length || 0,
            attachmentCount: (t.task_files as TaskFile[] | null)?.length || 0
        })) || []
    })) || []

    // SECURITY: Fetch data for CreateTaskDialog - filtered by foundry_id
    // Note: Profiles RLS is disabled due to recursion issues, so app-level filtering is CRITICAL
    const [
        { data: objectivesForDialogData, error: objDialogError },
        { data: membersRaw, error: membersError },
        { data: teamsData, error: teamsError }
    ] = await Promise.all([
        supabase.from('objectives').select('id, title').eq('foundry_id', profile.foundry_id).eq('is_ghost', false).is('deleted_at', null),
        supabase.from('profiles').select('id, full_name, role, email').eq('foundry_id', profile.foundry_id),
        supabase.from('teams').select('id, name').eq('foundry_id', profile.foundry_id)
    ])

    if (objDialogError) {
        console.error('[ObjectivesPage] Failed to fetch objectives for dialog:', { foundryId: profile.foundry_id, error: objDialogError.message })
    }
    if (membersError) {
        console.error('[ObjectivesPage] Failed to fetch members:', { foundryId: profile.foundry_id, error: membersError.message })
    }
    if (teamsError) {
        console.error('[ObjectivesPage] Failed to fetch teams:', { foundryId: profile.foundry_id, error: teamsError.message })
    }

    const objectivesForDialog = objectivesForDialogData || []
    const members = (membersRaw || []).map(p => ({
        id: p.id,
        full_name: p.full_name || 'Unknown',
        role: p.role,
        email: p.email || ''
    }))
    const teams = teamsData || []

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="h-8 w-1 bg-international-orange rounded-full shadow-[0_0_8px_rgba(255,69,0,0.6)]" />
                        <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight">Strategic Objectives</h1>
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm font-medium pl-4">High-level goals aligned with your company's purpose</p>
                </div>
                <FeatureTipWrapper>
                    <CreateObjectiveDialog prefill={prefillText} />
                </FeatureTipWrapper>
            </div>

            <CompanyProfilePrompt
                hasCompanyProfile={!!(foundry as { company_profile?: CompanyProfile | null } | null)?.company_profile}
                isFounder={profile.role === 'Founder'}
            />

            <TaskStatusLegend className="mb-6" />

            <ObjectivesListView 
                objectives={objectivesWithTasks}
                objectivesForDialog={objectivesForDialog}
                members={members}
                teams={teams}
                currentUserId={user.id}
            />
        </div>
    )
}
