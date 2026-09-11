# Onboarding Welcome Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically send a transactional welcome email (access link + provisional password) when a new organization/owner is created, replacing today's fully-manual "copy the password and send it yourself" operator flow.

**Architecture:** A generic, transport-only `MailService` (backend/src/mail/) wraps the Resend SDK. Onboarding-specific content lives in `organizations/application/send-welcome-email.ts`, which renders a fixed HTML/text template and calls `MailService.send()`. `CreateOrganizationWithOwnerUseCase` calls it fire-and-forget, only when a new person (not a reused owner) was created. Three new env vars (`RESEND_API_KEY`, `MAIL_FROM`, `CLINIC_APP_URL`) are validated explicitly at bootstrap, failing startup if any is missing.

**Tech Stack:** NestJS 11, Prisma 7, Resend SDK (Node), Jest (backend), React + Vitest/Testing Library (frontend, not exercised by this plan — see Task 6).

**Spec:** `docs/superpowers/specs/2026-09-11-onboarding-welcome-email-design.md`

**Linear issue:** SOU-48 (team SouPelvi, project Admin)

## Global Constraints

- Provider: Resend (locked in the spec).
- Trigger: only when `provisionalPassword !== null` (new person created); reused owners never get this email.
- Failure handling: fire-and-forget — a send failure is logged and never fails organization creation, never surfaces in the API response.
- Template authoring (MVP): plain HTML string + inline CSS built in code, isolated in its own function so a future engine swap (e.g. React Email) doesn't touch `MailService` or the use case.
- Config: `RESEND_API_KEY`, `MAIL_FROM`, `CLINIC_APP_URL` are required in **every** environment (dev included); missing any of them must fail app startup, not just in production.
- No persistence of email content or delivery status — only a `WELCOME_EMAIL_SENT` org event on success (no password/PII in it).
- `bun` is the package manager for `backend/` — use `bun add`, never `npm install`.

---

### Task 1: `MailService` — thin Resend transport seam

**Files:**
- Create: `backend/src/mail/mail.service.ts`
- Create: `backend/src/mail/mail.module.ts`
- Test: `backend/src/mail/mail.service.spec.ts`
- Modify: `backend/package.json` (new dependency, via `bun add`)
- Modify: `backend/.env.example`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Produces: `MailService.send(input: SendMailInput): Promise<void>` where `SendMailInput = { to: string; subject: string; html: string; text: string }`. Throws on provider error (does not swallow — the caller decides fire-and-forget).
- Produces: `MailModule` — `@Global()`, exports `MailService` (mirrors `ClinicApiModule`'s pattern, so no other module needs to import it explicitly).

- [ ] **Step 1: Add the `resend` dependency**

Run: `cd backend && bun add resend`

Expected: `backend/package.json` gains a `"resend": "^6.x.x"` entry under `dependencies`, and `backend/bun.lock` is updated. Do not commit `package-lock.json` if one appears.

- [ ] **Step 2: Add the two Resend env vars to `.env.example`**

In `backend/.env.example`, after the existing `CLINIC_EXTERNAL_API_KEY` line, add:

```bash
# RESEND_API_KEY — Resend API credential used to send the onboarding welcome email.
# Required in every environment (including local dev) — app fails to start without it.
RESEND_API_KEY="re_your_api_key"
# MAIL_FROM — sender identity for onboarding emails, e.g. "Pelvi <bemvindo@soupelvi.com.br>".
# Domain must be verified in Resend (SPF/DKIM) or mail lands in spam.
MAIL_FROM="Pelvi <bemvindo@soupelvi.com.br>"
```

(`CLINIC_APP_URL` is added in Task 2, alongside the code that validates it — keep this step to the two vars `MailService` itself reads.)

- [ ] **Step 3: Write the failing test for `MailService`**

Create `backend/src/mail/mail.service.spec.ts`:

```typescript
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
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd backend && bun run test -- mail.service.spec.ts`
Expected: FAIL — `Cannot find module './mail.service'`.

- [ ] **Step 5: Implement `MailService`**

Create `backend/src/mail/mail.service.ts`:

```typescript
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
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd backend && bun run test -- mail.service.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Create `MailModule` and register it globally**

Create `backend/src/mail/mail.module.ts`:

```typescript
import { Global, Module } from '@nestjs/common'
import { MailService } from './mail.service'

@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
```

In `backend/src/app.module.ts`:
- Add `import { MailModule } from './mail/mail.module'` next to the existing `import { ClinicApiModule } from './clinic-api/clinic-api.module'` line.
- Add `MailModule,` to the `imports: [...]` array, next to `ClinicApiModule,`.

- [ ] **Step 8: Verify the project still type-checks**

Run: `cd backend && bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
cd backend && bun add resend
git add package.json bun.lock .env.example src/app.module.ts src/mail/
git commit -m "feat(mail): add MailService (Resend transport seam)"
```

---

### Task 2: Fail-fast startup config check for all 3 onboarding-email env vars

**Files:**
- Create: `backend/src/mail/assert-mail-config.ts`
- Test: `backend/src/mail/assert-mail-config.spec.ts`
- Modify: `backend/src/main.ts`
- Modify: `backend/.env.example`
- Modify: `/Users/brunolima/Documents/repo/SouPelvi/pelvi-admin/CLAUDE.md` (env var table)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `assertMailConfig(config: Pick<ConfigService, 'get'>): void` — throws `Error` naming the first missing key among `RESEND_API_KEY`, `MAIL_FROM`, `CLINIC_APP_URL`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/mail/assert-mail-config.spec.ts`:

```typescript
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && bun run test -- assert-mail-config.spec.ts`
Expected: FAIL — `Cannot find module './assert-mail-config'`.

- [ ] **Step 3: Implement `assertMailConfig`**

Create `backend/src/mail/assert-mail-config.ts`:

```typescript
import { ConfigService } from '@nestjs/config'

const REQUIRED_KEYS = ['RESEND_API_KEY', 'MAIL_FROM', 'CLINIC_APP_URL'] as const

export function assertMailConfig(config: Pick<ConfigService, 'get'>): void {
  for (const key of REQUIRED_KEYS) {
    if (!config.get<string>(key)) {
      throw new Error(`${key} must be set (required to send the onboarding welcome email)`)
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && bun run test -- assert-mail-config.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire the check into bootstrap**

In `backend/src/main.ts`:
- Add `import { assertMailConfig } from './mail/assert-mail-config'` near the other imports.
- Immediately after the existing block:
  ```typescript
  if (process.env.NODE_ENV === 'production' && (!corsOrigin || corsOrigin.includes('localhost'))) {
    throw new Error('CORS_ORIGIN must be set to a production domain in production environment')
  }
  ```
  add:
  ```typescript
  assertMailConfig(config)
  ```

- [ ] **Step 6: Add `CLINIC_APP_URL` to `.env.example`**

In `backend/.env.example`, right after the `MAIL_FROM` line added in Task 1, add:

```bash
# CLINIC_APP_URL — base URL of the pelvi-ui frontend (distinct from CLINIC_API_URL,
# which is the API). Used to build the login link in the onboarding welcome email.
# Required in every environment — app fails to start without it.
CLINIC_APP_URL="https://app.soupelvi.com.br"
```

- [ ] **Step 7: Document the 3 vars in `CLAUDE.md`**

In `/Users/brunolima/Documents/repo/SouPelvi/pelvi-admin/CLAUDE.md`, in the env var table (the table containing the `CLINIC_EXTERNAL_API_KEY` row), add three rows right after it, before the `SEED_ADMIN_EMAIL` row:

```markdown
| `RESEND_API_KEY` | Resend API credential for transactional emails (onboarding welcome email). Required in every environment — startup fails if absent. |
| `MAIL_FROM` | Sender identity for onboarding emails, e.g. `Pelvi <bemvindo@soupelvi.com.br>`. Domain must be verified in Resend (SPF/DKIM). Required in every environment — startup fails if absent. |
| `CLINIC_APP_URL` | Base URL of the pelvi-ui frontend (e.g. `https://app.soupelvi.com.br`), used to build the login link in the welcome email. Distinct from `CLINIC_API_URL` (the API). Required in every environment — startup fails if absent. |
```

- [ ] **Step 8: Verify the project still type-checks**

Run: `cd backend && bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add backend/src/mail/assert-mail-config.ts backend/src/mail/assert-mail-config.spec.ts backend/src/main.ts backend/.env.example CLAUDE.md
git commit -m "feat(mail): fail startup when onboarding-email env vars are missing"
```

---

### Task 3: Prisma — add `WELCOME_EMAIL_SENT` to `OrgEventType`

**Files:**
- Modify: `backend/prisma/schema.prisma:177-190` (the `OrgEventType` enum)
- Create: a new migration under `backend/prisma/migrations/` (name/timestamp assigned by the tool)

**Interfaces:**
- Produces: `OrgEventType.WELCOME_EMAIL_SENT`, usable as the `type` argument to `OrgEventService.record(organizationId, type, payload?, actorId?)` (existing signature, unchanged, in `backend/src/organizations/application/org-event.service.ts`).

- [ ] **Step 1: Add the enum value**

In `backend/prisma/schema.prisma`, the `OrgEventType` enum currently reads:

```prisma
enum OrgEventType {
  ORG_CREATED
  STATUS_CHANGED
  SUBSCRIPTION_STARTED
  SUBSCRIPTION_CANCELED
  PLAN_CHANGED
  TRIAL_STARTED
  TRIAL_CONVERTED
  INVOICE_PAID
  INVOICE_OVERDUE
  USER_ADDED
  USER_REMOVED
  PASSWORD_RESET
}
```

Add `WELCOME_EMAIL_SENT` as the last value:

```prisma
enum OrgEventType {
  ORG_CREATED
  STATUS_CHANGED
  SUBSCRIPTION_STARTED
  SUBSCRIPTION_CANCELED
  PLAN_CHANGED
  TRIAL_STARTED
  TRIAL_CONVERTED
  INVOICE_PAID
  INVOICE_OVERDUE
  USER_ADDED
  USER_REMOVED
  PASSWORD_RESET
  WELCOME_EMAIL_SENT
}
```

- [ ] **Step 2: Generate the migration**

Run: `cd backend && bun run prisma:migrate:dev --name add_welcome_email_sent_event`

Expected: a new folder appears under `backend/prisma/migrations/` (e.g. `20260911..._add_welcome_email_sent_event/migration.sql`) containing `ALTER TYPE "OrgEventType" ADD VALUE 'WELCOME_EMAIL_SENT';`, and the Prisma client is regenerated.

**If the dev database in `.env.dev` is not reachable in this environment** (no local Postgres / no credentials), fall back to creating the migration file by hand instead of running the command:

```bash
mkdir -p "backend/prisma/migrations/$(date +%Y%m%d%H%M%S)_add_welcome_email_sent_event"
```

Then write to `backend/prisma/migrations/<that-folder>/migration.sql`:

```sql
ALTER TYPE "OrgEventType" ADD VALUE 'WELCOME_EMAIL_SENT';
```

Either way, finish with:

Run: `cd backend && bun run prisma:generate`
Expected: exits 0; `@prisma/client` types now include `WELCOME_EMAIL_SENT` in the `OrgEventType` enum.

- [ ] **Step 3: Verify the generated client has the new value**

Run: `cd backend && grep -r "WELCOME_EMAIL_SENT" node_modules/.prisma/client/*.d.ts`
Expected: at least one match.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat(db): add WELCOME_EMAIL_SENT to OrgEventType"
```

---

### Task 4: `send-welcome-email.ts` — render and send the onboarding email

**Files:**
- Create: `backend/src/organizations/application/send-welcome-email.ts`
- Test: `backend/src/organizations/application/send-welcome-email.spec.ts`
- Modify: `backend/src/organizations/organizations.module.ts`

**Interfaces:**
- Consumes: `MailService.send(input: SendMailInput): Promise<void>` (Task 1), `ConfigService.getOrThrow<string>('CLINIC_APP_URL')` (Task 2 guarantees it's set).
- Produces: `SendWelcomeEmail.execute(input: SendWelcomeEmailInput): Promise<void>` where
  ```typescript
  interface SendWelcomeEmailInput {
    ownerName: string
    ownerEmail: string
    organizationName: string
    provisionalPassword: string
  }
  ```
  Rethrows on failure (Task 5's caller decides to swallow it).
- Produces (exported for direct unit testing): `renderWelcomeEmail(input: SendWelcomeEmailInput & { accessUrl: string }): { subject: string; html: string; text: string }`.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/organizations/application/send-welcome-email.spec.ts`:

```typescript
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
    const config = { getOrThrow: () => 'https://app.soupelvi.com.br' } as ConfigService
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && bun run test -- send-welcome-email.spec.ts`
Expected: FAIL — `Cannot find module './send-welcome-email'`.

- [ ] **Step 3: Implement `send-welcome-email.ts`**

Create `backend/src/organizations/application/send-welcome-email.ts`:

```typescript
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && bun run test -- send-welcome-email.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Register `SendWelcomeEmail` in `OrganizationsModule`**

In `backend/src/organizations/organizations.module.ts`:
- Add `import { SendWelcomeEmail } from './application/send-welcome-email'` next to the other application imports.
- Add `SendWelcomeEmail,` to the `providers: [...]` array (e.g. right after `OrgEventService,`). `MailService` needs no explicit import — `MailModule` is `@Global()`.

- [ ] **Step 6: Verify the project still type-checks**

Run: `cd backend && bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add backend/src/organizations/application/send-welcome-email.ts backend/src/organizations/application/send-welcome-email.spec.ts backend/src/organizations/organizations.module.ts
git commit -m "feat(organizations): add SendWelcomeEmail use case"
```

---

### Task 5: Wire `SendWelcomeEmail` into `CreateOrganizationWithOwnerUseCase`

**Files:**
- Modify: `backend/src/organizations/application/create-organization-with-owner.usecase.ts:48-54` (constructor), `:165-167` (post-creation block)
- Modify: `backend/src/organizations/application/create-organization-with-owner.usecase.spec.ts`

**Interfaces:**
- Consumes: `SendWelcomeEmail.execute(input: SendWelcomeEmailInput): Promise<void>` (Task 4), `OrgEventService.record(organizationId: string, type: OrgEventType, payload?: Record<string, unknown>): Promise<void>` (existing), `OrgEventType.WELCOME_EMAIL_SENT` (Task 3).

- [ ] **Step 1: Extend the existing spec with the 3 new scenarios (written first, failing)**

In `backend/src/organizations/application/create-organization-with-owner.usecase.spec.ts`:

Add the import, next to the other imports:

```typescript
import { SendWelcomeEmail } from './send-welcome-email'
```

In the `describe` block, add a new `let` next to the others:

```typescript
  let sendWelcomeEmail: jest.Mocked<SendWelcomeEmail>
```

In `beforeEach`, next to where `orgEvents` is built, add:

```typescript
    sendWelcomeEmail = { execute: jest.fn().mockResolvedValue(undefined) } as any
```

Change the `sut = new CreateOrganizationWithOwnerUseCase(...)` line to:

```typescript
    sut = new CreateOrganizationWithOwnerUseCase(
      repo as any,
      clinicApi,
      prisma as any,
      resolveTrialPlan,
      orgEvents,
      sendWelcomeEmail,
    )
```

Add these three `it` blocks at the end of the `describe` block, before the closing `})`:

```typescript
  it('sends the welcome email when a new person is created', async () => {
    repo.findAll.mockResolvedValue({ data: [], total: 0 })
    clinicApi.createClinic.mockResolvedValue({ clinicId: 'clinic-new' } as any)
    clinicApi.upsertPerson.mockResolvedValue(personResp(false) as any)

    await sut.execute(baseInput)

    expect(sendWelcomeEmail.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerName: 'Ana Lima',
        ownerEmail: 'ana@test.com',
        organizationName: 'Clínica A',
      }),
    )
    expect(orgEvents.record).toHaveBeenCalledWith(
      'org-1',
      'WELCOME_EMAIL_SENT',
      expect.objectContaining({ ownerEmail: 'ana@test.com' }),
    )
  })

  it('does not send the welcome email when the owner is reused', async () => {
    repo.findAll.mockResolvedValue({ data: [], total: 0 })
    clinicApi.createClinic.mockResolvedValue({ clinicId: 'clinic-new' } as any)
    clinicApi.upsertPerson.mockResolvedValue(personResp(true) as any)

    await sut.execute(baseInput)

    expect(sendWelcomeEmail.execute).not.toHaveBeenCalled()
    expect(orgEvents.record).not.toHaveBeenCalledWith(
      expect.anything(),
      'WELCOME_EMAIL_SENT',
      expect.anything(),
    )
  })

  it('does not propagate a welcome-email failure and does not record the event', async () => {
    repo.findAll.mockResolvedValue({ data: [], total: 0 })
    clinicApi.createClinic.mockResolvedValue({ clinicId: 'clinic-new' } as any)
    clinicApi.upsertPerson.mockResolvedValue(personResp(false) as any)
    sendWelcomeEmail.execute.mockRejectedValue(new Error('Resend is down'))

    await expect(sut.execute(baseInput)).resolves.toBeDefined()
    expect(orgEvents.record).not.toHaveBeenCalledWith(
      expect.anything(),
      'WELCOME_EMAIL_SENT',
      expect.anything(),
    )
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && bun run test -- create-organization-with-owner.usecase.spec.ts`
Expected: FAIL — ts-jest reports a compile error on the `new CreateOrganizationWithOwnerUseCase(...)` call in `beforeEach` ("Expected 5 arguments, but got 6"), since the class doesn't accept `sendWelcomeEmail` yet. This confirms the wiring doesn't exist.

- [ ] **Step 3: Wire `SendWelcomeEmail` into the use case**

In `backend/src/organizations/application/create-organization-with-owner.usecase.ts`:

Add the import, next to the other application imports:

```typescript
import { SendWelcomeEmail } from './send-welcome-email'
```

In the constructor (currently ending with `private readonly orgEvents: OrgEventService,`), add a new parameter:

```typescript
    private readonly orgEvents: OrgEventService,
    private readonly sendWelcomeEmail: SendWelcomeEmail,
  ) {}
```

Replace this block:

```typescript
    if (personResp.reused) {
      this.logger.log(`Owner reaproveitado (cpf=***${input.owner.cpf.slice(-3)}); senha provisória não foi redefinida.`)
    }
```

with:

```typescript
    if (personResp.reused) {
      this.logger.log(`Owner reaproveitado (cpf=***${input.owner.cpf.slice(-3)}); senha provisória não foi redefinida.`)
    } else {
      try {
        await this.sendWelcomeEmail.execute({
          ownerName: personResp.person.name,
          ownerEmail: personResp.person.email,
          organizationName: organization.name,
          provisionalPassword,
        })
        await this.orgEvents.record(organization.id, 'WELCOME_EMAIL_SENT', {
          ownerEmail: personResp.person.email,
        })
      } catch (err) {
        this.logger.error(`Falha ao enviar e-mail de boas-vindas (org=${organization.id})`, err as Error)
      }
    }
```

- [ ] **Step 4: Run the tests to verify everything passes**

Run: `cd backend && bun run test -- create-organization-with-owner.usecase.spec.ts`
Expected: PASS (all tests, including the 3 new ones).

- [ ] **Step 5: Update `OrganizationsModule`'s DI order isn't affected — verify the whole backend test suite and type-check**

Run: `cd backend && bun run test && bunx tsc --noEmit`
Expected: all suites pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/organizations/application/create-organization-with-owner.usecase.ts backend/src/organizations/application/create-organization-with-owner.usecase.spec.ts
git commit -m "feat(organizations): send welcome email on new-owner organization creation"
```

---

### Task 6: Frontend — update the provisional-password modal copy

**Files:**
- Modify: `frontend/src/components/organizations/CreateOrganizationModal.tsx:181-183`

**Interfaces:**
- Consumes: existing `ownerCreated: OwnerCreatedInfo` component state (already has `ownerEmail: string` — no type change needed).

- [ ] **Step 1: Update the copy**

In `frontend/src/components/organizations/CreateOrganizationModal.tsx`, replace:

```tsx
              <p className="text-xs text-muted-foreground">
                Envie essa senha ao responsável por um canal seguro. Ele deverá alterá-la no primeiro acesso.
              </p>
```

with:

```tsx
              <p className="text-xs text-muted-foreground">
                Um e-mail de boas-vindas com o link de acesso foi enviado para{' '}
                <strong>{ownerCreated.ownerEmail}</strong>. Esta senha é o backup manual — envie por
                um canal seguro caso o e-mail não chegue.
              </p>
```

- [ ] **Step 2: Type-check and build**

Run: `cd frontend && bun run build`
Expected: exits 0 (no TypeScript or build errors). This project has no existing component-level tests (`find frontend/src -iname "*.test.tsx"` returns nothing) — a full render test would require newly building form-driving test scaffolding disproportionate to a one-line copy change referencing an already-typed field, so the build's type-check is the verification for this task.

- [ ] **Step 3: Manual check (once a real environment has Resend/CLINIC_APP_URL configured)**

Not executable in this environment (needs a live pelvi-ui backend + a configured Resend account — see spec section 8, "Manual / staging"). Before merging to `main`, whoever has access to a working local/staging setup should: create an organization with a new owner, confirm the modal shows the updated sentence with the correct email substituted, and confirm the email actually arrives.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/organizations/CreateOrganizationModal.tsx
git commit -m "feat(organizations): update provisional-password modal copy for welcome email"
```

---

### Task 7: Full verification, PR

**Files:** none (verification + PR only)

- [ ] **Step 1: Run the full backend test suite and type-check**

Run: `cd backend && bun run test && bunx tsc --noEmit && bun run lint`
Expected: all pass.

- [ ] **Step 2: Run the frontend build and lint**

Run: `cd frontend && bun run build && bun run lint`
Expected: all pass.

- [ ] **Step 3: Review the diff against the spec's acceptance criteria**

Re-read `docs/superpowers/specs/2026-09-11-onboarding-welcome-email-design.md` section 8 and this plan's Global Constraints; confirm every checkbox in Linear issue SOU-48's "Critérios de aceite" is covered by a task above.

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin bravilal/sou-48-enviar-e-mail-de-boas-vindas-ao-criar-organizacao
gh pr create --base main \
  --title "Enviar e-mail de boas-vindas ao criar organização" \
  --body "Refs SOU-48

Ver spec em docs/superpowers/specs/2026-09-11-onboarding-welcome-email-design.md."
```

- [ ] **Step 5: Move the Linear issue to In Review**

Update SOU-48's status to **In Review** once the PR is open.
