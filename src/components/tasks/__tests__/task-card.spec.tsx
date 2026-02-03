import { render, screen } from '@testing-library/react'
import { TaskCard } from '@/app/(platform)/tasks/task-card'
import '@testing-library/jest-dom'

// Mock server actions
jest.mock('@/actions/tasks', () => ({
    acceptTask: jest.fn(),
    rejectTask: jest.fn(),
    forwardTask: jest.fn(),
    amendTask: jest.fn()
}))

// Mock attachments to avoid Next.js Request API issues
jest.mock('@/actions/attachments', () => ({
    uploadTaskAttachment: jest.fn(),
    getTaskAttachments: jest.fn()
}))

const mockTask = {
    id: 'task-1',
    title: 'Test Task',
    description: 'Do the thing',
    status: 'Pending',
    creator_id: 'creator-1',
    assignee_id: 'user-1',
    foundry_id: 'foundry-1',
    objective_id: 'obj-1',
    start_date: null,
    end_date: null,
    forwarding_history: [],
    amendment_notes: null,
    created_at: null,
    updated_at: null
}

const defaultProps = {
    members: [],
    expanded: false,
    onToggle: jest.fn(),
}

describe('TaskCard', () => {
    it('renders task title', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        render(<TaskCard task={mockTask as any} currentUserId="user-2" {...defaultProps} />)
        expect(screen.getByText('Test Task')).toBeInTheDocument()
    })

    it('shows Accept button for assignee', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        render(<TaskCard task={mockTask as any} currentUserId="user-1" {...defaultProps} />)
        expect(screen.getByText('Accept')).toBeInTheDocument()
    })

    it('hides Accept button for non-assignee', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        render(<TaskCard task={mockTask as any} currentUserId="user-2" {...defaultProps} />)
        expect(screen.queryByText('Accept')).not.toBeInTheDocument()
    })

    it.skip('shows Amendment Notes when status is Amended_Pending_Approval', () => {
        const amendedTask = { ...mockTask, status: 'Amended_Pending_Approval', amendment_notes: 'Proposed changes' }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        render(<TaskCard task={amendedTask as any} currentUserId="user-1" {...defaultProps} />)
        expect(screen.getByText('Amendment Proposed:')).toBeInTheDocument()
        expect(screen.getByText('Proposed changes')).toBeInTheDocument()
    })
})
