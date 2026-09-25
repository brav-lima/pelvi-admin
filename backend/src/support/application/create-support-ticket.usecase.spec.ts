import { NotFoundException } from '@nestjs/common'
import { CreateSupportTicketUseCase } from './create-support-ticket.usecase'
import { ISupportTicketRepository } from '../domain/support-ticket.repository'
import { PrismaService } from '../../prisma/prisma.service'
import { SupportTicket } from '../domain/support-ticket.entity'

const baseContext = {
  route: '/patients/:id/evolutions',
  url: 'https://app.soupelvi.com.br/patients/1/evolutions',
  userAgent: 'Mozilla/5.0',
  appVersion: '1.8.2',
  sessionId: 'sess-1',
  occurredAt: '2026-09-25T20:14:32.000Z',
}

const makeTicket = (overrides: Partial<SupportTicket> = {}): SupportTicket => ({
  id: 'ticket-1',
  organizationId: 'org-1',
  category: 'BUG',
  status: 'OPEN',
  reporterName: 'Dr. João',
  reporterEmail: 'joao@test.com',
  reporterRole: 'PROFESSIONAL',
  description: 'Não consegui salvar a evolução',
  context: baseContext,
  sentryEventId: 'abc123',
  internalNote: null,
  emailReplyBody: null,
  emailRepliedAt: null,
  emailRepliedByAdminId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe('CreateSupportTicketUseCase', () => {
  it('resolves the organization by clinicId and creates the ticket', async () => {
    const ticket = makeTicket()
    const repo = { create: jest.fn().mockResolvedValue(ticket) } as unknown as jest.Mocked<ISupportTicketRepository>
    const prisma = {
      organization: { findFirst: jest.fn().mockResolvedValue({ id: 'org-1' }) },
    } as unknown as PrismaService
    const sut = new CreateSupportTicketUseCase(repo, prisma)

    const result = await sut.execute({
      clinicId: 'clinic-1',
      category: 'BUG',
      description: 'Não consegui salvar a evolução',
      reporterName: 'Dr. João',
      reporterEmail: 'joao@test.com',
      reporterRole: 'PROFESSIONAL',
      context: baseContext,
      sentryEventId: 'abc123',
    })

    expect(prisma.organization.findFirst).toHaveBeenCalledWith({
      where: { clinicExternalId: 'clinic-1' },
      select: { id: true },
    })
    expect(repo.create).toHaveBeenCalledWith({
      organizationId: 'org-1',
      category: 'BUG',
      reporterName: 'Dr. João',
      reporterEmail: 'joao@test.com',
      reporterRole: 'PROFESSIONAL',
      description: 'Não consegui salvar a evolução',
      context: baseContext,
      sentryEventId: 'abc123',
    })
    expect(result).toEqual(ticket)
  })

  it('defaults optional reporter/sentry fields to null when omitted', async () => {
    const repo = { create: jest.fn().mockResolvedValue(makeTicket()) } as unknown as jest.Mocked<ISupportTicketRepository>
    const prisma = {
      organization: { findFirst: jest.fn().mockResolvedValue({ id: 'org-1' }) },
    } as unknown as PrismaService
    const sut = new CreateSupportTicketUseCase(repo, prisma)

    await sut.execute({
      clinicId: 'clinic-1',
      category: 'QUESTION',
      description: 'Como cadastro um paciente?',
      reporterName: 'Dra. Ana',
      context: baseContext,
    })

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ reporterEmail: null, reporterRole: null, sentryEventId: null }),
    )
  })

  it('throws NotFoundException when clinicId does not match an organization', async () => {
    const repo = { create: jest.fn() } as unknown as jest.Mocked<ISupportTicketRepository>
    const prisma = {
      organization: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService
    const sut = new CreateSupportTicketUseCase(repo, prisma)

    await expect(
      sut.execute({
        clinicId: 'unknown-clinic',
        category: 'QUESTION',
        description: 'Dúvida',
        reporterName: 'Dra. Ana',
        context: baseContext,
      }),
    ).rejects.toThrow(NotFoundException)
    expect(repo.create).not.toHaveBeenCalled()
  })
})
