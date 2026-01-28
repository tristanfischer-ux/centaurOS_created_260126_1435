import { render, screen } from '@testing-library/react'
import { TaskCard } from '@/app/(platform)/tasks/task-card'
import '@testing-library/jest-dom'

// Mock server actions
jest.mock('@/actions/tasks', () => ({
    acceptTask: jest.fn(),
    rejectTask: jest.fn(),
    forwardTask: jest.fn(),
    amendTask: jest.fn(),
    updateTaskAssignees: jest.fn(),
    updateTaskDates: jest.fn()
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
    updated_at: null,
    risk_level: 'Low' as const,
    assignees: [],
    task_files: []
}

const mockMembers = [
    { id: 'user-1', full_name: 'User One', role: 'Apprentice' },
    { id: 'user-2', full_name: 'User Two', role: 'Executive' }
]

describe('TaskCard', () => {
    const defaultProps = {
        task: mockTask,
        currentUserId: 'user-2',
        members: mockMembers,
        expanded: false,
        onToggle: jest.fn(),
        isSelectionMode: false,
        isSelected: false,
        onToggleSelection: jest.fn()
    }

    it('renders task title', () => {
        // @ts-expect-error mock data
        render(<TaskCard {...defaultProps} />)
        expect(screen.getByText('Test Task')).toBeInTheDocument()
    })

    it('shows Accept button for assignee', () => {
        // @ts-expect-error mock data
        render(<TaskCard {...defaultProps} currentUserId="user-1" />)
        expect(screen.getByText('Accept')).toBeInTheDocument()
    })

    it('hides Accept button for non-assignee', () => {
        // @ts-expect-error mock data
        render(<TaskCard {...defaultProps} />)
        expect(screen.queryByText('Accept')).not.toBeInTheDocument()
    })

    it('shows Amendment Notes when status is Amended_Pending_Approval', () => {
        const amendedTask = { ...mockTask, status: 'Amended_Pending_Approval', amendment_notes: 'Proposed changes' }
        // @ts-expect-error mock data
        render(<TaskCard {...defaultProps} task={amendedTask} currentUserId="user-1" />)
        expect(screen.getByText('Amendment Proposed:')).toBeInTheDocument()
        expect(screen.getByText('Proposed changes')).toBeInTheDocument()
    })

    describe('Button Variants', () => {
        it('should render success variant button for Accept action', () => {
            // @ts-expect-error mock data
            render(<TaskCard {...defaultProps} currentUserId="user-1" expanded={true} />)
            // Accept button should use success/green variant
            const acceptButton = screen.getByText('Accept')
            expect(acceptButton).toBeInTheDocument()
            // Verify it has success variant CSS class (green styling)
            expect(acceptButton).toHaveClass('bg-green-600')
        })

        it('should render destructive variant button for Reject action', () => {
            // @ts-expect-error mock data
            render(<TaskCard {...defaultProps} currentUserId="user-1" expanded={true} />)
            // Reject button should use destructive/red variant
            const rejectButton = screen.getByText('Reject')
            expect(rejectButton).toBeInTheDocument()
            // Verify it has destructive variant CSS class (red styling)
            expect(rejectButton).toHaveClass('bg-red-600')
        })

        it('should render warning variant button for Forward action', () => {
            // @ts-expect-error mock data
            render(<TaskCard {...defaultProps} currentUserId="user-1" expanded={true} />)
            // Forward button should use warning/yellow variant
            const forwardButton = screen.getByText('Forward')
            expect(forwardButton).toBeInTheDocument()
            // Verify it has warning variant CSS class (yellow/amber styling)
            expect(forwardButton).toHaveClass('bg-yellow-600')
        })
    })

    describe('ARIA Attributes', () => {
        it('should have aria-checked attribute in selection mode', () => {
            // @ts-expect-error mock data
            render(<TaskCard {...defaultProps} isSelectionMode={true} isSelected={true} />)
            const checkbox = screen.getByRole('checkbox')
            expect(checkbox).toHaveAttribute('aria-checked', 'true')
            expect(checkbox).toHaveAttribute('aria-label', 'Select task Test Task')
        })

        it('should have aria-checked false when not selected', () => {
            // @ts-expect-error mock data
            render(<TaskCard {...defaultProps} isSelectionMode={true} isSelected={false} />)
            const checkbox = screen.getByRole('checkbox')
            expect(checkbox).toHaveAttribute('aria-checked', 'false')
        })

        it('should have aria-expanded attribute for collapsible sections', () => {
            // @ts-expect-error mock data
            const { container } = render(<TaskCard {...defaultProps} expanded={true} />)
            // Check for elements with aria-expanded attribute
            const elementsWithAriaExpanded = container.querySelectorAll('[aria-expanded]')
            // When the card is expanded, there should be at least one element with aria-expanded
            expect(elementsWithAriaExpanded.length).toBeGreaterThan(0)
            // Verify at least one element has aria-expanded="true"
            const hasExpandedTrue = Array.from(elementsWithAriaExpanded).some(
                el => el.getAttribute('aria-expanded') === 'true'
            )
            expect(hasExpandedTrue).toBe(true)
        })
    })

    describe('Accessibility', () => {
        it('should be keyboard accessible', () => {
            // @ts-expect-error mock data
            render(<TaskCard {...defaultProps} />)
            const buttons = screen.getAllByRole('button')
            buttons.forEach(button => {
                expect(button).toBeInTheDocument()
            })
        })

        it('should have proper semantic HTML structure', () => {
            // @ts-expect-error mock data
            const { container } = render(<TaskCard {...defaultProps} />)
            // Check for proper heading structure
            const headings = container.querySelectorAll('h3')
            expect(headings.length).toBeGreaterThan(0)
        })
    })
})
