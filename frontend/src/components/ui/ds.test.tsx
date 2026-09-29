import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilterChip, TableFooter } from './ds'

describe('FilterChip', () => {
  it('renders the count when provided', () => {
    render(<FilterChip label="Todas" count={3} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('renders no count badge when count is omitted', () => {
    render(<FilterChip label="Abertos" />)
    expect(screen.getByRole('button', { name: 'Abertos' })).toBeInTheDocument()
  })
})

describe('TableFooter', () => {
  it('keeps the legacy behaviour without onPageChange (Anterior disabled, range starts at 1)', () => {
    render(<TableFooter showing={5} total={12} />)
    expect(screen.getByText('1–5')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Anterior/ })).toBeDisabled()
  })

  it('shows the real range for page 2 and pages via onPageChange', () => {
    const onPageChange = vi.fn()
    render(<TableFooter showing={20} total={45} page={2} limit={20} onPageChange={onPageChange} />)

    expect(screen.getByText('21–40')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Próxima/ }))
    expect(onPageChange).toHaveBeenCalledWith(3)
    fireEvent.click(screen.getByRole('button', { name: /Anterior/ }))
    expect(onPageChange).toHaveBeenCalledWith(1)
  })

  it('disables Próxima on the last page and Anterior on the first', () => {
    const { rerender } = render(
      <TableFooter showing={5} total={45} page={3} limit={20} onPageChange={() => {}} />,
    )
    expect(screen.getByRole('button', { name: /Próxima/ })).toBeDisabled()

    rerender(<TableFooter showing={20} total={45} page={1} limit={20} onPageChange={() => {}} />)
    expect(screen.getByRole('button', { name: /Anterior/ })).toBeDisabled()
  })

  it('shows 0–0 for an empty result', () => {
    render(<TableFooter showing={0} total={0} page={1} limit={20} onPageChange={() => {}} />)
    expect(screen.getByText('0–0')).toBeInTheDocument()
  })
})
