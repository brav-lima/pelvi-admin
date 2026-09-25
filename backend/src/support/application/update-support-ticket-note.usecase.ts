import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { ISupportTicketRepository, SUPPORT_TICKET_REPOSITORY } from '../domain/support-ticket.repository'
import { SupportTicket } from '../domain/support-ticket.entity'

@Injectable()
export class UpdateSupportTicketNoteUseCase {
  constructor(
    @Inject(SUPPORT_TICKET_REPOSITORY)
    private readonly repo: ISupportTicketRepository,
  ) {}

  async execute(id: string, note: string): Promise<SupportTicket> {
    const ticket = await this.repo.findById(id)
    if (!ticket) throw new NotFoundException('Chamado não encontrado')
    return this.repo.updateInternalNote(id, note)
  }
}
