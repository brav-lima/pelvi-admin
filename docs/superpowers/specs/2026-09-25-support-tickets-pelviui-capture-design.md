# Support Tickets — pelvi-ui Capture Widget Design

**Note:** this spec was written from the `pelvi-admin` repo while designing
the admin-side counterpart, but everything it describes belongs to and
should be implemented in the **pelvi-ui** repo. It is self-contained so it
can be copied there directly. It depends on the API contract defined in
the sibling spec `2026-09-25-support-tickets-admin-design.md` (already
implemented / being implemented on the pelvi-admin side).

## Motivation

Source idea: a brainstorming doc proposing an in-product "Central de Ajuda"
so clinic users can report bugs, suggestions, or questions without leaving
the app, with the system automatically capturing technical context instead
of asking the user to describe it. See the admin-side spec for full
background and the Phase 2 items explicitly deferred (AI triage, knowledge
base, Linear automation, attachments, in-app reply thread).

## Scope (MVP)

- A discreet "? Ajuda" entry point in the pelvi-ui app shell.
- A small menu with three options that lead to a report form: "Encontrei um
  problema" (BUG), "Tenho uma sugestão" (SUGGESTION), "Dúvida / Falar com
  suporte" (QUESTION).
- The form asks only for a free-text description — everything else is
  captured automatically.
- On submit, the pelvi-ui **backend** (not the browser) calls pelvi-admin's
  external endpoint to create the ticket.
- Replies come back to the user by email, sent from pelvi-admin — no
  in-product reply UI in this phase.

## Out of scope (Phase 2)

Same list as the admin-side spec: AI triage, knowledge-base suggestions,
one-click Linear issue creation, file/screenshot attachments, in-app ticket
inbox/thread.

## Client-side (pelvi-ui frontend)

- New "Ajuda" trigger (button/menu) in the app shell, opening a small modal
  or panel with the three category options above.
- On selecting a category, show a single textarea: "Conte brevemente o que
  você estava tentando fazer" + a submit button. No other fields — do not
  ask the user for information the app already has.
- Capture the following automatically at submit time, client-side:
  - `route` — the app's logical route/screen name (not just the raw path,
    if the app has named routes)
  - `url` — `window.location.href`
  - `userAgent` — `navigator.userAgent`
  - `appVersion` — the app's existing build/version constant
  - `sessionId` — the existing session/correlation id already used for
    logging or analytics, if one exists; otherwise omit
  - `occurredAt` — `new Date().toISOString()`
  - `sentryEventId` — **only when category is `BUG`**: the id of the most
    recently captured Sentry event, if Sentry is initialized and has one
    available (e.g. `Sentry.lastEventId()` or equivalent for the SDK in
    use). `null`/omitted otherwise — do not force a manual Sentry capture
    if there wasn't already an error.
- POST this payload (description + captured context) to a new pelvi-ui
  backend endpoint, e.g. `POST /api/support/tickets`, authenticated the same
  way as any other pelvi-ui API call (existing session/JWT). Do **not**
  send `reporterName`/`reporterEmail`/`reporterRole`/`clinicId` from the
  browser — the backend fills those in from the authenticated session.
- On success, show a simple confirmation ("Recebemos seu relato, entraremos
  em contato por e-mail se necessário") and close the panel. On failure,
  show a generic error and let the user retry — do not lose their typed
  description.

## Server-side (pelvi-ui backend)

- New endpoint `POST /api/support/tickets` (or wherever this app's
  internal API conventions put it), guarded by the existing auth
  middleware for authenticated clinic users.
- From the authenticated request, server-side, resolve:
  - `clinicId` — the organization id, exactly like every other
    admin-integration call already does.
  - `reporterName`, `reporterEmail`, `reporterRole` — from the
    authenticated user's Person/User record. `reporterEmail` may be `null`
    if the person has none on file — that's expected and handled on the
    admin side (reply-by-email is simply unavailable for that ticket).
- Accept `category`, `description`, and the `context`/`sentryEventId`
  fields from the client body as-is (these are not security-sensitive —
  worst case a user submits a garbage `userAgent` string).
- Call pelvi-admin's external endpoint:

  `POST <ADMIN_API_URL>/api/clinic-ext/v1/support-tickets`
  header `x-clinic-api-key: <ADMIN_EXTERNAL_API_KEY>` (this env var/shared
  secret is the same one already used for other `clinic-ext` calls from
  this backend — reuse it, don't introduce a new one).

  Body:
  ```json
  {
    "clinicId": "<resolved organization id>",
    "category": "BUG | SUGGESTION | QUESTION",
    "description": "<from client>",
    "reporterName": "<from Person/User record>",
    "reporterEmail": "<from Person/User record, or null>",
    "reporterRole": "<ADMIN | PROFESSIONAL | RECEPTIONIST>",
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
- On a non-2xx response from pelvi-admin, return a generic failure to the
  client (don't leak admin-side error details); log the failure server-side
  for follow-up.
- This call is fire-and-forget from the user's perspective but should not
  be silently dropped — treat it like any other outbound integration call
  this backend already makes to pelvi-admin (same timeout/retry posture, if
  any exists for similar calls).

## Testing

- Unit test for the context-capture logic (correct fields present, correct
  handling when Sentry has no last event, correct handling when
  `sessionId` doesn't exist).
- Unit test for the backend endpoint confirming it never trusts
  `reporterName`/`reporterEmail`/`reporterRole`/`clinicId` from the request
  body, always resolving them from the authenticated session.
- Integration test (or manual verification) that a submitted ticket shows
  up correctly in the pelvi-admin backoffice.

## Open questions to resolve when this is picked up in pelvi-ui

- Exact mechanism to get `Sentry.lastEventId()` for whatever Sentry SDK
  version/setup pelvi-ui uses — verify the API still matches this repo's
  Sentry integration at implementation time.
- Whether pelvi-ui already has a `sessionId`/correlation id concept to
  reuse, or whether one needs to be introduced.
- Where the outbound admin-integration client already used for other
  `clinic-ext`-style calls lives in that codebase, so this reuses it
  instead of introducing a second HTTP client.
