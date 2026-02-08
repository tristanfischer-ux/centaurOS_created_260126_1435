'use client'

import { useState } from 'react'
import { DashboardHero } from '@/components/dashboard/dashboard-hero'
import { PriorityQueue } from '@/components/dashboard/priority-queue'
import { ObjectiveCards } from '@/components/dashboard/objective-cards'
import { TeamPulse } from '@/components/dashboard/team-pulse'
import { ActivityFeed } from '@/components/dashboard/activity-feed'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { ProductivityChart } from '@/components/dashboard/productivity-chart'
import { StatsCards } from '@/components/dashboard/stats-cards'
import { RecommendedForYou } from '@/components/dashboard/recommended-for-you'
import { MarketplaceSpotlight } from '@/components/dashboard/marketplace-spotlight'
import { WorkflowTemplatesPreview } from '@/components/dashboard/workflow-templates-preview'
import { FoundingMemberCard } from '@/components/dashboard/founding-member-card'
import { UpcomingEvents } from '@/components/dashboard/upcoming-events'

interface User {
  id: string
  fullName: string
  role: string
  avatarUrl: string | null
}

interface Task {
  id: string
  title: string
  status: string
  start_date: string | null
  end_date: string | null
  task_number?: number
  created_at: string
  objective?: { id: string; title: string; status: string } | null
  creator?: { id: string; full_name: string | null } | null
  assignee?: { id: string; full_name: string | null; avatar_url?: string | null } | null
}

interface Objective {
  id: string
  title: string
  description?: string | null
  status: string
  progress?: number | null
  start_date: string | null
  end_date: string | null
  created_at: string
  creator?: { id: string; full_name: string | null; avatar_url?: string | null } | null
  is_strategic_goal?: boolean | null
}

interface TeamMember {
  id: string
  full_name: string | null
  avatar_url: string | null
  role: string | null
  status: 'online' | 'away' | 'focus' | 'offline'
  last_seen: string | null
  current_task: { id: string; title: string; task_number?: number } | null
}

interface Activity {
  type: string
  timestamp: string
  task_id?: string
  task_title?: string
  task_number?: number
  objective_id?: string
  objective_title?: string
  user: { id: string; full_name: string | null; avatar_url?: string | null } | null
}

interface TaskCompletionStat {
  date: string
  label: string
  myTasks: number
  teamTasks: number
}

interface Blocker {
  id: string
  blockers: string
  blocker_severity: string | null
  needs_help: boolean
  user: { id: string; full_name: string | null; avatar_url?: string | null }
}

interface UnreadCounts {
  direct: number
  task: number
  total: number
}

interface FeaturedListing {
  id: string
  title: string
  description: string | null
  category: string
  subcategory: string
  is_verified: boolean | null
  image_url: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attributes: any
}

interface WorkflowTemplate {
  id: string
  name: string
  description: string
  category: string
  nodeCount: number
  icon: string
}

export interface DashboardClientProps {
  user: User
  foundryId: string
  myTasks: Task[]
  objectives: Objective[]
  teamPresence: TeamMember[]
  recentActivity: Activity[]
  taskCompletionStats: TaskCompletionStat[]
  overdueTasks: Task[]
  tasksDueToday: Task[]
  tasksDueThisWeek: Task[]
  blockers: Blocker[]
  pendingDecisions: Task[]
  unreadCounts: UnreadCounts
  isExecutiveOrFounder: boolean
  featuredListings: FeaturedListing[]
  workflowTemplates: WorkflowTemplate[]
  dailyFocus: string
}

/**
 * Dashboard Client Component
 * 
 * Redesigned command center that drives action:
 * - Hero with daily focus and clickable metrics
 * - Priority queue + Quick Actions with Discovery section
 * - Objectives with contextual nudges
 * - Recommended for You (revenue driver)
 * - Marketplace Spotlight (revenue driver)
 * - Workflow Templates (revenue driver)
 * - Team pulse + Activity feed
 * - Productivity chart
 * 
 * Mobile ordering prioritises: Priority Queue -> Quick Actions -> 
 * Recommendations -> Objectives -> Marketplace -> Workflows -> Team -> Activity
 */
export function DashboardClient({
  user,
  foundryId,
  myTasks,
  objectives,
  teamPresence,
  recentActivity,
  taskCompletionStats,
  overdueTasks,
  tasksDueToday,
  tasksDueThisWeek,
  blockers,
  pendingDecisions,
  unreadCounts,
  isExecutiveOrFounder,
  featuredListings,
  workflowTemplates,
  dailyFocus,
}: DashboardClientProps) {
  const [selectedView, setSelectedView] = useState<'overview' | 'tasks' | 'team'>('overview')
  
  // Calculate key metrics
  const totalTasks = myTasks.length
  const todayTasks = tasksDueToday.filter(t => 
    myTasks.some(mt => mt.id === t.id)
  ).length
  const overdueCount = overdueTasks.filter(t => 
    myTasks.some(mt => mt.id === t.id)
  ).length
  const activeObjectives = objectives.filter(o => o.status === 'Active' || o.status === 'In_Progress').length
  const teamOnline = teamPresence.filter(m => m.status === 'online' || m.status === 'focus').length
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-orange-50/30">
      {/* Hero Section */}
      <DashboardHero
        userName={user.fullName}
        userRole={user.role}
        totalTasks={totalTasks}
        todayTasks={todayTasks}
        overdueCount={overdueCount}
        unreadCount={unreadCounts.total}
        activeObjectives={activeObjectives}
        dailyFocus={dailyFocus}
        onViewChange={setSelectedView}
        selectedView={selectedView}
      />
      
      {/* Main Dashboard Grid */}
      <div className="px-4 sm:px-6 lg:px-8 pb-8 space-y-6">
        {/* Stats Cards Row */}
        <StatsCards
          totalTasks={totalTasks}
          todayTasks={todayTasks}
          overdueCount={overdueCount}
          activeObjectives={activeObjectives}
          teamOnline={teamOnline}
          teamTotal={teamPresence.length}
          unreadMessages={unreadCounts.total}
          isExecutiveOrFounder={isExecutiveOrFounder}
          blockersCount={blockers.length}
          pendingDecisionsCount={pendingDecisions.length}
        />
        
        {/* Main Content Grid */}
        {selectedView === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Actions & Priority */}
            <div className="lg:col-span-1 space-y-6 order-2 lg:order-1">
              <FoundingMemberCard />
              <QuickActions foundryId={foundryId} />
              <PriorityQueue
                myTasks={myTasks}
                overdueTasks={overdueTasks}
                tasksDueToday={tasksDueToday}
                userId={user.id}
              />
              <ProductivityChart data={taskCompletionStats} />
            </div>
            
            {/* Middle Column - Objectives & Recommendations */}
            <div className="lg:col-span-1 space-y-6 order-1 lg:order-2">
              <RecommendedForYou
                objectives={objectives}
                teamSize={teamPresence.length}
                taskCount={totalTasks}
                hasWorkflows={false}
              />
              <ObjectiveCards objectives={objectives} />
            </div>
            
            {/* Right Column - Discovery (Revenue) & Team */}
            <div className="lg:col-span-1 space-y-6 order-3">
              <UpcomingEvents />
              <MarketplaceSpotlight featuredListings={featuredListings} />
              <WorkflowTemplatesPreview templates={workflowTemplates} />
              <TeamPulse teamMembers={teamPresence} />
              <ActivityFeed activities={recentActivity} />
            </div>
          </div>
        )}
        
        {selectedView === 'tasks' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PriorityQueue
              myTasks={myTasks}
              overdueTasks={overdueTasks}
              tasksDueToday={tasksDueToday}
              userId={user.id}
            />
            <div className="space-y-6">
              <ObjectiveCards objectives={objectives} />
              <ProductivityChart data={taskCompletionStats} />
            </div>
          </div>
        )}
        
        {selectedView === 'team' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TeamPulse teamMembers={teamPresence} expanded />
            <ActivityFeed activities={recentActivity} expanded />
          </div>
        )}
      </div>
    </div>
  )
}
