import {
  SupportTicket,
  SupportTicketCategory,
  SupportTicketContext,
  SupportTicketStatus,
} from './support-ticket.entity'

export interface CreateSupportTicketData {
  organizationId: string
  category: SupportTicketCategory
  reporterName: string
  reporterEmail: string | null
  reporterRole: string | null
  description: string
  context: SupportTicketContext
  sentryEventId: string | null
}

export interface ListSupportTicketsFilter {
  status?: SupportTicketStatus
  category?: SupportTicketCategory
  page?: number
  limit?: number
}

export interface ISupportTicketRepository {
  create(data: CreateSupportTicketData): Promise<SupportTicket>
  findById(id: string): Promise<SupportTicket | null>
  findAll(
    filter: ListSupportTicketsFilter,
  ): Promise<{ data: SupportTicket[]; total: number; page: number; limit: number }>
  updateStatus(id: string, status: SupportTicketStatus): Promise<SupportTicket>
  updateInternalNote(id: string, note: string): Promise<SupportTicket>
  saveReply(id: string, body: string, adminId: string): Promise<SupportTicket>
}

export const SUPPORT_TICKET_REPOSITORY = Symbol('ISupportTicketRepository')
