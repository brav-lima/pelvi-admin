import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { ApiHeader, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { AdminThrottlerGuard } from '../common/guards/admin-throttler.guard'
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
  @UseGuards(AdminThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  create(@Body() dto: CreateSupportTicketDto) {
    return this.createTicket.execute(dto)
  }
}
