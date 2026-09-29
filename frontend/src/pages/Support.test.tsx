import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { SupportTicket } from '@/types/admin'

vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }))

import { api } from '@/lib/api'
import { SupportPage } from './Support'

const get = (api as unknown as { get: ReturnType<typeof vi.fn> }).get

const ticket = (over: Partial<SupportTicket> = {}): SupportTicket => ({
  id: 't1',
  organizationId: 'org-1',
  organization: { id: 'org-1', name: 'Clínica Aurora' },
  category: 'BUG',
  status: 'OPEN',
  reporterName: 'Dr. João',
  reporterEmail: 'joao@test.com',
  reporterRole: 'PROFESSIONAL',
  description: 'Não consegui salvar a evolução do paciente',
  context: { route: '/x', url: 'https://a/x', userAgent: 'UA', appVersion: '1.0.0', occurredAt: '2026-09-25T20:14:32.000Z' },
  sentryEventId: null,
  internalNote: null,
  emailReplyBody: null,
  emailRepliedAt: null,
  emailRepliedByAdminId: null,
  createdAt: '2026-09-25T20:14:32.000Z',
  updatedAt: '2026-09-25T20:14:32.000Z',
  ...over,
})

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SupportPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('SupportPage', () => {
  it('lists tickets with status, category, reporter and organization link', async () => {
    get.mockResolvedValue({ data: { data: [ticket()], total: 1, page: 1, limit: 20 } })
    renderPage()

    expect(await screen.findByText('Não consegui salvar a evolução do paciente')).toBeInTheDocument()
    expect(screen.getByText('Aberto')).toBeInTheDocument()
    expect(screen.getByText('Problema')).toBeInTheDocument()
    expect(screen.getByText('Dr. João')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Clínica Aurora' })).toHaveAttribute('href', '/organizations/org-1')
    expect(screen.getByRole('link', { name: /Não consegui salvar/ })).toHaveAttribute('href', '/support/t1')
  })

  it('shows a red error banner (not a skeleton) when the query fails', async () => {
    get.mockRejectedValue(new Error('boom'))
    renderPage()
    expect(await screen.findByText('Falha ao carregar chamados. Tente novamente.')).toBeInTheDocument()
  })

  it('shows an empty state when there are no tickets', async () => {
    get.mockResolvedValue({ data: { data: [], total: 0, page: 1, limit: 20 } })
    renderPage()
    expect(await screen.findByText('Nenhum chamado encontrado')).toBeInTheDocument()
  })

  it('filters by status and resets to page 1', async () => {
    get.mockResolvedValue({ data: { data: [ticket()], total: 45, page: 1, limit: 20 } })
    renderPage()
    await screen.findByText('Dr. João')

    fireEvent.click(screen.getByRole('button', { name: /Próxima/ }))
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/support-tickets', { params: { page: 2, limit: 20 } }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Abertos' }))
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/support-tickets', {
        params: { page: 1, limit: 20, status: 'OPEN' },
      }),
    )
  })

  it('falls back to "—" when the organization was not included', async () => {
    get.mockResolvedValue({ data: { data: [ticket({ organization: undefined })], total: 1, page: 1, limit: 20 } })
    renderPage()
    await screen.findByText('Dr. João')
    expect(screen.queryByRole('link', { name: 'Clínica Aurora' })).not.toBeInTheDocument()
  })
})
