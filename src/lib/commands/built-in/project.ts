import { 
  CheckSquare, 
  Target, 
  FileText,
  Sunrise
} from 'lucide-react'
import type { SlashCommand, CommandContext, CommandResult } from '../types'
import { actionResult, errorResult, navigateResult, messageResult } from '../executor'

/**
 * /task - Create a task from conversation context
 */
export const taskCommand: SlashCommand = {
  name: 'task',
  description: 'Create a new task',
  usage: '/task [title]',
  icon: CheckSquare,
  category: 'project',
  aliases: ['newtask'],
  args: [
    {
      name: 'title',
      description: 'Task title',
      required: true
    }
  ],
  execute: async (args: string[]): Promise<CommandResult> => {
    const title = args.join(' ')
    
    if (!title) {
      return errorResult('Usage: /task [title] - Example: /task Review the proposal')
    }
    
    // Navigate to tasks page with pre-filled title to create task
    return navigateResult(`/tasks?new=true&title=${encodeURIComponent(title)}`)
  }
}

/**
 * /objective - Create a new objective
 */
export const objectiveCommand: SlashCommand = {
  name: 'objective',
  description: 'Create a new objective',
  usage: '/objective [title]',
  icon: Target,
  category: 'project',
  aliases: ['newobjective', 'obj'],
  args: [
    {
      name: 'title',
      description: 'Objective title',
      required: true
    }
  ],
  execute: async (args: string[]): Promise<CommandResult> => {
    const title = args.join(' ')
    
    if (!title) {
      return errorResult('Usage: /objective [title]')
    }
    
    // Navigate to objectives with pre-filled title
    return navigateResult(`/objectives?new=true&title=${encodeURIComponent(title)}`)
  }
}

/**
 * /standup - Post a daily standup update
 */
export const standupCommand: SlashCommand = {
  name: 'standup',
  description: 'Share your daily standup',
  usage: '/standup [yesterday] | [today] | [blockers]',
  icon: Sunrise,
  category: 'project',
  args: [
    {
      name: 'update',
      description: 'Your standup (separate sections with |)',
      required: true
    }
  ],
  execute: async (args: string[]): Promise<CommandResult> => {
    const fullInput = args.join(' ')
    const parts = fullInput.split('|').map(p => p.trim())
    
    if (parts.length < 2) {
      return errorResult('Usage: /standup [yesterday] | [today] | [blockers]\nSeparate sections with |')
    }
    
    const [yesterday, today, blockers] = parts
    
    let content = `🌅 **Daily Standup**\n\n`
    content += `**Yesterday:** ${yesterday || 'Nothing to report'}\n\n`
    content += `**Today:** ${today || 'TBD'}\n\n`
    
    if (blockers) {
      content += `**Blockers:** ${blockers}`
    } else {
      content += `**Blockers:** None 🎉`
    }
    
    return messageResult(content)
  }
}

/**
 * /note - Create a quick note/memo
 */
export const noteCommand: SlashCommand = {
  name: 'note',
  description: 'Create a quick note',
  usage: '/note [content]',
  icon: FileText,
  category: 'project',
  aliases: ['memo'],
  args: [
    {
      name: 'content',
      description: 'Note content',
      required: true
    }
  ],
  execute: async (args: string[]): Promise<CommandResult> => {
    const content = args.join(' ')
    
    if (!content) {
      return errorResult('Usage: /note [content]')
    }
    
    // Format as a note
    const noteContent = `📝 **Note**\n${content}`
    return messageResult(noteContent)
  }
}

// Export all project commands
export const projectCommands: SlashCommand[] = [
  taskCommand,
  objectiveCommand,
  standupCommand,
  noteCommand
]
