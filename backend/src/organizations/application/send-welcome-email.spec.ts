import { ConfigService } from '@nestjs/config'
import { SendWelcomeEmail, renderWelcomeEmail } from './send-welcome-email'
import { MailService } from '../../mail/mail.service'

describe('renderWelcomeEmail', () => {
  const base = {
    ownerName: 'Ana Lima',
    ownerEmail: 'ana@test.com',
    ownerCpf: '12345678900',
    organizationName: 'Clínica A',
    provisionalPassword: 'Abc12345',
    accessUrl: 'https://app.soupelvi.com.br/login',
  }

  it('includes organization name, owner name, cpf, access link and password in html and text', () => {
    const result = renderWelcomeEmail(base)

    expect(result.subject).toBe('Bem-vindo(a) à Pelvi — seu acesso está liberado')
    for (const value of ['Ana Lima', 'Clínica A', 'https://app.soupelvi.com.br/login', 'Abc12345', '12345678900']) {
      expect(result.html).toContain(value)
      expect(result.text).toContain(value)
    }
    expect(result.text).toContain('Seu login é o CPF: 12345678900')
    expect(result.html).toContain('Seu login é o CPF: <strong>12345678900</strong>')
  })

  it('escapes HTML special characters in owner name, organization name and cpf', () => {
    const result = renderWelcomeEmail({
      ...base,
      ownerName: '<script>alert(1)</script>',
      organizationName: 'A & B "Clínica"',
      ownerCpf: '<b>123</b>',
    })

    expect(result.html).not.toContain('<script>')
    expect(result.html).toContain('&lt;script&gt;')
    expect(result.html).toContain('A &amp; B &quot;Clínica&quot;')
    expect(result.html).not.toContain('<b>123</b>')
    expect(result.html).toContain('&lt;b&gt;123&lt;/b&gt;')
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
      ownerCpf: '12345678900',
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

  it('does not produce a double slash when CLINIC_APP_URL has a trailing slash', async () => {
    const mail = { send: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<MailService>
    const config = { getOrThrow: () => 'https://app.soupelvi.com.br/' } as unknown as ConfigService
    const sut = new SendWelcomeEmail(mail, config)

    await sut.execute({
      ownerName: 'Ana Lima',
      ownerEmail: 'ana@test.com',
      ownerCpf: '12345678900',
      organizationName: 'Clínica A',
      provisionalPassword: 'Abc12345',
    })

    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining('https://app.soupelvi.com.br/login'),
        text: expect.stringContaining('https://app.soupelvi.com.br/login'),
      }),
    )
    const call = mail.send.mock.calls[0][0]
    expect(call.html).not.toContain('.com.br//login')
    expect(call.text).not.toContain('.com.br//login')
  })
})
