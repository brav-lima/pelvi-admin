import { ConfigService } from '@nestjs/config'

const REQUIRED_KEYS = ['RESEND_API_KEY', 'MAIL_FROM', 'CLINIC_APP_URL'] as const

export function assertMailConfig(config: Pick<ConfigService, 'get'>): void {
  for (const key of REQUIRED_KEYS) {
    if (!config.get<string>(key)) {
      throw new Error(`${key} must be set (required to send the onboarding welcome email)`)
    }
  }
}
