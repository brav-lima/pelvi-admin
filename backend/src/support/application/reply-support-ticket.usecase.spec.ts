import { BadRequestException, NotFoundException } from '@nestjs/common'
import { ReplySupportTicketUseCase, renderSupportReplyEmail } from './reply-support-ticket.usecase'
import { ISupportTicketRepository } from '../domain/support-ticket.repository'
import { MailService } from '../../mail/mail.service'
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

describe('renderSupportReplyEmail', () => {
  it('includes the reporter name and body in html and text', () => {
    const result = renderSupportReplyEmail({ reporterName: 'Dr. João', body: 'Já corrigimos o problema.' })

    expect(result.subject).toBe('Resposta ao seu chamado de suporte — SouPelvi')
    expect(result.html).toContain('Dr. João')
    expect(result.html).toContain('Já corrigimos o problema.')
    expect(result.text).toContain('Dr. João')
    expect(result.text).toContain('Já corrigimos o problema.')
  })

  it('escapes HTML special characters in the reply body', () => {
    const result = renderSupportReplyEmail({ reporterName: 'Ana', body: '<script>alert(1)</script>' })

    expect(result.html).not.toContain('<script>')
    expect(result.html).toContain('&lt;script&gt;')
  })
})

describe('ReplySupportTicketUseCase', () => {
  it('throws NotFoundException when the ticket does not exist', async () => {
    const repo = { findById: jest.fn().mockResolvedValue(null) } as unknown as jest.Mocked<ISupportTicketRepository>
    const mail = { send: jest.fn() } as unknown as jest.Mocked<MailService>
    const sut = new ReplySupportTicketUseCase(repo, mail)

    await expect(sut.execute('missing', 'corpo', 'admin-1')).rejects.toThrow(NotFoundException)
    expect(mail.send).not.toHaveBeenCalled()
  })

  it('throws BadRequestException when the ticket has no reporterEmail', async () => {
    const repo = { findById: jest.fn().mockResolvedValue(makeTicket({ reporterEmail: null })) } as unknown as jest.Mocked<ISupportTicketRepository>
    const mail = { send: jest.fn() } as unknown as jest.Mocked<MailService>
    const sut = new ReplySupportTicketUseCase(repo, mail)

    await expect(sut.execute('ticket-1', 'corpo', 'admin-1')).rejects.toThrow(BadRequestException)
    expect(mail.send).not.toHaveBeenCalled()
  })

  it('sends the email and persists the reply when reporterEmail is present', async () => {
    const ticket = makeTicket()
    const saved = makeTicket({ emailReplyBody: 'Já corrigimos', emailRepliedByAdminId: 'admin-1' })
    const repo = {
      findById: jest.fn().mockResolvedValue(ticket),
      saveReply: jest.fn().mockResolvedValue(saved),
    } as unknown as jest.Mocked<ISupportTicketRepository>
    const mail = { send: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<MailService>
    const sut = new ReplySupportTicketUseCase(repo, mail)

    const result = await sut.execute('ticket-1', 'Já corrigimos', 'admin-1')

    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'joao@test.com', subject: expect.stringContaining('Resposta') }),
    )
    expect(repo.saveReply).toHaveBeenCalledWith('ticket-1', 'Já corrigimos', 'admin-1')
    expect(result).toBe(saved)
  })

  it('does not persist the reply if sending the email fails', async () => {
    const ticket = makeTicket()
    const repo = {
      findById: jest.fn().mockResolvedValue(ticket),
      saveReply: jest.fn(),
    } as unknown as jest.Mocked<ISupportTicketRepository>
    const mail = { send: jest.fn().mockRejectedValue(new Error('Resend down')) } as unknown as jest.Mocked<MailService>
    const sut = new ReplySupportTicketUseCase(repo, mail)

    await expect(sut.execute('ticket-1', 'corpo', 'admin-1')).rejects.toThrow('Resend down')
    expect(repo.saveReply).not.toHaveBeenCalled()
  })
})
