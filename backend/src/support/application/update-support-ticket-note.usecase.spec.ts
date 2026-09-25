import { NotFoundException } from '@nestjs/common'
import { UpdateSupportTicketNoteUseCase } from './update-support-ticket-note.usecase'
import { ISupportTicketRepository } from '../domain/support-ticket.repository'
import { SupportTicket } from '../domain/support-ticket.entity'

const makeTicket = (overrides: Partial<SupportTicket> = {}): SupportTicket => ({
  id: 'ticket-1',
  organizationId: 'org-1',
  category: 'BUG',
  status: 'OPEN',
  reporterName: 'Dr. João',
  reporterEmail: 'joao@test.com',
  reporterRole: 'PROFESSIONAL',
  description: 'desc',
  context: { route: '/', url: '', userAgent: '', appVersion: '1.0.0', sessionId: 's', occurredAt: '2026-09-25T00:00:00.000Z' },
  sentryEventId: null,
  internalNote: null,
  emailReplyBody: null,
  emailRepliedAt: null,
  emailRepliedByAdminId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe('UpdateSupportTicketNoteUseCase', () => {
  it('updates the internal note when the ticket exists', async () => {
    const found = makeTicket()
    const updated = makeTicket({ internalNote: 'Investigando com o time de dados' })
    const repo = {
      findById: jest.fn().mockResolvedValue(found),
      updateInternalNote: jest.fn().mockResolvedValue(updated),
    } as unknown as jest.Mocked<ISupportTicketRepository>
    const sut = new UpdateSupportTicketNoteUseCase(repo)

    const result = await sut.execute('ticket-1', 'Investigando com o time de dados')

    expect(repo.updateInternalNote).toHaveBeenCalledWith('ticket-1', 'Investigando com o time de dados')
    expect(result).toBe(updated)
  })

  it('throws NotFoundException when the ticket does not exist', async () => {
    const repo = {
      findById: jest.fn().mockResolvedValue(null),
      updateInternalNote: jest.fn(),
    } as unknown as jest.Mocked<ISupportTicketRepository>
    const sut = new UpdateSupportTicketNoteUseCase(repo)

    await expect(sut.execute('missing', 'nota')).rejects.toThrow(NotFoundException)
    expect(repo.updateInternalNote).not.toHaveBeenCalled()
  })
})
