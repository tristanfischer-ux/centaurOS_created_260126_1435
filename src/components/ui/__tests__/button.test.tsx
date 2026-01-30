import { render, screen } from '@testing-library/react'
import { Button, buttonVariants } from '../button'
import '@testing-library/jest-dom'

describe('Button Component', () => {
    describe('Semantic Variants', () => {
        it('should render default variant with correct classes', () => {
            render(<Button variant="default">Primary Button</Button>)
            const button = screen.getByText('Primary Button')
            expect(button).toHaveClass('bg-accent', 'text-accent-foreground')
        })

        it('should render success variant with correct classes', () => {
            render(<Button variant="success">Success Button</Button>)
            const button = screen.getByText('Success Button')
            expect(button).toHaveClass('bg-status-success', 'text-status-success-foreground')
        })

        it('should render warning variant with correct classes', () => {
            render(<Button variant="warning">Warning Button</Button>)
            const button = screen.getByText('Warning Button')
            expect(button).toHaveClass('bg-status-warning', 'text-status-warning-foreground')
        })

        it('should render destructive variant with correct classes', () => {
            render(<Button variant="destructive">Destructive Button</Button>)
            const button = screen.getByText('Destructive Button')
            expect(button).toHaveClass('bg-destructive', 'text-destructive-foreground')
        })

        it('should render secondary variant with correct classes', () => {
            render(<Button variant="secondary">Secondary Button</Button>)
            const button = screen.getByText('Secondary Button')
            expect(button).toHaveClass('border-2', 'border-input', 'bg-background')
        })

        it('should render default variant when no variant specified', () => {
            render(<Button>Default Button</Button>)
            const button = screen.getByText('Default Button')
            expect(button).toHaveClass('bg-accent', 'text-accent-foreground')
        })
    })

    describe('Size Variants', () => {
        it('should render sm size with correct classes', () => {
            render(<Button size="sm">Small Button</Button>)
            const button = screen.getByText('Small Button')
            expect(button).toHaveClass('h-9', 'min-h-[44px]', 'md:min-h-0', 'px-3')
        })

        it('should render default size with correct classes', () => {
            render(<Button size="default">Default Size Button</Button>)
            const button = screen.getByText('Default Size Button')
            expect(button).toHaveClass('h-11', 'px-4', 'py-2')
        })

        it('should render lg size with correct classes', () => {
            render(<Button size="lg">Large Button</Button>)
            const button = screen.getByText('Large Button')
            expect(button).toHaveClass('h-12', 'px-8')
        })

        it('should render icon size with correct classes', () => {
            render(<Button size="icon">Icon Button</Button>)
            const button = screen.getByText('Icon Button')
            expect(button).toHaveClass('h-11', 'w-11')
        })
    })

    describe('Accessibility', () => {
        it('should be accessible as a button element', () => {
            render(<Button>Accessible Button</Button>)
            const button = screen.getByRole('button', { name: 'Accessible Button' })
            expect(button).toBeInTheDocument()
        })

        it('should support disabled state', () => {
            render(<Button disabled>Disabled Button</Button>)
            const button = screen.getByText('Disabled Button')
            expect(button).toBeDisabled()
            expect(button).toHaveClass('disabled:pointer-events-none', 'disabled:opacity-50')
        })
    })

    describe('buttonVariants utility', () => {
        it('should generate correct classes for default variant', () => {
            const classes = buttonVariants({ variant: 'default' })
            expect(classes).toContain('bg-accent')
            expect(classes).toContain('text-accent-foreground')
        })

        it('should generate correct classes for success variant', () => {
            const classes = buttonVariants({ variant: 'success' })
            expect(classes).toContain('bg-status-success')
            expect(classes).toContain('text-status-success-foreground')
        })

        it('should generate correct classes for warning variant', () => {
            const classes = buttonVariants({ variant: 'warning' })
            expect(classes).toContain('bg-status-warning')
            expect(classes).toContain('text-status-warning-foreground')
        })

        it('should generate correct classes for destructive variant', () => {
            const classes = buttonVariants({ variant: 'destructive' })
            expect(classes).toContain('bg-destructive')
            expect(classes).toContain('text-destructive-foreground')
        })

        it('should generate correct classes for ghost variant', () => {
            const classes = buttonVariants({ variant: 'ghost' })
            expect(classes).toContain('hover:bg-accent/10')
        })
    })
})
