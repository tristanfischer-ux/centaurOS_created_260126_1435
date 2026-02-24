import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ModuleImageGrid } from '../module-image-grid'
import type { CadLabModule } from '@/lib/cad-lab-types'

// Mock framer-motion to avoid animation issues in tests
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}))

const mockModule: CadLabModule = {
  id: 'test-module-1',
  name: 'Propulsion Assembly',
  purpose: 'Provides thrust for the vehicle',
  description: 'A detailed description of the propulsion assembly including all components.',
  whyItMatters: 'Without propulsion the vehicle cannot move.',
  inputs: ['Fuel', 'Electrical Power'],
  outputs: ['Thrust Vector', 'Exhaust'],
  keyParts: ['Turbopump', 'Combustion Chamber', 'Nozzle'],
  leadWeeks: 12,
  failureModes: ['Turbopump cavitation', 'Seal failure'],
  unknowns: ['Fuel mixture ratio optimization'],
  status: 'pending',
  imageStatus: 'complete',
  imageUrl: 'https://example.com/image.png',
}

describe('ModuleImageGrid', () => {
  it('renders module cards for revealed modules', () => {
    render(
      <ModuleImageGrid
        modules={[mockModule]}
        revealedModuleIds={new Set(['test-module-1'])}
        expandedModuleId={null}
        onToggleExpand={jest.fn()}
      />
    )

    expect(screen.getByText('Propulsion Assembly')).toBeInTheDocument()
    expect(screen.getByText('Provides thrust for the vehicle')).toBeInTheDocument()
  })

  it('opens detail dialog when expandedModuleId is set', () => {
    render(
      <ModuleImageGrid
        modules={[mockModule]}
        revealedModuleIds={new Set(['test-module-1'])}
        expandedModuleId="test-module-1"
        onToggleExpand={jest.fn()}
      />
    )

    // Dialog should be open with module details
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()

    const within = (el: HTMLElement) => ({
      getByText: (text: string | RegExp) => {
        const all = screen.getAllByText(text)
        const match = all.find((node) => el.contains(node))
        if (!match) throw new Error(`Could not find "${text}" within dialog`)
        return match
      },
    })
    const dlg = within(dialog)

    dlg.getByText('Propulsion Assembly')
    dlg.getByText('Description')
    dlg.getByText(/detailed description of the propulsion/)
    dlg.getByText('Why This Module Matters')
    dlg.getByText('Without propulsion the vehicle cannot move.')
    dlg.getByText('Key Components')
    dlg.getByText('Turbopump')
    dlg.getByText('Failure Modes')
    dlg.getByText('Turbopump cavitation')
    dlg.getByText('Unknowns')
    dlg.getByText('Fuel mixture ratio optimization')
    dlg.getByText(/12 weeks lead time/)
  })

  it('does not show dialog when expandedModuleId is null', () => {
    render(
      <ModuleImageGrid
        modules={[mockModule]}
        revealedModuleIds={new Set(['test-module-1'])}
        expandedModuleId={null}
        onToggleExpand={jest.fn()}
      />
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('calls onToggleExpand when a module card is clicked', () => {
    const onToggleExpand = jest.fn()

    render(
      <ModuleImageGrid
        modules={[mockModule]}
        revealedModuleIds={new Set(['test-module-1'])}
        expandedModuleId={null}
        onToggleExpand={onToggleExpand}
      />
    )

    // Click the card (it's rendered as a Card with onClick)
    fireEvent.click(screen.getByText('Propulsion Assembly'))
    expect(onToggleExpand).toHaveBeenCalledWith('test-module-1')
  })
})
