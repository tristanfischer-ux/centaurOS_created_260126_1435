'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import { createClient } from '@/lib/supabase/client'
import { usePresenceContext } from '@/components/PresenceProvider'
import { 
  Plus, 
  Target, 
  Users, 
  CheckSquare, 
  Clock, 
  Store, 
  Settings, 
  Bell,
  Focus,
  ClipboardCheck,
  FileText,
  Calendar,
  Keyboard,
  Moon,
  Sun,
  Eye,
  EyeOff,
  Lightbulb,
  Sparkles,
  Home,
  FileUp,
} from 'lucide-react'
import { toast } from 'sonner'
import { QuickCaptureDialog } from '@/components/smart/quick-capture-dialog'
import { TranscriptImportDialog } from '@/components/strategy/transcript-import-dialog'
import { useAdvisorPanel } from '@/contexts/advisor-panel-context'

import type { SmartGoalSuggestion } from '@/actions/smart-goals'

interface Task {
  id: string
  title: string
  status: string | null
}

interface Objective {
  id: string
  title: string
}

interface TeamMember {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [captureOpen, setCaptureOpen] = useState(false)
  const [transcriptImportOpen, setTranscriptImportOpen] = useState(false)
  const [tasks, setTasks] = useState<Task[]>([])
  const [objectives, setObjectives] = useState<Objective[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0)
  const [userRole, setUserRole] = useState<string | null>(null)
  const router = useRouter()
  const { myPresence, goFocus, goOnline } = usePresenceContext()
  const advisorPanel = useAdvisorPanel()

  const handleCaptureObjective = useCallback((rawIdea: string, suggestion?: SmartGoalSuggestion) => {
    const prefillText = suggestion?.title || rawIdea
    router.push(`/new-objectives?prefill=${encodeURIComponent(prefillText)}`)
  }, [router])

  const handleCaptureTask = useCallback((rawIdea: string, suggestion?: SmartGoalSuggestion) => {
    const prefillText = suggestion?.title || rawIdea
    router.push(`/new-tasks?prefill=${encodeURIComponent(prefillText)}`)
  }, [router])

  const toggleFocusMode = useCallback(() => {
    if (myPresence?.status === 'focus') {
      goOnline()
      toast.success('Focus mode disabled')
    } else {
      goFocus('Deep work time')
      toast.success('Focus mode enabled - notifications muted')
    }
  }, [myPresence, goFocus, goOnline])

  // Keyboard shortcuts
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Cmd+K / Ctrl+K - Open command palette
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
      // Cmd+N - New task (when not in input)
      if (e.key === 'n' && (e.metaKey || e.ctrlKey) && !isInputElement(e.target)) {
        e.preventDefault()
        router.push('/new-tasks')
      }
      // Cmd+Shift+F - Toggle focus mode
      if (e.key === 'f' && (e.metaKey || e.ctrlKey) && e.shiftKey && !isInputElement(e.target)) {
        e.preventDefault()
        toggleFocusMode()
      }
      // Cmd+Shift+E - Toggle advisor panel fullscreen (only when panel is open)
      if (e.key === 'e' && (e.metaKey || e.ctrlKey) && e.shiftKey && !isInputElement(e.target)) {
        e.preventDefault()
        if (advisorPanel.isOpen && advisorPanel.activeSpecialist) {
          advisorPanel.toggleFullscreen()
        }
      }
      // Cmd+/ - Show keyboard shortcuts
      if (e.key === '/' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        // Dispatch custom event to open keyboard shortcuts dialog
        window.dispatchEvent(new CustomEvent('open-keyboard-shortcuts'))
      }
    }

    const isInputElement = (target: EventTarget | null): boolean => {
      if (!target) return false
      const element = target as HTMLElement
      return element.tagName === 'INPUT' || 
             element.tagName === 'TEXTAREA' || 
             element.isContentEditable
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [router, toggleFocusMode, advisorPanel])

  const loadData = useCallback(async (isMounted: () => boolean) => {
    try {
      const supabase = createClient()
      
      // Get current user's role
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      
      // SECURITY: Get user's foundry_id to scope queries (RLS disabled on profiles)
      let foundryId: string | null = null
      if (user && isMounted()) {
        const { data: profile, error: profileError } = await supabase.from('profiles').select('role, foundry_id').eq('id', user.id).single()
        if (profileError && profileError.code !== 'PGRST116') throw profileError
        if (isMounted()) setUserRole(profile?.role || null)
        foundryId = profile?.foundry_id || null
      }
      
      if (!foundryId) return
      
      // Fetch tasks
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('id, title, status')
        .eq('is_ghost', false)
        .is('deleted_at', null)
        .eq('foundry_id', foundryId)
        .order('updated_at', { ascending: false })
        .limit(50)
      if (tasksError) throw tasksError
      if (isMounted()) setTasks(tasksData || [])
      
      // Fetch pending approval count
      const { data: pendingData, error: pendingError } = await supabase
        .from('tasks')
        .select('id')
        .eq('is_ghost', false)
        .is('deleted_at', null)
        .eq('foundry_id', foundryId)
        .in('status', ['Pending_Executive_Approval', 'Amended_Pending_Approval'])
      if (pendingError) throw pendingError
      if (isMounted()) setPendingApprovalCount(pendingData?.length || 0)
      
      // Fetch objectives
      const { data: objectivesData, error: objectivesError } = await supabase
        .from('objectives')
        .select('id, title')
        .eq('is_ghost', false)
        .is('deleted_at', null)
        .eq('foundry_id', foundryId)
        .order('updated_at', { ascending: false })
        .limit(20)
      if (objectivesError) throw objectivesError
      if (isMounted()) setObjectives(objectivesData || [])
      
      // Fetch team members
      // SECURITY: Scope to foundry (RLS disabled on profiles)
      const { data: membersData, error: membersError } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('foundry_id', foundryId)
        .limit(50)
      if (membersError) throw membersError
      if (isMounted()) setTeamMembers(membersData || [])
    } catch (error) {
      console.error('Error loading command palette data:', error)
    }
  }, [])

  // Load data when opened
  useEffect(() => {
    let mounted = true
    const isMounted = () => mounted
    
    if (open) {
      loadData(isMounted)
    }
    
    return () => {
      mounted = false
    }
  }, [open, loadData])

  const isExecutive = userRole === 'Executive' || userRole === 'Founder'
  const isFocusMode = myPresence?.status === 'focus'

  return (
    <>
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        
        {/* Quick Actions - Most Used */}
        <CommandGroup heading="Quick Actions">
          <CommandItem onSelect={() => { setOpen(false); setCaptureOpen(true) }}>
            <Lightbulb className="mr-2 h-4 w-4 text-international-orange" />
            Capture an Idea
            <span className="ml-auto text-xs text-muted-foreground">AI-guided</span>
          </CommandItem>
          <CommandItem onSelect={() => { router.push('/new-tasks'); setOpen(false) }}>
            <Plus className="mr-2 h-4 w-4" />
            New Task
            <span className="ml-auto text-xs text-muted-foreground">⌘N</span>
          </CommandItem>
          <CommandItem onSelect={() => { router.push('/new-objectives'); setOpen(false) }}>
            <Target className="mr-2 h-4 w-4" />
            New Objective
          </CommandItem>
          <CommandItem onSelect={() => { setOpen(false); setTranscriptImportOpen(true) }}>
            <FileUp className="mr-2 h-4 w-4" />
            Import Transcript
            <span className="ml-auto text-xs text-muted-foreground">Auto-extract</span>
          </CommandItem>
          <CommandItem onSelect={() => { toggleFocusMode(); setOpen(false) }}>
            <Focus className="mr-2 h-4 w-4" />
            {isFocusMode ? 'Exit Focus Mode' : 'Enter Focus Mode'}
            <span className="ml-auto text-xs text-muted-foreground">⌘⇧F</span>
          </CommandItem>
        </CommandGroup>

        {/* Executive Actions */}
        {isExecutive && pendingApprovalCount > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Approvals">
              <CommandItem 
                onSelect={() => { 
                  // Dispatch event to open batch approval sheet
                  window.dispatchEvent(new CustomEvent('open-batch-approvals'))
                  setOpen(false) 
                }}
              >
                <ClipboardCheck className="mr-2 h-4 w-4 text-status-warning" />
                Review Pending Approvals
                <span className="ml-auto bg-status-warning-light text-status-warning-dark text-xs px-2 py-0.5 rounded-full">
                  {pendingApprovalCount}
                </span>
              </CommandItem>
            </CommandGroup>
          </>
        )}

        <CommandSeparator />

        {/* Recent Tasks */}
        {tasks.length > 0 && (
          <CommandGroup heading="Recent Tasks">
            {tasks.slice(0, 5).map(task => (
              <CommandItem 
                key={task.id} 
                onSelect={() => { router.push(`/new-tasks?taskId=${task.id}`); setOpen(false) }}
              >
                <CheckSquare className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="truncate">{task.title}</span>
                {task.status && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {task.status.replace(/_/g, ' ')}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Recent Objectives */}
        {objectives.length > 0 && (
          <CommandGroup heading="Objectives">
            {objectives.slice(0, 5).map(obj => (
              <CommandItem 
                key={obj.id} 
                onSelect={() => { router.push(`/new-objectives`); setOpen(false) }}
              >
                <Target className="mr-2 h-4 w-4 text-muted-foreground" />
                <span className="truncate">{obj.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Team Members */}
        {teamMembers.length > 0 && (
          <CommandGroup heading="People">
            {teamMembers.slice(0, 5).map(member => (
              <CommandItem 
                key={member.id} 
                onSelect={() => { router.push(`/team/${member.id}`); setOpen(false) }}
              >
                <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>{member.full_name || member.email}</span>
                {member.role && (
                  <span className="ml-auto text-xs text-muted-foreground">{member.role}</span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />

        {/* Navigation */}
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => { router.push('/home'); setOpen(false) }}>
            <Home className="mr-2 h-4 w-4" />
            Home
          </CommandItem>
          <CommandItem onSelect={() => { router.push('/updates'); setOpen(false) }}>
            <Bell className="mr-2 h-4 w-4" />
            Updates
          </CommandItem>
          <CommandItem onSelect={() => { router.push('/new-objectives'); setOpen(false) }}>
            <Target className="mr-2 h-4 w-4" />
            Objectives
          </CommandItem>
          <CommandItem onSelect={() => { router.push('/new-tasks'); setOpen(false) }}>
            <CheckSquare className="mr-2 h-4 w-4" />
            Tasks
          </CommandItem>
          <CommandItem onSelect={() => { router.push('/team'); setOpen(false) }}>
            <Users className="mr-2 h-4 w-4" />
            Team Roster
          </CommandItem>
          <CommandItem onSelect={() => { router.push('/timeline'); setOpen(false) }}>
            <Calendar className="mr-2 h-4 w-4" />
            Timeline
          </CommandItem>
          <CommandItem onSelect={() => { router.push('/marketplace'); setOpen(false) }}>
            <Store className="mr-2 h-4 w-4" />
            Marketplace
          </CommandItem>
          <CommandItem onSelect={() => { router.push('/settings'); setOpen(false) }}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Utilities */}
        <CommandGroup heading="Utilities">
          <CommandItem onSelect={() => { 
            window.dispatchEvent(new CustomEvent('open-keyboard-shortcuts'))
            setOpen(false) 
          }}>
            <Keyboard className="mr-2 h-4 w-4" />
            Keyboard Shortcuts
            <span className="ml-auto text-xs text-muted-foreground">⌘/</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>

    {/* Quick Capture Dialog - Opened from command palette */}
    <QuickCaptureDialog
      open={captureOpen}
      onOpenChange={setCaptureOpen}
      onCreateObjective={handleCaptureObjective}
      onCreateTask={handleCaptureTask}
    />

    {/* Transcript Import Dialog - Opened from command palette */}
    <TranscriptImportDialog
      open={transcriptImportOpen}
      onOpenChange={setTranscriptImportOpen}
      onComplete={() => router.refresh()}
    />
    </>
  )
}
