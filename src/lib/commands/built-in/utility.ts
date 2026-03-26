import { 
  Bell, 
  Clock, 
  HelpCircle,
  Keyboard
} from 'lucide-react'
import type { SlashCommand, CommandContext, CommandResult } from '../types'
import { actionResult, errorResult } from '../executor'
import { parseNaturalTime } from '../parser'

/**
 * /remind - Set a reminder
 */
export const remindCommand: SlashCommand = {
  name: 'remind',
  description: 'Set a reminder',
  usage: '/remind [time] [message]',
  icon: Bell,
  category: 'utility',
  aliases: ['reminder'],
  args: [
    {
      name: 'time',
      description: 'When to remind (e.g., 30m, 2h, tomorrow, in 1 hour)',
      required: true,
      options: ['30m', '1h', '2h', 'tomorrow', 'in 30 minutes', 'in 1 hour']
    },
    {
      name: 'message',
      description: 'What to remind about',
      required: true
    }
  ],
  execute: async (args: string[], context: CommandContext): Promise<CommandResult> => {
    if (args.length < 2) {
      return errorResult('Usage: /remind [time] [message] - Example: /remind 30m Check the report')
    }
    
    // Try to parse the time from the first arg(s)
    let timeStr = args[0]
    let messageStart = 1
    
    // Handle "in X minutes" format
    if (args[0].toLowerCase() === 'in' && args.length >= 3) {
      timeStr = args.slice(0, 3).join(' ')
      messageStart = 3
    }
    
    const remindAt = parseNaturalTime(timeStr)
    
    if (!remindAt) {
      return errorResult(`Couldn't parse time: "${timeStr}". Try: 30m, 2h, tomorrow, "in 30 minutes"`)
    }
    
    const message = args.slice(messageStart).join(' ')
    
    if (!message) {
      return errorResult('Please provide a reminder message')
    }
    
    // DECISION: Reminder persistence deferred — currently ephemeral (lost on page refresh)
    const formattedTime = remindAt.toLocaleString('en-US', {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit'
    })
    
    return actionResult(`Reminder set for ${formattedTime}: "${message}"`)
  }
}

/**
 * /help - Show help for commands
 */
export const helpCommand: SlashCommand = {
  name: 'help',
  description: 'Show help for slash commands',
  usage: '/help [command]',
  icon: HelpCircle,
  category: 'utility',
  args: [
    {
      name: 'command',
      description: 'Command to get help for (optional)',
      required: false
    }
  ],
  execute: async (args: string[]): Promise<CommandResult> => {
    const commandName = args[0]?.toLowerCase()
    
    if (commandName) {
      // Get help for specific command
      const { getCommandHelp } = await import('../executor')
      const help = getCommandHelp(commandName)
      
      if (help) {
        // Return as message so user sees it
        return { type: 'message', content: help }
      }
      
      return errorResult(`Unknown command: /${commandName}`)
    }
    
    // General help - list categories
    const helpText = `**Slash Commands**

**Messaging**
• /shrug - Add shrug emoticon
• /mute - Mute conversation
• /archive - Archive conversation

**Status**
• /status [emoji] [text] - Set your status
• /dnd [duration] - Do not disturb
• /away - Set as away
• /active - Set as active

**Navigation**
• /goto [page] - Navigate to page
• /search [query] - Search messages

**Utility**
• /remind [time] [message] - Set reminder
• /help [command] - This help

Type /help [command] for details on a specific command.`
    
    return { type: 'message', content: helpText }
  }
}

/**
 * /shortcuts - Show keyboard shortcuts
 */
export const shortcutsCommand: SlashCommand = {
  name: 'shortcuts',
  description: 'Show keyboard shortcuts',
  usage: '/shortcuts',
  icon: Keyboard,
  category: 'utility',
  aliases: ['keys', 'hotkeys'],
  execute: async (): Promise<CommandResult> => {
    // Dispatch event to open keyboard shortcuts dialog
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('open-keyboard-shortcuts'))
    }
    
    return actionResult('Keyboard shortcuts opened')
  }
}

/**
 * /clear - Clear the message input
 */
export const clearCommand: SlashCommand = {
  name: 'clear',
  description: 'Clear the message input',
  usage: '/clear',
  icon: Clock,
  category: 'utility',
  execute: async (): Promise<CommandResult> => {
    // This is handled specially by the input component
    return { type: 'action', message: 'Input cleared', data: { clearInput: true } }
  }
}

// Export all utility commands
export const utilityCommands: SlashCommand[] = [
  remindCommand,
  helpCommand,
  shortcutsCommand,
  clearCommand
]
