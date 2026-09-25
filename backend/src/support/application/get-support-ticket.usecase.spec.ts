import { NotFoundException } from '@nestjs/common'
import { GetSupportTicketUseCase } from './get-support-ticket.usecase'
import { ISupportTicketRepository } from '../domain/support-ticket.repository'
import { SupportTicket } from '../domain/support-ticket.entity'

const makeTicket = (): SupportTicket => ({
  id: 'ticket-1',
  organizationId: 'org-1',
  category: 'BUG',
  status: 'OPEN',
  reporterName: 'Dr. João',
  reporterEmail: 'joao@test.com',
  reporterRole: 'PROFESSIONAL',
  description: 'desc',
  context: {
    route: '/', url: '', userAgent: '', appVersion: '1.0.0', sessionId: 's', occurredAt: '2026-09-25T00:00:00.000Z',
  },
  sentryEventId: null,
  internalNote: null,
  emailReplyBody: null,
  emailRepliedAt: null,
  emailRepliedByAdminId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
})

describe('GetSupportTicketUseCase', () => {
  it('returns the ticket when found', async () => {
    const ticket = makeTicket()
    const repo = { findById: jest.fn().mockResolvedValue(ticket) } as unknown as jest.Mocked<ISupportTicketRepository>
    const sut = new GetSupportTicketUseCase(repo)

    const result = await sut.execute('ticket-1')

    expect(repo.findById).toHaveBeenCalledWith('ticket-1')
    expect(result).toBe(ticket)
  })

  it('throws NotFoundException when the ticket does not exist', async () => {
    const repo = { findById: jest.fn().mockResolvedValue(null) } as unknown as jest.Mocked<ISupportTicketRepository>
    const sut = new GetSupportTicketUseCase(repo)

    await expect(sut.execute('missing')).rejects.toThrow(NotFoundException)
  })
})
