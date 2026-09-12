# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Development Workflow

All development MUST follow this process — no exceptions:

### 1. Source of truth: Linear
- Every task comes from Linear, team **SouPelvi** (key `SOU`), project **Admin**
  (`https://linear.app/blvckship/project/admin-af7923f2aee3`)
- Before starting any implementation, check the project for items in **Todo** status
- Respect priority order: `Urgent` → `High` → `Medium` → `Low`
- Never implement something not tracked as a Linear issue in this project

### 2. Branch per issue
- Create a dedicated branch for each issue before writing any code
- Use the branch name Linear generates for the issue (`gitBranchName` field),
  format `<linear-username>/sou-<issue-number>-<slug>`
  - Example: `bravilal/sou-48-enviar-e-mail-de-boas-vindas-ao-criar-organizacao`
- Always branch off `main` (only production environment exists currently):
  ```bash
  git checkout main && git pull && git checkout -b bravilal/sou-48-<slug>
  ```
- Move the issue to **In Progress** when starting work on it

### 3. Pull Request linked to the issue
- Open a PR targeting `main` referencing the Linear issue identifier (e.g.
  `SOU-48`) in the body — the Linear GitHub integration auto-links and can
  auto-close the issue on merge, same intent as `Closes #<n>` on GitHub Issues
- PR title should match the issue title
- PR must pass TypeScript check (`tsc --noEmit`) before being considered ready
- Use `gh pr create --base main` and include the issue reference:
  ```bash
  gh pr create --base main --title "..." --body "Refs SOU-48"
  ```

### 4. Update Linear after merge
- After the PR is merged, move the corresponding Linear issue to **Done**
  (confirm the GitHub integration did this automatically; update manually if
  not)

### Linear issue statuses (team SouPelvi)
`Backlog` → `Todo` → `In Progress` → `In Review` → `Done` (also `Canceled`, `Duplicate`)

GitHub Issues on this repo are no longer the source of truth for task
tracking as of 2026-09-11 — pre-existing open GitHub issues predate the
Linear migration and should be triaged into Linear before being worked on.

---

## Overview

Pelvi Admin is a full-stack SaaS admin dashboard for managing clinic organizations, subscription plans, billing, and metrics — the **operator back-office** of the `pelvi-ui` clinic product. It consists of a React frontend (`frontend/`) and a NestJS backend (`backend/`) in separate subdirectories.

**Package manager**: **Bun** (`bun.lock` is the lockfile of record in both `backend/` and `frontend/`). Do not commit `package-lock.json`.

Integration with pelvi-ui: two HTTP channels, no cross-DB FKs.
- **admin→clinic** (`clinic-api/`): pelvi-admin calls pelvi-ui `/api/internal/*` using `CLINIC_INTERNAL_API_KEY` as `x-internal-api-key`.
- **clinic→admin** (`clinic-ext/`): pelvi-ui backend proxies authenticated clinic requests to `/api/clinic-ext/*` using `CLINIC_EXTERNAL_API_KEY` as `x-clinic-api-key`. `clinicId` (= pelvi-ui `organizationId`) is extracted from the clinic JWT server-side — never from the browser.

---

## Commands

### Frontend (`frontend/`)

```bash
bun run dev        # Start Vite dev server on port 8081
bun run build      # tsc -b + vite build
bun run lint       # ESLint on src/
bun run preview    # Preview production build
```

### Backend (`backend/`)

```bash
bun run start:dev          # NestJS watch mode (loads .env.dev via dotenvx)
bun run build              # nest build → dist/
bun run lint               # ESLint on src/ and test/
bun run test               # Jest tests

# Prisma
bun run prisma:generate        # Regenerate Prisma client after schema changes
bun run prisma:migrate:dev     # Run dev migrations
bun run prisma:migrate:deploy  # Deploy migrations to production
bun run prisma:seed            # Seed database (ts-node)
bun run prisma:studio          # Open Prisma Studio UI
```

### Environment Setup

Copy `backend/.env.example` to `backend/.env.dev` and populate:

| Variable | Purpose |
|----------|---------|
| `DATABASE_ADMIN_URL` | PostgreSQL connection string |
| `JWT_ADMIN_SECRET` | JWT signing secret (access token) |
| `JWT_ADMIN_REFRESH_SECRET` | JWT signing secret (refresh token — must differ from access) |
| `PORT` | Backend port (default 3001) |
| `CORS_ORIGIN` | Frontend URL for CORS (required in production) |
| `CLINIC_API_URL` | Base URL of the pelvi-ui clinic API (e.g. `http://localhost:3000`). Admin appends `/api/internal/*` — do **not** include the path prefix. |
| `CLINIC_INTERNAL_API_KEY` | Shared secret for admin→clinic calls (`x-internal-api-key` header). Must match `INTERNAL_API_KEY` on the clinic side. Rotation policy: every 90 days or immediately on suspected compromise. |
| `CLINIC_EXTERNAL_API_KEY` | Shared secret for clinic→admin calls accepted on `x-clinic-api-key` header. Must match `ADMIN_EXTERNAL_API_KEY` in pelvi-ui. Same rotation policy. |
| `RESEND_API_KEY` | Resend API credential for transactional emails (onboarding welcome email). Required in every environment — startup fails if absent. |
| `MAIL_FROM` | Sender identity for onboarding emails, e.g. `SouPelvi <bemvindo@soupelvi.com.br>`. Domain must be verified in Resend (SPF/DKIM). Required in every environment — startup fails if absent. |
| `CLINIC_APP_URL` | Base URL of the pelvi-ui frontend (e.g. `https://app.soupelvi.com.br`), used to build the login link in the welcome email. Distinct from `CLINIC_API_URL` (the API). Required in every environment — startup fails if absent. |
| `SEED_ADMIN_EMAIL` | Email do super admin criado no seed (default: `admin@soupelvi.com.br`) |
| `SEED_ADMIN_PASSWORD` | **Obrigatória.** Senha do super admin criado no seed. Sem essa var o seed falha. Deve estar definida tanto em `.env.dev` (local) quanto nas envs do Coolify (production). Se o admin já existir no banco, o seed pula a criação e mantém a senha atual. |

### Docker

Both frontend and backend have a `Dockerfile`. The backend uses `docker-entrypoint.sh`, which runs `prisma migrate deploy` on startup, then seed if `RUN_SEED=true`. Both containers install via Bun. End-to-end orchestration with the clinic product lives in the parent `docker-compose.yml`.

**Production (Coolify)**: `RUN_SEED=false` — seed was used to bootstrap the super admin; production DB is already initialized. Migrations still run on every deploy.

### Environments (Coolify — VPS)

Deployed on a VPS via **Coolify**. Currently **only production** is active — no staging environment yet.

| Git branch | Coolify service | Purpose |
|------------|-----------------|---------|
| `main`     | `backoffice` (frontend) + `backoffice-api` (backend) | Live traffic |

- **Database**: Neon (PostgreSQL) — production only.
- All PRs merge directly into `main`.

---

## Architecture

### Frontend (`frontend/src/`)

React SPA (React Router DOM 7) with:
- **Server state**: TanStack React Query — all API calls use query hooks with caching/refetch. List endpoints (`/invoices`, `/subscriptions`) return `{ data: T[], total: number, page: number, limit: number }` — destructure `data` before rendering.
- **Auth state**: `contexts/AdminAuthContext.tsx` — stores user in React state, session validated via `GET /auth/me` on mount; provides `useAdminAuth()`. Auth uses httpOnly cookies (`admin_token` + `admin_refresh_token`); no token stored in JS.
- **HTTP client**: `lib/api.ts` — Axios instance with `withCredentials: true` (sends cookies automatically). Interceptor handles 401 → automatic refresh via `POST /auth/refresh` → retry once; on refresh failure redirects to `/login`.
- **Toast**: `contexts/ToastContext.tsx` — `useToast()` with `toast.success/error`; use `getErrorMessage(err)` from `lib/utils.ts` to extract server messages.
- **Forms**: React Hook Form + Zod validation (including `superRefine` for conditional validation in multi-mode forms).
- **Styling**: Tailwind CSS with CSS variable-based theming (`src/index.css`); `ui/` primitives are Radix UI wrappers.
- **Error states**: all list pages (`Dashboard`, `Organizations`, `Invoices`, `Subscriptions`) show a red error banner when the query fails — never an infinite skeleton.

**Routing**: Protected by `components/auth/ProtectedRoute.tsx`. Layout routes under `/` render `AdminLayout` → `AdminSidebar` + `AdminTopBar` with nested pages (Dashboard, Organizations, OrganizationDetail, Plans, Subscriptions, Invoices).

**Path alias**: `@/*` resolves to `src/*`

**Dev proxy**: Vite proxies `/api/*` → `http://localhost:3001` — no hardcoded backend URL in frontend code.

**Formatters** (`lib/utils.ts`): `formatCurrency`, `formatDate`, `formatCNPJ`, `formatCPF`, `getErrorMessage`, `cn` (tailwind-merge).

**Frontend types** (`src/types/admin.ts`): `AdminUser`, `Organization`, `Plan`, `Subscription`, `Invoice`, `MetricsSummary`, `PaginatedResponse<T>`. `PaginatedResponse<T>` is `{ data: T[], total: number }` — used by Organizations. Invoices/Subscriptions return an extended shape `{ data, total, page, limit }`.

### Typography System

Shared across all Pelvi products (pelvi-ui, pelvi-admin, pelvi-landing-page):

- **Body / `font-sans`** → `Inter` — loaded from Google Fonts (400–700), via `src/routes/__root.tsx`
- **Headings / `font-display`** → `Plus Jakarta Sans` — loaded from Google Fonts (500–800)
- CSS vars defined in `frontend/src/index.css` `:root`: `--font-sans`, `--font-display`, `--font-mono`
- Tailwind fontFamily: `sans: ['var(--font-sans)']`, `display: ['var(--font-display)']`, `mono: ['var(--font-mono)']`
- `h1–h3` automatically use `--font-display` with `letter-spacing: -0.01em`
- Utility classes: `.font-display`, `.font-mono-ds`, `.num` (tabular numerals)

### Layout System

`AdminLayout` (`frontend/src/components/layout/AdminLayout.tsx`):
- Flex row: `AdminSidebar` (240px fixed) + content column (`AdminTopBar` + `<main>`)
- No collapse — sidebar always visible at 240px
- Inline CSS vars throughout (`var(--side-bg)`, `var(--bg)`, `var(--text)`, etc.) — defined in `index.css`

`AdminSidebar` details:
- Fixed width 240px, dark background (`var(--side-bg)`)
- Brand section: 32×32 "P" logo + "Pelvi Admin" title + "Back office" subtitle
- Section labels: "Operação" (nav items) and "Sistema" (settings) — uppercase 10.5px
- Nav items: 13.5px font, 8px padding, border-radius 8px, inline hover/active states via `onMouseEnter`/`onMouseLeave`
- Badge on "Faturas" showing overdue invoice count (from `metrics/summary` query)
- User footer: hash-color avatar (seeded from name) + name + role — same algorithm as pelvi-ui
- Custom inline SVG icons (no Lucide dependency in sidebar)

`AdminTopBar` details:
- Height 56px, `border-bottom`, `var(--surface)` background
- Left: breadcrumbs derived from URL path segments (UUIDs replaced with `…`)
- Center-right: search bar placeholder (⌘K kbd), 280px min-width
- Right: bell icon + divider + "Senha" button (opens ChangePasswordModal) + "Sair" button

### Pages

| Page | Route | Notes |
|------|-------|-------|
| Login | `/login` | Email + password, dynamic API health status indicator |
| Dashboard | `/dashboard` | KPI tiles with sparklines and period deltas (MRR, active orgs, revenue) |
| Organizations | `/organizations` | List with MRR per org, status badge, search/filter |
| OrganizationDetail | `/organizations/:id` | Users, subscription, invoices per org |
| Plans | `/plans` | Plan CRUD with pricing and limits |
| Subscriptions | `/subscriptions` | Paginated list, status filter |
| Invoices | `/invoices` | Paginated list, overdue badge, status filter |

### Backend (`backend/src/`)

NestJS 11 API on port 3001. Global prefix `/api/admin`. Swagger docs at `/api/admin/docs`.

**Top-level middleware** (in `main.ts`):
- `helmet()` — security headers
- `cookie-parser` — required to read httpOnly auth cookies
- `ValidationPipe` global (whitelist + forbidNonWhitelisted + transform). `exceptionFactory` normalizes validation errors to `{ message: 'Validation failed', errors: [{ field, messages }] }` — do NOT change this shape; frontend `getErrorMessage` depends on it.
- `GlobalExceptionFilter` — standardizes all unhandled errors to `{ statusCode, message, timestamp }`.
- CORS with `credentials: true`; `CORS_ORIGIN` must be a non-localhost domain in production or startup fails.

**Rate limiting**: `AdminThrottlerGuard` extends `ThrottlerGuard` — tracks by `admin:<userId>` for authenticated requests, `ip:<ip>` for anonymous. Applied globally (100 req/min default). Stricter per-route `@Throttle()` on sensitive endpoints (password reset: 5/min).

**Auth**: JWT via Passport (`auth/strategies/jwt.strategy.ts`) reading the `admin_token` httpOnly cookie. Refresh token rotation via `POST /auth/refresh` (reads `admin_refresh_token` cookie, issues new pair, rotates DB entry). Guards:
- `JwtAuthGuard` — verifies access token (applied per-controller via `@UseGuards`)
- `RolesGuard` — checks `@Roles()` decorator against `AdminRole` enum

Login issues both cookies server-side; logout clears them and revokes the refresh token in DB (`AdminRefreshToken` model).

**Admin roles**: `SUPER_ADMIN`, `FINANCE`, `SUPPORT` — defined in Prisma schema and `types/admin.ts`.

**Module layout** — each feature follows a layered pattern:
- `dto/` — request/response shapes (class-validator decorators)
- `domain/` — entities and repository interfaces
- `application/` — use cases (single-responsibility classes)
- `infra/` — Prisma repository implementations

**External integration — admin→clinic (`clinic-api/`)**: `ClinicApiService` is the single seam for HTTP calls to pelvi-ui using `CLINIC_INTERNAL_API_KEY` as `x-internal-api-key`. It:
- Appends `/api/internal/*` to `CLINIC_API_URL` — do **not** include that path in the env var.
- Uses a `buildUrl` tagged-template helper that `encodeURIComponent`-s every dynamic segment and asserts `URL.origin` matches the configured base — blocks SSRF/path-traversal.
- Supported operations: clinic create/list, access update, person upsert, link person to clinic (ADMIN/PROFESSIONAL/RECEPTIONIST), list/update/reset-password clinic users.

**External integration — clinic→admin (`clinic-ext/`)**: exposes read-only endpoints under `/api/clinic-ext/*` for pelvi-ui backend to proxy subscription data to authenticated clinic users. Guard: `ClinicExternalApiKeyGuard` validates `x-clinic-api-key` against `CLINIC_EXTERNAL_API_KEY`. Endpoints:
- `GET /api/clinic-ext/subscription?clinicId=<uuid>` — subscription + plan for an org (looked up by `clinicExternalId`)
- `GET /api/clinic-ext/plans` — active plans list

**Organizations module** (`organizations/application/`):
- `create-organization-with-owner.usecase.ts` — **standard org creation flow**: creates Clinic in pelvi-ui → upserts Person by CPF → links as ADMIN → persists Organization locally → creates TRIAL Subscription (+14 days) → propagates plan limits to pelvi-ui. Returns `{ organization, owner, subscription, provisionalPassword }`. Reusing an existing CPF returns `provisionalPassword: null` and `owner.reused: true`.
- `resolve-trial-plan.ts` — injectable helper that resolves the trial plan ID. Checks `TRIAL_PLAN_ID` env var first; falls back to DB lookup (`Plan.name ILIKE '%trial%', isActive = true`). Throws if neither exists.
- `create-organization.usecase.ts` — legacy flow that links an existing clinic by `clinicExternalId` without creating a new one.
- `provisional-password.ts` — generates passwords using `crypto.randomInt` (rejection sampling). Do NOT use `randomBytes % alphabet.length` — that's biased.
- `reset-clinic-user-password.usecase.ts` — generates a new provisional password and pushes it to pelvi-ui via clinic-api.
- `resolve-clinic-id.ts` — converts admin `organizationId` → `clinicExternalId` before any clinic-api call.
- `list-organizations.usecase.ts`, `update-status.usecase.ts` — listing + status transitions.

**`common/`**:
- `filters/global-exception.filter.ts` — catches all unhandled exceptions, returns `{ statusCode, message, timestamp }`.
- `guards/admin-throttler.guard.ts` — rate limiting by user ID or IP.

### Database (Prisma + PostgreSQL)

Schema at `backend/prisma/schema.prisma`. Core models (all IDs are UUIDs):

| Model | Key fields | Notes |
|-------|-----------|-------|
| `AdminUser` | `role: AdminRole` | Internal admin accounts |
| `AdminRefreshToken` | `tokenHash`, `expiresAt`, `revokedAt` | Refresh token rotation; `onDelete: Cascade` from AdminUser |
| `Organization` | `document: String @unique`, `clinicExternalId`, `status: OrgStatus` | SaaS customers. Linked to clinic product via `clinicExternalId` (no cross-DB FK). |
| `Plan` | `priceMonthly`, `maxUsers`, `maxPatients`, `features: Json?` | Subscription tiers |
| `Subscription` | `status: SubscriptionStatus`, `trialEndsAt` | `onDelete: Cascade` from Organization; `onDelete: Restrict` from Plan; `@@unique([organizationId, planId])` — one active plan per org. |
| `Invoice` | `amount`, `status: InvoiceStatus`, `dueDate` | `onDelete: Cascade` from Subscription |

Cascade rules:
- Deleting an `Organization` → cascades to its `Subscription`s → cascades to their `Invoice`s.
- Deleting a `Plan` is blocked if any `Subscription` references it (`Restrict`).

After any schema change: `bun run prisma:generate` then `bun run prisma:migrate:dev`.

**Paginated list endpoints** (`GET /invoices`, `GET /subscriptions`) accept `page` (default 1) and `limit` (default 50, max 100) query params and return `{ data, total, page, limit }`.

### Path Aliases

Both frontend and backend use `@/*` → `src/*` in their respective `tsconfig.json` files.
