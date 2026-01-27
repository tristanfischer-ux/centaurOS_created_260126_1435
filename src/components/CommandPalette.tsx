'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { createClient } from '@/lib/supabase/client'

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
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [tasks, setTasks] = useState<Task[]>([])
  const [objectives, setObjectives] = useState<Objective[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const router = useRouter()

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  // Load data when opened
  useEffect(() => {
    if (open) {
      loadData()
    }
  }, [open])

  const loadData = useCallback(async () => {
    const supabase = createClient()
    
    // Fetch tasks
    const { data: tasksData } = await supabase
      .from('tasks')
      .select('id, title, status')
      .limit(50)
    setTasks(tasksData || [])
    
    // Fetch objectives
    const { data: objectivesData } = await supabase
      .from('objectives')
      .select('id, title')
      .limit(20)
    setObjectives(objectivesData || [])
    
    // Fetch team members
    const { data: membersData } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .limit(50)
    setTeamMembers(membersData || [])
  }, [])

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search tasks, objectives, people..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        
        <CommandGroup heading="Quick Actions">
          <CommandItem onSelect={() => { router.push('/tasks'); setOpen(false) }}>
            📋 Create Task
          </CommandItem>
          <CommandItem onSelect={() => { router.push('/objectives'); setOpen(false) }}>
            🎯 Create Objective
          </CommandItem>
          <CommandItem onSelect={() => { router.push('/team'); setOpen(false) }}>
            👥 View Team
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading="Tasks">
          {tasks.slice(0, 5).map(task => (
            <CommandItem key={task.id} onSelect={() => { router.push(`/tasks?task=${task.id}`); setOpen(false) }}>
              {task.title}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Objectives">
          {objectives.slice(0, 5).map(obj => (
            <CommandItem key={obj.id} onSelect={() => { router.push(`/objectives/${obj.id}`); setOpen(false) }}>
              {obj.title}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => { router.push('/objectives'); setOpen(false) }}>Objectives</CommandItem>
          <CommandItem onSelect={() => { router.push('/tasks'); setOpen(false) }}>Tasks</CommandItem>
          <CommandItem onSelect={() => { router.push('/team'); setOpen(false) }}>Roster</CommandItem>
          <CommandItem onSelect={() => { router.push('/marketplace'); setOpen(false) }}>Marketplace</CommandItem>
          <CommandItem onSelect={() => { router.push('/timeline'); setOpen(false) }}>Timeline</CommandItem>
          <CommandItem onSelect={() => { router.push('/settings'); setOpen(false) }}>Settings</CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
