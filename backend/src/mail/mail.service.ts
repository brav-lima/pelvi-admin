import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Resend } from 'resend'

export interface SendMailInput {
  to: string
  subject: string
  html: string
  text: string
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name)
  private client?: Resend

  constructor(private readonly config: ConfigService) {}

  // Lazy — mirrors ClinicApiService's baseUrl/headers getters. RESEND_API_KEY
  // presence is guaranteed at boot by assertMailConfig() (see Task 2); this
  // getOrThrow is a type-safety net, not the fail-fast mechanism.
  private get resend(): Resend {
    if (!this.client) {
      this.client = new Resend(this.config.getOrThrow<string>('RESEND_API_KEY'))
    }
    return this.client
  }

  async send(input: SendMailInput): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.config.getOrThrow<string>('MAIL_FROM'),
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    })

    if (error) {
      this.logger.error(`Falha ao enviar e-mail via Resend: ${error.message}`)
      throw new Error(error.message)
    }
  }
}
