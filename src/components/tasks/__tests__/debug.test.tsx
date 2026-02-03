import { TaskCard } from '@/app/(platform)/tasks/task-card'

jest.mock('@/actions/tasks', () => ({}))

// Mock attachments to avoid Next.js Request API issues
jest.mock('@/actions/attachments', () => ({
    uploadTaskAttachment: jest.fn(),
    getTaskAttachments: jest.fn()
}))

describe('Debug TaskCard Import', () => {
    it('should import successfully', () => {
        expect(TaskCard).toBeDefined()
    })
})
