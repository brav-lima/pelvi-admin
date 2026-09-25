import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { ListSupportTicketsUseCase } from './application/list-support-tickets.usecase'
import { GetSupportTicketUseCase } from './application/get-support-ticket.usecase'
import { UpdateSupportTicketStatusUseCase } from './application/update-support-ticket-status.usecase'
import { UpdateSupportTicketNoteUseCase } from './application/update-support-ticket-note.usecase'
import { ReplySupportTicketUseCase } from './application/reply-support-ticket.usecase'
import { UpdateStatusDto } from './dto/update-status.dto'
import { UpdateInternalNoteDto } from './dto/update-internal-note.dto'
import { ReplyDto } from './dto/reply.dto'
import { SupportTicketCategory, SupportTicketStatus } from './domain/support-ticket.entity'

@ApiTags('support-tickets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('support-tickets')
export class SupportTicketAdminController {
  constructor(
    private readonly listTickets: ListSupportTicketsUseCase,
    private readonly getTicket: GetSupportTicketUseCase,
    private readonly updateStatusUseCase: UpdateSupportTicketStatusUseCase,
    private readonly updateNoteUseCase: UpdateSupportTicketNoteUseCase,
    private readonly replyUseCase: ReplySupportTicketUseCase,
  ) {}

  @Get()
  @Roles('SUPER_ADMIN', 'SUPPORT')
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('status') status?: SupportTicketStatus,
    @Query('category') category?: SupportTicketCategory,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.listTickets.execute({
      status,
      category,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    })
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'SUPPORT')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.getTicket.execute(id)
  }

  @Patch(':id/status')
  @Roles('SUPER_ADMIN', 'SUPPORT')
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStatusDto) {
    return this.updateStatusUseCase.execute(id, dto.status)
  }

  @Patch(':id/internal-note')
  @Roles('SUPER_ADMIN', 'SUPPORT')
  updateInternalNote(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateInternalNoteDto) {
    return this.updateNoteUseCase.execute(id, dto.note)
  }

  @Post(':id/reply')
  @Roles('SUPER_ADMIN', 'SUPPORT')
  reply(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplyDto,
    @CurrentUser() adminId: string,
  ) {
    return this.replyUseCase.execute(id, dto.body, adminId)
  }
}
