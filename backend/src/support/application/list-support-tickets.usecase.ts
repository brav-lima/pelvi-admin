import { Inject, Injectable } from '@nestjs/common'
import {
  ISupportTicketRepository,
  ListSupportTicketsFilter,
  SUPPORT_TICKET_REPOSITORY,
} from '../domain/support-ticket.repository'

@Injectable()
export class ListSupportTicketsUseCase {
  constructor(
    @Inject(SUPPORT_TICKET_REPOSITORY)
    private readonly repo: ISupportTicketRepository,
  ) {}

  execute(filter: ListSupportTicketsFilter) {
    return this.repo.findAll(filter)
  }
}
