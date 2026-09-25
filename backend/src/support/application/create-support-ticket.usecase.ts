import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { ISupportTicketRepository, SUPPORT_TICKET_REPOSITORY } from '../domain/support-ticket.repository'
import { SupportTicket, SupportTicketCategory, SupportTicketContext } from '../domain/support-ticket.entity'

export interface CreateSupportTicketInput {
  clinicId: string
  category: SupportTicketCategory
  description: string
  reporterName: string
  reporterEmail?: string | null
  reporterRole?: string | null
  context: SupportTicketContext
  sentryEventId?: string | null
}

@Injectable()
export class CreateSupportTicketUseCase {
  constructor(
    @Inject(SUPPORT_TICKET_REPOSITORY)
    private readonly repo: ISupportTicketRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(input: CreateSupportTicketInput): Promise<SupportTicket> {
    const org = await this.prisma.organization.findFirst({
      where: { clinicExternalId: input.clinicId },
      select: { id: true },
    })
    if (!org) throw new NotFoundException('Organização não encontrada')

    return this.repo.create({
      organizationId: org.id,
      category: input.category,
      reporterName: input.reporterName,
      reporterEmail: input.reporterEmail ?? null,
      reporterRole: input.reporterRole ?? null,
      description: input.description,
      context: input.context,
      sentryEventId: input.sentryEventId ?? null,
    })
  }
}
