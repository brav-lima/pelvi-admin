import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { ISupportTicketRepository, SUPPORT_TICKET_REPOSITORY } from '../domain/support-ticket.repository'
import { SupportTicket } from '../domain/support-ticket.entity'
import { MailService } from '../../mail/mail.service'

@Injectable()
export class ReplySupportTicketUseCase {
  constructor(
    @Inject(SUPPORT_TICKET_REPOSITORY)
    private readonly repo: ISupportTicketRepository,
    private readonly mail: MailService,
  ) {}

  async execute(id: string, body: string, adminId: string): Promise<SupportTicket> {
    const ticket = await this.repo.findById(id)
    if (!ticket) throw new NotFoundException('Chamado não encontrado')
    if (!ticket.reporterEmail) {
      throw new BadRequestException('Este chamado não possui e-mail do solicitante cadastrado')
    }

    const { subject, html, text } = renderSupportReplyEmail({ reporterName: ticket.reporterName, body })
    await this.mail.send({ to: ticket.reporterEmail, subject, html, text })

    return this.repo.saveReply(id, body, adminId)
  }
}

export interface RenderSupportReplyEmailInput {
  reporterName: string
  body: string
}

export function renderSupportReplyEmail(
  input: RenderSupportReplyEmailInput,
): { subject: string; html: string; text: string } {
  const { reporterName, body } = input
  const subject = 'Resposta ao seu chamado de suporte — SouPelvi'
  const safeName = escapeHtml(reporterName)
  const safeBody = escapeHtml(body).replace(/\n/g, '<br/>')

  const html = `
<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;padding:32px;">
            <tr>
              <td style="font-size:18px;font-weight:bold;color:#111827;padding-bottom:16px;">Olá, ${safeName}</td>
            </tr>
            <tr>
              <td style="font-size:14px;color:#374151;line-height:1.5;">${safeBody}</td>
            </tr>
            <tr>
              <td style="font-size:12px;color:#6b7280;line-height:1.5;padding-top:24px;">Equipe SouPelvi</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim()

  const text = [`Olá, ${reporterName}`, '', body, '', 'Equipe SouPelvi'].join('\n')

  return { subject, html, text }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
