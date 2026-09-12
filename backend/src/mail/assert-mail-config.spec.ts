import { assertMailConfig } from './assert-mail-config'

const valid = {
  RESEND_API_KEY: 're_123',
  MAIL_FROM: 'Pelvi <a@b.com>',
  CLINIC_APP_URL: 'https://app.soupelvi.com.br',
}

const makeConfig = (values: Record<string, string | undefined>) => ({
  get: (key: string) => values[key],
})

describe('assertMailConfig', () => {
  it('does not throw when all three vars are set', () => {
    expect(() => assertMailConfig(makeConfig(valid))).not.toThrow()
  })

  it.each(['RESEND_API_KEY', 'MAIL_FROM', 'CLINIC_APP_URL'] as const)(
    'throws when %s is missing',
    (key) => {
      const rest = { ...valid, [key]: undefined }
      expect(() => assertMailConfig(makeConfig(rest))).toThrow(key)
    },
  )
})
