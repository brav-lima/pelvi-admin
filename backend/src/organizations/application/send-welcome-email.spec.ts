import { ConfigService } from '@nestjs/config'
import { SendWelcomeEmail, renderWelcomeEmail } from './send-welcome-email'
import { MailService } from '../../mail/mail.service'

describe('renderWelcomeEmail', () => {
  const base = {
    ownerName: 'Ana Lima',
    ownerEmail: 'ana@test.com',
    organizationName: 'Clínica A',
    provisionalPassword: 'Abc12345',
    accessUrl: 'https://app.soupelvi.com.br/login',
  }

  it('includes organization name, owner name, access link and password in html and text', () => {
    const result = renderWelcomeEmail(base)

    expect(result.subject).toBe('Bem-vindo(a) à Pelvi — seu acesso está liberado')
    for (const value of ['Ana Lima', 'Clínica A', 'https://app.soupelvi.com.br/login', 'Abc12345']) {
      expect(result.html).toContain(value)
      expect(result.text).toContain(value)
    }
  })

  it('escapes HTML special characters in owner and organization name', () => {
    const result = renderWelcomeEmail({
      ...base,
      ownerName: '<script>alert(1)</script>',
      organizationName: 'A & B "Clínica"',
    })

    expect(result.html).not.toContain('<script>')
    expect(result.html).toContain('&lt;script&gt;')
    expect(result.html).toContain('A &amp; B &quot;Clínica&quot;')
  })
})

describe('SendWelcomeEmail', () => {
  it('builds the access URL from CLINIC_APP_URL and calls MailService.send', async () => {
    const mail = { send: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<MailService>
    const config = { getOrThrow: () => 'https://app.soupelvi.com.br' } as unknown as ConfigService
    const sut = new SendWelcomeEmail(mail, config)

    await sut.execute({
      ownerName: 'Ana Lima',
      ownerEmail: 'ana@test.com',
      organizationName: 'Clínica A',
      provisionalPassword: 'Abc12345',
    })

    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ana@test.com',
        subject: expect.stringContaining('Bem-vindo'),
        html: expect.stringContaining('https://app.soupelvi.com.br/login'),
        text: expect.stringContaining('https://app.soupelvi.com.br/login'),
      }),
    )
  })
})
