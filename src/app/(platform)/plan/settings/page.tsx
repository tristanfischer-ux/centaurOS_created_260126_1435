/**
 * @file /plan/settings — Plan section settings.
 *
 * PLAN-SCHEMA §16 (permissions matrix) + §16.3 (access-change audit).
 *
 * Flag-gated. If `new_plan_experience` is OFF for the current user we
 * redirect to the legacy `/settings` landing page so the user never sees a
 * 404 or a broken surface mid-rollout.
 *
 * V1 tabs:
 *   - General       · nudge frequency + specialist behaviour (stub-ish)
 *   - Notifications · stub only
 *   - Permissions   · access-change audit table + "Apply Phase 3 role matrix"
 *   - Danger        · stub only
 */

import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { getFeatureFlag } from '@/lib/features/flags'
import { FLAG_NEW_PLAN_EXPERIENCE } from '@/lib/features/keys'
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@/components/ui/tabs'

import { GeneralTab } from './tabs/GeneralTab'
import { NotificationsTab } from './tabs/NotificationsTab'
import { PermissionsTab } from './tabs/PermissionsTab'
import { DangerTab } from './tabs/DangerTab'
import { computeAccessDelta } from '@/actions/plan/permissions'
import type { AccessDeltaRow } from '@/actions/plan/permissions.types'

export const dynamic = 'force-dynamic'

interface SearchParams {
    tab?: string
}

export default async function PlanSettingsPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>
}) {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const flagOn = await getFeatureFlag(supabase, user.id, FLAG_NEW_PLAN_EXPERIENCE)
    if (!flagOn) {
        redirect('/settings')
    }

    const params = await searchParams
    const activeTab =
        params.tab && ['general', 'notifications', 'permissions', 'danger'].includes(params.tab)
            ? params.tab
            : 'general'

    // Pre-load the access delta server-side so the Permissions tab renders
    // with data already in the tree — no client-side loading spinner.
    const deltaRes = await computeAccessDelta()
    const delta: {
        appliedAt: string | null
        appliedBy: string | null
        rows: AccessDeltaRow[]
    } = deltaRes.success
        ? {
              appliedAt: deltaRes.data.appliedAt,
              appliedBy: deltaRes.data.appliedBy,
              rows: deltaRes.data.rows,
          }
        : { appliedAt: null, appliedBy: null, rows: [] }

    return (
        <div className="space-y-6">
            <header className="space-y-2">
                <h1 className="text-2xl font-semibold text-foreground">Plan settings</h1>
                <p className="max-w-2xl text-sm text-muted-foreground">
                    Control how Plan nudges you, who can do what, and how the Plan surface
                    behaves for your team.
                </p>
            </header>

            <Tabs defaultValue={activeTab}>
                <TabsList>
                    <TabsTrigger value="general">General</TabsTrigger>
                    <TabsTrigger value="notifications">Notifications</TabsTrigger>
                    <TabsTrigger value="permissions">Permissions</TabsTrigger>
                    <TabsTrigger value="danger">Danger</TabsTrigger>
                </TabsList>

                <TabsContent value="general">
                    <GeneralTab />
                </TabsContent>

                <TabsContent value="notifications">
                    <NotificationsTab />
                </TabsContent>

                <TabsContent value="permissions">
                    <PermissionsTab
                        initialAppliedAt={delta.appliedAt}
                        initialAppliedBy={delta.appliedBy}
                        initialRows={delta.rows}
                    />
                </TabsContent>

                <TabsContent value="danger">
                    <DangerTab />
                </TabsContent>
            </Tabs>
        </div>
    )
}
