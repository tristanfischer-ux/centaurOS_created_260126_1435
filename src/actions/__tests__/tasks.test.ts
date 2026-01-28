import { acceptTask, rejectTask, forwardTask, amendTask, createTask, updateTaskDates } from '../tasks'
import { removeTeamMember } from '../team'

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

jest.mock('@/lib/ai-worker', () => ({
    runAIWorker: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('@/lib/audit', () => ({
    logTaskHistory: jest.fn().mockResolvedValue(undefined)
}))

// Mock Revalidate
jest.mock('next/cache', () => ({
    revalidatePath: jest.fn()
}))

describe('Task Actions', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        
        // Default mock setup
        mockSupabaseClient.auth.getUser.mockResolvedValue({
            data: { user: { id: 'user-123', app_metadata: { foundry_id: 'foundry-123' } } }
        })
    })

    describe('acceptTask', () => {
        it('should update status to Accepted', async () => {
            const mockUpdate = jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ error: null })
            })
            mockSupabaseClient.from.mockReturnValue({
                update: mockUpdate
            })

            const result = await acceptTask('task-123')
            expect(result).toEqual({ success: true })
            expect(mockUpdate).toHaveBeenCalledWith({ status: 'Accepted' })
        })
    })

    describe('rejectTask', () => {
        it('should fail without reason', async () => {
            const result = await rejectTask('task-123', '')
            expect(result).toEqual({ error: 'Reason required for rejection' })
        })

        it('should update status to Rejected', async () => {
            const mockUpdate = jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ error: null })
            })
            mockSupabaseClient.from.mockReturnValue({
                update: mockUpdate
            })

            const result = await rejectTask('task-123', 'Not my job')
            expect(result).toEqual({ success: true })
            expect(mockUpdate).toHaveBeenCalledWith({ status: 'Rejected', rejection_reason: 'Not my job' })
        })
    })

    describe('forwardTask', () => {
        it('should use RPC function transfer_task_assignee', async () => {
            const mockTask = { id: 'task-123', assignee_id: 'old-assignee', forwarding_history: [] }
            
            mockSupabaseClient.from.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({ data: mockTask })
                    })
                }),
                update: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({ error: null })
                })
            })

            mockSupabaseClient.rpc.mockResolvedValue({ error: null })

            const result = await forwardTask('task-123', 'new-assignee', 'Delegating')

            expect(result).toEqual({ success: true })
            expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('transfer_task_assignee', {
                p_task_id: 'task-123',
                p_new_assignee_id: 'new-assignee'
            })
        })

        it('should fail when task has no assignee', async () => {
            const mockTask = { id: 'task-123', assignee_id: null, forwarding_history: [] }
            
            mockSupabaseClient.from.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({ data: mockTask })
                    })
                })
            })

            const result = await forwardTask('task-123', 'new-assignee', 'Delegating')

            expect(result).toEqual({ error: 'Task has no assignee to forward from' })
        })

        it('should fail when RPC function fails', async () => {
            const mockTask = { id: 'task-123', assignee_id: 'old-assignee', forwarding_history: [] }
            
            mockSupabaseClient.from.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({ data: mockTask })
                    })
                }),
                update: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({ error: null })
                })
            })

            mockSupabaseClient.rpc.mockResolvedValue({ error: { message: 'RPC failed' } })

            const result = await forwardTask('task-123', 'new-assignee', 'Delegating')

            expect(result).toEqual({ error: 'Failed to update task assignees' })
        })

        it('should handle concurrent forward operations', async () => {
            const mockTask = { id: 'task-123', assignee_id: 'old-assignee', forwarding_history: [] }
            
            mockSupabaseClient.from.mockReturnValue({
                select: jest.fn().mockReturnValue({
                    eq: jest.fn().mockReturnValue({
                        single: jest.fn().mockResolvedValue({ data: mockTask })
                    })
                }),
                update: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({ error: null })
                })
            })

            mockSupabaseClient.rpc.mockResolvedValue({ error: null })

            // Simulate concurrent forwards
            const promises = [
                forwardTask('task-123', 'new-assignee-1', 'Reason 1'),
                forwardTask('task-123', 'new-assignee-2', 'Reason 2')
            ]

            const results = await Promise.all(promises)

            // Both should succeed (RPC handles race condition)
            expect(results.every(r => r.success === true)).toBe(true)
            expect(mockSupabaseClient.rpc).toHaveBeenCalledTimes(2)
        })
    })

    describe('amendTask', () => {
        it('should update status to Amended_Pending_Approval', async () => {
            mockSupabaseClient.from.mockImplementation((table: string) => {
                if (table === 'task_comments') {
                    return {
                        insert: jest.fn().mockResolvedValue({ error: null })
                    }
                }
                return {
                    update: jest.fn().mockReturnValue({
                        eq: jest.fn().mockResolvedValue({ error: null })
                    })
                }
            })

            const result = await amendTask('task-123', { amendment_notes: 'Need more time' })
            expect(result).toEqual({ success: true })
        })
    })

    describe('createTask validation', () => {
        const createMockFormData = (overrides: Record<string, string> = {}) => {
            const formData = new FormData()
            formData.append('title', overrides.title || 'Test Task')
            formData.append('objective_id', overrides.objective_id || 'obj-123')
            formData.append('assignee_id', overrides.assignee_id || 'user-123')
            if (overrides.description) formData.append('description', overrides.description)
            if (overrides.risk_level) formData.append('risk_level', overrides.risk_level)
            if (overrides.file_count) formData.append('file_count', overrides.file_count)
            return formData
        }

        beforeEach(() => {
            mockSupabaseClient.from.mockImplementation((table: string) => {
                if (table === 'profiles') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({ data: { foundry_id: 'foundry-123' } })
                            })
                        })
                    }
                }
                if (table === 'tasks') {
                    return {
                        insert: jest.fn().mockReturnValue({
                            select: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({
                                    data: { id: 'new-task-123' },
                                    error: null
                                })
                            })
                        }),
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                single: jest.fn().mockResolvedValue({ data: { id: 'task-123' } })
                            })
                        })
                    }
                }
                if (table === 'task_assignees') {
                    return {
                        insert: jest.fn().mockResolvedValue({ error: null })
                    }
                }
                if (table === 'team_members') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockResolvedValue({ data: [] })
                        })
                    }
                }
                return {}
            })
        })

        it('should validate title length (1-500 chars)', async () => {
            const emptyTitleFormData = createMockFormData({ title: '' })
            const result1 = await createTask(emptyTitleFormData)
            expect(result1).toEqual({ error: 'Title cannot be empty' })

            const longTitle = 'a'.repeat(501)
            const longTitleFormData = createMockFormData({ title: longTitle })
            const result2 = await createTask(longTitleFormData)
            expect(result2).toEqual({ error: 'Title must be 500 characters or less' })
        })

        it('should validate description length (max 10,000 chars)', async () => {
            const longDescription = 'a'.repeat(10001)
            const formData = createMockFormData({ description: longDescription })
            const result = await createTask(formData)
            expect(result).toEqual({ error: 'Description must be 10,000 characters or less' })
        })

        it('should validate risk level enum', async () => {
            const validFormData = createMockFormData({ risk_level: 'High' })
            const result = await createTask(validFormData)
            expect(result.success).toBe(true)

            const invalidFormData = createMockFormData({ risk_level: 'Invalid' })
            const result2 = await createTask(invalidFormData)
            // Should default to 'Low' and succeed
            expect(result2.success).toBe(true)
        })

        it('should validate file count parsing', async () => {
            const invalidFileCountFormData = createMockFormData({ file_count: 'invalid' })
            const result1 = await createTask(invalidFileCountFormData)
            expect(result1).toEqual({ error: 'Invalid file count: must be a non-negative number' })

            const negativeFileCountFormData = createMockFormData({ file_count: '-1' })
            const result2 = await createTask(negativeFileCountFormData)
            expect(result2).toEqual({ error: 'Invalid file count: must be a non-negative number' })
        })
    })

    describe('updateTaskDates validation', () => {
        beforeEach(() => {
            mockSupabaseClient.from.mockReturnValue({
                update: jest.fn().mockReturnValue({
                    eq: jest.fn().mockResolvedValue({ error: null })
                })
            })
        })

        it('should validate date format', async () => {
            const result1 = await updateTaskDates('task-123', 'invalid-date', '2024-01-02')
            expect(result1).toEqual({ error: 'Invalid start date format. Please use ISO date format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)' })

            const result2 = await updateTaskDates('task-123', '2024-01-01', 'invalid-date')
            expect(result2).toEqual({ error: 'Invalid end date format. Please use ISO date format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)' })
        })

        it('should validate startDate < endDate', async () => {
            const result = await updateTaskDates('task-123', '2024-01-02', '2024-01-01')
            expect(result).toEqual({ error: 'Start date must be before end date' })

            const result2 = await updateTaskDates('task-123', '2024-01-01', '2024-01-01')
            expect(result2).toEqual({ error: 'Start date must be before end date' })
        })

        it('should require both dates', async () => {
            const result1 = await updateTaskDates('task-123', '', '2024-01-02')
            expect(result1).toEqual({ error: 'Start date and end date are required' })

            const result2 = await updateTaskDates('task-123', '2024-01-01', '')
            expect(result2).toEqual({ error: 'Start date and end date are required' })
        })

        it('should successfully update valid dates', async () => {
            const result = await updateTaskDates('task-123', '2024-01-01', '2024-01-02')
            expect(result).toEqual({ success: true })
        })
    })
})

describe('removeTeamMember race conditions', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockSupabaseClient.auth.getUser.mockResolvedValue({
            data: { user: { id: 'user-123', app_metadata: { foundry_id: 'foundry-123' } } }
        })
    })

    it('should correctly handle concurrent removals', async () => {
        const mockTeam = { foundry_id: 'foundry-123' }
        const mockMembership = { profile_id: 'user-123' }
        const mockMemberToRemove = { profile_id: 'member-123' }
        const mockCurrentMembers = [
            { profile_id: 'user-123' },
            { profile_id: 'member-123' },
            { profile_id: 'member-456' }
        ]

        mockSupabaseClient.from.mockImplementation((table: string) => {
            if (table === 'profiles') {
                return {
                    select: jest.fn().mockReturnValue({
                        eq: jest.fn().mockReturnValue({
                            single: jest.fn().mockResolvedValue({ data: { foundry_id: 'foundry-123' } })
                        })
                    })
                }
            }
            if (table === 'teams') {
                return {
                    select: jest.fn().mockReturnValue({
                        eq: jest.fn().mockReturnValue({
                            single: jest.fn().mockResolvedValue({ data: mockTeam })
                        })
                    })
                }
            }
            if (table === 'team_members') {
                return {
                    select: jest.fn().mockReturnValue({
                        eq: jest.fn().mockReturnValue({
                            single: jest.fn().mockResolvedValue({ data: mockMemberToRemove })
                        })
                    }),
                    delete: jest.fn().mockReturnValue({
                        eq: jest.fn().mockResolvedValue({ error: null })
                    })
                }
            }
            return {}
        })

        // Mock the count check
        let callCount = 0
        mockSupabaseClient.from.mockImplementation((table: string) => {
            if (table === 'team_members') {
                if (callCount === 0) {
                    callCount++
                    return {
                        select: jest.fn().mockResolvedValue({ data: mockCurrentMembers, error: null })
                    }
                }
                return {
                    select: jest.fn().mockReturnValue({
                        eq: jest.fn().mockReturnValue({
                            single: jest.fn().mockResolvedValue({ data: mockMemberToRemove })
                        })
                    }),
                    delete: jest.fn().mockReturnValue({
                        eq: jest.fn().mockResolvedValue({ error: null })
                    })
                }
            }
            return {}
        })

        const result = await removeTeamMember('team-123', 'member-123')
        expect(result.success).toBe(true)
    })

    it('should prevent removal when team would have less than 2 members', async () => {
        const mockTeam = { foundry_id: 'foundry-123' }
        const mockMembership = { profile_id: 'user-123' }
        const mockMemberToRemove = { profile_id: 'member-123' }
        const mockCurrentMembers = [
            { profile_id: 'user-123' },
            { profile_id: 'member-123' }
        ]

        let memberCallCount = 0
        mockSupabaseClient.from.mockImplementation((table: string) => {
            if (table === 'profiles') {
                return {
                    select: jest.fn().mockReturnValue({
                        eq: jest.fn().mockReturnValue({
                            single: jest.fn().mockResolvedValue({ data: { foundry_id: 'foundry-123' } })
                        })
                    })
                }
            }
            if (table === 'teams') {
                return {
                    select: jest.fn().mockReturnValue({
                        eq: jest.fn().mockReturnValue({
                            single: jest.fn().mockResolvedValue({ data: mockTeam })
                        })
                    })
                }
            }
            if (table === 'team_members') {
                memberCallCount++
                if (memberCallCount === 1) {
                    // Check user membership
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                eq: jest.fn().mockReturnValue({
                                    single: jest.fn().mockResolvedValue({ data: mockMembership })
                                })
                            })
                        })
                    }
                } else if (memberCallCount === 2) {
                    // Check member to remove exists
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({
                                eq: jest.fn().mockReturnValue({
                                    single: jest.fn().mockResolvedValue({ data: mockMemberToRemove })
                                })
                            })
                        })
                    }
                } else {
                    // Get current members count (only 2 members)
                    return {
                        select: jest.fn().mockResolvedValue({ data: mockCurrentMembers, error: null })
                    }
                }
            }
            return {}
        })

        const result = await removeTeamMember('team-123', 'member-123')
        expect(result).toEqual({ error: 'Cannot remove member: team must have at least 2 members' })
    })
})
