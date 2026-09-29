import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }))
vi.mock('@/contexts/AdminAuthContext', () => ({ useAdminAuth: vi.fn() }))

import { api } from '@/lib/api'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import { AdminSidebar } from './AdminSidebar'

const get = (api as unknown as { get: ReturnType<typeof vi.fn> }).get
const auth = useAdminAuth as unknown as ReturnType<typeof vi.fn>

const asRole = (role: 'SUPER_ADMIN' | 'FINANCE' | 'SUPPORT') =>
  auth.mockReturnValue({ user: { id: 'u1', name: 'Ana Silva', email: 'a@x.com', role, createdAt: '' } })

function renderSidebar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AdminSidebar />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  get.mockImplementation((url: string) => {
    if (url === '/support-tickets') return Promise.resolve({ data: { data: [], total: 7, page: 1, limit: 1 } })
    if (url === '/metrics/summary') return Promise.reject({ response: { status: 403 } })
    return Promise.reject(new Error(`unexpected ${url}`))
  })
})

describe('AdminSidebar — Suporte item', () => {
  it('SUPPORT sees the item and a badge from GET /support-tickets total, even though /metrics/summary is 403', async () => {
    asRole('SUPPORT')
    renderSidebar()

    expect(await screen.findByRole('link', { name: /Suporte/ })).toHaveAttribute('href', '/support')
    expect(await screen.findByText('7')).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('/support-tickets', { params: { status: 'OPEN', limit: 1 } })
  })

  it('SUPER_ADMIN sees the item and badge', async () => {
    asRole('SUPER_ADMIN')
    renderSidebar()
    expect(await screen.findByRole('link', { name: /Suporte/ })).toBeInTheDocument()
    expect(await screen.findByText('7')).toBeInTheDocument()
  })

  it('FINANCE does not see the item and never calls /support-tickets', async () => {
    asRole('FINANCE')
    renderSidebar()

    expect(screen.queryByRole('link', { name: /Suporte/ })).not.toBeInTheDocument()
    expect(get).not.toHaveBeenCalledWith('/support-tickets', expect.anything())
  })

  it('hides the badge when there are no open tickets', async () => {
    get.mockImplementation((url: string) =>
      url === '/support-tickets'
        ? Promise.resolve({ data: { data: [], total: 0, page: 1, limit: 1 } })
        : Promise.reject({ response: { status: 403 } }),
    )
    asRole('SUPPORT')
    renderSidebar()

    const link = await screen.findByRole('link', { name: /Suporte/ })
    expect(link).not.toHaveTextContent(/\d/)
  })
})
