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
  LayoutDashboard,
  Focus,
  ClipboardCheck,
  FileText,
  Calendar,
  Keyboard,
  Moon,
  Sun,
  Eye,
  EyeOff
} from 'lucide-react'
import { toast } from 'sonner'

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
  const [tasks, setTasks] = useState<Task[]>([])
  const [objectives, setObjectives] = useState<Objective[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0)
  const [userRole, setUserRole] = useState<string | null>(null)
  const router = useRouter()
  const { myPresence, goFocus, goOnline } = usePresenceContext()

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
        router.push('/tasks')
      }
      // Cmd+Shift+F - Toggle focus mode
      if (e.key === 'f' && (e.metaKey || e.ctrlKey) && e.shiftKey && !isInputElement(e.target)) {
        e.preventDefault()
        toggleFocusMode()
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
  }, [router, toggleFocusMode])

  const toggleFocusMode = useCallback(() => {
    if (myPresence?.status === 'focus') {
      goOnline()
      toast.success('Focus mode disabled')
    } else {
      goFocus('Deep work time')
      toast.success('Focus mode enabled - notifications muted')
    }
  }, [myPresence, goFocus, goOnline])

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

  const loadData = useCallback(async (isMounted: () => boolean) => {
    try {
      const supabase = createClient()
      
      // Get current user's role
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      
      if (user && isMounted()) {
        const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        if (profileError && profileError.code !== 'PGRST116') throw profileError
        if (isMounted()) setUserRole(profile?.role || null)
      }
      
      // Fetch tasks
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('id, title, status')
        .order('updated_at', { ascending: false })
        .limit(50)
      if (tasksError) throw tasksError
      if (isMounted()) setTasks(tasksData || [])
      
      // Fetch pending approval count
      const { data: pendingData, error: pendingError } = await supabase
        .from('tasks')
        .select('id')
        .in('status', ['Pending_Executive_Approval', 'Amended_Pending_Approval'])
      if (pendingError) throw pendingError
      if (isMounted()) setPendingApprovalCount(pendingData?.length || 0)
      
      // Fetch objectives
      const { data: objectivesData, error: objectivesError } = await supabase
        .from('objectives')
        .select('id, title')
        .order('updated_at', { ascending: false })
        .limit(20)
      if (objectivesError) throw objectivesError
      if (isMounted()) setObjectives(objectivesData || [])
      
      // Fetch team members
      const { data: membersData, error: membersError } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .limit(50)
      if (membersError) throw membersError
      if (isMounted()) setTeamMembers(membersData || [])
    } catch (error) {
      console.error('Error loading command palette data:', error)
    }
  }, [])

  const isExecutive = userRole === 'Executive' || userRole === 'Founder'
  const isFocusMode = myPresence?.status === 'focus'

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        
        {/* Quick Actions - Most Used */}
        <CommandGroup heading="Quick Actions">
          <CommandItem onSelect={() => { router.push('/tasks'); setOpen(false) }}>
            <Plus className="mr-2 h-4 w-4" />
            New Task
            <span className="ml-auto text-xs text-muted-foreground">⌘N</span>
          </CommandItem>
          <CommandItem onSelect={() => { router.push('/objectives'); setOpen(false) }}>
            <Target className="mr-2 h-4 w-4" />
            New Objective
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
                <ClipboardCheck className="mr-2 h-4 w-4 text-amber-500" />
                Review Pending Approvals
                <span className="ml-auto bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">
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
                onSelect={() => { router.push(`/tasks?task=${task.id}`); setOpen(false) }}
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
                onSelect={() => { router.push(`/objectives/${obj.id}`); setOpen(false) }}
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
          <CommandItem onSelect={() => { router.push('/dashboard'); setOpen(false) }}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Dashboard
          </CommandItem>
          <CommandItem onSelect={() => { router.push('/objectives'); setOpen(false) }}>
            <Target className="mr-2 h-4 w-4" />
            Objectives
          </CommandItem>
          <CommandItem onSelect={() => { router.push('/tasks'); setOpen(false) }}>
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
  )
}
