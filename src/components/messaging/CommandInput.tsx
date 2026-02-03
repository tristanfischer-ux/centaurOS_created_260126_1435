'use client'

import { useState, useRef, useEffect, useCallback, KeyboardEvent, FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/ui/user-avatar'
import { MessageInputHelp } from '@/components/messaging/MessageInputHelp'
import { cn } from '@/lib/utils'
import { 
  Send, 
  Paperclip, 
  Loader2,
  Slash,
  AtSign,
  Hash,
  CheckSquare
} from 'lucide-react'
import { getMentionAtCursor } from '@/lib/mentions'
import { 
  getCommandAtCursor, 
  searchCommands, 
  executeCommand,
  shouldExecuteAsCommand,
  type SlashCommand,
  type CommandContext,
  type CommandSuggestion
} from '@/lib/commands'
import { useInputWithHistory } from '@/hooks/useInputHistory'
import { useDraft } from '@/hooks/useDraft'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface Profile {
  id: string
  full_name: string
  email: string
}

interface Task {
  id: string
  title: string
  task_number?: number
  status?: string | null
}

interface CommandInputProps {
  conversationId: string | null
  currentUserId: string
  foundryId: string
  members: Profile[]
  /** Optional list of tasks for # task references */
  tasks?: Task[]
  onSend: (content: string) => Promise<boolean>
  /** Callback to handle task references in messages */
  onTaskReference?: (taskId: string, content: string) => Promise<void>
  onFileClick?: () => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

type AutocompleteMode = 'none' | 'command' | 'mention' | 'task'

export function CommandInput({
  conversationId,
  currentUserId,
  foundryId,
  members,
  tasks = [],
  onSend,
  onTaskReference,
  onFileClick,
  placeholder = "Type a message... (/ for commands)",
  className,
  disabled = false
}: CommandInputProps) {
  const router = useRouter()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [mounted, setMounted] = useState(false)
  
  // Draft auto-save
  const { draft, setDraft, clearDraft } = useDraft(conversationId)
  
  // Input with history
  const {
    value: inputValue,
    setValue: setInputValue,
    handleUpArrow,
    handleDownArrow,
    handleSend: addToHistory
  } = useInputWithHistory(draft)
  
  // Update draft when input changes
  useEffect(() => {
    setDraft(inputValue)
  }, [inputValue, setDraft])
  
  // Autocomplete state
  const [autocompleteMode, setAutocompleteMode] = useState<AutocompleteMode>('none')
  const [commandSuggestions, setCommandSuggestions] = useState<CommandSuggestion[]>([])
  const [mentionSuggestions, setMentionSuggestions] = useState<Profile[]>([])
  const [taskSuggestions, setTaskSuggestions] = useState<Task[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [autocompleteInfo, setAutocompleteInfo] = useState<{ start: number; end: number } | null>(null)
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null)
  
  const [isSending, setIsSending] = useState(false)
  
  // Set mounted state for portal
  useEffect(() => {
    setMounted(true)
  }, [])
  
  // Update dropdown position
  const updateDropdownPosition = useCallback(() => {
    if (textareaRef.current) {
      const rect = textareaRef.current.getBoundingClientRect()
      setDropdownPosition({
        top: rect.top,
        left: rect.left,
        width: Math.min(rect.width, 400)
      })
    }
  }, [])
  
  // Helper to detect task reference at cursor position (#123 or #task)
  const getTaskRefAtCursor = useCallback((text: string, cursor: number): { ref: string; start: number; end: number } | null => {
    // Find the start of the task reference (looking backwards from cursor)
    let start = cursor - 1
    while (start >= 0 && text[start] !== '#' && text[start] !== ' ' && text[start] !== '\n') {
      start--
    }
    
    // Check if we found a # at the start
    if (start < 0 || text[start] !== '#') {
      return null
    }
    
    // Check if # is at the start or preceded by whitespace
    if (start > 0 && text[start - 1] !== ' ' && text[start - 1] !== '\n') {
      return null
    }
    
    // Extract the reference text (after #)
    const ref = text.slice(start + 1, cursor)
    
    return { ref, start, end: cursor }
  }, [])

  // Handle input change with autocomplete detection
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    
    const cursorPosition = e.target.selectionStart
    
    // Check for slash command
    const commandMatch = getCommandAtCursor(newValue, cursorPosition)
    if (commandMatch) {
      const suggestions = searchCommands(commandMatch.command, { limit: 8 })
      setCommandSuggestions(suggestions)
      setAutocompleteInfo({ start: commandMatch.start, end: commandMatch.end })
      setAutocompleteMode(suggestions.length > 0 ? 'command' : 'none')
      setSelectedIndex(0)
      updateDropdownPosition()
      return
    }
    
    // Check for mention
    const mentionMatch = getMentionAtCursor(newValue, cursorPosition)
    if (mentionMatch) {
      const filtered = members.filter(m =>
        m.full_name.toLowerCase().includes(mentionMatch.mention.toLowerCase()) ||
        m.email.toLowerCase().includes(mentionMatch.mention.toLowerCase())
      ).slice(0, 5)
      
      setMentionSuggestions(filtered)
      setAutocompleteInfo({ start: mentionMatch.start, end: mentionMatch.end })
      setAutocompleteMode(filtered.length > 0 ? 'mention' : 'none')
      setSelectedIndex(0)
      updateDropdownPosition()
      return
    }
    
    // Check for task reference (#123 or #taskname)
    if (tasks.length > 0) {
      const taskRefMatch = getTaskRefAtCursor(newValue, cursorPosition)
      if (taskRefMatch) {
        const searchTerm = taskRefMatch.ref.toLowerCase()
        const filtered = tasks.filter(t => {
          // Match by task number
          if (t.task_number && t.task_number.toString().includes(searchTerm)) {
            return true
          }
          // Match by title
          if (t.title.toLowerCase().includes(searchTerm)) {
            return true
          }
          return false
        }).slice(0, 8)
        
        setTaskSuggestions(filtered)
        setAutocompleteInfo({ start: taskRefMatch.start, end: taskRefMatch.end })
        setAutocompleteMode(filtered.length > 0 ? 'task' : 'none')
        setSelectedIndex(0)
        updateDropdownPosition()
        return
      }
    }
    
    // No autocomplete
    setAutocompleteMode('none')
  }, [members, tasks, setInputValue, updateDropdownPosition, getTaskRefAtCursor])
  
  // Insert command into input
  const insertCommand = useCallback((command: SlashCommand) => {
    if (!autocompleteInfo) return
    
    const before = inputValue.slice(0, autocompleteInfo.start)
    const after = inputValue.slice(autocompleteInfo.end)
    const hasArgs = command.args && command.args.length > 0
    const newValue = `${before}/${command.name}${hasArgs ? ' ' : ''}${after}`
    
    setInputValue(newValue)
    setAutocompleteMode('none')
    textareaRef.current?.focus()
    
    // Position cursor after command
    setTimeout(() => {
      if (textareaRef.current) {
        const newPosition = autocompleteInfo.start + command.name.length + (hasArgs ? 2 : 1)
        textareaRef.current.setSelectionRange(newPosition, newPosition)
      }
    }, 0)
  }, [autocompleteInfo, inputValue, setInputValue])
  
  // Insert mention into input
  const insertMention = useCallback((profile: Profile) => {
    if (!autocompleteInfo) return
    
    const fullName = profile.full_name
    const before = inputValue.slice(0, autocompleteInfo.start)
    const after = inputValue.slice(autocompleteInfo.end)
    
    // Use quotes if name contains spaces
    const hasSpace = fullName.includes(' ')
    const mentionText = hasSpace ? `@"${fullName}"` : `@${fullName}`
    const newValue = `${before}${mentionText} ${after}`
    
    setInputValue(newValue)
    setAutocompleteMode('none')
    textareaRef.current?.focus()
    
    setTimeout(() => {
      if (textareaRef.current) {
        const newPosition = autocompleteInfo.start + mentionText.length + 1
        textareaRef.current.setSelectionRange(newPosition, newPosition)
      }
    }, 0)
  }, [autocompleteInfo, inputValue, setInputValue])
  
  // Insert task reference into input
  const insertTask = useCallback((task: Task) => {
    if (!autocompleteInfo) return
    
    const before = inputValue.slice(0, autocompleteInfo.start)
    const after = inputValue.slice(autocompleteInfo.end)
    
    // Format: #123 Task Title
    const taskNum = task.task_number ? `#${task.task_number}` : `#[${task.id.slice(0, 8)}]`
    const taskText = `${taskNum} ${task.title}`
    const newValue = `${before}${taskText} ${after}`
    
    setInputValue(newValue)
    setAutocompleteMode('none')
    textareaRef.current?.focus()
    
    setTimeout(() => {
      if (textareaRef.current) {
        const newPosition = autocompleteInfo.start + taskText.length + 1
        textareaRef.current.setSelectionRange(newPosition, newPosition)
      }
    }, 0)
  }, [autocompleteInfo, inputValue, setInputValue])
  
  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle autocomplete navigation
    if (autocompleteMode !== 'none') {
      const maxIndex = autocompleteMode === 'command' 
        ? commandSuggestions.length - 1 
        : autocompleteMode === 'mention'
        ? mentionSuggestions.length - 1
        : taskSuggestions.length - 1
      
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(i => Math.min(i + 1, maxIndex))
        return
      }
      
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(i => Math.max(i - 1, 0))
        return
      }
      
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        if (autocompleteMode === 'command' && commandSuggestions[selectedIndex]) {
          insertCommand(commandSuggestions[selectedIndex].command)
        } else if (autocompleteMode === 'mention' && mentionSuggestions[selectedIndex]) {
          insertMention(mentionSuggestions[selectedIndex])
        } else if (autocompleteMode === 'task' && taskSuggestions[selectedIndex]) {
          insertTask(taskSuggestions[selectedIndex])
        }
        return
      }
      
      if (e.key === 'Escape') {
        e.preventDefault()
        setAutocompleteMode('none')
        return
      }
    }
    
    // History navigation (up arrow in empty input)
    if (e.key === 'ArrowUp' && !inputValue.trim()) {
      if (handleUpArrow(true)) {
        e.preventDefault()
        return
      }
    }
    
    if (e.key === 'ArrowDown') {
      if (handleDownArrow()) {
        e.preventDefault()
        return
      }
    }
    
    // Cmd/Ctrl+Enter to send
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit(e as unknown as FormEvent)
      return
    }
    
    // Enter to send (without shift for new line)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as unknown as FormEvent)
      return
    }
    
    // Escape to clear
    if (e.key === 'Escape' && inputValue) {
      e.preventDefault()
      setInputValue('')
      return
    }
  }, [
    autocompleteMode, 
    commandSuggestions, 
    mentionSuggestions,
    taskSuggestions,
    selectedIndex, 
    insertCommand, 
    insertMention,
    insertTask,
    inputValue,
    handleUpArrow,
    handleDownArrow,
    setInputValue
  ])
  
  // Handle form submit
  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault()
    console.log('[CommandInput.handleSubmit] Called', { inputValue, isSending, disabled })
    
    const content = inputValue.trim()
    if (!content || isSending || disabled) {
      console.log('[CommandInput.handleSubmit] Early return', { content: !!content, isSending, disabled })
      return
    }
    
    // Check if it's a slash command
    if (shouldExecuteAsCommand(content)) {
      setIsSending(true)
      
      const context: CommandContext = {
        conversationId: conversationId || undefined,
        userId: currentUserId,
        foundryId,
        router: { push: router.push },
        toast: { success: toast.success, error: toast.error, info: toast.info }
      }
      
      try {
        const result = await executeCommand(content, context)
        
        // Handle different result types
        if (result.type === 'message' && result.content) {
          // Send as message
          const success = await onSend(result.content)
          if (success) {
            setInputValue('')
            clearDraft()
            addToHistory()
          }
        } else if (result.type === 'action') {
          // Action handled by executor, clear input
          setInputValue('')
          clearDraft()
          addToHistory()
        } else if (result.type === 'navigate') {
          // Navigation handled by executor
          setInputValue('')
          clearDraft()
        } else if (result.type === 'error') {
          // Error already shown by executor
        }
        
        // Check for special data flags
        if (result.data?.clearInput) {
          setInputValue('')
          clearDraft()
        }
      } catch (error) {
        toast.error('Command failed to execute')
      } finally {
        setIsSending(false)
        textareaRef.current?.focus()
      }
      
      return
    }
    
    // Regular message
    console.log('[CommandInput.handleSubmit] Sending regular message:', content)
    setIsSending(true)
    
    try {
      console.log('[CommandInput.handleSubmit] Calling onSend...')
      const success = await onSend(content)
      console.log('[CommandInput.handleSubmit] onSend returned:', success)
      if (success) {
        setInputValue('')
        clearDraft()
        addToHistory()
      }
    } catch (error) {
      console.error('[CommandInput.handleSubmit] onSend threw error:', error)
    } finally {
      setIsSending(false)
      textareaRef.current?.focus()
    }
  }, [
    inputValue, 
    isSending, 
    disabled, 
    conversationId, 
    currentUserId, 
    foundryId, 
    router, 
    onSend, 
    setInputValue, 
    clearDraft, 
    addToHistory
  ])
  
  // Update position on scroll/resize
  useEffect(() => {
    if (autocompleteMode !== 'none') {
      updateDropdownPosition()
      window.addEventListener('scroll', updateDropdownPosition, true)
      window.addEventListener('resize', updateDropdownPosition)
      return () => {
        window.removeEventListener('scroll', updateDropdownPosition, true)
        window.removeEventListener('resize', updateDropdownPosition)
      }
    }
  }, [autocompleteMode, updateDropdownPosition])
  
  // Render autocomplete dropdown
  const renderDropdown = () => {
    if (autocompleteMode === 'none' || !dropdownPosition || !mounted) {
      return null
    }
    
    const ariaLabel = autocompleteMode === 'command' 
      ? 'Command suggestions' 
      : autocompleteMode === 'mention'
      ? 'Mention suggestions'
      : 'Task suggestions'
    
    return createPortal(
      <div 
        role="listbox"
        aria-label={ariaLabel}
        className="fixed bg-background border-2 rounded-lg shadow-xl z-[200] overflow-hidden"
        style={{
          top: dropdownPosition.top - 4,
          left: dropdownPosition.left,
          width: dropdownPosition.width,
          transform: 'translateY(-100%)'
        }}
      >
        {/* Header */}
        <div className="p-2 text-xs text-muted-foreground border-b bg-muted flex items-center gap-2">
          {autocompleteMode === 'command' ? (
            <>
              <Slash className="h-3 w-3" />
              <span>Commands · ↑↓ to navigate · Enter to select</span>
            </>
          ) : autocompleteMode === 'mention' ? (
            <>
              <AtSign className="h-3 w-3" />
              <span>Mention · ↑↓ to navigate · Enter to select</span>
            </>
          ) : (
            <>
              <Hash className="h-3 w-3" />
              <span>Link task · ↑↓ to navigate · Enter to select</span>
            </>
          )}
        </div>
        
        {/* Suggestions list */}
        <div className="max-h-[280px] overflow-y-auto bg-background">
          {autocompleteMode === 'command' && commandSuggestions.map((suggestion, index) => (
            <button
              key={suggestion.command.name}
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              onClick={() => insertCommand(suggestion.command)}
              className={cn(
                'w-full px-3 py-2.5 text-left flex items-start gap-3 transition-colors',
                index === selectedIndex 
                  ? 'bg-status-info-light' 
                  : 'hover:bg-muted'
              )}
            >
              <suggestion.command.icon className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">/{suggestion.command.name}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {suggestion.command.usage.replace(`/${suggestion.command.name}`, '').trim()}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {suggestion.command.description}
                </p>
              </div>
            </button>
          ))}
          
          {autocompleteMode === 'mention' && mentionSuggestions.map((profile, index) => (
            <button
              key={profile.id}
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              onClick={() => insertMention(profile)}
              className={cn(
                'w-full px-3 py-2 text-left flex items-center gap-3 transition-colors',
                index === selectedIndex 
                  ? 'bg-status-info-light' 
                  : 'hover:bg-muted'
              )}
            >
              <UserAvatar
                name={profile.full_name}
                size="sm"
                className="shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate text-foreground">{profile.full_name}</div>
                <div className="text-xs text-muted-foreground truncate">{profile.email}</div>
              </div>
            </button>
          ))}
          
          {autocompleteMode === 'task' && taskSuggestions.map((task, index) => (
            <button
              key={task.id}
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              onClick={() => insertTask(task)}
              className={cn(
                'w-full px-3 py-2 text-left flex items-center gap-3 transition-colors',
                index === selectedIndex 
                  ? 'bg-status-info-light' 
                  : 'hover:bg-muted'
              )}
            >
              <CheckSquare className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    #{task.task_number || '--'}
                  </span>
                  <span className="font-medium truncate text-foreground">{task.title}</span>
                </div>
                {task.status && (
                  <div className="text-xs text-muted-foreground truncate mt-0.5">
                    {task.status.replace(/_/g, ' ')}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>,
      document.body
    )
  }
  
  return (
    <form onSubmit={handleSubmit} className={cn("border-t border-border p-4", className)}>
      <div className="flex items-end gap-2">
        {onFileClick && (
          <Button 
            type="button" 
            variant="ghost" 
            size="icon" 
            onClick={onFileClick}
            className="flex-shrink-0 mb-0.5"
            aria-label="Attach file"
            disabled={disabled}
          >
            <Paperclip className="w-5 h-5" />
          </Button>
        )}
        
        <div className="relative flex-1">
          <Textarea
            ref={textareaRef}
            value={inputValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || isSending}
            className="min-h-[44px] max-h-[200px] resize-none py-3"
            rows={1}
          />
          {renderDropdown()}
        </div>
        
        <Button 
          type="submit" 
          size="icon" 
          disabled={!inputValue.trim() || isSending || disabled}
          className="flex-shrink-0 mb-0.5"
          aria-label={isSending ? "Sending message" : "Send message"}
        >
          {isSending ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </Button>
      </div>
      
      {/* Quick reference help */}
      <MessageInputHelp />
    </form>
  )
}
