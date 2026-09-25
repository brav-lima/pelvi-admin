import { Injectable } from '@nestjs/common'
import { Prisma, SupportTicket as PrismaSupportTicketRow } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import {
  CreateSupportTicketData,
  ISupportTicketRepository,
  ListSupportTicketsFilter,
} from '../domain/support-ticket.repository'
import { SupportTicket, SupportTicketContext, SupportTicketStatus } from '../domain/support-ticket.entity'

@Injectable()
export class PrismaSupportTicketRepository implements ISupportTicketRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toDomain(row: PrismaSupportTicketRow): SupportTicket {
    return { ...row, context: row.context as unknown as SupportTicketContext }
  }

  async create(data: CreateSupportTicketData): Promise<SupportTicket> {
    const row = await this.prisma.supportTicket.create({
      data: {
        organizationId: data.organizationId,
        category: data.category,
        reporterName: data.reporterName,
        reporterEmail: data.reporterEmail,
        reporterRole: data.reporterRole,
        description: data.description,
        context: data.context as unknown as Prisma.InputJsonValue,
        sentryEventId: data.sentryEventId,
      },
    })
    return this.toDomain(row)
  }

  async findById(id: string): Promise<SupportTicket | null> {
    const row = await this.prisma.supportTicket.findUnique({ where: { id } })
    return row ? this.toDomain(row) : null
  }

  async findAll(filter: ListSupportTicketsFilter): Promise<{ data: SupportTicket[]; total: number }> {
    const { status, category, page = 1, limit = 50 } = filter
    const take = Math.min(limit, 100)
    const skip = (page - 1) * take

    const where: Prisma.SupportTicketWhereInput = {
      ...(status && { status }),
      ...(category && { category }),
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.supportTicket.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.supportTicket.count({ where }),
    ])

    return { data: rows.map((row) => this.toDomain(row)), total }
  }

  async updateStatus(id: string, status: SupportTicketStatus): Promise<SupportTicket> {
    const row = await this.prisma.supportTicket.update({ where: { id }, data: { status } })
    return this.toDomain(row)
  }

  async updateInternalNote(id: string, note: string): Promise<SupportTicket> {
    const row = await this.prisma.supportTicket.update({ where: { id }, data: { internalNote: note } })
    return this.toDomain(row)
  }

  async saveReply(id: string, body: string, adminId: string): Promise<SupportTicket> {
    const row = await this.prisma.supportTicket.update({
      where: { id },
      data: { emailReplyBody: body, emailRepliedAt: new Date(), emailRepliedByAdminId: adminId },
    })
    return this.toDomain(row)
  }
}
