import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { SupportTicket } from '@/types/admin'

vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() } }))

import { api } from '@/lib/api'
import { ToastProvider } from '@/contexts/ToastContext'
import { SupportDetailPage } from './SupportDetail'

const mocked = api as unknown as {
  get: ReturnType<typeof vi.fn>
  patch: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
}

const ticket = (over: Partial<SupportTicket> = {}): SupportTicket => ({
  id: '11111111-2222-3333-4444-555555555555',
  organizationId: 'org-1',
  organization: { id: 'org-1', name: 'Clínica Aurora' },
  category: 'BUG',
  status: 'OPEN',
  reporterName: 'Dr. João',
  reporterEmail: 'joao@test.com',
  reporterRole: 'PROFESSIONAL',
  description: 'Não consegui salvar a evolução',
  context: {
    route: '/patients/:id/evolutions',
    url: 'https://app.soupelvi.com.br/patients/1/evolutions',
    userAgent: 'Mozilla/5.0',
    appVersion: '1.8.2',
    sessionId: 'sess-1',
    occurredAt: '2026-09-25T20:14:32.000Z',
  },
  sentryEventId: 'abc123def',
  internalNote: null,
  emailReplyBody: null,
  emailRepliedAt: null,
  emailRepliedByAdminId: null,
  createdAt: '2026-09-25T20:14:32.000Z',
  updatedAt: '2026-09-25T20:14:32.000Z',
  ...over,
})

function renderPage(id = '11111111-2222-3333-4444-555555555555') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[`/support/${id}`]}>
          <Routes>
            <Route path="/support/:id" element={<SupportDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
})

describe('SupportDetailPage', () => {
  it('renders reporter, description, captured context and the sentry id as plain text', async () => {
    mocked.get.mockResolvedValue({ data: ticket() })
    renderPage()

    expect(await screen.findByText('Não consegui salvar a evolução')).toBeInTheDocument()
    expect(screen.getByText('joao@test.com')).toBeInTheDocument()
    expect(screen.getByText('/patients/:id/evolutions')).toBeInTheDocument()
    expect(screen.getByText('1.8.2')).toBeInTheDocument()
    expect(screen.getByText('sess-1')).toBeInTheDocument()
    expect(screen.getByText('abc123def')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /abc123def/ })).not.toBeInTheDocument()
  })

  it('copies the sentry event id to the clipboard', async () => {
    mocked.get.mockResolvedValue({ data: ticket() })
    renderPage()
    await screen.findByText('abc123def')

    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('abc123def')
  })

  it('renders nulls as "—" without crashing (role, sentry id, session id)', async () => {
    mocked.get.mockResolvedValue({
      data: ticket({
        reporterRole: null,
        sentryEventId: null,
        context: { route: '/', url: 'u', userAgent: 'ua', appVersion: '1', occurredAt: '2026-09-25T20:14:32.000Z' },
      }),
    })
    renderPage()
    await screen.findByText('Não consegui salvar a evolução')
    expect(screen.queryByRole('button', { name: 'Copiar' })).not.toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3)
  })

  it('shows an error banner when the ticket cannot be loaded (404)', async () => {
    mocked.get.mockRejectedValue({ response: { status: 404, data: { message: 'Chamado não encontrado' } } })
    renderPage('does-not-exist')
    expect(await screen.findByText('Chamado não encontrado')).toBeInTheDocument()
  })

  it('changes status via PATCH and disables the current status button', async () => {
    mocked.get.mockResolvedValue({ data: ticket() })
    mocked.patch.mockResolvedValue({ data: ticket({ status: 'IN_PROGRESS' }) })
    renderPage()
    await screen.findByText('Não consegui salvar a evolução')

    expect(screen.getByRole('button', { name: 'Marcar como Aberto' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como Em análise' }))
    await waitFor(() =>
      expect(mocked.patch).toHaveBeenCalledWith(expect.stringMatching(/\/status$/), { status: 'IN_PROGRESS' }),
    )
  })

  it('saves the internal note, and blocks saving when unchanged or empty', async () => {
    mocked.get.mockResolvedValue({ data: ticket({ internalNote: 'nota antiga' }) })
    mocked.patch.mockResolvedValue({ data: ticket({ internalNote: 'nota nova' }) })
    renderPage()
    await screen.findByText('Não consegui salvar a evolução')

    const save = screen.getByRole('button', { name: 'Salvar nota' })
    expect(save).toBeDisabled()

    const textarea = screen.getByLabelText('Nota interna')
    fireEvent.change(textarea, { target: { value: '   ' } })
    expect(save).toBeDisabled()

    fireEvent.change(textarea, { target: { value: 'nota nova' } })
    expect(save).toBeEnabled()
    fireEvent.click(save)
    await waitFor(() =>
      expect(mocked.patch).toHaveBeenCalledWith(expect.stringMatching(/\/internal-note$/), { note: 'nota nova' }),
    )
  })

  it('sends a reply by e-mail when the reporter has an e-mail', async () => {
    mocked.get.mockResolvedValue({ data: ticket() })
    mocked.post.mockResolvedValue({ data: ticket({ emailReplyBody: 'Já corrigimos', emailRepliedAt: '2026-09-26T10:00:00.000Z' }) })
    renderPage()
    await screen.findByText('Não consegui salvar a evolução')

    const send = screen.getByRole('button', { name: 'Responder por e-mail' })
    expect(send).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Resposta por e-mail'), { target: { value: 'Já corrigimos' } })
    expect(send).toBeEnabled()
    fireEvent.click(send)
    await waitFor(() =>
      expect(mocked.post).toHaveBeenCalledWith(expect.stringMatching(/\/reply$/), { body: 'Já corrigimos' }),
    )
  })

  it('disables the reply form with an explanatory tooltip when reporterEmail is null', async () => {
    mocked.get.mockResolvedValue({ data: ticket({ reporterEmail: null }) })
    renderPage()
    await screen.findByText('Não consegui salvar a evolução')

    expect(screen.getByLabelText('Resposta por e-mail')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Responder por e-mail' })).toBeDisabled()
    expect(screen.getAllByTitle('Este chamado não possui e-mail do solicitante').length).toBeGreaterThanOrEqual(1)
    expect(mocked.post).not.toHaveBeenCalled()
  })

  it('shows the last sent reply when one exists', async () => {
    mocked.get.mockResolvedValue({
      data: ticket({ emailReplyBody: 'Já corrigimos o problema', emailRepliedAt: '2026-09-26T10:00:00.000Z' }),
    })
    renderPage()
    expect(await screen.findByText('Já corrigimos o problema')).toBeInTheDocument()
  })
})
