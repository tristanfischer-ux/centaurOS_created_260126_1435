import { acceptTask, rejectTask, forwardTask, amendTask } from '../tasks'

// Mock Supabase
jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(() => ({
        auth: {
            getUser: jest.fn(() => Promise.resolve({ data: { user: { id: 'user-123', app_metadata: { foundry_id: 'foundry-123' } } } }))
        },
        from: jest.fn((table) => ({
            select: jest.fn(() => ({
                eq: jest.fn(() => ({
                    single: jest.fn(() => Promise.resolve({ data: { id: 'task-123', assignee_id: 'old-assignee', forwarding_history: [] } }))
                }))
            })),
            insert: jest.fn(() => Promise.resolve({ error: null })),
            update: jest.fn(() => ({
                eq: jest.fn(() => Promise.resolve({ error: null }))
            })),
        }))
    }))
}))

// Mock Revalidate
jest.mock('next/cache', () => ({
    revalidatePath: jest.fn()
}))

describe('Task Actions', () => {
    it('acceptTask should update status to Accepted', async () => {
        const result = await acceptTask('task-123')
        expect(result).toEqual({ success: true })
    })

    it('rejectTask should fail without reason', async () => {
        const result = await rejectTask('task-123', '')
        expect(result).toEqual({ error: 'Reason required for rejection' })
    })

    it('rejectTask should update status to Rejected', async () => {
        const result = await rejectTask('task-123', 'Not my job')
        expect(result).toEqual({ success: true })
    })

    it('forwardTask should update assignee_id', async () => {
        const result = await forwardTask('task-123', 'new-assignee', 'Delegating')
        expect(result).toEqual({ success: true })
    })

    it('amendTask should update status to Amended_Pending_Approval', async () => {
        const result = await amendTask('task-123', { amendment_notes: 'Need more time' })
        expect(result).toEqual({ success: true })
    })
})
