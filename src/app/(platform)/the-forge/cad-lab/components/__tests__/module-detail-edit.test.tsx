import { render, screen, fireEvent, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ModuleImageGrid } from '../module-image-grid'
import type { CadLabModule } from '@/lib/cad-lab-types'

// Suppress expected console.error from mocked framer-motion props
let consoleErrorSpy: jest.SpyInstance
beforeAll(() => { consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {}) })
afterAll(() => { consoleErrorSpy.mockRestore() })

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, layout: _layout, initial: _initial, animate: _animate, exit: _exit, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}))

const mockModule: CadLabModule = {
  id: 'mod-1',
  name: 'Test Module',
  purpose: 'Test purpose',
  description: 'A test description',
  whyItMatters: 'It matters because testing',
  inputs: ['Input A'],
  outputs: ['Output B'],
  keyParts: ['Part 1'],
  leadWeeks: 4,
  failureModes: ['Failure mode 1'],
  unknowns: ['Unknown 1'],
  status: 'pending',
  imageStatus: 'complete',
  imageUrl: 'https://example.com/image.png',
}

describe('ModuleDetailDialog edit mode', () => {
  it('shows Edit button when onModuleSave is provided', () => {
    render(
      <ModuleImageGrid
        modules={[mockModule]}
        revealedModuleIds={new Set(['mod-1'])}
        expandedModuleId="mod-1"
        onToggleExpand={jest.fn()}
        onModuleSave={jest.fn()}
      />
    )
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Edit')).toBeInTheDocument()
  })

  it('does not show Edit button when onModuleSave is not provided', () => {
    render(
      <ModuleImageGrid
        modules={[mockModule]}
        revealedModuleIds={new Set(['mod-1'])}
        expandedModuleId="mod-1"
        onToggleExpand={jest.fn()}
      />
    )
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByText('Edit')).not.toBeInTheDocument()
  })

  it('enters edit mode and shows editable fields', () => {
    render(
      <ModuleImageGrid
        modules={[mockModule]}
        revealedModuleIds={new Set(['mod-1'])}
        expandedModuleId="mod-1"
        onToggleExpand={jest.fn()}
        onModuleSave={jest.fn()}
      />
    )
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByText('Edit'))

    // Should show Save changes and Cancel buttons
    expect(within(dialog).getByText('Save changes')).toBeInTheDocument()
    expect(within(dialog).getByText('Cancel')).toBeInTheDocument()

    // Should have editable textareas for description
    const textareas = dialog.querySelectorAll('textarea')
    expect(textareas.length).toBeGreaterThanOrEqual(2) // description + whyItMatters at minimum
  })

  it('calls onModuleSave with updated module on Save', () => {
    const onModuleSave = jest.fn()
    render(
      <ModuleImageGrid
        modules={[mockModule]}
        revealedModuleIds={new Set(['mod-1'])}
        expandedModuleId="mod-1"
        onToggleExpand={jest.fn()}
        onModuleSave={onModuleSave}
      />
    )
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByText('Edit'))

    // Modify the description textarea
    const textareas = dialog.querySelectorAll('textarea')
    const descTextarea = Array.from(textareas).find(
      (ta) => ta.textContent === 'A test description' || (ta as HTMLTextAreaElement).value === 'A test description'
    )
    if (descTextarea) {
      fireEvent.change(descTextarea, { target: { value: 'Updated description' } })
    }

    fireEvent.click(within(dialog).getByText('Save changes'))
    expect(onModuleSave).toHaveBeenCalledTimes(1)

    const saved = onModuleSave.mock.calls[0][0] as CadLabModule
    expect(saved.id).toBe('mod-1')
    // It filters empty strings from arrays
    expect(saved.inputs).not.toContain('')
    expect(saved.outputs).not.toContain('')
  })

  it('reverts changes on Cancel', () => {
    const onModuleSave = jest.fn()
    render(
      <ModuleImageGrid
        modules={[mockModule]}
        revealedModuleIds={new Set(['mod-1'])}
        expandedModuleId="mod-1"
        onToggleExpand={jest.fn()}
        onModuleSave={onModuleSave}
      />
    )
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByText('Edit'))
    fireEvent.click(within(dialog).getByText('Cancel'))

    // Should return to view mode
    expect(within(dialog).queryByText('Save changes')).not.toBeInTheDocument()
    // Original data should be displayed
    expect(within(dialog).getByText('A test description')).toBeInTheDocument()
    expect(onModuleSave).not.toHaveBeenCalled()
  })
})
