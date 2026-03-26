import { 
  MessageSquare, 
  VolumeX, 
  Archive, 
  Sparkles,
  TableProperties
} from 'lucide-react'
import type { SlashCommand, CommandContext, CommandResult } from '../types'
import { messageResult, actionResult, errorResult } from '../executor'

/**
 * /shrug - Append shrug emoticon to message
 */
export const shrugCommand: SlashCommand = {
  name: 'shrug',
  description: 'Append a shrug emoticon to your message',
  usage: '/shrug [message]',
  icon: Sparkles,
  category: 'messaging',
  args: [
    {
      name: 'message',
      description: 'Optional message to prepend',
      required: false
    }
  ],
  execute: async (args: string[]): Promise<CommandResult> => {
    const message = args.join(' ')
    const shrug = '¯\\_(ツ)_/¯'
    const content = message ? `${message} ${shrug}` : shrug
    return messageResult(content)
  }
}

/**
 * /tableflip - Append tableflip emoticon
 */
export const tableflipCommand: SlashCommand = {
  name: 'tableflip',
  description: 'Flip a table in frustration',
  usage: '/tableflip [message]',
  icon: TableProperties,
  category: 'messaging',
  aliases: ['flip'],
  args: [
    {
      name: 'message',
      description: 'Optional message to prepend',
      required: false
    }
  ],
  execute: async (args: string[]): Promise<CommandResult> => {
    const message = args.join(' ')
    const flip = '(╯°□°)╯︵ ┻━┻'
    const content = message ? `${message} ${flip}` : flip
    return messageResult(content)
  }
}

/**
 * /unflip - Put the table back
 */
export const unflipCommand: SlashCommand = {
  name: 'unflip',
  description: 'Put the table back calmly',
  usage: '/unflip [message]',
  icon: TableProperties,
  category: 'messaging',
  execute: async (args: string[]): Promise<CommandResult> => {
    const message = args.join(' ')
    const unflip = '┬─┬ノ( º _ ºノ)'
    const content = message ? `${message} ${unflip}` : unflip
    return messageResult(content)
  }
}

/**
 * /lenny - Lenny face
 */
export const lennyCommand: SlashCommand = {
  name: 'lenny',
  description: 'Send a Lenny face',
  usage: '/lenny [message]',
  icon: Sparkles,
  category: 'messaging',
  execute: async (args: string[]): Promise<CommandResult> => {
    const message = args.join(' ')
    const lenny = '( ͡° ͜ʖ ͡°)'
    const content = message ? `${message} ${lenny}` : lenny
    return messageResult(content)
  }
}

/**
 * /mute - Mute current conversation
 */
export const muteCommand: SlashCommand = {
  name: 'mute',
  description: 'Mute notifications for this conversation',
  usage: '/mute',
  icon: VolumeX,
  category: 'messaging',
  execute: async (_args: string[], context: CommandContext): Promise<CommandResult> => {
    if (!context.conversationId) {
      return errorResult('No conversation selected')
    }
    
    // DECISION: Mute functionality deferred — returns placeholder message
    return actionResult('Conversation muted (feature coming soon)')
  }
}

/**
 * /unmute - Unmute current conversation
 */
export const unmuteCommand: SlashCommand = {
  name: 'unmute',
  description: 'Unmute notifications for this conversation',
  usage: '/unmute',
  icon: VolumeX,
  category: 'messaging',
  execute: async (_args: string[], context: CommandContext): Promise<CommandResult> => {
    if (!context.conversationId) {
      return errorResult('No conversation selected')
    }
    
    // DECISION: Unmute functionality deferred — returns placeholder message
    return actionResult('Conversation unmuted (feature coming soon)')
  }
}

/**
 * /archive - Archive current conversation
 */
export const archiveCommand: SlashCommand = {
  name: 'archive',
  description: 'Archive this conversation',
  usage: '/archive',
  icon: Archive,
  category: 'messaging',
  execute: async (_args: string[], context: CommandContext): Promise<CommandResult> => {
    if (!context.conversationId) {
      return errorResult('No conversation selected')
    }
    
    try {
      const { archiveConversation } = await import('@/actions/messaging')
      const result = await archiveConversation(context.conversationId)
      
      if (result.success) {
        return actionResult('Conversation archived')
      } else {
        return errorResult(result.error || 'Failed to archive conversation')
      }
    } catch (error) {
      return errorResult('Failed to archive conversation')
    }
  }
}

/**
 * /msg - Quick DM to a user
 */
export const msgCommand: SlashCommand = {
  name: 'msg',
  description: 'Send a quick DM to someone',
  usage: '/msg @user message',
  icon: MessageSquare,
  category: 'messaging',
  aliases: ['dm'],
  args: [
    {
      name: 'user',
      description: 'User to message (@mention or name)',
      required: true
    },
    {
      name: 'message',
      description: 'Message to send',
      required: true
    }
  ],
  execute: async (args: string[], context: CommandContext): Promise<CommandResult> => {
    if (args.length < 2) {
      return errorResult('Usage: /msg @user message')
    }
    
    const userRef = args[0]
    const message = args.slice(1).join(' ')
    
    if (!message) {
      return errorResult('Please provide a message')
    }
    
    // DECISION: Quick DM lookup deferred — requires user search + conversation creation
    return errorResult(`Quick DM to ${userRef} is not yet implemented`)
  }
}

// Export all messaging commands
export const messagingCommands: SlashCommand[] = [
  shrugCommand,
  tableflipCommand,
  unflipCommand,
  lennyCommand,
  muteCommand,
  unmuteCommand,
  archiveCommand,
  msgCommand
]
