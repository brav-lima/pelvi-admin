import { Module } from '@nestjs/common'
import { SupportTicketExternalController } from './support-ticket-external.controller'
import { SupportTicketAdminController } from './support-ticket-admin.controller'
import { CreateSupportTicketUseCase } from './application/create-support-ticket.usecase'
import { ListSupportTicketsUseCase } from './application/list-support-tickets.usecase'
import { GetSupportTicketUseCase } from './application/get-support-ticket.usecase'
import { UpdateSupportTicketStatusUseCase } from './application/update-support-ticket-status.usecase'
import { UpdateSupportTicketNoteUseCase } from './application/update-support-ticket-note.usecase'
import { ReplySupportTicketUseCase } from './application/reply-support-ticket.usecase'
import { PrismaSupportTicketRepository } from './infra/prisma-support-ticket.repository'
import { SUPPORT_TICKET_REPOSITORY } from './domain/support-ticket.repository'

@Module({
  controllers: [SupportTicketExternalController, SupportTicketAdminController],
  providers: [
    CreateSupportTicketUseCase,
    ListSupportTicketsUseCase,
    GetSupportTicketUseCase,
    UpdateSupportTicketStatusUseCase,
    UpdateSupportTicketNoteUseCase,
    ReplySupportTicketUseCase,
    {
      provide: SUPPORT_TICKET_REPOSITORY,
      useClass: PrismaSupportTicketRepository,
    },
  ],
})
export class SupportModule {}
