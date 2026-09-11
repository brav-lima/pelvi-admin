import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { MailService } from '../../mail/mail.service'

export interface SendWelcomeEmailInput {
  ownerName: string
  ownerEmail: string
  organizationName: string
  provisionalPassword: string
}

@Injectable()
export class SendWelcomeEmail {
  constructor(
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  async execute(input: SendWelcomeEmailInput): Promise<void> {
    const accessUrl = `${this.config.getOrThrow<string>('CLINIC_APP_URL')}/login`
    const { subject, html, text } = renderWelcomeEmail({ ...input, accessUrl })
    await this.mail.send({ to: input.ownerEmail, subject, html, text })
  }
}

interface RenderWelcomeEmailInput extends SendWelcomeEmailInput {
  accessUrl: string
}

// Plain HTML in code for the MVP (locked in the spec). Kept isolated in this
// function so swapping to a templating engine later doesn't touch
// SendWelcomeEmail or MailService.
export function renderWelcomeEmail(
  input: RenderWelcomeEmailInput,
): { subject: string; html: string; text: string } {
  const { ownerName, organizationName, provisionalPassword, accessUrl } = input
  const subject = 'Bem-vindo(a) à Pelvi — seu acesso está liberado'

  const safeOwnerName = escapeHtml(ownerName)
  const safeOrgName = escapeHtml(organizationName)
  const safePassword = escapeHtml(provisionalPassword)

  const html = `
<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;padding:32px;">
            <tr>
              <td style="font-size:20px;font-weight:bold;color:#111827;padding-bottom:16px;">Bem-vindo(a) à Pelvi!</td>
            </tr>
            <tr>
              <td style="font-size:14px;color:#374151;line-height:1.5;padding-bottom:16px;">
                Olá, ${safeOwnerName}. A organização <strong>${safeOrgName}</strong> foi criada com sucesso e seu acesso já está liberado.
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:16px;">
                <a href="${accessUrl}" style="display:inline-block;background-color:#4f46e5;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;">Acessar o sistema</a>
              </td>
            </tr>
            <tr>
              <td style="font-size:14px;color:#374151;line-height:1.5;padding-bottom:8px;">
                Sua senha provisória de acesso é:
              </td>
            </tr>
            <tr>
              <td style="font-size:16px;font-family:monospace;background-color:#f4f5f7;padding:12px;border-radius:6px;color:#111827;">
                ${safePassword}
              </td>
            </tr>
            <tr>
              <td style="font-size:12px;color:#6b7280;line-height:1.5;padding-top:16px;">
                Por segurança, altere essa senha no primeiro acesso.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim()

  const text = [
    'Bem-vindo(a) à Pelvi!',
    '',
    `Olá, ${ownerName}. A organização ${organizationName} foi criada com sucesso e seu acesso já está liberado.`,
    '',
    `Acesse o sistema em: ${accessUrl}`,
    '',
    `Sua senha provisória de acesso é: ${provisionalPassword}`,
    '',
    'Por segurança, altere essa senha no primeiro acesso.',
  ].join('\n')

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
