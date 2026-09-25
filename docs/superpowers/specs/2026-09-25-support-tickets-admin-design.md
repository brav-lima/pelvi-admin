# Support Tickets — Admin-side MVP Design

Source idea: `docs/suporteInteligente.md` (brainstorming doc, in Portuguese).
This spec covers only the **pelvi-admin** side (backend module + backoffice
UI). The pelvi-ui widget/capture side is a separate, self-contained spec:
`2026-09-25-support-tickets-pelviui-capture-design.md`, written to be handed
off and implemented in that repo later.

## Motivation

Today there is no in-product way for clinic users to report a bug, suggest
an improvement, or ask a question, and no structured place in the backoffice
to track and answer these. The brainstorming doc proposes a staged approach:
start with a simple "Help Center + smart form + automatic context capture +
Sentry pairing", and defer AI triage / automatic Linear issue creation to a
later phase. This spec is that first stage, scoped to what pelvi-admin owns.

## Scope (MVP)

- A new `SupportTicket` record created when a clinic user reports a problem,
  suggestion, or question from inside pelvi-ui.
- Context (route, browser, app version, session id, timestamp) and, for bug
  reports, a Sentry event id are captured automatically by the pelvi-ui
  widget and sent along with the ticket — no manual re-entry by the user.
- A new "Suporte" area in the backoffice: list + detail, status workflow,
  an internal note, and a **reply-by-email** action (using the reporter's
  email on file, when available).
- A sidebar badge showing the count of open tickets, matching the existing
  overdue-invoice badge pattern.

## Out of scope (Phase 2, not this spec)

- AI-based triage or auto-suggested knowledge-base articles.
- Automatic (or one-click) Linear issue creation from a ticket.
- A "Learn how to use" knowledge base.
- File/screenshot attachments.
- Two-way in-product messaging (a "My tickets" inbox inside pelvi-ui) —
  replies go out by email instead.
- Auto-constructed Sentry deep links — the captured `sentryEventId` is shown
  as copyable text; the admin searches it in Sentry's own UI.

## Data model

Follows the existing schema conventions (snake_case columns via `@map`,
`onDelete: Cascade` from `Organization`, no cross-DB FK to pelvi-ui — same
as `Subscription`/`Invoice`).

```prisma
enum SupportTicketCategory {
  BUG
  SUGGESTION
  QUESTION
}

enum SupportTicketStatus {
  OPEN
  IN_PROGRESS
  RESOLVED
}

model SupportTicket {
  id             String                @id @default(uuid())
  organizationId String                @map("organization_id")
  organization   Organization          @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  category       SupportTicketCategory
  status         SupportTicketStatus   @default(OPEN)

  reporterName   String                @map("reporter_name")
  reporterEmail  String?               @map("reporter_email")
  reporterRole   String?               @map("reporter_role") // free text mirror of the pelvi-ui role (ADMIN/PROFESSIONAL/RECEPTIONIST)

  description    String
  context        Json                  // { route, url, userAgent, appVersion, sessionId, occurredAt }
  sentryEventId  String?               @map("sentry_event_id")

  internalNote   String?               @map("internal_note") // free-form, overwritten as the admin investigates

  emailReplyBody       String?   @map("email_reply_body")
  emailRepliedAt       DateTime? @map("email_replied_at")
  emailRepliedByAdminId String?  @map("email_replied_by_admin_id")
  emailRepliedByAdmin   AdminUser? @relation(fields: [emailRepliedByAdminId], references: [id])

  createdAt      DateTime              @default(now()) @map("created_at")
  updatedAt      DateTime              @updatedAt @map("updated_at")

  @@index([organizationId])
  @@index([status])
  @@map("support_tickets")
}
```

`Organization` gains a `supportTickets SupportTicket[]` back-relation.
`AdminUser` gains an `emailRepliedTickets SupportTicket[]` back-relation.

Cascade rule addition to the table in CLAUDE.md: deleting an `Organization`
also cascades to its `SupportTicket`s.

## Module layout

New `backend/src/support/` module, following the same layered pattern as
`organizations/`:

- `dto/` — `create-support-ticket.dto.ts`, `list-support-tickets-query.dto.ts`,
  `update-status.dto.ts`, `update-internal-note.dto.ts`, `reply.dto.ts`
- `domain/` — `support-ticket.repository.ts` (interface)
- `application/` — `create-support-ticket.usecase.ts`,
  `list-support-tickets.usecase.ts`, `get-support-ticket.usecase.ts`,
  `update-support-ticket-status.usecase.ts`,
  `update-support-ticket-note.usecase.ts`, `reply-support-ticket.usecase.ts`
- `infra/` — `prisma-support-ticket.repository.ts`
- `support-ticket-external.controller.ts` — external-facing, guarded by
  the existing `ClinicExternalApiKeyGuard`
- `support-ticket-admin.controller.ts` — backoffice-facing, guarded by
  `JwtAuthGuard` + `RolesGuard(SUPPORT, SUPER_ADMIN)`

## API

### External (called by the pelvi-ui backend, `x-clinic-api-key` header)

`POST /api/clinic-ext/v1/support-tickets`

```json
{
  "clinicId": "uuid",
  "category": "BUG | SUGGESTION | QUESTION",
  "description": "string",
  "reporterName": "string",
  "reporterEmail": "string | null",
  "reporterRole": "string | null",
  "context": {
    "route": "string",
    "url": "string",
    "userAgent": "string",
    "appVersion": "string",
    "sessionId": "string",
    "occurredAt": "ISO 8601 string"
  },
  "sentryEventId": "string | null"
}
```

Looks up `Organization` by `clinicExternalId = clinicId` (404 if not found —
mirrors the existing `getSubscription` behavior in `clinic-ext.service.ts`).
Creates the ticket with `status: OPEN`. Returns `{ id, status, createdAt }`.

`clinicId`, `reporterName`, `reporterEmail`, `reporterRole` must be extracted
server-side by the pelvi-ui backend from the authenticated session/JWT —
never trusted from the browser. Same convention already documented for
`clinicId` elsewhere in `clinic-ext`.

### Internal (admin JWT cookie, `RolesGuard(SUPPORT, SUPER_ADMIN)`)

- `GET /api/admin/support-tickets?page&limit&status&category` →
  `{ data, total, page, limit }` (same shape as Invoices/Subscriptions;
  default `limit` 50, max 100).
- `GET /api/admin/support-tickets/:id` → full ticket detail.
- `PATCH /api/admin/support-tickets/:id/status` — `{ status }`. Any
  transition allowed (OPEN/IN_PROGRESS/RESOLVED), no strict state machine
  for MVP.
- `PATCH /api/admin/support-tickets/:id/internal-note` — `{ note }`,
  overwrites `internalNote`.
- `POST /api/admin/support-tickets/:id/reply` — `{ body }`. 400s
  (`BadRequestException`) if `reporterEmail` is null. Sends via the existing
  `MailService` (`backend/src/mail/mail.service.ts`), then sets
  `emailReplyBody`, `emailRepliedAt`, `emailRepliedByAdminId`. Can be called
  again to overwrite/re-send (no history of prior replies in MVP).

### Metrics

`GET /metrics/summary` response gains `openSupportTicketsCount` (count of
tickets with `status: OPEN`), used for the sidebar badge.

## Backoffice UI

- `frontend/src/pages/Support.tsx`, route `/support`. List table: status
  badge (🔴 Aberto / 🟡 Em análise / 🟢 Resolvido), category, description
  excerpt, reporter name, organization name (link to
  `/organizations/:id`), created date. Status filter dropdown, pagination,
  red error banner on query failure, skeleton on load — same conventions as
  `Invoices`/`Subscriptions`.
- Detail view `/support/:id`: reporter info, category/status, full
  description, captured context block, `sentryEventId` shown as copyable
  text (no auto-generated link), internal note (editable textarea + save),
  email reply section (textarea + "Responder por e-mail", disabled with a
  tooltip when `reporterEmail` is null; shows `emailReplyBody`/
  `emailRepliedAt` once sent), and status action buttons.
- `AdminSidebar`: new "Suporte" nav item under "Operação", badge =
  `openSupportTicketsCount`, same visual pattern as the Invoices overdue
  badge.
- New React Query hooks in the existing `lib/api.ts` client pattern; new
  type additions to `src/types/admin.ts` (`SupportTicket`,
  `SupportTicketCategory`, `SupportTicketStatus`).

## Error handling

- `GlobalExceptionFilter` already normalizes all unhandled errors — no new
  filter needed.
- Reply with no `reporterEmail` → `BadRequestException`, surfaced via the
  existing `getErrorMessage` on the frontend.
- Unknown `clinicId` on ticket creation → `NotFoundException` (the pelvi-ui
  side must handle this defensively — covered in its own spec).
- `MailService.send` failure on reply → propagates the same
  timeout/error behavior already built for the onboarding welcome email;
  the ticket is left without `emailRepliedAt` set so the admin can retry.
- DTO validation via the existing global `ValidationPipe`
  (whitelist + forbidNonWhitelisted + transform) rejects invalid
  `category`/`status` values with the standard
  `{ message: 'Validation failed', errors: [...] }` shape.

## Testing

- Unit tests per use case (`create`, `list`, `get`, `update-status`,
  `update-internal-note`, `reply`), mirroring the style in
  `organizations/application/*.spec.ts`.
- DTO validation tests confirming invalid enum values are rejected.
- `reply` use case test confirming the `BadRequestException` path when
  `reporterEmail` is null, and that `MailService.send` is called with the
  right `to`/`subject`/`body` otherwise.
- No e2e/browser test planned for MVP; manual verification of the list/detail
  pages, consistent with how other backoffice pages were built.
- `tsc --noEmit` must pass before the PR is ready, per the standard workflow.

## Migration

`bun run prisma:generate` then `bun run prisma:migrate:dev` after adding the
model/enums/back-relations above.

## Linear

Per the project's workflow, this needs to be filed as one or more issues in
the SouPelvi/Admin Linear project before implementation starts (branch name
from the issue's `gitBranchName`, PR referencing the issue id). Suggested
split: (1) backend module + migration, (2) backoffice UI + sidebar badge.
