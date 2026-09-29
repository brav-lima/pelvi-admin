import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { SupportTicket, SupportTicketStatus } from '@/types/admin'
import type { UseMutationResult } from '@tanstack/react-query'

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
}))

import { api } from '@/lib/api'
import {
  STATUS_LABEL,
  CATEGORY_LABEL,
  useSupportTickets,
  useOpenSupportTicketsCount,
  useUpdateTicketStatus,
} from './support'

const mockedApi = api as unknown as {
  get: ReturnType<typeof vi.fn>
  patch: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
}

function wrapperWith(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('labels', () => {
  it('maps every status and category to a Portuguese label', () => {
    expect(STATUS_LABEL).toEqual({ OPEN: 'Aberto', IN_PROGRESS: 'Em análise', RESOLVED: 'Resolvido' })
    expect(CATEGORY_LABEL).toEqual({ BUG: 'Problema', SUGGESTION: 'Sugestão', QUESTION: 'Dúvida' })
  })
})

describe('useSupportTickets', () => {
  it('requests the list with page, limit and status, omitting status when undefined', async () => {
    mockedApi.get.mockResolvedValue({ data: { data: [], total: 0, page: 1, limit: 20 } })
    const client = newClient()

    const { result, rerender } = renderHook(
      ({ status }: { status?: SupportTicketStatus }) => useSupportTickets({ status, page: 2, limit: 20 }),
      { wrapper: wrapperWith(client), initialProps: { status: undefined as SupportTicketStatus | undefined } },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedApi.get).toHaveBeenCalledWith('/support-tickets', { params: { page: 2, limit: 20 } })

    rerender({ status: 'OPEN' as SupportTicketStatus })
    await waitFor(() =>
      expect(mockedApi.get).toHaveBeenCalledWith('/support-tickets', {
        params: { page: 2, limit: 20, status: 'OPEN' },
      }),
    )
  })
})

describe('useOpenSupportTicketsCount', () => {
  it('returns the total of GET /support-tickets?status=OPEN&limit=1 and never calls /metrics/summary', async () => {
    mockedApi.get.mockResolvedValue({ data: { data: [], total: 7, page: 1, limit: 1 } })

    const { result } = renderHook(() => useOpenSupportTicketsCount(true), {
      wrapper: wrapperWith(newClient()),
    })
    await waitFor(() => expect(result.current.data).toBe(7))

    expect(mockedApi.get).toHaveBeenCalledWith('/support-tickets', {
      params: { status: 'OPEN', limit: 1 },
    })
    expect(mockedApi.get).not.toHaveBeenCalledWith('/metrics/summary', expect.anything())
  })

  it('does not fire when disabled', () => {
    renderHook(() => useOpenSupportTicketsCount(false), { wrapper: wrapperWith(newClient()) })
    expect(mockedApi.get).not.toHaveBeenCalled()
  })
})

describe('useUpdateTicketStatus', () => {
  it('PATCHes the status and invalidates every support-ticket query', async () => {
    mockedApi.patch.mockResolvedValue({ data: { id: 't1', status: 'RESOLVED' } })
    const client = newClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateTicketStatus('t1') as UseMutationResult<SupportTicket, unknown, SupportTicketStatus>, { wrapper: wrapperWith(client) })
    await act(async () => {
      await result.current.mutateAsync('RESOLVED' as SupportTicketStatus)
    })

    expect(mockedApi.patch).toHaveBeenCalledWith('/support-tickets/t1/status', { status: 'RESOLVED' })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['support-tickets'] })
  })
})
