import { render, screen } from '@testing-library/react'
import { Dialog, DialogContent, DialogTitle } from '../dialog'
import '@testing-library/jest-dom'

describe('Dialog Component', () => {
    describe('Size Variants', () => {
        it('should render sm size with correct max-width class', () => {
            render(
                <Dialog open>
                    <DialogContent size="sm" data-testid="dialog-content">
                        <DialogTitle>Small Dialog</DialogTitle>
                        <p>Small Dialog</p>
                    </DialogContent>
                </Dialog>
            )
            const content = screen.getByTestId('dialog-content')
            expect(content).toHaveClass('sm:max-w-[425px]')
        })

        it('should render md size with correct max-width class', () => {
            render(
                <Dialog open>
                    <DialogContent size="md" data-testid="dialog-content">
                        <DialogTitle>Medium Dialog</DialogTitle>
                        <p>Medium Dialog</p>
                    </DialogContent>
                </Dialog>
            )
            const content = screen.getByTestId('dialog-content')
            expect(content).toHaveClass('sm:max-w-[600px]')
        })

        it('should render lg size with correct max-width class', () => {
            render(
                <Dialog open>
                    <DialogContent size="lg" data-testid="dialog-content">
                        <DialogTitle>Large Dialog</DialogTitle>
                        <p>Large Dialog</p>
                    </DialogContent>
                </Dialog>
            )
            const content = screen.getByTestId('dialog-content')
            expect(content).toHaveClass('sm:max-w-[800px]')
        })

        it('should render default size when no size specified', () => {
            render(
                <Dialog open>
                    <DialogContent data-testid="dialog-content">
                        <DialogTitle>Default Dialog</DialogTitle>
                        <p>Default Dialog</p>
                    </DialogContent>
                </Dialog>
            )
            const content = screen.getByTestId('dialog-content')
            expect(content).toHaveClass('sm:max-w-lg')
        })
    })

    describe('Accessibility', () => {
        it('should render with proper ARIA attributes', () => {
            render(
                <Dialog open>
                    <DialogContent data-testid="dialog-content">
                        <DialogTitle>Dialog Title</DialogTitle>
                        <p>Dialog Content</p>
                    </DialogContent>
                </Dialog>
            )
            // Verify dialog has proper role attribute
            const dialog = screen.getByRole('dialog')
            expect(dialog).toBeInTheDocument()
            
            // Verify aria-modal is set for modal dialogs
            expect(dialog).toHaveAttribute('aria-modal', 'true')
            
            // Verify dialog is labeled by the title (aria-labelledby or aria-describedby)
            const dialogTitle = screen.getByText('Dialog Title')
            expect(dialogTitle).toBeInTheDocument()
            
            // Check that the dialog has aria-labelledby pointing to the title
            const labelledBy = dialog.getAttribute('aria-labelledby')
            expect(labelledBy).toBeTruthy()
        })
    })
})
