import { render, screen } from '@testing-library/react'
import { EmptyState } from '../empty-state'
import { Button } from '../button'
import '@testing-library/jest-dom'

describe('EmptyState Component', () => {
    describe('Rendering', () => {
        it('should render with title', () => {
            render(<EmptyState title="No items found" />)
            expect(screen.getByText('No items found')).toBeInTheDocument()
        })

        it('should render with optional description', () => {
            render(
                <EmptyState 
                    title="No items found" 
                    description="Try adding some items to get started"
                />
            )
            expect(screen.getByText('No items found')).toBeInTheDocument()
            expect(screen.getByText('Try adding some items to get started')).toBeInTheDocument()
        })

        it('should render without description when not provided', () => {
            render(<EmptyState title="No items found" />)
            expect(screen.getByText('No items found')).toBeInTheDocument()
            expect(screen.queryByText(/Try adding/i)).not.toBeInTheDocument()
        })

        it('should render with optional icon', () => {
            const TestIcon = () => <span data-testid="test-icon">📦</span>
            render(
                <EmptyState 
                    title="No items found" 
                    icon={<TestIcon />}
                />
            )
            expect(screen.getByTestId('test-icon')).toBeInTheDocument()
        })

        it('should render without icon when not provided', () => {
            render(<EmptyState title="No items found" />)
            expect(screen.queryByTestId('test-icon')).not.toBeInTheDocument()
        })

        it('should render with optional action button', () => {
            render(
                <EmptyState 
                    title="No items found" 
                    action={<Button>Add Item</Button>}
                />
            )
            expect(screen.getByText('No items found')).toBeInTheDocument()
            expect(screen.getByText('Add Item')).toBeInTheDocument()
        })

        it('should render without action button when not provided', () => {
            render(<EmptyState title="No items found" />)
            expect(screen.queryByText('Add Item')).not.toBeInTheDocument()
        })

        it('should render all props together', () => {
            const TestIcon = () => <span data-testid="test-icon">📦</span>
            render(
                <EmptyState 
                    title="No items found" 
                    description="Try adding some items"
                    icon={<TestIcon />}
                    action={<Button>Add Item</Button>}
                />
            )
            expect(screen.getByText('No items found')).toBeInTheDocument()
            expect(screen.getByText('Try adding some items')).toBeInTheDocument()
            expect(screen.getByTestId('test-icon')).toBeInTheDocument()
            expect(screen.getByText('Add Item')).toBeInTheDocument()
        })
    })

    describe('Styling', () => {
        it('should apply custom className', () => {
            const { container } = render(
                <EmptyState 
                    title="Test" 
                    className="custom-class"
                />
            )
            const emptyState = container.firstChild
            expect(emptyState).toHaveClass('custom-class')
        })

        it('should have proper layout classes', () => {
            const { container } = render(<EmptyState title="Test" />)
            const emptyState = container.firstChild
            expect(emptyState).toHaveClass('flex', 'flex-col', 'items-center', 'justify-center')
        })
    })

    describe('Accessibility', () => {
        it('should have proper heading structure', () => {
            render(<EmptyState title="No items found" />)
            const heading = screen.getByRole('heading', { level: 3 })
            expect(heading).toHaveTextContent('No items found')
        })

        it('should be accessible with action button', () => {
            render(
                <EmptyState 
                    title="No items found" 
                    action={<Button>Add Item</Button>}
                />
            )
            const button = screen.getByRole('button', { name: 'Add Item' })
            expect(button).toBeInTheDocument()
        })
    })
})
