import { 
  Smile, 
  Moon, 
  Coffee, 
  CircleCheck, 
  CircleDot 
} from 'lucide-react'
import type { SlashCommand, CommandContext, CommandResult } from '../types'
import { actionResult, errorResult } from '../executor'

/**
 * /status - Update your status
 */
export const statusCommand: SlashCommand = {
  name: 'status',
  description: 'Update your status message',
  usage: '/status [emoji] [message]',
  icon: Smile,
  category: 'status',
  args: [
    {
      name: 'emoji',
      description: 'Status emoji (optional)',
      required: false
    },
    {
      name: 'message',
      description: 'Status message',
      required: false
    }
  ],
  execute: async (args: string[], context: CommandContext): Promise<CommandResult> => {
    // Parse emoji and message
    let emoji = ''
    let message = ''
    
    if (args.length > 0) {
      // Check if first arg is an emoji (simple check)
      const firstArg = args[0]
      if (/^\p{Emoji}/u.test(firstArg) || firstArg.startsWith(':')) {
        emoji = firstArg
        message = args.slice(1).join(' ')
      } else {
        message = args.join(' ')
      }
    }
    
    // TODO: Integrate with PresenceProvider to update status
    // For now, show what would be set
    const statusText = emoji ? `${emoji} ${message}` : message
    
    if (!statusText) {
      return actionResult('Status cleared')
    }
    
    return actionResult(`Status set to: ${statusText}`)
  }
}

/**
 * /dnd - Do Not Disturb mode
 */
export const dndCommand: SlashCommand = {
  name: 'dnd',
  description: 'Enable Do Not Disturb mode',
  usage: '/dnd [duration]',
  icon: Moon,
  category: 'status',
  aliases: ['donotdisturb'],
  args: [
    {
      name: 'duration',
      description: 'How long (e.g., 30m, 2h, 1d)',
      required: false,
      options: ['30m', '1h', '2h', '4h', 'until tomorrow']
    }
  ],
  execute: async (args: string[], context: CommandContext): Promise<CommandResult> => {
    const duration = args.join(' ') || '1h'
    
    // TODO: Integrate with PresenceProvider
    // dispatch event to trigger focus mode
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('set-dnd', { detail: { duration } }))
    }
    
    return actionResult(`Do Not Disturb enabled for ${duration}`)
  }
}

/**
 * /away - Set status to away
 */
export const awayCommand: SlashCommand = {
  name: 'away',
  description: 'Set your status to away',
  usage: '/away [message]',
  icon: Coffee,
  category: 'status',
  aliases: ['brb'],
  args: [
    {
      name: 'message',
      description: 'Optional away message',
      required: false
    }
  ],
  execute: async (args: string[]): Promise<CommandResult> => {
    const message = args.join(' ')
    
    // TODO: Integrate with PresenceProvider
    if (message) {
      return actionResult(`Status set to away: ${message}`)
    }
    return actionResult('Status set to away')
  }
}

/**
 * /active - Set status to active
 */
export const activeCommand: SlashCommand = {
  name: 'active',
  description: 'Set your status to active',
  usage: '/active',
  icon: CircleCheck,
  category: 'status',
  aliases: ['online', 'back'],
  execute: async (): Promise<CommandResult> => {
    // TODO: Integrate with PresenceProvider
    return actionResult('Status set to active')
  }
}

/**
 * /focus - Enter focus mode
 */
export const focusCommand: SlashCommand = {
  name: 'focus',
  description: 'Enter focus mode (mutes notifications)',
  usage: '/focus [reason]',
  icon: CircleDot,
  category: 'status',
  args: [
    {
      name: 'reason',
      description: 'What you\'re focusing on',
      required: false
    }
  ],
  execute: async (args: string[]): Promise<CommandResult> => {
    const reason = args.join(' ') || 'Deep work'
    
    // Dispatch event for PresenceProvider to handle
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('enter-focus-mode', { 
        detail: { reason } 
      }))
    }
    
    return actionResult(`Focus mode enabled: ${reason}`)
  }
}

// Export all status commands
export const statusCommands: SlashCommand[] = [
  statusCommand,
  dndCommand,
  awayCommand,
  activeCommand,
  focusCommand
]
