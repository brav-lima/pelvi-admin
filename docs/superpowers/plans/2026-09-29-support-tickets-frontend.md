# Support Tickets Backoffice UI (SOU-64) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pelvi-admin backoffice UI for support tickets: a paginated list (`/support`), a detail/triage view (`/support/:id`) and an open-tickets badge in the sidebar.

**Architecture:** Server state lives in React Query hooks in a new `frontend/src/lib/support.ts` (built on the existing `api` axios instance). Two pages (`pages/Support.tsx`, `pages/SupportDetail.tsx`) follow the inline-CSS-vars + `ds.tsx` primitives conventions of `Invoices.tsx`. The sidebar badge reads `total` from `GET /support-tickets?status=OPEN&limit=1` (never `/metrics/summary`, which is closed to the `SUPPORT` role). One small backend change (Task 1) makes list/detail include the organization `{ id, name }`, which the list needs and the SOU-63 API does not return today.

**Tech Stack:** React 18, React Router DOM 7, TanStack React Query 5, Axios, Vitest + Testing Library (jsdom), Tailwind + inline CSS vars, Bun. Backend touch: NestJS 11 + Prisma 6.

**Spec:** `docs/superpowers/specs/2026-09-25-support-tickets-admin-design.md` (sections "Backoffice UI" and "Metrics"). Linear: SOU-64. Branch `bravilal/sou-64-suporte-tela-de-backoffice-lista-detalhe-e-badge` is already checked out.

## Global Constraints

- Package manager is **Bun**: `bun run <script>` / `bunx`. Never `npm`/`npx`. Do not commit `package-lock.json`.
- The badge count MUST come from `GET /support-tickets?status=OPEN&limit=1` → `total`. It MUST NOT read `openSupportTicketsCount` from `/metrics/summary` (spec, Metrics section).
- `sentryEventId` is shown as **copyable plain text — no auto-generated Sentry link** (spec, Out of scope).
- List page: red error banner when the query fails — never an infinite skeleton; skeleton only while loading (CLAUDE.md "Error states").
- Status badges: 🔴 Aberto / 🟡 Em análise / 🟢 Resolvido (spec).
- Reply section is disabled with a tooltip when `reporterEmail` is null (spec).
- All user-facing strings in Portuguese. Use `getErrorMessage(err)` from `@/lib/utils` for server errors and `useToast()` for feedback.
- Path alias `@/*` → `frontend/src/*`. Style with inline `var(--…)` CSS vars and `ds.tsx` primitives (`PageHeader`, `Card`, `CardHeader`, `StatusPill`, `Btn`, `FilterChip`, `TableFooter`, `OrgAvatar`), matching `Invoices.tsx`. Table class is `pa-tbl`.
- `bunx tsc --noEmit` (backend) and `bun run build` (frontend, runs `tsc -b`) must pass before the PR is ready.
- Hooks go in `frontend/src/lib/support.ts`, **not** inside `lib/api.ts`: `api.ts` is only the axios instance and `api.test.ts` mocks `axios` wholesale. (The Linear issue says "hooks em `lib/api.ts`"; this is a deliberate, noted deviation.)
- Out of scope: attachments, Sentry deep links, thread UI in pelvi-ui, and the existing `/dashboard` 403 for the `SUPPORT` role (pre-existing; note it in the PR, don't fix it here).

## Review Focus

Failure modes the spec implies but nothing else pins; each has a test in the task that owns the code.

1. **`SUPPORT` role sees the badge** (`/metrics/summary` would 403). Sidebar test asserts the badge comes from the tickets endpoint (Task 6).
2. **`FINANCE` role has no access to `/support-tickets`** (backend is `SUPER_ADMIN`/`SUPPORT` only). Nav item hidden and the badge query never fires for it (Task 6).
3. **Ticket with `reporterEmail: null`**: reply textarea/button disabled, tooltip explains why; no request can be sent (Task 5).
4. **Ticket with null optional fields** (`reporterRole`, `sentryEventId`, `internalNote`): renders "—"/empty, no crash (Task 5).
5. **Pagination edge**: "Próxima" disabled on the last page, "Anterior" disabled on page 1; changing the status filter resets to page 1 (Tasks 3 and 4).
6. **Empty list** shows "Nenhum chamado encontrado" (not a blank table) (Task 4).
7. **Unknown ticket id / 404** on detail shows an error banner instead of an infinite skeleton (Task 5).

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/src/support/domain/support-ticket.entity.ts` (mod) | add optional `organization?: { id; name }` to `SupportTicket` |
| `backend/src/support/infra/prisma-support-ticket.repository.ts` (mod) | `include` organization in `findById` and `findAll` |
| `frontend/src/types/admin.ts` (mod) | `SupportTicket*` types |
| `frontend/src/lib/support.ts` (new) | query keys + React Query hooks + status/category label helpers |
| `frontend/src/lib/support.test.tsx` (new) | hook + helper tests |
| `frontend/src/components/ui/ds.tsx` (mod) | `FilterChip` count optional; `TableFooter` real pagination (backward compatible) |
| `frontend/src/components/ui/ds.test.tsx` (new) | tests for those two changes |
| `frontend/src/components/support/TicketBadges.tsx` (new) | `TicketStatusPill`, `TicketCategoryTag` |
| `frontend/src/pages/Support.tsx` (new) | list page `SupportPage` |
| `frontend/src/pages/Support.test.tsx` (new) | list page tests |
| `frontend/src/pages/SupportDetail.tsx` (new) | detail page `SupportDetailPage` |
| `frontend/src/pages/SupportDetail.test.tsx` (new) | detail page tests |
| `frontend/src/App.tsx` (mod) | routes `support`, `support/:id` |
| `frontend/src/components/layout/AdminSidebar.tsx` (mod) | "Suporte" item + role-gated badge |
| `frontend/src/components/layout/AdminSidebar.test.tsx` (new) | sidebar tests |

---

### Task 1: Backend — include organization in list/detail responses

The list table must show the organization name with a link to `/organizations/:id` (spec), but `findAll`/`findById` currently return bare rows.

**Files:**
- Modify: `backend/src/support/domain/support-ticket.entity.ts`
- Modify: `backend/src/support/infra/prisma-support-ticket.repository.ts`

**Interfaces:**
- Produces: `SupportTicket.organization?: { id: string; name: string }` in list and detail JSON. `create`/`updateStatus`/`updateInternalNote`/`saveReply` keep returning it as `undefined` (optional) — the frontend re-fetches after mutations, so it does not depend on it.

- [ ] **Step 1: Extend the entity**

In `backend/src/support/domain/support-ticket.entity.ts`, add to the `SupportTicket` interface after `updatedAt: Date`:

```ts
  organization?: { id: string; name: string }
```

- [ ] **Step 2: Include the relation in the read paths**

In `backend/src/support/infra/prisma-support-ticket.repository.ts`, add above the class:

```ts
const withOrganization = { organization: { select: { id: true, name: true } } } as const
```

Replace `toDomain` with a version that accepts the optional relation:

```ts
  private toDomain(
    row: PrismaSupportTicketRow & { organization?: { id: string; name: string } },
  ): SupportTicket {
    return { ...row, context: row.context as unknown as SupportTicketContext }
  }
```

In `findById`, replace the query with:

```ts
    const row = await this.prisma.supportTicket.findUnique({ where: { id }, include: withOrganization })
```

In `findAll`, replace the `findMany` call with:

```ts
      this.prisma.supportTicket.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: withOrganization,
      }),
```

- [ ] **Step 3: Verify**

Run: `cd backend && bunx tsc --noEmit && bun run test`
Expected: no type errors; all suites still pass (23 suites / 100 tests — repositories are not unit-tested in this codebase, per the SOU-63 plan convention).

- [ ] **Step 4: Commit**

```bash
git add backend/src/support
git commit -m "feat(support): include organization name in ticket list and detail"
```

---

### Task 2: Types and React Query hooks

**Files:**
- Modify: `frontend/src/types/admin.ts`
- Create: `frontend/src/lib/support.ts`
- Test: `frontend/src/lib/support.test.tsx`

**Interfaces:**
- Produces (types, in `@/types/admin`): `SupportTicketCategory`, `SupportTicketStatus`, `SupportTicketContext`, `SupportTicket`, `SupportTicketListResponse`.
- Produces (in `@/lib/support`):
  - `supportKeys`: `{ all, list(filter), detail(id), openCount }`
  - `STATUS_LABEL: Record<SupportTicketStatus, string>`, `CATEGORY_LABEL: Record<SupportTicketCategory, string>`
  - `useSupportTickets(filter: { status?: SupportTicketStatus; page: number; limit: number })` → `UseQueryResult<SupportTicketListResponse>`
  - `useSupportTicket(id: string | undefined)` → `UseQueryResult<SupportTicket>`
  - `useOpenSupportTicketsCount(enabled: boolean)` → `UseQueryResult<number>`
  - `useUpdateTicketStatus(id)`, `useUpdateTicketNote(id)`, `useReplyToTicket(id)` → `UseMutationResult<SupportTicket, unknown, …>`; each invalidates `supportKeys.all` on success.

- [ ] **Step 1: Add the types**

Append to `frontend/src/types/admin.ts`:

```ts
export type SupportTicketCategory = 'BUG' | 'SUGGESTION' | 'QUESTION'
export type SupportTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'

export interface SupportTicketContext {
  route: string
  url: string
  userAgent: string
  appVersion: string
  sessionId?: string
  occurredAt: string
}

export interface SupportTicket {
  id: string
  organizationId: string
  organization?: { id: string; name: string }
  category: SupportTicketCategory
  status: SupportTicketStatus
  reporterName: string
  reporterEmail: string | null
  reporterRole: string | null
  description: string
  context: SupportTicketContext
  sentryEventId: string | null
  internalNote: string | null
  emailReplyBody: string | null
  emailRepliedAt: string | null
  emailRepliedByAdminId: string | null
  createdAt: string
  updatedAt: string
}

export interface SupportTicketListResponse {
  data: SupportTicket[]
  total: number
  page: number
  limit: number
}
```

(`sessionId` is optional because the backend's final review made it optional — commit `8847c31`.)

- [ ] **Step 2: Write the failing test**

`frontend/src/lib/support.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
}))

import { api } from '@/lib/api'
import {
  STATUS_LABEL,
  CATEGORY_LABEL,
  useSupportTickets,
  useOpenSupportTicketsCount,
  useUpdateTicketStatus,
} from './support'

const mockedApi = api as unknown as {
  get: ReturnType<typeof vi.fn>
  patch: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
}

function wrapperWith(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('labels', () => {
  it('maps every status and category to a Portuguese label', () => {
    expect(STATUS_LABEL).toEqual({ OPEN: 'Aberto', IN_PROGRESS: 'Em análise', RESOLVED: 'Resolvido' })
    expect(CATEGORY_LABEL).toEqual({ BUG: 'Problema', SUGGESTION: 'Sugestão', QUESTION: 'Dúvida' })
  })
})

describe('useSupportTickets', () => {
  it('requests the list with page, limit and status, omitting status when undefined', async () => {
    mockedApi.get.mockResolvedValue({ data: { data: [], total: 0, page: 1, limit: 20 } })
    const client = newClient()

    const { result, rerender } = renderHook(
      ({ status }: { status?: 'OPEN' }) => useSupportTickets({ status, page: 2, limit: 20 }),
      { wrapper: wrapperWith(client), initialProps: { status: undefined } },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockedApi.get).toHaveBeenCalledWith('/support-tickets', { params: { page: 2, limit: 20 } })

    rerender({ status: 'OPEN' })
    await waitFor(() =>
      expect(mockedApi.get).toHaveBeenCalledWith('/support-tickets', {
        params: { page: 2, limit: 20, status: 'OPEN' },
      }),
    )
  })
})

describe('useOpenSupportTicketsCount', () => {
  it('returns the total of GET /support-tickets?status=OPEN&limit=1 and never calls /metrics/summary', async () => {
    mockedApi.get.mockResolvedValue({ data: { data: [], total: 7, page: 1, limit: 1 } })

    const { result } = renderHook(() => useOpenSupportTicketsCount(true), {
      wrapper: wrapperWith(newClient()),
    })
    await waitFor(() => expect(result.current.data).toBe(7))

    expect(mockedApi.get).toHaveBeenCalledWith('/support-tickets', {
      params: { status: 'OPEN', limit: 1 },
    })
    expect(mockedApi.get).not.toHaveBeenCalledWith('/metrics/summary', expect.anything())
  })

  it('does not fire when disabled', () => {
    renderHook(() => useOpenSupportTicketsCount(false), { wrapper: wrapperWith(newClient()) })
    expect(mockedApi.get).not.toHaveBeenCalled()
  })
})

describe('useUpdateTicketStatus', () => {
  it('PATCHes the status and invalidates every support-ticket query', async () => {
    mockedApi.patch.mockResolvedValue({ data: { id: 't1', status: 'RESOLVED' } })
    const client = newClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateTicketStatus('t1'), { wrapper: wrapperWith(client) })
    await act(async () => {
      await result.current.mutateAsync('RESOLVED')
    })

    expect(mockedApi.patch).toHaveBeenCalledWith('/support-tickets/t1/status', { status: 'RESOLVED' })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['support-tickets'] })
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd frontend && bun run test -- src/lib/support.test.tsx`
Expected: FAIL — `Failed to resolve import "./support"`.

- [ ] **Step 4: Write the implementation**

`frontend/src/lib/support.ts`:

```ts
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  SupportTicket,
  SupportTicketCategory,
  SupportTicketListResponse,
  SupportTicketStatus,
} from '@/types/admin'

export const STATUS_LABEL: Record<SupportTicketStatus, string> = {
  OPEN: 'Aberto',
  IN_PROGRESS: 'Em análise',
  RESOLVED: 'Resolvido',
}

export const CATEGORY_LABEL: Record<SupportTicketCategory, string> = {
  BUG: 'Problema',
  SUGGESTION: 'Sugestão',
  QUESTION: 'Dúvida',
}

export interface SupportListFilter {
  status?: SupportTicketStatus
  page: number
  limit: number
}

export const supportKeys = {
  all: ['support-tickets'] as const,
  list: (filter: SupportListFilter) => ['support-tickets', 'list', filter] as const,
  detail: (id: string) => ['support-tickets', 'detail', id] as const,
  openCount: ['support-tickets', 'open-count'] as const,
}

export function useSupportTickets(filter: SupportListFilter) {
  const { status, page, limit } = filter
  return useQuery<SupportTicketListResponse>({
    queryKey: supportKeys.list(filter),
    queryFn: () =>
      api
        .get('/support-tickets', { params: { page, limit, ...(status && { status }) } })
        .then((r) => r.data),
    placeholderData: keepPreviousData,
  })
}

export function useSupportTicket(id: string | undefined) {
  return useQuery<SupportTicket>({
    queryKey: supportKeys.detail(id ?? ''),
    queryFn: () => api.get(`/support-tickets/${id}`).then((r) => r.data),
    enabled: !!id,
    retry: false,
  })
}

// Badge source. Deliberately NOT /metrics/summary: that endpoint is closed to the SUPPORT role.
export function useOpenSupportTicketsCount(enabled: boolean) {
  return useQuery<number>({
    queryKey: supportKeys.openCount,
    queryFn: () =>
      api
        .get<SupportTicketListResponse>('/support-tickets', { params: { status: 'OPEN', limit: 1 } })
        .then((r) => r.data.total),
    enabled,
    staleTime: 60_000,
  })
}

function useTicketMutation<TVars>(request: (vars: TVars) => Promise<{ data: SupportTicket }>) {
  const queryClient = useQueryClient()
  return useMutation<SupportTicket, unknown, TVars>({
    mutationFn: (vars) => request(vars).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: supportKeys.all }),
  })
}

export function useUpdateTicketStatus(id: string) {
  return useTicketMutation((status: SupportTicketStatus) =>
    api.patch(`/support-tickets/${id}/status`, { status }),
  )
}

export function useUpdateTicketNote(id: string) {
  return useTicketMutation((note: string) => api.patch(`/support-tickets/${id}/internal-note`, { note }))
}

export function useReplyToTicket(id: string) {
  return useTicketMutation((body: string) => api.post(`/support-tickets/${id}/reply`, { body }))
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && bun run test -- src/lib/support.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/admin.ts frontend/src/lib/support.ts frontend/src/lib/support.test.tsx
git commit -m "feat(support): add ticket types and React Query hooks"
```

---

### Task 3: Design-system tweaks — optional chip count, working pagination

`FilterChip` requires a `count` (the status filter is server-side, so per-status counts are unknown), and `TableFooter`'s buttons are a non-functional stub (always disabled / no handler). Both changes must stay backward compatible: `Invoices`, `Subscriptions` and `Organizations` call them today with the old props.

**Files:**
- Modify: `frontend/src/components/ui/ds.tsx` (`FilterChip` ~line 245, `TableFooter` ~line 278)
- Test: `frontend/src/components/ui/ds.test.tsx`

**Interfaces:**
- `FilterChip` props: `count?: number` (badge rendered only when provided).
- `TableFooter` props: existing `{ showing: number; total: number }` plus optional `page?: number; limit?: number; onPageChange?: (page: number) => void`. When `onPageChange` is absent it renders exactly as before. When present: range is `((page-1)*limit+1)–((page-1)*limit+showing)`, "‹ Anterior" disabled when `page <= 1`, "Próxima ›" disabled when `page * limit >= total`.

- [ ] **Step 1: Write the failing test**

`frontend/src/components/ui/ds.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilterChip, TableFooter } from './ds'

describe('FilterChip', () => {
  it('renders the count when provided', () => {
    render(<FilterChip label="Todas" count={3} />)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('renders no count badge when count is omitted', () => {
    render(<FilterChip label="Abertos" />)
    expect(screen.getByRole('button', { name: 'Abertos' })).toBeInTheDocument()
  })
})

describe('TableFooter', () => {
  it('keeps the legacy behaviour without onPageChange (Anterior disabled, range starts at 1)', () => {
    render(<TableFooter showing={5} total={12} />)
    expect(screen.getByText('1–5')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Anterior/ })).toBeDisabled()
  })

  it('shows the real range for page 2 and pages via onPageChange', () => {
    const onPageChange = vi.fn()
    render(<TableFooter showing={20} total={45} page={2} limit={20} onPageChange={onPageChange} />)

    expect(screen.getByText('21–40')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Próxima/ }))
    expect(onPageChange).toHaveBeenCalledWith(3)
    fireEvent.click(screen.getByRole('button', { name: /Anterior/ }))
    expect(onPageChange).toHaveBeenCalledWith(1)
  })

  it('disables Próxima on the last page and Anterior on the first', () => {
    const { rerender } = render(
      <TableFooter showing={5} total={45} page={3} limit={20} onPageChange={() => {}} />,
    )
    expect(screen.getByRole('button', { name: /Próxima/ })).toBeDisabled()

    rerender(<TableFooter showing={20} total={45} page={1} limit={20} onPageChange={() => {}} />)
    expect(screen.getByRole('button', { name: /Anterior/ })).toBeDisabled()
  })

  it('shows 0–0 for an empty result', () => {
    render(<TableFooter showing={0} total={0} page={1} limit={20} onPageChange={() => {}} />)
    expect(screen.getByText('0–0')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && bun run test -- src/components/ui/ds.test.tsx`
Expected: FAIL — `count` is required (type error is not enforced at runtime, but the "no count" and pagination tests fail: `Próxima` never calls `onPageChange`, `21–40` not found).

- [ ] **Step 3: Implement**

In `frontend/src/components/ui/ds.tsx`, change the `FilterChip` signature and wrap the count span:

```tsx
export function FilterChip({ label, count, active, onClick }: { label: string; count?: number; active?: boolean; onClick?: () => void }) {
```

Replace the `<span … className="num">{count}</span>` element with:

```tsx
      {count !== undefined && (
        <span
          style={{
            fontSize: 11, padding: '1px 7px', borderRadius: 999,
            background: active ? 'white' : 'var(--surface-3)',
            color: active ? 'var(--p-ink)' : 'var(--text-muted)',
            fontWeight: 500,
          }}
          className="num"
        >
          {count}
        </span>
      )}
```

Replace the whole `TableFooter` function with:

```tsx
export function TableFooter({
  showing, total, page = 1, limit, onPageChange,
}: {
  showing: number
  total: number
  page?: number
  limit?: number
  onPageChange?: (page: number) => void
}) {
  const paged = !!onPageChange && !!limit
  const offset = paged ? (page - 1) * limit! : 0
  const from = showing === 0 ? 0 : offset + 1
  const to = offset + showing
  const canPrev = paged && page > 1
  const canNext = paged && page * limit! < total
  const navBtn = (enabled: boolean): React.CSSProperties => ({
    height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid var(--ds-border)',
    background: 'var(--surface)', fontSize: 12.5, fontFamily: 'var(--font-sans)',
    cursor: enabled ? 'pointer' : 'not-allowed', opacity: enabled ? 1 : 0.5,
  })

  return (
    <div
      className="flex items-center justify-between"
      style={{ padding: '10px 16px', borderTop: '1px solid var(--ds-border)', background: 'var(--surface-2)', fontSize: 12, color: 'var(--text-muted)' }}
    >
      <div>
        Mostrando <span className="num" style={{ color: 'var(--text-2)' }}>{from}–{to}</span>{' '}
        de <span className="num" style={{ color: 'var(--text-2)' }}>{total}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {paged ? (
          <>
            <button disabled={!canPrev} onClick={() => onPageChange!(page - 1)} style={navBtn(canPrev)}>‹ Anterior</button>
            <button disabled={!canNext} onClick={() => onPageChange!(page + 1)} style={navBtn(canNext)}>Próxima ›</button>
          </>
        ) : (
          <>
            <button disabled style={{ ...navBtn(false) }}>‹ Anterior</button>
            <button style={{ ...navBtn(true) }}>Próxima ›</button>
          </>
        )}
      </div>
    </div>
  )
}
```

(The non-paged branch keeps the legacy look/behaviour for the three existing callers. In the legacy branch `from` is `showing === 0 ? 0 : 1` and `to` is `showing`, identical to before except an empty list now reads `0–0`.)

- [ ] **Step 4: Run tests and type-check**

Run: `cd frontend && bun run test -- src/components/ui/ds.test.tsx && bunx tsc -b`
Expected: PASS (5 tests); no type errors in `Invoices`/`Subscriptions`/`Organizations`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/ds.tsx frontend/src/components/ui/ds.test.tsx
git commit -m "feat(ui): optional FilterChip count and working TableFooter pagination"
```

---

### Task 4: Ticket badges + list page (`/support`)

**Files:**
- Create: `frontend/src/components/support/TicketBadges.tsx`
- Create: `frontend/src/pages/Support.tsx`
- Modify: `frontend/src/App.tsx`
- Test: `frontend/src/pages/Support.test.tsx`

**Interfaces:**
- Consumes: `useSupportTickets`, `STATUS_LABEL`, `CATEGORY_LABEL` (Task 2); `FilterChip`, `TableFooter` new props (Task 3).
- Produces: `TicketStatusPill({ status })`, `TicketCategoryTag({ category })` (used again in Task 5); `SupportPage` (named export); routes `support` and `support/:id`.
- Page size constant: `PAGE_SIZE = 20`.

- [ ] **Step 1: Write the failing test**

`frontend/src/pages/Support.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { SupportTicket } from '@/types/admin'

vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }))

import { api } from '@/lib/api'
import { SupportPage } from './Support'

const get = (api as unknown as { get: ReturnType<typeof vi.fn> }).get

const ticket = (over: Partial<SupportTicket> = {}): SupportTicket => ({
  id: 't1',
  organizationId: 'org-1',
  organization: { id: 'org-1', name: 'Clínica Aurora' },
  category: 'BUG',
  status: 'OPEN',
  reporterName: 'Dr. João',
  reporterEmail: 'joao@test.com',
  reporterRole: 'PROFESSIONAL',
  description: 'Não consegui salvar a evolução do paciente',
  context: { route: '/x', url: 'https://a/x', userAgent: 'UA', appVersion: '1.0.0', occurredAt: '2026-09-25T20:14:32.000Z' },
  sentryEventId: null,
  internalNote: null,
  emailReplyBody: null,
  emailRepliedAt: null,
  emailRepliedByAdminId: null,
  createdAt: '2026-09-25T20:14:32.000Z',
  updatedAt: '2026-09-25T20:14:32.000Z',
  ...over,
})

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SupportPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('SupportPage', () => {
  it('lists tickets with status, category, reporter and organization link', async () => {
    get.mockResolvedValue({ data: { data: [ticket()], total: 1, page: 1, limit: 20 } })
    renderPage()

    expect(await screen.findByText('Não consegui salvar a evolução do paciente')).toBeInTheDocument()
    expect(screen.getByText('Aberto')).toBeInTheDocument()
    expect(screen.getByText('Problema')).toBeInTheDocument()
    expect(screen.getByText('Dr. João')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Clínica Aurora' })).toHaveAttribute('href', '/organizations/org-1')
    expect(screen.getByRole('link', { name: /Não consegui salvar/ })).toHaveAttribute('href', '/support/t1')
  })

  it('shows a red error banner (not a skeleton) when the query fails', async () => {
    get.mockRejectedValue(new Error('boom'))
    renderPage()
    expect(await screen.findByText('Falha ao carregar chamados. Tente novamente.')).toBeInTheDocument()
  })

  it('shows an empty state when there are no tickets', async () => {
    get.mockResolvedValue({ data: { data: [], total: 0, page: 1, limit: 20 } })
    renderPage()
    expect(await screen.findByText('Nenhum chamado encontrado')).toBeInTheDocument()
  })

  it('filters by status and resets to page 1', async () => {
    get.mockResolvedValue({ data: { data: [ticket()], total: 45, page: 1, limit: 20 } })
    renderPage()
    await screen.findByText('Dr. João')

    fireEvent.click(screen.getByRole('button', { name: /Próxima/ }))
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/support-tickets', { params: { page: 2, limit: 20 } }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Abertos' }))
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/support-tickets', {
        params: { page: 1, limit: 20, status: 'OPEN' },
      }),
    )
  })

  it('falls back to "—" when the organization was not included', async () => {
    get.mockResolvedValue({ data: { data: [ticket({ organization: undefined })], total: 1, page: 1, limit: 20 } })
    renderPage()
    await screen.findByText('Dr. João')
    expect(screen.queryByRole('link', { name: 'Clínica Aurora' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && bun run test -- src/pages/Support.test.tsx`
Expected: FAIL — `Failed to resolve import "./Support"`.

- [ ] **Step 3: Create the badges**

`frontend/src/components/support/TicketBadges.tsx`:

```tsx
import { StatusPill } from '@/components/ui/ds'
import { CATEGORY_LABEL, STATUS_LABEL } from '@/lib/support'
import type { SupportTicketCategory, SupportTicketStatus } from '@/types/admin'

const STATUS_DOT: Record<SupportTicketStatus, string> = {
  OPEN: '🔴',
  IN_PROGRESS: '🟡',
  RESOLVED: '🟢',
}

const STATUS_TONE = { OPEN: 'danger', IN_PROGRESS: 'warn', RESOLVED: 'ok' } as const

export function TicketStatusPill({ status }: { status: SupportTicketStatus }) {
  return (
    <StatusPill tone={STATUS_TONE[status]}>
      <span aria-hidden="true">{STATUS_DOT[status]}</span> {STATUS_LABEL[status]}
    </StatusPill>
  )
}

export function TicketCategoryTag({ category }: { category: SupportTicketCategory }) {
  return <StatusPill tone="muted">{CATEGORY_LABEL[category]}</StatusPill>
}
```

(The tests match `getByText('Aberto')`; the emoji lives in an `aria-hidden` span so the label text node stays separate. If `getByText('Aberto')` fails because the text node is `" Aberto"`, use `{ exact: false }` in the assertion — do not drop the emoji.)

- [ ] **Step 4: Create the list page**

`frontend/src/pages/Support.tsx`:

```tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSupportTickets } from '@/lib/support'
import { formatDate } from '@/lib/utils'
import type { SupportTicketStatus } from '@/types/admin'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, FilterChip, OrgAvatar, PageHeader, TableFooter } from '@/components/ui/ds'
import { TicketCategoryTag, TicketStatusPill } from '@/components/support/TicketBadges'

const PAGE_SIZE = 20
const COLUMNS = 6

type StatusFilter = SupportTicketStatus | 'all'

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'OPEN', label: 'Abertos' },
  { key: 'IN_PROGRESS', label: 'Em análise' },
  { key: 'RESOLVED', label: 'Resolvidos' },
]

function excerpt(text: string, max = 90) {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text
}

export function SupportPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)

  const { data, isLoading, error } = useSupportTickets({
    status: statusFilter === 'all' ? undefined : statusFilter,
    page,
    limit: PAGE_SIZE,
  })
  const tickets = data?.data ?? []
  const total = data?.total ?? 0

  const changeFilter = (next: StatusFilter) => {
    setStatusFilter(next)
    setPage(1)
  }

  if (error) {
    return (
      <div style={{ borderRadius: 8, background: 'var(--danger-soft)', padding: '12px 16px', fontSize: 13, color: 'var(--danger-ink)' }}>
        Falha ao carregar chamados. Tente novamente.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader title="Suporte" subtitle="Chamados reportados pelas clínicas" />

      <div className="flex items-center gap-2 flex-wrap">
        {FILTERS.map(({ key, label }) => (
          <FilterChip key={key} label={label} active={statusFilter === key} onClick={() => changeFilter(key)} />
        ))}
      </div>

      <Card style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table className="pa-tbl">
            <thead>
              <tr>
                <th>Status</th>
                <th>Categoria</th>
                <th>Descrição</th>
                <th>Solicitante</th>
                <th>Organização</th>
                <th>Criado em</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: COLUMNS }).map((_, j) => (
                      <td key={j}><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : tickets.map((t) => (
                <tr key={t.id}>
                  <td><TicketStatusPill status={t.status} /></td>
                  <td><TicketCategoryTag category={t.category} /></td>
                  <td style={{ maxWidth: 360 }}>
                    <Link to={`/support/${t.id}`} style={{ color: 'var(--text)', fontWeight: 500, textDecoration: 'none' }}>
                      {excerpt(t.description)}
                    </Link>
                  </td>
                  <td>{t.reporterName}</td>
                  <td>
                    {t.organization ? (
                      <Link to={`/organizations/${t.organization.id}`} className="flex items-center gap-2" style={{ color: 'var(--text)', textDecoration: 'none' }}>
                        <OrgAvatar name={t.organization.name} size={24} />
                        <span style={{ fontWeight: 500 }}>{t.organization.name}</span>
                      </Link>
                    ) : '—'}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{formatDate(t.createdAt)}</td>
                </tr>
              ))}
              {!isLoading && tickets.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    Nenhum chamado encontrado
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <TableFooter showing={tickets.length} total={total} page={page} limit={PAGE_SIZE} onPageChange={setPage} />
      </Card>
    </div>
  )
}
```

The `<Link>` in the org cell has an accessible name equal to the org name (the avatar text is initials in a `div`; the test uses `getByRole('link', { name: 'Clínica Aurora' })`. If the avatar initials get concatenated into the accessible name, add `aria-label={t.organization.name}` on the `Link`.)

- [ ] **Step 5: Register the routes**

In `frontend/src/App.tsx`, add imports after the `InvoicesPage` import:

```tsx
import { SupportPage } from '@/pages/Support'
import { SupportDetailPage } from '@/pages/SupportDetail'
```

and after `<Route path="invoices" … />`:

```tsx
            <Route path="support" element={<SupportPage />} />
            <Route path="support/:id" element={<SupportDetailPage />} />
```

`SupportDetailPage` does not exist until Task 5; to keep this task green, create a temporary stub now and replace it in Task 5:

`frontend/src/pages/SupportDetail.tsx`:

```tsx
export function SupportDetailPage() {
  return null
}
```

- [ ] **Step 6: Run tests and type-check**

Run: `cd frontend && bun run test -- src/pages/Support.test.tsx && bunx tsc -b`
Expected: PASS (5 tests); no type errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/support frontend/src/pages/Support.tsx frontend/src/pages/Support.test.tsx frontend/src/pages/SupportDetail.tsx frontend/src/App.tsx
git commit -m "feat(support): add ticket list page and routes"
```

---

### Task 5: Ticket detail page (`/support/:id`)

**Files:**
- Modify (replace stub): `frontend/src/pages/SupportDetail.tsx`
- Test: `frontend/src/pages/SupportDetail.test.tsx`

**Interfaces:**
- Consumes: `useSupportTicket`, `useUpdateTicketStatus`, `useUpdateTicketNote`, `useReplyToTicket`, `STATUS_LABEL` (Task 2); `TicketStatusPill`, `TicketCategoryTag` (Task 4); `useToast`, `getErrorMessage`.
- Produces: `SupportDetailPage` (named export, reads `:id` via `useParams`).

Behaviour (from spec/issue):
- Header: back link to `/support`, category + status pills, "Chamado <id first 8 chars>".
- Reporter card: name, email (or "—"), role (or "—"), organization link.
- Description card: full text, `white-space: pre-wrap`.
- Context card: `route`, `url`, `userAgent`, `appVersion`, `sessionId` (or "—"), `occurredAt`.
- Sentry: `sentryEventId` in a `<code>` element + "Copiar" button (`navigator.clipboard.writeText`, toast "ID copiado"); "—" when null. No link.
- Status actions: three buttons (Aberto / Em análise / Resolvido); the current one is disabled; click calls the status mutation, toast on success/error.
- Internal note: textarea seeded from `internalNote`, "Salvar nota" disabled when unchanged or empty (DTO requires non-empty `note`).
- Reply: textarea + "Responder por e-mail". If `reporterEmail` is null: textarea and button disabled, wrapper `title="Este chamado não possui e-mail do solicitante"`. If `emailRepliedAt` is set, show the last reply body and date above the form. Button disabled while body is blank.

- [ ] **Step 1: Write the failing test**

`frontend/src/pages/SupportDetail.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { SupportTicket } from '@/types/admin'

vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() } }))

import { api } from '@/lib/api'
import { ToastProvider } from '@/contexts/ToastContext'
import { SupportDetailPage } from './SupportDetail'

const mocked = api as unknown as {
  get: ReturnType<typeof vi.fn>
  patch: ReturnType<typeof vi.fn>
  post: ReturnType<typeof vi.fn>
}

const ticket = (over: Partial<SupportTicket> = {}): SupportTicket => ({
  id: '11111111-2222-3333-4444-555555555555',
  organizationId: 'org-1',
  organization: { id: 'org-1', name: 'Clínica Aurora' },
  category: 'BUG',
  status: 'OPEN',
  reporterName: 'Dr. João',
  reporterEmail: 'joao@test.com',
  reporterRole: 'PROFESSIONAL',
  description: 'Não consegui salvar a evolução',
  context: {
    route: '/patients/:id/evolutions',
    url: 'https://app.soupelvi.com.br/patients/1/evolutions',
    userAgent: 'Mozilla/5.0',
    appVersion: '1.8.2',
    sessionId: 'sess-1',
    occurredAt: '2026-09-25T20:14:32.000Z',
  },
  sentryEventId: 'abc123def',
  internalNote: null,
  emailReplyBody: null,
  emailRepliedAt: null,
  emailRepliedByAdminId: null,
  createdAt: '2026-09-25T20:14:32.000Z',
  updatedAt: '2026-09-25T20:14:32.000Z',
  ...over,
})

function renderPage(id = '11111111-2222-3333-4444-555555555555') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[`/support/${id}`]}>
          <Routes>
            <Route path="/support/:id" element={<SupportDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
})

describe('SupportDetailPage', () => {
  it('renders reporter, description, captured context and the sentry id as plain text', async () => {
    mocked.get.mockResolvedValue({ data: ticket() })
    renderPage()

    expect(await screen.findByText('Não consegui salvar a evolução')).toBeInTheDocument()
    expect(screen.getByText('joao@test.com')).toBeInTheDocument()
    expect(screen.getByText('/patients/:id/evolutions')).toBeInTheDocument()
    expect(screen.getByText('1.8.2')).toBeInTheDocument()
    expect(screen.getByText('sess-1')).toBeInTheDocument()
    expect(screen.getByText('abc123def')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /abc123def/ })).not.toBeInTheDocument()
  })

  it('copies the sentry event id to the clipboard', async () => {
    mocked.get.mockResolvedValue({ data: ticket() })
    renderPage()
    await screen.findByText('abc123def')

    fireEvent.click(screen.getByRole('button', { name: 'Copiar' }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('abc123def')
  })

  it('renders nulls as "—" without crashing (role, sentry id, session id)', async () => {
    mocked.get.mockResolvedValue({
      data: ticket({
        reporterRole: null,
        sentryEventId: null,
        context: { route: '/', url: 'u', userAgent: 'ua', appVersion: '1', occurredAt: '2026-09-25T20:14:32.000Z' },
      }),
    })
    renderPage()
    await screen.findByText('Não consegui salvar a evolução')
    expect(screen.queryByRole('button', { name: 'Copiar' })).not.toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3)
  })

  it('shows an error banner when the ticket cannot be loaded (404)', async () => {
    mocked.get.mockRejectedValue({ response: { status: 404, data: { message: 'Chamado não encontrado' } } })
    renderPage('does-not-exist')
    expect(await screen.findByText('Chamado não encontrado')).toBeInTheDocument()
  })

  it('changes status via PATCH and disables the current status button', async () => {
    mocked.get.mockResolvedValue({ data: ticket() })
    mocked.patch.mockResolvedValue({ data: ticket({ status: 'IN_PROGRESS' }) })
    renderPage()
    await screen.findByText('Não consegui salvar a evolução')

    expect(screen.getByRole('button', { name: 'Marcar como Aberto' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como Em análise' }))
    await waitFor(() =>
      expect(mocked.patch).toHaveBeenCalledWith(expect.stringMatching(/\/status$/), { status: 'IN_PROGRESS' }),
    )
  })

  it('saves the internal note, and blocks saving when unchanged or empty', async () => {
    mocked.get.mockResolvedValue({ data: ticket({ internalNote: 'nota antiga' }) })
    mocked.patch.mockResolvedValue({ data: ticket({ internalNote: 'nota nova' }) })
    renderPage()
    await screen.findByText('Não consegui salvar a evolução')

    const save = screen.getByRole('button', { name: 'Salvar nota' })
    expect(save).toBeDisabled()

    const textarea = screen.getByLabelText('Nota interna')
    fireEvent.change(textarea, { target: { value: '   ' } })
    expect(save).toBeDisabled()

    fireEvent.change(textarea, { target: { value: 'nota nova' } })
    expect(save).toBeEnabled()
    fireEvent.click(save)
    await waitFor(() =>
      expect(mocked.patch).toHaveBeenCalledWith(expect.stringMatching(/\/internal-note$/), { note: 'nota nova' }),
    )
  })

  it('sends a reply by e-mail when the reporter has an e-mail', async () => {
    mocked.get.mockResolvedValue({ data: ticket() })
    mocked.post.mockResolvedValue({ data: ticket({ emailReplyBody: 'Já corrigimos', emailRepliedAt: '2026-09-26T10:00:00.000Z' }) })
    renderPage()
    await screen.findByText('Não consegui salvar a evolução')

    const send = screen.getByRole('button', { name: 'Responder por e-mail' })
    expect(send).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Resposta por e-mail'), { target: { value: 'Já corrigimos' } })
    expect(send).toBeEnabled()
    fireEvent.click(send)
    await waitFor(() =>
      expect(mocked.post).toHaveBeenCalledWith(expect.stringMatching(/\/reply$/), { body: 'Já corrigimos' }),
    )
  })

  it('disables the reply form with an explanatory tooltip when reporterEmail is null', async () => {
    mocked.get.mockResolvedValue({ data: ticket({ reporterEmail: null }) })
    renderPage()
    await screen.findByText('Não consegui salvar a evolução')

    expect(screen.getByLabelText('Resposta por e-mail')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Responder por e-mail' })).toBeDisabled()
    expect(screen.getByTitle('Este chamado não possui e-mail do solicitante')).toBeInTheDocument()
    expect(mocked.post).not.toHaveBeenCalled()
  })

  it('shows the last sent reply when one exists', async () => {
    mocked.get.mockResolvedValue({
      data: ticket({ emailReplyBody: 'Já corrigimos o problema', emailRepliedAt: '2026-09-26T10:00:00.000Z' }),
    })
    renderPage()
    expect(await screen.findByText('Já corrigimos o problema')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && bun run test -- src/pages/SupportDetail.test.tsx`
Expected: FAIL — the stub renders `null`, so every `findByText` times out.

- [ ] **Step 3: Implement the page**

Replace `frontend/src/pages/SupportDetail.tsx`:

```tsx
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  STATUS_LABEL,
  useReplyToTicket,
  useSupportTicket,
  useUpdateTicketNote,
  useUpdateTicketStatus,
} from '@/lib/support'
import { formatDate, getErrorMessage } from '@/lib/utils'
import { useToast } from '@/contexts/ToastContext'
import type { SupportTicket, SupportTicketStatus } from '@/types/admin'
import { Skeleton } from '@/components/ui/skeleton'
import { Btn, Card, CardHeader, PageHeader } from '@/components/ui/ds'
import { TicketCategoryTag, TicketStatusPill } from '@/components/support/TicketBadges'

const STATUSES: SupportTicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED']
const NO_EMAIL_TOOLTIP = 'Este chamado não possui e-mail do solicitante'

const textareaStyle: React.CSSProperties = {
  width: '100%', minHeight: 96, padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--ds-border)', background: 'var(--surface)', color: 'var(--text)',
  fontSize: 13, fontFamily: 'var(--font-sans)', resize: 'vertical',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 2, wordBreak: 'break-word' }}>{children}</div>
    </div>
  )
}

const dash = (v: string | null | undefined) => (v ? v : '—')

export function SupportDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: ticket, isLoading, error } = useSupportTicket(id)

  if (error) {
    return (
      <div style={{ borderRadius: 8, background: 'var(--danger-soft)', padding: '12px 16px', fontSize: 13, color: 'var(--danger-ink)' }}>
        {getErrorMessage(error)}
      </div>
    )
  }
  if (isLoading || !ticket) {
    return <Skeleton className="h-64 w-full" />
  }
  // `key` re-seeds the local form state if a refetch brings a different note.
  return <TicketDetail key={ticket.id} ticket={ticket} />
}

function TicketDetail({ ticket }: { ticket: SupportTicket }) {
  const { toast } = useToast()
  const updateStatus = useUpdateTicketStatus(ticket.id)
  const updateNote = useUpdateTicketNote(ticket.id)
  const reply = useReplyToTicket(ticket.id)

  const [note, setNote] = useState(ticket.internalNote ?? '')
  const [replyBody, setReplyBody] = useState('')

  const noteDirty = note.trim() !== '' && note !== (ticket.internalNote ?? '')
  const canReply = !!ticket.reporterEmail

  const copySentryId = async () => {
    try {
      await navigator.clipboard.writeText(ticket.sentryEventId!)
      toast.success('ID copiado')
    } catch {
      toast.error('Não foi possível copiar o ID')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Link to="/support" style={{ fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none' }}>
        ‹ Voltar para chamados
      </Link>

      <PageHeader
        title={`Chamado ${ticket.id.slice(0, 8)}`}
        subtitle={<>Aberto em {formatDate(ticket.createdAt)}</>}
        actions={
          <>
            <TicketCategoryTag category={ticket.category} />
            <TicketStatusPill status={ticket.status} />
          </>
        }
      />

      <Card>
        <CardHeader title="Solicitante" />
        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <Field label="Nome">{ticket.reporterName}</Field>
          <Field label="E-mail">{dash(ticket.reporterEmail)}</Field>
          <Field label="Papel">{dash(ticket.reporterRole)}</Field>
          <Field label="Organização">
            {ticket.organization ? (
              <Link to={`/organizations/${ticket.organization.id}`}>{ticket.organization.name}</Link>
            ) : '—'}
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Descrição" />
        <div style={{ padding: 16, fontSize: 13.5, whiteSpace: 'pre-wrap', color: 'var(--text)' }}>{ticket.description}</div>
      </Card>

      <Card>
        <CardHeader title="Contexto capturado" />
        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          <Field label="Rota">{ticket.context.route}</Field>
          <Field label="URL">{ticket.context.url}</Field>
          <Field label="Navegador">{ticket.context.userAgent}</Field>
          <Field label="Versão do app">{ticket.context.appVersion}</Field>
          <Field label="Sessão">{dash(ticket.context.sessionId)}</Field>
          <Field label="Ocorrido em">{formatDate(ticket.context.occurredAt)}</Field>
          <Field label="Sentry event ID">
            {ticket.sentryEventId ? (
              <span className="flex items-center gap-2">
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{ticket.sentryEventId}</code>
                <Btn size="sm" onClick={copySentryId}>Copiar</Btn>
              </span>
            ) : '—'}
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Status" />
        <div style={{ padding: 16 }} className="flex items-center gap-2 flex-wrap">
          {STATUSES.map((s) => (
            <Btn
              key={s}
              size="sm"
              disabled={ticket.status === s || updateStatus.isPending}
              onClick={() =>
                updateStatus.mutate(s, {
                  onSuccess: () => toast.success(`Status alterado para ${STATUS_LABEL[s]}`),
                  onError: (err) => toast.error(getErrorMessage(err)),
                })
              }
            >
              Marcar como {STATUS_LABEL[s]}
            </Btn>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Nota interna" subtitle="Visível apenas para o time de suporte" />
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <textarea aria-label="Nota interna" style={textareaStyle} value={note} onChange={(e) => setNote(e.target.value)} />
          <div>
            <Btn
              variant="primary"
              size="sm"
              disabled={!noteDirty || updateNote.isPending}
              onClick={() =>
                updateNote.mutate(note, {
                  onSuccess: () => toast.success('Nota salva'),
                  onError: (err) => toast.error(getErrorMessage(err)),
                })
              }
            >
              Salvar nota
            </Btn>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Resposta por e-mail" subtitle={canReply ? `Será enviada para ${ticket.reporterEmail}` : undefined} />
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ticket.emailRepliedAt && ticket.emailReplyBody && (
            <div style={{ borderRadius: 8, background: 'var(--surface-2)', padding: '10px 12px', fontSize: 13 }}>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 4 }}>
                Última resposta enviada em {formatDate(ticket.emailRepliedAt)}
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{ticket.emailReplyBody}</div>
            </div>
          )}
          <span title={canReply ? undefined : NO_EMAIL_TOOLTIP} style={{ display: 'contents' }}>
            <textarea
              aria-label="Resposta por e-mail"
              style={{ ...textareaStyle, opacity: canReply ? 1 : 0.6 }}
              value={replyBody}
              disabled={!canReply}
              onChange={(e) => setReplyBody(e.target.value)}
            />
          </span>
          <span title={canReply ? undefined : NO_EMAIL_TOOLTIP} style={{ alignSelf: 'flex-start' }}>
            <Btn
              variant="primary"
              size="sm"
              disabled={!canReply || replyBody.trim() === '' || reply.isPending}
              onClick={() =>
                reply.mutate(replyBody, {
                  onSuccess: () => {
                    toast.success('Resposta enviada por e-mail')
                    setReplyBody('')
                  },
                  onError: (err) => toast.error(getErrorMessage(err)),
                })
              }
            >
              Responder por e-mail
            </Btn>
          </span>
        </div>
      </Card>
    </div>
  )
}
```

Notes for the implementer:
- A disabled `<button>` does not fire hover events, so the tooltip is a native `title` on the wrapping `<span>`, the standard workaround.
- `useSupportTicket` sets `retry: false`, so a 404 shows the banner immediately.
- `getErrorMessage` on a `{ response: { data: { message } } }` rejection returns the server message ("Chamado não encontrado").
- After a successful reply, `invalidateQueries` refetches the ticket and the "Última resposta enviada" block appears.
- `Card` / `CardHeader` come from `ds.tsx`; if `CardHeader` requires other props, check its signature at `ds.tsx:139` (only `title` is required).

- [ ] **Step 4: Run tests and type-check**

Run: `cd frontend && bun run test -- src/pages/SupportDetail.test.tsx && bunx tsc -b`
Expected: PASS (9 tests); no type errors. If the `getByText('—')` count assertion in the nulls test is off by the layout (it needs ≥3: role, session, sentry), keep the assertion and fix the page, not the test.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/SupportDetail.tsx frontend/src/pages/SupportDetail.test.tsx
git commit -m "feat(support): add ticket detail page with triage, note and e-mail reply"
```

---

### Task 6: Sidebar — "Suporte" item and role-gated badge

**Files:**
- Modify: `frontend/src/components/layout/AdminSidebar.tsx`
- Test: `frontend/src/components/layout/AdminSidebar.test.tsx`

**Interfaces:**
- Consumes: `useOpenSupportTicketsCount(enabled)` (Task 2); `useAdminAuth()` → `user.role`.
- Behaviour: the "Suporte" item (`/support`) is rendered only when `user.role` is `SUPER_ADMIN` or `SUPPORT` (the only roles the backend allows). Its badge shows the open-ticket total when `> 0`, styled like the overdue-invoice badge. The existing `/metrics/summary` query and "Faturas" badge are untouched.

- [ ] **Step 1: Write the failing test**

`frontend/src/components/layout/AdminSidebar.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }))
vi.mock('@/contexts/AdminAuthContext', () => ({ useAdminAuth: vi.fn() }))

import { api } from '@/lib/api'
import { useAdminAuth } from '@/contexts/AdminAuthContext'
import { AdminSidebar } from './AdminSidebar'

const get = (api as unknown as { get: ReturnType<typeof vi.fn> }).get
const auth = useAdminAuth as unknown as ReturnType<typeof vi.fn>

const asRole = (role: 'SUPER_ADMIN' | 'FINANCE' | 'SUPPORT') =>
  auth.mockReturnValue({ user: { id: 'u1', name: 'Ana Silva', email: 'a@x.com', role, createdAt: '' } })

function renderSidebar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AdminSidebar />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  get.mockImplementation((url: string) => {
    if (url === '/support-tickets') return Promise.resolve({ data: { data: [], total: 7, page: 1, limit: 1 } })
    if (url === '/metrics/summary') return Promise.reject({ response: { status: 403 } })
    return Promise.reject(new Error(`unexpected ${url}`))
  })
})

describe('AdminSidebar — Suporte item', () => {
  it('SUPPORT sees the item and a badge from GET /support-tickets total, even though /metrics/summary is 403', async () => {
    asRole('SUPPORT')
    renderSidebar()

    expect(await screen.findByRole('link', { name: /Suporte/ })).toHaveAttribute('href', '/support')
    expect(await screen.findByText('7')).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('/support-tickets', { params: { status: 'OPEN', limit: 1 } })
  })

  it('SUPER_ADMIN sees the item and badge', async () => {
    asRole('SUPER_ADMIN')
    renderSidebar()
    expect(await screen.findByRole('link', { name: /Suporte/ })).toBeInTheDocument()
    expect(await screen.findByText('7')).toBeInTheDocument()
  })

  it('FINANCE does not see the item and never calls /support-tickets', async () => {
    asRole('FINANCE')
    renderSidebar()

    expect(screen.queryByRole('link', { name: /Suporte/ })).not.toBeInTheDocument()
    expect(get).not.toHaveBeenCalledWith('/support-tickets', expect.anything())
  })

  it('hides the badge when there are no open tickets', async () => {
    get.mockImplementation((url: string) =>
      url === '/support-tickets'
        ? Promise.resolve({ data: { data: [], total: 0, page: 1, limit: 1 } })
        : Promise.reject({ response: { status: 403 } }),
    )
    asRole('SUPPORT')
    renderSidebar()

    const link = await screen.findByRole('link', { name: /Suporte/ })
    expect(link).not.toHaveTextContent(/\d/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && bun run test -- src/components/layout/AdminSidebar.test.tsx`
Expected: FAIL — no link named "Suporte".

- [ ] **Step 3: Implement**

In `frontend/src/components/layout/AdminSidebar.tsx`:

1. Add the import next to the other `@/lib` imports:

```tsx
import { useOpenSupportTicketsCount } from '@/lib/support'
```

2. Add an icon after `FileIcon`:

```tsx
const LifebuoyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
    <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/>
    <path d="m5.6 5.6 3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9"/>
  </svg>
)
```

3. Replace the `navItems` array with a typed one that supports a badge kind and a role gate:

```tsx
type NavItem = {
  to: string
  icon: () => JSX.Element
  label: string
  badge?: 'overdue' | 'support'
  roles?: AdminRole[]
}

const navItems: NavItem[] = [
  { to: '/dashboard',     icon: DashboardIcon, label: 'Visão geral' },
  { to: '/organizations', icon: BuildingIcon,  label: 'Organizações' },
  { to: '/plans',         icon: CardIcon,      label: 'Planos' },
  { to: '/subscriptions', icon: RefreshIcon,   label: 'Assinaturas' },
  { to: '/invoices',      icon: FileIcon,      label: 'Faturas', badge: 'overdue' },
  { to: '/support',       icon: LifebuoyIcon,  label: 'Suporte', badge: 'support', roles: SUPPORT_ROLES },
]
```

with, above it: `const SUPPORT_ROLES: AdminRole[] = ['SUPER_ADMIN', 'SUPPORT']`, and extend the type import to `import type { AdminRole, MetricsSummary } from '@/types/admin'`.

4. In `AdminSidebar()`, after `const overdueCount = …`:

```tsx
  const canSeeSupport = !!user && SUPPORT_ROLES.includes(user.role)
  const { data: openTickets = 0 } = useOpenSupportTicketsCount(canSeeSupport)
  const badgeCount = { overdue: overdueCount, support: openTickets }
  const visibleNavItems = navItems.filter((item) => !item.roles || (!!user && item.roles.includes(user.role)))
```

5. In the JSX, change `navItems.map(({ to, icon: Icon, label, badge }) => (` to `visibleNavItems.map(({ to, icon: Icon, label, badge }) => (`, and replace the badge block `{badge && overdueCount > 0 && ( … {overdueCount} … )}` with:

```tsx
              {badge && badgeCount[badge] > 0 && (
                <span
                  className="num"
                  style={{
                    fontSize: 10.5, padding: '1px 6px', borderRadius: 999,
                    background: 'hsl(0 72% 51% / 0.22)',
                    color: 'hsl(0 65% 78%)',
                    fontWeight: 600,
                  }}
                >
                  {badgeCount[badge]}
                </span>
              )}
```

(Same visual as the overdue-invoice badge, per the spec.)

- [ ] **Step 4: Run tests and type-check**

Run: `cd frontend && bun run test -- src/components/layout/AdminSidebar.test.tsx && bunx tsc -b`
Expected: PASS (4 tests); no type errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/AdminSidebar.tsx frontend/src/components/layout/AdminSidebar.test.tsx
git commit -m "feat(support): add Suporte sidebar item with open-tickets badge"
```

---

### Task 7: Final verification and PR

**Files:** none (verification only).

- [ ] **Step 1: Full frontend suite** — `cd frontend && bun run test` → all suites pass (existing `api.test.ts` / `utils.test.ts` included).
- [ ] **Step 2: Frontend build** — `cd frontend && bun run build` → `tsc -b` and `vite build` succeed.
- [ ] **Step 3: Frontend lint** — `cd frontend && bun run lint` → no new errors or warnings.
- [ ] **Step 4: Backend** — `cd backend && bunx tsc --noEmit && bun run test` → passes (100 tests).
- [ ] **Step 5: Manual smoke (optional, recommended)** — `bun run start:dev` in `backend/` and `bun run dev` in `frontend/`. Log in as `SUPER_ADMIN` and confirm: Suporte appears under Operação; `/support` lists tickets; filter chips work and pagination pages; `/support/:id` shows all sections; status change updates the pill and the sidebar badge; note saves; reply is disabled for a ticket without e-mail. Log in as `SUPPORT` and confirm the badge shows (no reliance on `/metrics/summary`). Log in as `FINANCE` and confirm no Suporte item. Seed a ticket with `curl -X POST localhost:3001/api/admin/v1/clinic-ext/support-tickets -H 'x-clinic-api-key: $CLINIC_EXTERNAL_API_KEY' …` using the body shape in the spec.
- [ ] **Step 6: Push and open the PR** (per CLAUDE.md)

```bash
git push -u origin bravilal/sou-64-suporte-tela-de-backoffice-lista-detalhe-e-badge
gh pr create --base main --title "Suporte: tela de backoffice (lista, detalhe e badge)" --body "Refs SOU-64"
```

In the PR body also note: (1) backend now includes `organization { id, name }` in ticket list/detail; (2) hooks live in `lib/support.ts`, not `lib/api.ts`; (3) `TableFooter`/`FilterChip` gained backward-compatible props; (4) pre-existing: `/dashboard` calls `/metrics/summary`, which 403s for `SUPPORT` — separate issue.
