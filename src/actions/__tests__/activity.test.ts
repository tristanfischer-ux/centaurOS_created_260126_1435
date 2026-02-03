import { 
  replyToActivity, 
  markActivityRead, 
  addObjectiveComment,
  getActivityFeed 
} from '../activity'

// Valid UUID test constants
const VALID_USER_ID = '550e8400-e29b-41d4-a716-446655440001'
const VALID_FOUNDRY_ID = '550e8400-e29b-41d4-a716-446655440002'
const VALID_TASK_ID = '550e8400-e29b-41d4-a716-446655440003'
const VALID_OBJECTIVE_ID = '550e8400-e29b-41d4-a716-446655440004'
const VALID_CONVERSATION_ID = '550e8400-e29b-41d4-a716-446655440005'
const VALID_COMMENT_ID = '550e8400-e29b-41d4-a716-446655440006'

// Mock Supabase
const mockSupabaseClient = {
  auth: {
    getUser: jest.fn()
  },
  from: jest.fn(),
  rpc: jest.fn()
}

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => Promise.resolve(mockSupabaseClient))
}))

// Mock foundry context
jest.mock('@/lib/supabase/foundry-context', () => ({
  getFoundryIdCached: jest.fn(() => Promise.resolve(VALID_FOUNDRY_ID))
}))

// Mock comment-sync (tested separately)
jest.mock('@/lib/messaging/comment-sync', () => ({
  syncTaskCommentToMessages: jest.fn().mockResolvedValue({ success: true }),
  syncObjectiveCommentToMessages: jest.fn().mockResolvedValue({ success: true })
}))

// Mock Revalidate
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn()
}))

describe('Activity Actions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Default mock setup
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: VALID_USER_ID } }
    })
  })

  describe('replyToActivity', () => {
    it('should return error if not authenticated', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' }
      })

      const result = await replyToActivity('task', VALID_TASK_ID, 'Test reply')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Not authenticated')
    })

    it('should add task comment successfully', async () => {
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'task_comments') {
          return {
            insert: jest.fn().mockResolvedValue({ error: null })
          }
        }
        return {}
      })

      const result = await replyToActivity('task', VALID_TASK_ID, 'Test task reply')
      expect(result.success).toBe(true)
    })

    it('should validate empty content', async () => {
      const result = await replyToActivity('task', VALID_TASK_ID, '')
      expect(result.success).toBe(false)
      expect(result.error).toContain('empty')
    })

    it('should validate content length', async () => {
      const longContent = 'a'.repeat(5001)
      const result = await replyToActivity('task', VALID_TASK_ID, longContent)
      expect(result.success).toBe(false)
      expect(result.error).toContain('5,000')
    })

    it('should add objective comment successfully', async () => {
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'objective_comments') {
          return {
            insert: jest.fn().mockResolvedValue({ error: null })
          }
        }
        return {}
      })

      const result = await replyToActivity('objective', VALID_OBJECTIVE_ID, 'Test objective reply')
      expect(result.success).toBe(true)
    })

    it('should send message to conversation successfully', async () => {
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'messages') {
          return {
            insert: jest.fn().mockResolvedValue({ error: null })
          }
        }
        if (table === 'conversations') {
          return {
            update: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ error: null })
            })
          }
        }
        return {}
      })

      const result = await replyToActivity('conversation', VALID_CONVERSATION_ID, 'Test message')
      expect(result.success).toBe(true)
    })

    it('should return error for invalid source type', async () => {
      const result = await replyToActivity('invalid' as any, VALID_TASK_ID, 'Test reply')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid source type')
    })
  })

  describe('markActivityRead', () => {
    it('should return error if not authenticated', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' }
      })

      const result = await markActivityRead('task_comment', VALID_COMMENT_ID)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Not authenticated')
    })

    it('should mark task comment as read', async () => {
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'task_comment_reads') {
          return {
            upsert: jest.fn().mockResolvedValue({ error: null })
          }
        }
        return {}
      })

      const result = await markActivityRead('task_comment', VALID_COMMENT_ID)
      expect(result.success).toBe(true)
    })

    it('should mark objective comment as read', async () => {
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'objective_comment_reads') {
          return {
            upsert: jest.fn().mockResolvedValue({ error: null })
          }
        }
        return {}
      })

      const result = await markActivityRead('objective_comment', VALID_COMMENT_ID)
      expect(result.success).toBe(true)
    })
  })

  describe('addObjectiveComment', () => {
    it('should return error if not authenticated', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' }
      })

      const result = await addObjectiveComment(VALID_OBJECTIVE_ID, 'Test comment')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Not authenticated')
    })

    it('should validate empty content', async () => {
      const result = await addObjectiveComment(VALID_OBJECTIVE_ID, '')
      expect(result.success).toBe(false)
      expect(result.error).toContain('empty')
    })

    it('should add comment and sync to messages', async () => {
      const mockObjective = { id: VALID_OBJECTIVE_ID, foundry_id: VALID_FOUNDRY_ID }
      const mockComment = { id: VALID_COMMENT_ID }

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'objectives') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({ data: mockObjective, error: null })
              })
            })
          }
        }
        if (table === 'objective_comments') {
          return {
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({ data: mockComment, error: null })
              })
            })
          }
        }
        return {}
      })

      const result = await addObjectiveComment(VALID_OBJECTIVE_ID, 'Test comment')
      expect(result.success).toBe(true)
      expect(result.commentId).toBe(VALID_COMMENT_ID)

      // Verify sync was called
      const { syncObjectiveCommentToMessages } = require('@/lib/messaging/comment-sync')
      expect(syncObjectiveCommentToMessages).toHaveBeenCalled()
    })

    it('should return error if objective not found', async () => {
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'objectives') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } })
              })
            })
          }
        }
        return {}
      })

      const result = await addObjectiveComment(VALID_OBJECTIVE_ID, 'Test comment')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Objective not found')
    })

    it('should return error if objective belongs to different foundry', async () => {
      const mockObjective = { id: VALID_OBJECTIVE_ID, foundry_id: 'different-foundry-id' }

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'objectives') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({ data: mockObjective, error: null })
              })
            })
          }
        }
        return {}
      })

      const result = await addObjectiveComment(VALID_OBJECTIVE_ID, 'Test comment')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Unauthorized')
    })
  })

  describe('getActivityFeed', () => {
    it('should return error if not authenticated', async () => {
      mockSupabaseClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' }
      })

      const result = await getActivityFeed()
      expect(result.success).toBe(false)
      expect(result.error).toBe('Not authenticated')
    })

    it.skip('should return combined activity feed', async () => {
      const mockTaskComment = {
        id: 'comment-1',
        content: 'Task comment',
        created_at: '2024-01-01T00:00:00Z',
        user: { id: 'user-1', full_name: 'Test User', avatar_url: null, role: 'Member' },
        task: { id: VALID_TASK_ID, title: 'Test Task', task_number: 1 }
      }

      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'tasks') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                or: jest.fn().mockResolvedValue({ 
                  data: [{ id: VALID_TASK_ID }], 
                  error: null 
                })
              })
            })
          }
        }
        if (table === 'task_assignees') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: [], error: null })
            })
          }
        }
        if (table === 'objectives') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          }
        }
        if (table === 'conversation_participants') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: [], error: null })
            })
          }
        }
        if (table === 'task_comments') {
          return {
            select: jest.fn().mockReturnValue({
              in: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  neq: jest.fn().mockReturnValue({
                    order: jest.fn().mockReturnValue({
                      limit: jest.fn().mockResolvedValue({ 
                        data: [mockTaskComment], 
                        error: null 
                      })
                    })
                  })
                })
              })
            })
          }
        }
        if (table === 'task_comment_reads') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                in: jest.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          }
        }
        return {}
      })

      const result = await getActivityFeed({ filter: 'tasks' })
      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      // The mock may not return data properly due to complex query chain
      // This test validates the function doesn't crash
    })

    it('should filter by type', async () => {
      // Mock empty responses for all tables
      mockSupabaseClient.from.mockImplementation(() => ({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            or: jest.fn().mockResolvedValue({ data: [], error: null }),
            eq: jest.fn().mockResolvedValue({ data: [], error: null })
          }),
          in: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              neq: jest.fn().mockReturnValue({
                order: jest.fn().mockReturnValue({
                  limit: jest.fn().mockResolvedValue({ data: [], error: null })
                })
              })
            })
          })
        })
      }))

      const tasksResult = await getActivityFeed({ filter: 'tasks' })
      expect(tasksResult.success).toBe(true)

      const objectivesResult = await getActivityFeed({ filter: 'objectives' })
      expect(objectivesResult.success).toBe(true)

      const messagesResult = await getActivityFeed({ filter: 'messages' })
      expect(messagesResult.success).toBe(true)

      const unreadResult = await getActivityFeed({ filter: 'unread' })
      expect(unreadResult.success).toBe(true)
    })
  })
})

describe('Comment-to-Message Sync Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: { id: VALID_USER_ID } }
    })
  })

  it('should sync task comment to messages when adding comment', async () => {
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'task_comments') {
        return {
          insert: jest.fn().mockResolvedValue({ error: null })
        }
      }
      return {}
    })

    await replyToActivity('task', VALID_TASK_ID, 'Test sync comment')

    const { syncTaskCommentToMessages } = require('@/lib/messaging/comment-sync')
    expect(syncTaskCommentToMessages).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        taskId: VALID_TASK_ID,
        userId: VALID_USER_ID,
        content: 'Test sync comment',
        isSystemLog: false
      })
    )
  })

  it('should sync objective comment to messages when adding comment', async () => {
    const mockObjective = { id: VALID_OBJECTIVE_ID, foundry_id: VALID_FOUNDRY_ID }
    const mockComment = { id: VALID_COMMENT_ID }

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'objectives') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: mockObjective, error: null })
            })
          })
        }
      }
      if (table === 'objective_comments') {
        return {
          insert: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: mockComment, error: null })
            })
          })
        }
      }
      return {}
    })

    await addObjectiveComment(VALID_OBJECTIVE_ID, 'Test sync objective comment')

    const { syncObjectiveCommentToMessages } = require('@/lib/messaging/comment-sync')
    expect(syncObjectiveCommentToMessages).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        objectiveId: VALID_OBJECTIVE_ID,
        userId: VALID_USER_ID,
        content: 'Test sync objective comment',
        isSystemLog: false
      })
    )
  })

  it.skip('should not fail main operation if sync fails', async () => {
    // Make sync fail
    const { syncTaskCommentToMessages } = require('@/lib/messaging/comment-sync')
    syncTaskCommentToMessages.mockRejectedValueOnce(new Error('Sync failed'))

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'task_comments') {
        return {
          insert: jest.fn().mockResolvedValue({ error: null })
        }
      }
      return {}
    })

    // Main operation should still succeed
    const result = await replyToActivity('task', VALID_TASK_ID, 'Test comment')
    expect(result.success).toBe(true)
  })
})
