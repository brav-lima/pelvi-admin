import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { ApiHeader, ApiTags } from '@nestjs/swagger'
import { ClinicExternalApiKeyGuard } from '../common/guards/clinic-external-api-key.guard'
import { CreateSupportTicketUseCase } from './application/create-support-ticket.usecase'
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto'

@ApiTags('clinic-ext')
@ApiHeader({ name: 'x-clinic-api-key', required: true })
@UseGuards(ClinicExternalApiKeyGuard)
@Controller('v1/clinic-ext')
export class SupportTicketExternalController {
  constructor(private readonly createTicket: CreateSupportTicketUseCase) {}

  @Post('support-tickets')
  create(@Body() dto: CreateSupportTicketDto) {
    return this.createTicket.execute(dto)
  }
}
