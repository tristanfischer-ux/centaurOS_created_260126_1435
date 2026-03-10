import type { ConversationWithParticipants } from '@/lib/messaging/service'

/**
 * Derives a human-readable display name for a conversation.
 *
 * @description Handles task channels (#number: title), objective channels,
 * titled conversations, and DM/expert fallback to the other participant's name.
 */
export function getConversationDisplayName(
  conv: ConversationWithParticipants,
  currentUserId: string
): string {
  if (conv.conversation_type === 'task' && conv.task) {
    return `#${conv.task.task_number}: ${conv.task.title}`
  }
  if (conv.conversation_type === 'objective' && conv.objective) {
    return conv.objective.title
  }
  if (conv.title) {
    return conv.title
  }
  const otherParticipant = conv.buyer?.id === currentUserId ? conv.seller : conv.buyer
  return otherParticipant?.full_name || otherParticipant?.email || 'Unknown'
}
