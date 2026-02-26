import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ProcessFlowDiagram } from '../process-flow-diagram'
import type { CadLabModule } from '@/lib/cad-lab-types'

const baseModule = {
  purpose: '',
  description: '',
  whyItMatters: '',
  keyParts: [],
  leadWeeks: 0,
  failureModes: [],
  unknowns: [],
  status: 'pending' as const,
  imageStatus: 'pending' as const,
  imageUrl: undefined,
}

const connectedModules: CadLabModule[] = [
  {
    ...baseModule,
    id: 'mod-a',
    name: 'Power Supply',
    inputs: ['AC mains voltage'],
    outputs: ['DC power supply output 24V'],
  },
  {
    ...baseModule,
    id: 'mod-b',
    name: 'Motor Controller',
    inputs: ['DC power supply input 24V', 'Control signal data'],
    outputs: ['PWM motor drive signal'],
  },
  {
    ...baseModule,
    id: 'mod-c',
    name: 'Sensor Array',
    inputs: ['DC power supply input 24V'],
    outputs: ['Sensor telemetry data signal'],
  },
]

// Module with no overlapping IO keywords (orphan)
const orphanModule: CadLabModule = {
  ...baseModule,
  id: 'mod-orphan',
  name: 'Standalone Unit',
  inputs: ['Completely unique foo input'],
  outputs: ['Completely unique bar output'],
}

describe('ProcessFlowDiagram interactivity', () => {
  it('renders module cards as clickable buttons when onModuleClick is provided', () => {
    render(
      <ProcessFlowDiagram
        modules={connectedModules}
        onModuleClick={jest.fn()}
      />
    )
    const buttons = screen.getAllByRole('button')
    const moduleButtons = buttons.filter((b) => b.getAttribute('aria-label')?.includes('click to view'))
    expect(moduleButtons.length).toBe(3)
  })

  it('calls onModuleClick when a module card is clicked', () => {
    const onModuleClick = jest.fn()
    render(
      <ProcessFlowDiagram
        modules={connectedModules}
        onModuleClick={onModuleClick}
      />
    )
    const powerSupplyButton = screen.getAllByRole('button').find(
      (b) => b.getAttribute('aria-label')?.includes('Power Supply')
    )
    expect(powerSupplyButton).toBeTruthy()
    fireEvent.click(powerSupplyButton!)
    expect(onModuleClick).toHaveBeenCalledWith('mod-a')
  })

  it('calls onModuleClick on Enter keypress', () => {
    const onModuleClick = jest.fn()
    render(
      <ProcessFlowDiagram
        modules={connectedModules}
        onModuleClick={onModuleClick}
      />
    )
    const motorButton = screen.getAllByRole('button').find(
      (b) => b.getAttribute('aria-label')?.includes('Motor Controller')
    )
    fireEvent.keyDown(motorButton!, { key: 'Enter' })
    expect(onModuleClick).toHaveBeenCalledWith('mod-b')
  })

  it('shows orphan callout when modules are unconnected', () => {
    const modulesWithOrphan = [...connectedModules, orphanModule]
    render(
      <ProcessFlowDiagram
        modules={modulesWithOrphan}
        onModuleClick={jest.fn()}
      />
    )
    expect(screen.getByText(/not connected/)).toBeInTheDocument()
    // "Standalone Unit" appears in both the card and the orphan callout
    expect(screen.getAllByText('Standalone Unit').length).toBeGreaterThanOrEqual(2)
  })

  it('shows "all connected" message when there are no orphans', () => {
    render(
      <ProcessFlowDiagram
        modules={connectedModules}
        onModuleClick={jest.fn()}
      />
    )
    expect(screen.getByText(/integration coverage looks good/)).toBeInTheDocument()
  })

  it('renders module cards as non-clickable when onModuleClick is not provided', () => {
    render(
      <ProcessFlowDiagram modules={connectedModules} />
    )
    // Cards should have role="button" but cursor-default
    const buttons = screen.getAllByRole('button')
    const moduleButtons = buttons.filter((b) => b.getAttribute('aria-label')?.includes('click to view'))
    moduleButtons.forEach((btn) => {
      expect(btn.className).toContain('cursor-default')
    })
  })
})
