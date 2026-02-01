import { TaskCard } from '@/app/(platform)/tasks/task-card'

jest.mock('@/actions/tasks', () => ({}))

describe('Debug TaskCard Import', () => {
    it('should import successfully', () => {
        expect(TaskCard).toBeDefined()
    })
})
