import { render, screen } from '@testing-library/react'
import { Button, buttonVariants } from '../button'
import '@testing-library/jest-dom'

describe('Button Component', () => {
    describe('Semantic Variants', () => {
        it('should render primary variant with correct classes', () => {
            const { container } = render(<Button variant="default">Primary Button</Button>)
            const button = screen.getByText('Primary Button')
            expect(button).toHaveClass('bg-slate-900', 'hover:bg-slate-800', 'text-white')
        })

        it('should render success variant with correct classes', () => {
            const { container } = render(<Button variant="success">Success Button</Button>)
            const button = screen.getByText('Success Button')
            expect(button).toHaveClass('bg-green-600', 'hover:bg-green-700', 'text-white')
        })

        it('should render warning variant with correct classes', () => {
            const { container } = render(<Button variant="warning">Warning Button</Button>)
            const button = screen.getByText('Warning Button')
            expect(button).toHaveClass('bg-amber-500', 'hover:bg-amber-600', 'text-white')
        })

        it('should render danger variant with correct classes', () => {
            const { container } = render(<Button variant="danger">Danger Button</Button>)
            const button = screen.getByText('Danger Button')
            expect(button).toHaveClass('bg-red-600', 'hover:bg-red-700', 'text-white')
        })

        it('should render certified variant with correct classes', () => {
            const { container } = render(<Button variant="success">Certified Button</Button>)
            const button = screen.getByText('Certified Button')
            expect(button).toHaveClass('bg-purple-600', 'hover:bg-purple-700', 'text-white')
        })

        it('should render default variant when no variant specified', () => {
            const { container } = render(<Button>Default Button</Button>)
            const button = screen.getByText('Default Button')
            expect(button).toHaveClass('bg-primary', 'text-primary-foreground')
        })
    })

    describe('Size Variants', () => {
        it('should render sm size with correct classes', () => {
            render(<Button size="sm">Small Button</Button>)
            const button = screen.getByText('Small Button')
            expect(button).toHaveClass('h-9', 'min-h-[44px]', 'md:min-h-0', 'rounded-md', 'px-3')
        })

        it('should render default size with correct classes', () => {
            render(<Button size="default">Default Size Button</Button>)
            const button = screen.getByText('Default Size Button')
            expect(button).toHaveClass('h-11', 'px-4', 'py-2')
        })

        it('should render lg size with correct classes', () => {
            render(<Button size="lg">Large Button</Button>)
            const button = screen.getByText('Large Button')
            expect(button).toHaveClass('h-11', 'rounded-md', 'px-8')
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
        it('should generate correct classes for primary variant', () => {
            const classes = buttonVariants({ variant: 'primary' })
            expect(classes).toContain('bg-slate-900')
            expect(classes).toContain('hover:bg-slate-800')
            expect(classes).toContain('text-white')
        })

        it('should generate correct classes for success variant', () => {
            const classes = buttonVariants({ variant: 'success' })
            expect(classes).toContain('bg-green-600')
            expect(classes).toContain('hover:bg-green-700')
            expect(classes).toContain('text-white')
        })

        it('should generate correct classes for warning variant', () => {
            const classes = buttonVariants({ variant: 'warning' })
            expect(classes).toContain('bg-amber-500')
            expect(classes).toContain('hover:bg-amber-600')
            expect(classes).toContain('text-white')
        })

        it('should generate correct classes for danger variant', () => {
            const classes = buttonVariants({ variant: 'danger' })
            expect(classes).toContain('bg-red-600')
            expect(classes).toContain('hover:bg-red-700')
            expect(classes).toContain('text-white')
        })

        it('should generate correct classes for certified variant', () => {
            const classes = buttonVariants({ variant: 'certified' })
            expect(classes).toContain('bg-purple-600')
            expect(classes).toContain('hover:bg-purple-700')
            expect(classes).toContain('text-white')
        })
    })
})
