import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ProductOverviewCard } from '../product-overview-card'

describe('ProductOverviewCard', () => {
  it('renders overview text in view mode', () => {
    render(
      <ProductOverviewCard
        overview="This is a product overview."
        onSave={jest.fn()}
      />
    )
    expect(screen.getByText('Product Overview')).toBeInTheDocument()
    expect(screen.getByText('This is a product overview.')).toBeInTheDocument()
    expect(screen.getByText('Edit')).toBeInTheDocument()
  })

  it('shows Add prompt when overview is empty', () => {
    render(
      <ProductOverviewCard overview="" onSave={jest.fn()} />
    )
    expect(screen.getByText('Product Overview')).toBeInTheDocument()
    expect(screen.getByText('Add')).toBeInTheDocument()
    expect(screen.getByText(/No product overview yet/)).toBeInTheDocument()
  })

  it('switches to edit mode on Edit click', () => {
    render(
      <ProductOverviewCard
        overview="Some overview text"
        onSave={jest.fn()}
      />
    )
    fireEvent.click(screen.getByText('Edit'))
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
    expect(screen.getByText('Save')).toBeInTheDocument()
  })

  it('calls onSave with edited text on Save', () => {
    const onSave = jest.fn()
    render(
      <ProductOverviewCard
        overview="Original text"
        onSave={onSave}
      />
    )
    fireEvent.click(screen.getByText('Edit'))
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Updated text' } })
    fireEvent.click(screen.getByText('Save'))

    expect(onSave).toHaveBeenCalledWith('Updated text')
    // Should exit edit mode
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('reverts to original text on Cancel', () => {
    const onSave = jest.fn()
    render(
      <ProductOverviewCard
        overview="Original text"
        onSave={onSave}
      />
    )
    fireEvent.click(screen.getByText('Edit'))
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'Changed text' } })
    fireEvent.click(screen.getByText('Cancel'))

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText('Original text')).toBeInTheDocument()
  })
})
