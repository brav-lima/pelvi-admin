# Onboarding Welcome Email — Design Spec

**Date:** 2026-09-11
**Status:** Approved for planning
**Scope:** New backend module (`mail/`) + hook into existing organization-creation
flow + small frontend copy change. Architectural.

---

## 1. Purpose

Today, creating a new organization/physiotherapist (`CreateOrganizationWithOwnerUseCase`)
generates a provisional password but sends no communication. The operator must
manually copy the password from a modal and deliver it "through a secure
channel" themselves — there is no standard welcome message and no access link.

This spec adds an automatic transactional welcome email, sent when a new owner
is created, containing a greeting, the pelvi-ui access link, and the
provisional password.

Out of scope: the operator-broadcast communications system (see
[2026-08-29-communications-system-design.md](./2026-08-29-communications-system-design.md)) —
different use case (broadcast to many orgs vs. one transactional send per
signup), not yet implemented. This spec creates the mail-sending
infrastructure independently; the broadcast system may reuse the transport
seam (`MailService`) when it is built, but nothing here is designed ahead of
time for that reuse beyond keeping the seam generic.

---

## 2. Decisions (locked)

| Dimension | Decision |
|---|---|
| Provider | Resend (same choice already locked in the communications-system spec) |
| Provider isolation | Thin `MailService` seam wraps the Resend SDK (matches `ClinicApiService` pattern) — transport only, no template knowledge |
| Trigger | End of `CreateOrganizationWithOwnerUseCase.execute()`, only when `provisionalPassword !== null` (a new person was created) |
| Reused owner (existing CPF) | No email sent — they already have access and a known password |
| Failure handling | Fire-and-forget: caught, logged at `error`, never fails organization creation |
| Template authoring (MVP) | Plain HTML string + inline CSS, built in code (function returning `{ subject, html, text }`), isolated in its own file so swapping the rendering engine later doesn't touch the use case or `MailService` |
| Template authoring (future, not built now) | React Email (or similar) noted as the likely upgrade if the number/complexity of transactional emails grows and raw HTML becomes hard to maintain |
| Access link source | New env var `CLINIC_APP_URL` (pelvi-ui frontend base URL) — does not exist today; only `CLINIC_API_URL` (the API) exists |
| Required config | `RESEND_API_KEY`, `MAIL_FROM`, `CLINIC_APP_URL` — required in **every** environment (dev included), checked explicitly at bootstrap |
| Audit trail | New `OrgEventType.WELCOME_EMAIL_SENT`, recorded only on successful send |
| Frontend | `CreateOrganizationModal` copy updated to state that a welcome email with the access link was sent to the owner's email; provisional password field kept as backup/reference |

### Explicitly rejected

- Resend-hosted/managed templates — Resend's transactional `emails.send` API
  has no persisted template store (unlike SendGrid Dynamic Templates); its
  "Broadcasts" product with a visual editor is a different, marketing-oriented
  product and doesn't fit a code-triggered transactional send.
- React Email / MJML for the MVP — real option, but an added dependency and
  build step not justified for a single email template today. Revisit if/when
  more transactional templates are added.
- Sending a (passwordless) notice to reused owners — they already have
  working access; no onboarding action needed.
- Blocking organization creation on email failure, or surfacing a
  send-success/failure flag through the API — adds complexity the operator
  doesn't need; the provisional-password fallback in the UI already covers
  delivery failure.
- Template registry / discriminated payload types (as designed for the
  broadcast system) — overkill for exactly one fixed email shape.

---

## 3. Backend — module `mail/`

```
backend/src/mail/
  mail.service.ts   MailService (Resend-backed): send({ to, subject, html, text }): Promise<void>
  mail.module.ts    exports MailService
```

- `MailService` reads `RESEND_API_KEY` and `MAIL_FROM` via `ConfigService`.
- `send()` calls the Resend SDK's `emails.send()` once. On provider error, it
  logs at `error` and rethrows — the caller decides whether to swallow it
  (this use case does; a future caller could choose differently).
- No circuit breaker, no retry, no batching — single request/response call,
  consistent with the "one signup at a time" scale of this trigger.
- This module knows nothing about welcome emails, organizations, or any other
  domain — purely a transport seam, mirroring `clinic-api/`'s role for HTTP
  calls to pelvi-ui.

---

## 4. Backend — welcome email content

```
backend/src/organizations/application/
  send-welcome-email.ts   Injectable; renders + sends the welcome email
```

- `render-welcome-email` logic lives inside `send-welcome-email.ts` (or a
  co-located `render-welcome-email.ts` if the implementation plan prefers
  splitting render from send) and is isolated from `CreateOrganizationWithOwnerUseCase`.
- Input: `{ ownerName, ownerEmail, organizationName, provisionalPassword }`.
- Output sent via `MailService.send()`:
  - `to`: `ownerEmail`
  - `subject`: e.g. `"Bem-vindo(a) à Pelvi — seu acesso está liberado"`
  - `html`: single fixed layout, CSS inlined (email clients strip
    `<style>`), containing a greeting with `ownerName`/`organizationName`,
    the access link, and the provisional password with a note to change it
    on first login.
  - `text`: plain-text equivalent (deliverability).
  - Access link: `${CLINIC_APP_URL}/login` (exact pelvi-ui login path to be
    confirmed against the pelvi-ui repo during implementation; `/login` is
    the working assumption).

### 4.1 Wiring into `CreateOrganizationWithOwnerUseCase`

- Inject `SendWelcomeEmail` (from `send-welcome-email.ts`).
- After the existing `orgEvents.record('TRIAL_STARTED', ...)` call, if
  `provisionalPassword !== null`:
  ```
  try {
    await this.sendWelcomeEmail.execute({ ownerName, ownerEmail, organizationName, provisionalPassword })
    await this.orgEvents.record(organization.id, 'WELCOME_EMAIL_SENT', { ownerEmail })
  } catch (err) {
    this.logger.error(`Falha ao enviar e-mail de boas-vindas (org=${organization.id})`, err)
  }
  ```
- No PII or secrets (password, full email) in the log message beyond what's
  already logged elsewhere in this use case (compare to the existing CPF
  masking convention: `***${cpf.slice(-3)}`).
- The use case's return shape is unchanged — the frontend has no way to know
  whether the email actually succeeded, by design (fire-and-forget).

---

## 5. Database

Add one value to the existing enum in `backend/prisma/schema.prisma`:

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
  WELCOME_EMAIL_SENT   // new
}
```

Requires `bun run prisma:generate` + a new migration
(`bun run prisma:migrate:dev`). No other schema changes — no persistence of
email content or delivery status (matches the fire-and-forget decision).

---

## 6. Configuration

| Env var | Purpose | Required |
|---|---|---|
| `RESEND_API_KEY` | Resend API credential | Yes — every environment, startup fails if absent |
| `MAIL_FROM` | Sender identity, e.g. `Pelvi <bemvindo@soupelvi.com.br>`. Domain must be verified in Resend. | Yes — every environment, startup fails if absent |
| `CLINIC_APP_URL` | Base URL of the pelvi-ui frontend (e.g. `https://app.soupelvi.com.br`), used to build the login link in the welcome email. Distinct from `CLINIC_API_URL` (the API base). | Yes — every environment, startup fails if absent |

- Explicit check added in `backend/src/main.ts`, alongside the existing
  `CORS_ORIGIN` production check, but **unconditional** (not gated to
  `NODE_ENV === 'production'`) since local development also needs to exercise
  the full signup flow against a real (or Resend sandbox/test) key.
- Add all three to `backend/.env.example` with placeholder values.
- Document in `CLAUDE.md` env table.
- Production: set in Coolify env for `backoffice-api`.

New dependency: `resend` (backend only, same package the future
communications system will also depend on). Installed via Bun; `bun.lock`
updated.

---

## 7. Frontend

- `frontend/src/components/organizations/CreateOrganizationModal.tsx`:
  update the copy in the "Senha provisória gerada" dialog to state that a
  welcome email with the access link was sent to the owner's email address.
  The provisional password field and copy button stay exactly as they are
  today — kept as the manual fallback if delivery fails or lands in spam.
- No new routes, no new API calls, no change to the response shape consumed
  by the frontend.

---

## 8. Testing

### Backend (Jest)

- `mail.service.spec.ts` — mocks the Resend SDK client: `send()` calls it
  with the expected payload shape; a provider throw propagates to the caller
  (this module does not swallow errors itself).
- `send-welcome-email.spec.ts` — rendered `subject`/`html`/`text` contain
  `organizationName`, `ownerName`, the access link built from
  `CLINIC_APP_URL`, and the provisional password; `mailService.send` called
  exactly once with `to: ownerEmail`.
- `create-organization-with-owner.usecase.spec.ts` (extend existing):
  - New person created → `sendWelcomeEmail.execute` called once with the
    correct arguments; `WELCOME_EMAIL_SENT` event recorded.
  - Owner reused (`personResp.reused === true`) → `sendWelcomeEmail.execute`
    **not** called.
  - `sendWelcomeEmail.execute` throws → use case still resolves successfully
    with the same return shape as today; error logged; no
    `WELCOME_EMAIL_SENT` event recorded.
- Bootstrap check: a small test (or manual verification) that `main.ts`
  throws when any of `RESEND_API_KEY` / `MAIL_FROM` / `CLINIC_APP_URL` is
  missing.

### Frontend

- Update the existing `CreateOrganizationModal` test/story (if any) to assert
  the new copy mentioning the email was sent.

### Manual / staging

- No staging env exists. Before merging: verify the Resend domain is
  verified, trigger a real organization creation against a personal test
  inbox, confirm subject/link/password render correctly and land outside
  spam.

---

## 9. Security & safety notes

- Provisional password is sent by email in plaintext, same trust level as
  today's operator-copies-and-sends-manually flow — not a new exposure, but
  worth noting: email is inherently less controlled than an internal channel.
  This is an accepted trade-off for a "simple onboarding" MVP; the modal
  still shows the password so the operator can use a more secure channel
  instead if the org is sensitive.
- No email content or recipient list is persisted (only the fact that a send
  was attempted, via the `WELCOME_EMAIL_SENT` org event, without the
  password).
- `RESEND_API_KEY` follows the same handling as other shared secrets in this
  repo (env var, not committed, rotated on suspected compromise).
- `MAIL_FROM` domain must have SPF/DKIM configured in Resend or mail lands in
  spam — call out in the implementation plan as a prerequisite, same note as
  in the communications-system spec.

---

## 10. Development workflow (per CLAUDE.md)

Before implementation:

1. Create / locate a tracked item on the project board
   (`https://github.com/orgs/brav-lima/projects/1`), move to **In progress**.
2. Branch `feat/<issue>-onboarding-welcome-email` off `main`.
3. PR targets `main`, body `Closes #<n>`, passes `tsc --noEmit` in both
   packages.
4. After merge, move board item to **Done**.

---

## 11. Resolved during brainstorming

- **Provider:** Resend, reusing the decision already locked for the
  (unimplemented) communications-broadcast system, via a new, independent
  `MailService` seam.
- **Trigger scope:** new-person signups only; reused owners are excluded.
- **Failure mode:** fire-and-forget, matching the precedent already set in
  the communications-system spec.
- **Template authoring:** plain HTML in code for the MVP; the render
  function is isolated in its own file specifically so that adopting React
  Email (or another engine) later is a localized change, not a rewrite of
  the use case or the mail transport.
- **Access link:** requires a new `CLINIC_APP_URL` env var; no existing env
  var pointed at the pelvi-ui frontend.
