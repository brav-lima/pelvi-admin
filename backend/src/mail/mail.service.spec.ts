import { ConfigService } from '@nestjs/config'
import { MailService } from './mail.service'

const mockSend = jest.fn()

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}))

const makeConfig = (overrides: Record<string, string> = {}) =>
  ({
    getOrThrow: (key: string) => overrides[key] ?? `test-${key}`,
  }) as ConfigService

describe('MailService', () => {
  beforeEach(() => {
    mockSend.mockReset()
  })

  it('sends an email with the configured sender and given content', async () => {
    mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null })
    const service = new MailService(makeConfig({ MAIL_FROM: 'Pelvi <a@b.com>' }))

    await service.send({ to: 'owner@test.com', subject: 'Oi', html: '<p>Oi</p>', text: 'Oi' })

    expect(mockSend).toHaveBeenCalledWith({
      from: 'Pelvi <a@b.com>',
      to: 'owner@test.com',
      subject: 'Oi',
      html: '<p>Oi</p>',
      text: 'Oi',
    })
  })

  it('throws when Resend returns an error', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'Invalid `from` field' },
    })
    const service = new MailService(makeConfig())

    await expect(
      service.send({ to: 'owner@test.com', subject: 'Oi', html: '<p>Oi</p>', text: 'Oi' }),
    ).rejects.toThrow('Invalid `from` field')
  })

  it('rejects with a timeout error when the Resend call hangs', async () => {
    jest.useFakeTimers()
    try {
      mockSend.mockReturnValue(new Promise(() => {})) // never resolves
      const service = new MailService(makeConfig())

      const pending = service.send({ to: 'owner@test.com', subject: 'Oi', html: '<p>Oi</p>', text: 'Oi' })
      const assertion = expect(pending).rejects.toThrow('Timeout ao enviar e-mail via Resend')

      await jest.advanceTimersByTimeAsync(5000)
      await assertion
    } finally {
      jest.useRealTimers()
    }
  })
})
