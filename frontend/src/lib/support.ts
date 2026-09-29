import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  SupportTicket,
  SupportTicketCategory,
  SupportTicketListResponse,
  SupportTicketStatus,
} from '@/types/admin'

export const STATUS_LABEL: Record<SupportTicketStatus, string> = {
  OPEN: 'Aberto',
  IN_PROGRESS: 'Em análise',
  RESOLVED: 'Resolvido',
}

export const CATEGORY_LABEL: Record<SupportTicketCategory, string> = {
  BUG: 'Problema',
  SUGGESTION: 'Sugestão',
  QUESTION: 'Dúvida',
}

export interface SupportListFilter {
  status?: SupportTicketStatus
  page: number
  limit: number
}

export const supportKeys = {
  all: ['support-tickets'] as const,
  list: (filter: SupportListFilter) => ['support-tickets', 'list', filter] as const,
  detail: (id: string) => ['support-tickets', 'detail', id] as const,
  openCount: ['support-tickets', 'open-count'] as const,
}

export function useSupportTickets(filter: SupportListFilter) {
  const { status, page, limit } = filter
  return useQuery<SupportTicketListResponse>({
    queryKey: supportKeys.list(filter),
    queryFn: () =>
      api
        .get('/support-tickets', { params: { page, limit, ...(status && { status }) } })
        .then((r) => r.data),
    placeholderData: keepPreviousData,
  })
}

export function useSupportTicket(id: string | undefined) {
  return useQuery<SupportTicket>({
    queryKey: supportKeys.detail(id ?? ''),
    queryFn: () => api.get(`/support-tickets/${id}`).then((r) => r.data),
    enabled: !!id,
    retry: false,
  })
}

// Badge source. Deliberately NOT /metrics/summary: that endpoint is closed to the SUPPORT role.
export function useOpenSupportTicketsCount(enabled: boolean) {
  return useQuery<number>({
    queryKey: supportKeys.openCount,
    queryFn: () =>
      api
        .get<SupportTicketListResponse>('/support-tickets', { params: { status: 'OPEN', limit: 1 } })
        .then((r) => r.data.total),
    enabled,
    staleTime: 60_000,
  })
}

export function useUpdateTicketStatus(id: string) {
  const queryClient = useQueryClient()
  return useMutation<SupportTicket, unknown, SupportTicketStatus>({
    mutationFn: (status: SupportTicketStatus) =>
      api.patch(`/support-tickets/${id}/status`, { status }).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: supportKeys.all }),
  })
}

export function useUpdateTicketNote(id: string) {
  const queryClient = useQueryClient()
  return useMutation<SupportTicket, unknown, string>({
    mutationFn: (note: string) =>
      api.patch(`/support-tickets/${id}/internal-note`, { note }).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: supportKeys.all }),
  })
}

export function useReplyToTicket(id: string) {
  const queryClient = useQueryClient()
  return useMutation<SupportTicket, unknown, string>({
    mutationFn: (body: string) =>
      api.post(`/support-tickets/${id}/reply`, { body }).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: supportKeys.all }),
  })
}
