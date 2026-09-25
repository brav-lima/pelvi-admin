export type SupportTicketCategory = 'BUG' | 'SUGGESTION' | 'QUESTION'
export type SupportTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'

export interface SupportTicketContext {
  route: string
  url: string
  userAgent: string
  appVersion: string
  sessionId?: string | null
  occurredAt: string
}

export interface SupportTicket {
  id: string
  organizationId: string
  category: SupportTicketCategory
  status: SupportTicketStatus
  reporterName: string
  reporterEmail: string | null
  reporterRole: string | null
  description: string
  context: SupportTicketContext
  sentryEventId: string | null
  internalNote: string | null
  emailReplyBody: string | null
  emailRepliedAt: Date | null
  emailRepliedByAdminId: string | null
  createdAt: Date
  updatedAt: Date
}
