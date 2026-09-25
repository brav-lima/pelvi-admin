# Support Tickets Backend (SOU-63) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pelvi-admin backend for the support-tickets MVP: a `SupportTicket` model, an external endpoint the pelvi-ui backend calls to create tickets, and internal admin endpoints to list/view/triage/reply to them.

**Architecture:** A new `backend/src/support/` NestJS module following the existing layered pattern (`dto/domain/application/infra`), same shape as `organizations/`. Two controllers share the module: one guarded by the existing `ClinicExternalApiKeyGuard` (mounted alongside `clinic-ext`'s route family) for ticket creation, one guarded by `JwtAuthGuard`+`RolesGuard` for backoffice operations. `MetricsService.getSummary()` gets one more count for the sidebar badge (frontend work is a separate issue, SOU-64).

**Tech Stack:** NestJS 11, Prisma 6, PostgreSQL, class-validator, Jest, Bun.

**Spec:** `docs/superpowers/specs/2026-09-25-support-tickets-admin-design.md`

## Global Constraints

- Package manager is **Bun** — every command below uses `bun run <script>` or `bunx`, never `npm`/`npx` unless the codebase already does (it doesn't).
- `tsc --noEmit` must pass before this is considered ready (project workflow requirement).
- Follow the existing layered module pattern (`dto/domain/application/infra`) — do not put business logic in controllers.
- Do not modify `clinic-ext/clinic-ext.controller.ts` or `clinic-ext/clinic-ext.service.ts` — the external support-ticket endpoint lives in its own controller inside the new `support/` module, guarded by the same `ClinicExternalApiKeyGuard`.
- Real route paths carry the global `api/admin` prefix set in `main.ts` (`app.setGlobalPrefix('api/admin')`). The external endpoint's real path is `POST /api/admin/v1/clinic-ext/support-tickets`; internal endpoints resolve under `/api/admin/support-tickets/*`.
- This codebase does not unit-test Prisma repository implementations or controllers directly (no existing `*.repository.spec.ts` or `*.controller.spec.ts` files) — only `application/*.usecase.ts` use cases and DTO-adjacent pure functions (like `renderWelcomeEmail`) get unit tests. Follow that convention; don't invent new test files for the repository or controllers.
- All admin-facing strings (validation messages, error messages) are in Portuguese, matching the rest of the codebase.
- Branch `bravilal/sou-63-suporte-modelo-de-dados-e-modulo-backend-support-tickets` already exists and is checked out. Linear issue: SOU-63.

---

### Task 1: Prisma schema — `SupportTicket` model, enums, back-relations, migration

**Files:**
- Modify: `backend/prisma/schema.prisma`

**Interfaces:**
- Produces: Prisma Client types `SupportTicket`, `SupportTicketCategory` (`'BUG'|'SUGGESTION'|'QUESTION'`), `SupportTicketStatus` (`'OPEN'|'IN_PROGRESS'|'RESOLVED'`), used by every later task via `this.prisma.supportTicket.*`.

- [ ] **Step 1: Add the enums and model to `schema.prisma`**

Append at the end of `backend/prisma/schema.prisma` (after the `Invoice` model, i.e. after line 226):

```prisma

// ──────────────────────────────────────────────
// SupportTicket — chamados de suporte reportados pela clínica (MVP)
// ──────────────────────────────────────────────

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

  category       SupportTicketCategory
  status         SupportTicketStatus   @default(OPEN)

  reporterName   String                @map("reporter_name")
  reporterEmail  String?               @map("reporter_email")
  reporterRole   String?               @map("reporter_role")

  description    String
  context        Json
  sentryEventId  String?               @map("sentry_event_id")

  internalNote   String?               @map("internal_note")

  emailReplyBody        String?    @map("email_reply_body")
  emailRepliedAt        DateTime?  @map("email_replied_at")
  emailRepliedByAdminId String?    @map("email_replied_by_admin_id")

  createdAt      DateTime              @default(now()) @map("created_at")
  updatedAt      DateTime              @updatedAt @map("updated_at")

  organization       Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  emailRepliedByAdmin AdminUser?  @relation(fields: [emailRepliedByAdminId], references: [id])

  @@index([organizationId])
  @@index([status])
  @@map("support_tickets")
}
```

- [ ] **Step 2: Add back-relations to `Organization` and `AdminUser`**

In `backend/prisma/schema.prisma`, modify the `Organization` model (around line 82-83):

```prisma
  subscriptions Subscription[]
  events        OrgEvent[]
```

replace with:

```prisma
  subscriptions Subscription[]
  events        OrgEvent[]
  supportTickets SupportTicket[]
```

And modify the `AdminUser` model (around line 29):

```prisma
  refreshTokens AdminRefreshToken[]
```

replace with:

```prisma
  refreshTokens AdminRefreshToken[]
  emailRepliedTickets SupportTicket[]
```

- [ ] **Step 3: Generate the Prisma client and create the migration**

Run:
```bash
cd backend && bun run prisma:generate && bun run prisma:migrate:dev --name add_support_tickets
```
Expected: migration created under `backend/prisma/migrations/`, command exits 0, no errors. If there's no reachable dev database configured in this environment, at minimum run `bunx prisma validate` and `bunx prisma format` from `backend/` to confirm the schema is syntactically valid, and note in the task's commit message that `migrate:dev` still needs to run against a real database before merge.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(db): add SupportTicket model for MVP support tickets"
```

---

### Task 2: Domain layer — entity and repository interface

**Files:**
- Create: `backend/src/support/domain/support-ticket.entity.ts`
- Create: `backend/src/support/domain/support-ticket.repository.ts`

**Interfaces:**
- Consumes: nothing (pure types).
- Produces: `SupportTicket`, `SupportTicketCategory`, `SupportTicketStatus`, `SupportTicketContext` entity types; `ISupportTicketRepository`, `SUPPORT_TICKET_REPOSITORY`, `CreateSupportTicketData`, `ListSupportTicketsFilter` — used by every use case (Tasks 5-10) and the infra repository (Task 3).

- [ ] **Step 1: Create the entity file**

`backend/src/support/domain/support-ticket.entity.ts`:

```ts
export type SupportTicketCategory = 'BUG' | 'SUGGESTION' | 'QUESTION'
export type SupportTicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'

export interface SupportTicketContext {
  route: string
  url: string
  userAgent: string
  appVersion: string
  sessionId: string
  occurredAt: string
}

export interface SupportTicket {
  id: string
  organizationId: string
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
  emailRepliedAt: Date | null
  emailRepliedByAdminId: string | null
  createdAt: Date
  updatedAt: Date
}
```

- [ ] **Step 2: Create the repository interface**

`backend/src/support/domain/support-ticket.repository.ts`:

```ts
import {
  SupportTicket,
  SupportTicketCategory,
  SupportTicketContext,
  SupportTicketStatus,
} from './support-ticket.entity'

export interface CreateSupportTicketData {
  organizationId: string
  category: SupportTicketCategory
  reporterName: string
  reporterEmail: string | null
  reporterRole: string | null
  description: string
  context: SupportTicketContext
  sentryEventId: string | null
}

export interface ListSupportTicketsFilter {
  status?: SupportTicketStatus
  category?: SupportTicketCategory
  page?: number
  limit?: number
}

export interface ISupportTicketRepository {
  create(data: CreateSupportTicketData): Promise<SupportTicket>
  findById(id: string): Promise<SupportTicket | null>
  findAll(filter: ListSupportTicketsFilter): Promise<{ data: SupportTicket[]; total: number }>
  updateStatus(id: string, status: SupportTicketStatus): Promise<SupportTicket>
  updateInternalNote(id: string, note: string): Promise<SupportTicket>
  saveReply(id: string, body: string, adminId: string): Promise<SupportTicket>
}

export const SUPPORT_TICKET_REPOSITORY = Symbol('ISupportTicketRepository')
```

- [ ] **Step 3: Verify it compiles**

Run: `cd backend && bunx tsc --noEmit`
Expected: no errors related to the new files (there will be no consumers yet, so this just confirms the files themselves are syntactically and structurally valid TypeScript).

- [ ] **Step 4: Commit**

```bash
git add backend/src/support/domain
git commit -m "feat(support): add SupportTicket domain entity and repository interface"
```

---

### Task 3: Infra layer — Prisma repository implementation

**Files:**
- Create: `backend/src/support/infra/prisma-support-ticket.repository.ts`

**Interfaces:**
- Consumes: `ISupportTicketRepository`, `CreateSupportTicketData`, `ListSupportTicketsFilter` from Task 2; `PrismaService` from `backend/src/prisma/prisma.service.ts` (already exists, `@Global()`).
- Produces: `PrismaSupportTicketRepository` class, consumed by the module wiring in Task 11.

- [ ] **Step 1: Create the repository implementation**

`backend/src/support/infra/prisma-support-ticket.repository.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { Prisma, SupportTicket as PrismaSupportTicketRow } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import {
  CreateSupportTicketData,
  ISupportTicketRepository,
  ListSupportTicketsFilter,
} from '../domain/support-ticket.repository'
import { SupportTicket, SupportTicketContext, SupportTicketStatus } from '../domain/support-ticket.entity'

@Injectable()
export class PrismaSupportTicketRepository implements ISupportTicketRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toDomain(row: PrismaSupportTicketRow): SupportTicket {
    return { ...row, context: row.context as unknown as SupportTicketContext }
  }

  async create(data: CreateSupportTicketData): Promise<SupportTicket> {
    const row = await this.prisma.supportTicket.create({
      data: {
        organizationId: data.organizationId,
        category: data.category,
        reporterName: data.reporterName,
        reporterEmail: data.reporterEmail,
        reporterRole: data.reporterRole,
        description: data.description,
        context: data.context as unknown as Prisma.InputJsonValue,
        sentryEventId: data.sentryEventId,
      },
    })
    return this.toDomain(row)
  }

  async findById(id: string): Promise<SupportTicket | null> {
    const row = await this.prisma.supportTicket.findUnique({ where: { id } })
    return row ? this.toDomain(row) : null
  }

  async findAll(filter: ListSupportTicketsFilter): Promise<{ data: SupportTicket[]; total: number }> {
    const { status, category, page = 1, limit = 50 } = filter
    const take = Math.min(limit, 100)
    const skip = (page - 1) * take

    const where: Prisma.SupportTicketWhereInput = {
      ...(status && { status }),
      ...(category && { category }),
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.supportTicket.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.supportTicket.count({ where }),
    ])

    return { data: rows.map((row) => this.toDomain(row)), total }
  }

  async updateStatus(id: string, status: SupportTicketStatus): Promise<SupportTicket> {
    const row = await this.prisma.supportTicket.update({ where: { id }, data: { status } })
    return this.toDomain(row)
  }

  async updateInternalNote(id: string, note: string): Promise<SupportTicket> {
    const row = await this.prisma.supportTicket.update({ where: { id }, data: { internalNote: note } })
    return this.toDomain(row)
  }

  async saveReply(id: string, body: string, adminId: string): Promise<SupportTicket> {
    const row = await this.prisma.supportTicket.update({
      where: { id },
      data: { emailReplyBody: body, emailRepliedAt: new Date(), emailRepliedByAdminId: adminId },
    })
    return this.toDomain(row)
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd backend && bunx tsc --noEmit`
Expected: no errors. (This requires Task 1's `bun run prisma:generate` to have run, so `@prisma/client` exports `SupportTicket`, `Prisma.SupportTicketWhereInput`, `Prisma.InputJsonValue`.)

- [ ] **Step 3: Commit**

```bash
git add backend/src/support/infra
git commit -m "feat(support): add Prisma repository implementation for SupportTicket"
```

---

### Task 4: DTOs

**Files:**
- Create: `backend/src/support/dto/create-support-ticket.dto.ts`
- Create: `backend/src/support/dto/update-status.dto.ts`
- Create: `backend/src/support/dto/update-internal-note.dto.ts`
- Create: `backend/src/support/dto/reply.dto.ts`

**Interfaces:**
- Consumes: nothing beyond `class-validator`/`class-transformer`/`@nestjs/swagger`.
- Produces: `CreateSupportTicketDto`, `SupportTicketContextDto`, `UpdateStatusDto`, `UpdateInternalNoteDto`, `ReplyDto` — consumed by the controllers in Task 11.

- [ ] **Step 1: Create `create-support-ticket.dto.ts`**

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator'

export class SupportTicketContextDto {
  @ApiProperty()
  @IsString()
  route!: string

  @ApiProperty()
  @IsString()
  url!: string

  @ApiProperty()
  @IsString()
  userAgent!: string

  @ApiProperty()
  @IsString()
  appVersion!: string

  @ApiProperty()
  @IsString()
  sessionId!: string

  @ApiProperty()
  @IsString()
  occurredAt!: string
}

export class CreateSupportTicketDto {
  @ApiProperty()
  @IsUUID()
  clinicId!: string

  @ApiProperty({ enum: ['BUG', 'SUGGESTION', 'QUESTION'] })
  @IsEnum(['BUG', 'SUGGESTION', 'QUESTION'])
  category!: 'BUG' | 'SUGGESTION' | 'QUESTION'

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description!: string

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reporterName!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reporterEmail?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reporterRole?: string | null

  @ApiProperty({ type: () => SupportTicketContextDto })
  @ValidateNested()
  @Type(() => SupportTicketContextDto)
  context!: SupportTicketContextDto

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sentryEventId?: string | null
}
```

- [ ] **Step 2: Create `update-status.dto.ts`**

```ts
import { ApiProperty } from '@nestjs/swagger'
import { IsEnum } from 'class-validator'

export class UpdateStatusDto {
  @ApiProperty({ enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED'] })
  @IsEnum(['OPEN', 'IN_PROGRESS', 'RESOLVED'])
  status!: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'
}
```

- [ ] **Step 3: Create `update-internal-note.dto.ts`**

```ts
import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

export class UpdateInternalNoteDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  note!: string
}
```

- [ ] **Step 4: Create `reply.dto.ts`**

```ts
import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

export class ReplyDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  body!: string
}
```

- [ ] **Step 5: Verify it compiles**

Run: `cd backend && bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/support/dto
git commit -m "feat(support): add DTOs for support ticket endpoints"
```

---

### Task 5: `CreateSupportTicketUseCase`

**Files:**
- Create: `backend/src/support/application/create-support-ticket.usecase.ts`
- Test: `backend/src/support/application/create-support-ticket.usecase.spec.ts`

**Interfaces:**
- Consumes: `ISupportTicketRepository`, `SUPPORT_TICKET_REPOSITORY` (Task 2); `PrismaService`.
- Produces: `CreateSupportTicketUseCase`, `CreateSupportTicketInput` — consumed by the external controller (Task 11).

- [ ] **Step 1: Write the failing test**

`backend/src/support/application/create-support-ticket.usecase.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common'
import { CreateSupportTicketUseCase } from './create-support-ticket.usecase'
import { ISupportTicketRepository } from '../domain/support-ticket.repository'
import { PrismaService } from '../../prisma/prisma.service'
import { SupportTicket } from '../domain/support-ticket.entity'

const baseContext = {
  route: '/patients/:id/evolutions',
  url: 'https://app.soupelvi.com.br/patients/1/evolutions',
  userAgent: 'Mozilla/5.0',
  appVersion: '1.8.2',
  sessionId: 'sess-1',
  occurredAt: '2026-09-25T20:14:32.000Z',
}

const makeTicket = (overrides: Partial<SupportTicket> = {}): SupportTicket => ({
  id: 'ticket-1',
  organizationId: 'org-1',
  category: 'BUG',
  status: 'OPEN',
  reporterName: 'Dr. João',
  reporterEmail: 'joao@test.com',
  reporterRole: 'PROFESSIONAL',
  description: 'Não consegui salvar a evolução',
  context: baseContext,
  sentryEventId: 'abc123',
  internalNote: null,
  emailReplyBody: null,
  emailRepliedAt: null,
  emailRepliedByAdminId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe('CreateSupportTicketUseCase', () => {
  it('resolves the organization by clinicId and creates the ticket', async () => {
    const repo = { create: jest.fn().mockResolvedValue(makeTicket()) } as unknown as jest.Mocked<ISupportTicketRepository>
    const prisma = {
      organization: { findFirst: jest.fn().mockResolvedValue({ id: 'org-1' }) },
    } as unknown as PrismaService
    const sut = new CreateSupportTicketUseCase(repo, prisma)

    const result = await sut.execute({
      clinicId: 'clinic-1',
      category: 'BUG',
      description: 'Não consegui salvar a evolução',
      reporterName: 'Dr. João',
      reporterEmail: 'joao@test.com',
      reporterRole: 'PROFESSIONAL',
      context: baseContext,
      sentryEventId: 'abc123',
    })

    expect(prisma.organization.findFirst).toHaveBeenCalledWith({
      where: { clinicExternalId: 'clinic-1' },
      select: { id: true },
    })
    expect(repo.create).toHaveBeenCalledWith({
      organizationId: 'org-1',
      category: 'BUG',
      reporterName: 'Dr. João',
      reporterEmail: 'joao@test.com',
      reporterRole: 'PROFESSIONAL',
      description: 'Não consegui salvar a evolução',
      context: baseContext,
      sentryEventId: 'abc123',
    })
    expect(result).toEqual(makeTicket())
  })

  it('defaults optional reporter/sentry fields to null when omitted', async () => {
    const repo = { create: jest.fn().mockResolvedValue(makeTicket()) } as unknown as jest.Mocked<ISupportTicketRepository>
    const prisma = {
      organization: { findFirst: jest.fn().mockResolvedValue({ id: 'org-1' }) },
    } as unknown as PrismaService
    const sut = new CreateSupportTicketUseCase(repo, prisma)

    await sut.execute({
      clinicId: 'clinic-1',
      category: 'QUESTION',
      description: 'Como cadastro um paciente?',
      reporterName: 'Dra. Ana',
      context: baseContext,
    })

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ reporterEmail: null, reporterRole: null, sentryEventId: null }),
    )
  })

  it('throws NotFoundException when clinicId does not match an organization', async () => {
    const repo = { create: jest.fn() } as unknown as jest.Mocked<ISupportTicketRepository>
    const prisma = {
      organization: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService
    const sut = new CreateSupportTicketUseCase(repo, prisma)

    await expect(
      sut.execute({
        clinicId: 'unknown-clinic',
        category: 'QUESTION',
        description: 'Dúvida',
        reporterName: 'Dra. Ana',
        context: baseContext,
      }),
    ).rejects.toThrow(NotFoundException)
    expect(repo.create).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && bun run test -- create-support-ticket.usecase.spec.ts`
Expected: FAIL — `Cannot find module './create-support-ticket.usecase'`.

- [ ] **Step 3: Write the implementation**

`backend/src/support/application/create-support-ticket.usecase.ts`:

```ts
import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { ISupportTicketRepository, SUPPORT_TICKET_REPOSITORY } from '../domain/support-ticket.repository'
import { SupportTicket, SupportTicketCategory, SupportTicketContext } from '../domain/support-ticket.entity'

export interface CreateSupportTicketInput {
  clinicId: string
  category: SupportTicketCategory
  description: string
  reporterName: string
  reporterEmail?: string | null
  reporterRole?: string | null
  context: SupportTicketContext
  sentryEventId?: string | null
}

@Injectable()
export class CreateSupportTicketUseCase {
  constructor(
    @Inject(SUPPORT_TICKET_REPOSITORY)
    private readonly repo: ISupportTicketRepository,
    private readonly prisma: PrismaService,
  ) {}

  async execute(input: CreateSupportTicketInput): Promise<SupportTicket> {
    const org = await this.prisma.organization.findFirst({
      where: { clinicExternalId: input.clinicId },
      select: { id: true },
    })
    if (!org) throw new NotFoundException('Organização não encontrada')

    return this.repo.create({
      organizationId: org.id,
      category: input.category,
      reporterName: input.reporterName,
      reporterEmail: input.reporterEmail ?? null,
      reporterRole: input.reporterRole ?? null,
      description: input.description,
      context: input.context,
      sentryEventId: input.sentryEventId ?? null,
    })
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && bun run test -- create-support-ticket.usecase.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/support/application/create-support-ticket.usecase.ts backend/src/support/application/create-support-ticket.usecase.spec.ts
git commit -m "feat(support): add CreateSupportTicketUseCase"
```

---

### Task 6: `ListSupportTicketsUseCase`

**Files:**
- Create: `backend/src/support/application/list-support-tickets.usecase.ts`
- Test: `backend/src/support/application/list-support-tickets.usecase.spec.ts`

**Interfaces:**
- Consumes: `ISupportTicketRepository`, `SUPPORT_TICKET_REPOSITORY`, `ListSupportTicketsFilter` (Task 2).
- Produces: `ListSupportTicketsUseCase` — consumed by the admin controller (Task 11).

- [ ] **Step 1: Write the failing test**

`backend/src/support/application/list-support-tickets.usecase.spec.ts`:

```ts
import { ListSupportTicketsUseCase } from './list-support-tickets.usecase'
import { ISupportTicketRepository } from '../domain/support-ticket.repository'

describe('ListSupportTicketsUseCase', () => {
  it('delegates to the repository with the given filter and returns its result', async () => {
    const paginated = { data: [], total: 0 }
    const repo = { findAll: jest.fn().mockResolvedValue(paginated) } as unknown as jest.Mocked<ISupportTicketRepository>
    const sut = new ListSupportTicketsUseCase(repo)

    const result = await sut.execute({ status: 'OPEN', page: 2, limit: 10 })

    expect(repo.findAll).toHaveBeenCalledWith({ status: 'OPEN', page: 2, limit: 10 })
    expect(result).toBe(paginated)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && bun run test -- list-support-tickets.usecase.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`backend/src/support/application/list-support-tickets.usecase.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import {
  ISupportTicketRepository,
  ListSupportTicketsFilter,
  SUPPORT_TICKET_REPOSITORY,
} from '../domain/support-ticket.repository'

@Injectable()
export class ListSupportTicketsUseCase {
  constructor(
    @Inject(SUPPORT_TICKET_REPOSITORY)
    private readonly repo: ISupportTicketRepository,
  ) {}

  execute(filter: ListSupportTicketsFilter) {
    return this.repo.findAll(filter)
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && bun run test -- list-support-tickets.usecase.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/support/application/list-support-tickets.usecase.ts backend/src/support/application/list-support-tickets.usecase.spec.ts
git commit -m "feat(support): add ListSupportTicketsUseCase"
```

---

### Task 7: `GetSupportTicketUseCase`

**Files:**
- Create: `backend/src/support/application/get-support-ticket.usecase.ts`
- Test: `backend/src/support/application/get-support-ticket.usecase.spec.ts`

**Interfaces:**
- Consumes: `ISupportTicketRepository`, `SUPPORT_TICKET_REPOSITORY` (Task 2).
- Produces: `GetSupportTicketUseCase` — consumed by the admin controller (Task 11).

- [ ] **Step 1: Write the failing test**

`backend/src/support/application/get-support-ticket.usecase.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common'
import { GetSupportTicketUseCase } from './get-support-ticket.usecase'
import { ISupportTicketRepository } from '../domain/support-ticket.repository'
import { SupportTicket } from '../domain/support-ticket.entity'

const makeTicket = (): SupportTicket => ({
  id: 'ticket-1',
  organizationId: 'org-1',
  category: 'BUG',
  status: 'OPEN',
  reporterName: 'Dr. João',
  reporterEmail: 'joao@test.com',
  reporterRole: 'PROFESSIONAL',
  description: 'desc',
  context: {
    route: '/', url: '', userAgent: '', appVersion: '1.0.0', sessionId: 's', occurredAt: '2026-09-25T00:00:00.000Z',
  },
  sentryEventId: null,
  internalNote: null,
  emailReplyBody: null,
  emailRepliedAt: null,
  emailRepliedByAdminId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
})

describe('GetSupportTicketUseCase', () => {
  it('returns the ticket when found', async () => {
    const ticket = makeTicket()
    const repo = { findById: jest.fn().mockResolvedValue(ticket) } as unknown as jest.Mocked<ISupportTicketRepository>
    const sut = new GetSupportTicketUseCase(repo)

    const result = await sut.execute('ticket-1')

    expect(repo.findById).toHaveBeenCalledWith('ticket-1')
    expect(result).toBe(ticket)
  })

  it('throws NotFoundException when the ticket does not exist', async () => {
    const repo = { findById: jest.fn().mockResolvedValue(null) } as unknown as jest.Mocked<ISupportTicketRepository>
    const sut = new GetSupportTicketUseCase(repo)

    await expect(sut.execute('missing')).rejects.toThrow(NotFoundException)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && bun run test -- get-support-ticket.usecase.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`backend/src/support/application/get-support-ticket.usecase.ts`:

```ts
import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { ISupportTicketRepository, SUPPORT_TICKET_REPOSITORY } from '../domain/support-ticket.repository'
import { SupportTicket } from '../domain/support-ticket.entity'

@Injectable()
export class GetSupportTicketUseCase {
  constructor(
    @Inject(SUPPORT_TICKET_REPOSITORY)
    private readonly repo: ISupportTicketRepository,
  ) {}

  async execute(id: string): Promise<SupportTicket> {
    const ticket = await this.repo.findById(id)
    if (!ticket) throw new NotFoundException('Chamado não encontrado')
    return ticket
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && bun run test -- get-support-ticket.usecase.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/support/application/get-support-ticket.usecase.ts backend/src/support/application/get-support-ticket.usecase.spec.ts
git commit -m "feat(support): add GetSupportTicketUseCase"
```

---

### Task 8: `UpdateSupportTicketStatusUseCase`

**Files:**
- Create: `backend/src/support/application/update-support-ticket-status.usecase.ts`
- Test: `backend/src/support/application/update-support-ticket-status.usecase.spec.ts`

**Interfaces:**
- Consumes: `ISupportTicketRepository`, `SUPPORT_TICKET_REPOSITORY` (Task 2).
- Produces: `UpdateSupportTicketStatusUseCase` — consumed by the admin controller (Task 11).

- [ ] **Step 1: Write the failing test**

`backend/src/support/application/update-support-ticket-status.usecase.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common'
import { UpdateSupportTicketStatusUseCase } from './update-support-ticket-status.usecase'
import { ISupportTicketRepository } from '../domain/support-ticket.repository'
import { SupportTicket } from '../domain/support-ticket.entity'

const makeTicket = (overrides: Partial<SupportTicket> = {}): SupportTicket => ({
  id: 'ticket-1',
  organizationId: 'org-1',
  category: 'BUG',
  status: 'OPEN',
  reporterName: 'Dr. João',
  reporterEmail: 'joao@test.com',
  reporterRole: 'PROFESSIONAL',
  description: 'desc',
  context: { route: '/', url: '', userAgent: '', appVersion: '1.0.0', sessionId: 's', occurredAt: '2026-09-25T00:00:00.000Z' },
  sentryEventId: null,
  internalNote: null,
  emailReplyBody: null,
  emailRepliedAt: null,
  emailRepliedByAdminId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe('UpdateSupportTicketStatusUseCase', () => {
  it('updates the status when the ticket exists', async () => {
    const found = makeTicket()
    const updated = makeTicket({ status: 'IN_PROGRESS' })
    const repo = {
      findById: jest.fn().mockResolvedValue(found),
      updateStatus: jest.fn().mockResolvedValue(updated),
    } as unknown as jest.Mocked<ISupportTicketRepository>
    const sut = new UpdateSupportTicketStatusUseCase(repo)

    const result = await sut.execute('ticket-1', 'IN_PROGRESS')

    expect(repo.updateStatus).toHaveBeenCalledWith('ticket-1', 'IN_PROGRESS')
    expect(result).toBe(updated)
  })

  it('throws NotFoundException when the ticket does not exist', async () => {
    const repo = {
      findById: jest.fn().mockResolvedValue(null),
      updateStatus: jest.fn(),
    } as unknown as jest.Mocked<ISupportTicketRepository>
    const sut = new UpdateSupportTicketStatusUseCase(repo)

    await expect(sut.execute('missing', 'RESOLVED')).rejects.toThrow(NotFoundException)
    expect(repo.updateStatus).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && bun run test -- update-support-ticket-status.usecase.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`backend/src/support/application/update-support-ticket-status.usecase.ts`:

```ts
import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { ISupportTicketRepository, SUPPORT_TICKET_REPOSITORY } from '../domain/support-ticket.repository'
import { SupportTicket, SupportTicketStatus } from '../domain/support-ticket.entity'

@Injectable()
export class UpdateSupportTicketStatusUseCase {
  constructor(
    @Inject(SUPPORT_TICKET_REPOSITORY)
    private readonly repo: ISupportTicketRepository,
  ) {}

  async execute(id: string, status: SupportTicketStatus): Promise<SupportTicket> {
    const ticket = await this.repo.findById(id)
    if (!ticket) throw new NotFoundException('Chamado não encontrado')
    return this.repo.updateStatus(id, status)
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && bun run test -- update-support-ticket-status.usecase.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/support/application/update-support-ticket-status.usecase.ts backend/src/support/application/update-support-ticket-status.usecase.spec.ts
git commit -m "feat(support): add UpdateSupportTicketStatusUseCase"
```

---

### Task 9: `UpdateSupportTicketNoteUseCase`

**Files:**
- Create: `backend/src/support/application/update-support-ticket-note.usecase.ts`
- Test: `backend/src/support/application/update-support-ticket-note.usecase.spec.ts`

**Interfaces:**
- Consumes: `ISupportTicketRepository`, `SUPPORT_TICKET_REPOSITORY` (Task 2).
- Produces: `UpdateSupportTicketNoteUseCase` — consumed by the admin controller (Task 11).

- [ ] **Step 1: Write the failing test**

`backend/src/support/application/update-support-ticket-note.usecase.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common'
import { UpdateSupportTicketNoteUseCase } from './update-support-ticket-note.usecase'
import { ISupportTicketRepository } from '../domain/support-ticket.repository'
import { SupportTicket } from '../domain/support-ticket.entity'

const makeTicket = (overrides: Partial<SupportTicket> = {}): SupportTicket => ({
  id: 'ticket-1',
  organizationId: 'org-1',
  category: 'BUG',
  status: 'OPEN',
  reporterName: 'Dr. João',
  reporterEmail: 'joao@test.com',
  reporterRole: 'PROFESSIONAL',
  description: 'desc',
  context: { route: '/', url: '', userAgent: '', appVersion: '1.0.0', sessionId: 's', occurredAt: '2026-09-25T00:00:00.000Z' },
  sentryEventId: null,
  internalNote: null,
  emailReplyBody: null,
  emailRepliedAt: null,
  emailRepliedByAdminId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe('UpdateSupportTicketNoteUseCase', () => {
  it('updates the internal note when the ticket exists', async () => {
    const found = makeTicket()
    const updated = makeTicket({ internalNote: 'Investigando com o time de dados' })
    const repo = {
      findById: jest.fn().mockResolvedValue(found),
      updateInternalNote: jest.fn().mockResolvedValue(updated),
    } as unknown as jest.Mocked<ISupportTicketRepository>
    const sut = new UpdateSupportTicketNoteUseCase(repo)

    const result = await sut.execute('ticket-1', 'Investigando com o time de dados')

    expect(repo.updateInternalNote).toHaveBeenCalledWith('ticket-1', 'Investigando com o time de dados')
    expect(result).toBe(updated)
  })

  it('throws NotFoundException when the ticket does not exist', async () => {
    const repo = {
      findById: jest.fn().mockResolvedValue(null),
      updateInternalNote: jest.fn(),
    } as unknown as jest.Mocked<ISupportTicketRepository>
    const sut = new UpdateSupportTicketNoteUseCase(repo)

    await expect(sut.execute('missing', 'nota')).rejects.toThrow(NotFoundException)
    expect(repo.updateInternalNote).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && bun run test -- update-support-ticket-note.usecase.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`backend/src/support/application/update-support-ticket-note.usecase.ts`:

```ts
import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { ISupportTicketRepository, SUPPORT_TICKET_REPOSITORY } from '../domain/support-ticket.repository'
import { SupportTicket } from '../domain/support-ticket.entity'

@Injectable()
export class UpdateSupportTicketNoteUseCase {
  constructor(
    @Inject(SUPPORT_TICKET_REPOSITORY)
    private readonly repo: ISupportTicketRepository,
  ) {}

  async execute(id: string, note: string): Promise<SupportTicket> {
    const ticket = await this.repo.findById(id)
    if (!ticket) throw new NotFoundException('Chamado não encontrado')
    return this.repo.updateInternalNote(id, note)
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && bun run test -- update-support-ticket-note.usecase.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/support/application/update-support-ticket-note.usecase.ts backend/src/support/application/update-support-ticket-note.usecase.spec.ts
git commit -m "feat(support): add UpdateSupportTicketNoteUseCase"
```

---

### Task 10: `ReplySupportTicketUseCase` + email template

**Files:**
- Create: `backend/src/support/application/reply-support-ticket.usecase.ts`
- Test: `backend/src/support/application/reply-support-ticket.usecase.spec.ts`

**Interfaces:**
- Consumes: `ISupportTicketRepository`, `SUPPORT_TICKET_REPOSITORY` (Task 2); `MailService` from `backend/src/mail/mail.service.ts` (existing, `@Global()` via `MailModule`; `send(input: { to, subject, html, text }): Promise<void>`, throws on failure).
- Produces: `ReplySupportTicketUseCase`, `renderSupportReplyEmail` — consumed by the admin controller (Task 11).

- [ ] **Step 1: Write the failing test**

`backend/src/support/application/reply-support-ticket.usecase.spec.ts`:

```ts
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { ReplySupportTicketUseCase, renderSupportReplyEmail } from './reply-support-ticket.usecase'
import { ISupportTicketRepository } from '../domain/support-ticket.repository'
import { MailService } from '../../mail/mail.service'
import { SupportTicket } from '../domain/support-ticket.entity'

const makeTicket = (overrides: Partial<SupportTicket> = {}): SupportTicket => ({
  id: 'ticket-1',
  organizationId: 'org-1',
  category: 'BUG',
  status: 'OPEN',
  reporterName: 'Dr. João',
  reporterEmail: 'joao@test.com',
  reporterRole: 'PROFESSIONAL',
  description: 'desc',
  context: { route: '/', url: '', userAgent: '', appVersion: '1.0.0', sessionId: 's', occurredAt: '2026-09-25T00:00:00.000Z' },
  sentryEventId: null,
  internalNote: null,
  emailReplyBody: null,
  emailRepliedAt: null,
  emailRepliedByAdminId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe('renderSupportReplyEmail', () => {
  it('includes the reporter name and body in html and text', () => {
    const result = renderSupportReplyEmail({ reporterName: 'Dr. João', body: 'Já corrigimos o problema.' })

    expect(result.subject).toBe('Resposta ao seu chamado de suporte — SouPelvi')
    expect(result.html).toContain('Dr. João')
    expect(result.html).toContain('Já corrigimos o problema.')
    expect(result.text).toContain('Dr. João')
    expect(result.text).toContain('Já corrigimos o problema.')
  })

  it('escapes HTML special characters in the reply body', () => {
    const result = renderSupportReplyEmail({ reporterName: 'Ana', body: '<script>alert(1)</script>' })

    expect(result.html).not.toContain('<script>')
    expect(result.html).toContain('&lt;script&gt;')
  })
})

describe('ReplySupportTicketUseCase', () => {
  it('throws NotFoundException when the ticket does not exist', async () => {
    const repo = { findById: jest.fn().mockResolvedValue(null) } as unknown as jest.Mocked<ISupportTicketRepository>
    const mail = { send: jest.fn() } as unknown as jest.Mocked<MailService>
    const sut = new ReplySupportTicketUseCase(repo, mail)

    await expect(sut.execute('missing', 'corpo', 'admin-1')).rejects.toThrow(NotFoundException)
    expect(mail.send).not.toHaveBeenCalled()
  })

  it('throws BadRequestException when the ticket has no reporterEmail', async () => {
    const repo = { findById: jest.fn().mockResolvedValue(makeTicket({ reporterEmail: null })) } as unknown as jest.Mocked<ISupportTicketRepository>
    const mail = { send: jest.fn() } as unknown as jest.Mocked<MailService>
    const sut = new ReplySupportTicketUseCase(repo, mail)

    await expect(sut.execute('ticket-1', 'corpo', 'admin-1')).rejects.toThrow(BadRequestException)
    expect(mail.send).not.toHaveBeenCalled()
  })

  it('sends the email and persists the reply when reporterEmail is present', async () => {
    const ticket = makeTicket()
    const saved = makeTicket({ emailReplyBody: 'Já corrigimos', emailRepliedByAdminId: 'admin-1' })
    const repo = {
      findById: jest.fn().mockResolvedValue(ticket),
      saveReply: jest.fn().mockResolvedValue(saved),
    } as unknown as jest.Mocked<ISupportTicketRepository>
    const mail = { send: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<MailService>
    const sut = new ReplySupportTicketUseCase(repo, mail)

    const result = await sut.execute('ticket-1', 'Já corrigimos', 'admin-1')

    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'joao@test.com', subject: expect.stringContaining('Resposta') }),
    )
    expect(repo.saveReply).toHaveBeenCalledWith('ticket-1', 'Já corrigimos', 'admin-1')
    expect(result).toBe(saved)
  })

  it('does not persist the reply if sending the email fails', async () => {
    const ticket = makeTicket()
    const repo = {
      findById: jest.fn().mockResolvedValue(ticket),
      saveReply: jest.fn(),
    } as unknown as jest.Mocked<ISupportTicketRepository>
    const mail = { send: jest.fn().mockRejectedValue(new Error('Resend down')) } as unknown as jest.Mocked<MailService>
    const sut = new ReplySupportTicketUseCase(repo, mail)

    await expect(sut.execute('ticket-1', 'corpo', 'admin-1')).rejects.toThrow('Resend down')
    expect(repo.saveReply).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && bun run test -- reply-support-ticket.usecase.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`backend/src/support/application/reply-support-ticket.usecase.ts`:

```ts
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { ISupportTicketRepository, SUPPORT_TICKET_REPOSITORY } from '../domain/support-ticket.repository'
import { SupportTicket } from '../domain/support-ticket.entity'
import { MailService } from '../../mail/mail.service'

@Injectable()
export class ReplySupportTicketUseCase {
  constructor(
    @Inject(SUPPORT_TICKET_REPOSITORY)
    private readonly repo: ISupportTicketRepository,
    private readonly mail: MailService,
  ) {}

  async execute(id: string, body: string, adminId: string): Promise<SupportTicket> {
    const ticket = await this.repo.findById(id)
    if (!ticket) throw new NotFoundException('Chamado não encontrado')
    if (!ticket.reporterEmail) {
      throw new BadRequestException('Este chamado não possui e-mail do solicitante cadastrado')
    }

    const { subject, html, text } = renderSupportReplyEmail({ reporterName: ticket.reporterName, body })
    await this.mail.send({ to: ticket.reporterEmail, subject, html, text })

    return this.repo.saveReply(id, body, adminId)
  }
}

export interface RenderSupportReplyEmailInput {
  reporterName: string
  body: string
}

export function renderSupportReplyEmail(
  input: RenderSupportReplyEmailInput,
): { subject: string; html: string; text: string } {
  const { reporterName, body } = input
  const subject = 'Resposta ao seu chamado de suporte — SouPelvi'
  const safeName = escapeHtml(reporterName)
  const safeBody = escapeHtml(body).replace(/\n/g, '<br/>')

  const html = `
<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;padding:32px;">
            <tr>
              <td style="font-size:18px;font-weight:bold;color:#111827;padding-bottom:16px;">Olá, ${safeName}</td>
            </tr>
            <tr>
              <td style="font-size:14px;color:#374151;line-height:1.5;">${safeBody}</td>
            </tr>
            <tr>
              <td style="font-size:12px;color:#6b7280;line-height:1.5;padding-top:24px;">Equipe SouPelvi</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim()

  const text = [`Olá, ${reporterName}`, '', body, '', 'Equipe SouPelvi'].join('\n')

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

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && bun run test -- reply-support-ticket.usecase.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/support/application/reply-support-ticket.usecase.ts backend/src/support/application/reply-support-ticket.usecase.spec.ts
git commit -m "feat(support): add ReplySupportTicketUseCase with email reply"
```

---

### Task 11: Controllers + module + app wiring

**Files:**
- Create: `backend/src/support/support-ticket-external.controller.ts`
- Create: `backend/src/support/support-ticket-admin.controller.ts`
- Create: `backend/src/support/support.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: every use case from Tasks 5-10; `ClinicExternalApiKeyGuard` (`backend/src/common/guards/clinic-external-api-key.guard.ts`); `JwtAuthGuard` (`backend/src/auth/guards/jwt-auth.guard.ts`); `RolesGuard` + `Roles` (`backend/src/auth/guards/roles.guard.ts`, `backend/src/auth/decorators/roles.decorator.ts`); `CurrentUser` (`backend/src/auth/decorators/current-user.decorator.ts`); DTOs from Task 4; `PrismaSupportTicketRepository` from Task 3; `SUPPORT_TICKET_REPOSITORY` from Task 2.
- Produces: registers `POST /api/admin/v1/clinic-ext/support-tickets` and `GET|GET :id|PATCH :id/status|PATCH :id/internal-note|POST :id/reply` under `/api/admin/support-tickets`.

- [ ] **Step 1: Create the external controller**

`backend/src/support/support-ticket-external.controller.ts`:

```ts
import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { ApiHeader, ApiTags } from '@nestjs/swagger'
import { ClinicExternalApiKeyGuard } from '../common/guards/clinic-external-api-key.guard'
import { CreateSupportTicketUseCase } from './application/create-support-ticket.usecase'
import { CreateSupportTicketDto } from './dto/create-support-ticket.dto'

@ApiTags('clinic-ext')
@ApiHeader({ name: 'x-clinic-api-key', required: true })
@UseGuards(ClinicExternalApiKeyGuard)
@Controller('v1/clinic-ext')
export class SupportTicketExternalController {
  constructor(private readonly createTicket: CreateSupportTicketUseCase) {}

  @Post('support-tickets')
  create(@Body() dto: CreateSupportTicketDto) {
    return this.createTicket.execute(dto)
  }
}
```

- [ ] **Step 2: Create the admin controller**

`backend/src/support/support-ticket-admin.controller.ts`:

```ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorator'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { ListSupportTicketsUseCase } from './application/list-support-tickets.usecase'
import { GetSupportTicketUseCase } from './application/get-support-ticket.usecase'
import { UpdateSupportTicketStatusUseCase } from './application/update-support-ticket-status.usecase'
import { UpdateSupportTicketNoteUseCase } from './application/update-support-ticket-note.usecase'
import { ReplySupportTicketUseCase } from './application/reply-support-ticket.usecase'
import { UpdateStatusDto } from './dto/update-status.dto'
import { UpdateInternalNoteDto } from './dto/update-internal-note.dto'
import { ReplyDto } from './dto/reply.dto'
import { SupportTicketCategory, SupportTicketStatus } from './domain/support-ticket.entity'

@ApiTags('support-tickets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('support-tickets')
export class SupportTicketAdminController {
  constructor(
    private readonly listTickets: ListSupportTicketsUseCase,
    private readonly getTicket: GetSupportTicketUseCase,
    private readonly updateStatusUseCase: UpdateSupportTicketStatusUseCase,
    private readonly updateNoteUseCase: UpdateSupportTicketNoteUseCase,
    private readonly replyUseCase: ReplySupportTicketUseCase,
  ) {}

  @Get()
  @Roles('SUPER_ADMIN', 'SUPPORT')
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('status') status?: SupportTicketStatus,
    @Query('category') category?: SupportTicketCategory,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.listTickets.execute({
      status,
      category,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    })
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'SUPPORT')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.getTicket.execute(id)
  }

  @Patch(':id/status')
  @Roles('SUPER_ADMIN', 'SUPPORT')
  updateStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStatusDto) {
    return this.updateStatusUseCase.execute(id, dto.status)
  }

  @Patch(':id/internal-note')
  @Roles('SUPER_ADMIN', 'SUPPORT')
  updateInternalNote(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateInternalNoteDto) {
    return this.updateNoteUseCase.execute(id, dto.note)
  }

  @Post(':id/reply')
  @Roles('SUPER_ADMIN', 'SUPPORT')
  reply(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplyDto,
    @CurrentUser() adminId: string,
  ) {
    return this.replyUseCase.execute(id, dto.body, adminId)
  }
}
```

- [ ] **Step 3: Create the module**

`backend/src/support/support.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { SupportTicketExternalController } from './support-ticket-external.controller'
import { SupportTicketAdminController } from './support-ticket-admin.controller'
import { CreateSupportTicketUseCase } from './application/create-support-ticket.usecase'
import { ListSupportTicketsUseCase } from './application/list-support-tickets.usecase'
import { GetSupportTicketUseCase } from './application/get-support-ticket.usecase'
import { UpdateSupportTicketStatusUseCase } from './application/update-support-ticket-status.usecase'
import { UpdateSupportTicketNoteUseCase } from './application/update-support-ticket-note.usecase'
import { ReplySupportTicketUseCase } from './application/reply-support-ticket.usecase'
import { PrismaSupportTicketRepository } from './infra/prisma-support-ticket.repository'
import { SUPPORT_TICKET_REPOSITORY } from './domain/support-ticket.repository'

@Module({
  controllers: [SupportTicketExternalController, SupportTicketAdminController],
  providers: [
    CreateSupportTicketUseCase,
    ListSupportTicketsUseCase,
    GetSupportTicketUseCase,
    UpdateSupportTicketStatusUseCase,
    UpdateSupportTicketNoteUseCase,
    ReplySupportTicketUseCase,
    {
      provide: SUPPORT_TICKET_REPOSITORY,
      useClass: PrismaSupportTicketRepository,
    },
  ],
})
export class SupportModule {}
```

- [ ] **Step 4: Wire into `app.module.ts`**

In `backend/src/app.module.ts`, add the import:

```ts
import { ClinicExtModule } from './clinic-ext/clinic-ext.module'
```

add right after it:

```ts
import { ClinicExtModule } from './clinic-ext/clinic-ext.module'
import { SupportModule } from './support/support.module'
```

and in the `imports` array, replace:

```ts
    ClinicExtModule,
  ],
```

with:

```ts
    ClinicExtModule,
    SupportModule,
  ],
```

- [ ] **Step 5: Verify it compiles and the full suite still passes**

Run: `cd backend && bunx tsc --noEmit && bun run test`
Expected: both succeed; all previously-written support-ticket use-case tests still pass; no regressions in existing suites.

- [ ] **Step 6: Commit**

```bash
git add backend/src/support/support-ticket-external.controller.ts backend/src/support/support-ticket-admin.controller.ts backend/src/support/support.module.ts backend/src/app.module.ts
git commit -m "feat(support): wire support ticket controllers and module"
```

---

### Task 12: Metrics — `openSupportTicketsCount`

**Files:**
- Modify: `backend/src/metrics/metrics.service.ts`
- Test: `backend/src/metrics/metrics.service.spec.ts` (new file — `MetricsService` has no existing tests)

**Interfaces:**
- Consumes: `PrismaService` (already injected in `MetricsService`).
- Produces: `getSummary()` return type gains `openSupportTicketsCount: number`, to be consumed by the frontend sidebar badge in SOU-64.

- [ ] **Step 1: Write the failing test**

`backend/src/metrics/metrics.service.spec.ts`:

```ts
import { MetricsService } from './metrics.service'
import { PrismaService } from '../prisma/prisma.service'

describe('MetricsService.getSummary', () => {
  it('includes openSupportTicketsCount alongside the existing summary fields', async () => {
    const prisma = {
      organization: { count: jest.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(2) },
      subscription: { count: jest.fn().mockResolvedValue(3) },
      invoice: { count: jest.fn().mockResolvedValue(1) },
      supportTicket: { count: jest.fn().mockResolvedValue(4) },
      $queryRaw: jest.fn().mockResolvedValue([{ mrr: '1000' }]),
    } as unknown as PrismaService
    const sut = new MetricsService(prisma)

    const result = await sut.getSummary()

    expect(result).toEqual({
      mrr: 1000,
      activeOrgs: 5,
      trialOrgs: 3,
      suspendedOrgs: 2,
      overdueInvoices: 1,
      openSupportTicketsCount: 4,
    })
    expect(prisma.supportTicket.count).toHaveBeenCalledWith({ where: { status: 'OPEN' } })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && bun run test -- metrics.service.spec.ts`
Expected: FAIL — `result` does not have `openSupportTicketsCount` (actual `undefined`).

- [ ] **Step 3: Update the implementation**

In `backend/src/metrics/metrics.service.ts`, replace the `getSummary` method:

```ts
  async getSummary() {
    const [activeOrgs, trialOrgs, suspendedOrgs, overdueInvoices, mrrResult] =
      await Promise.all([
        this.prisma.organization.count({ where: { status: 'ACTIVE' } }),
        this.prisma.subscription.count({ where: { status: 'TRIAL' } }),
        this.prisma.organization.count({ where: { status: 'SUSPENDED' } }),
        this.prisma.invoice.count({ where: { status: 'OVERDUE' } }),
        this.prisma.$queryRaw<[{ mrr: string }]>`
          SELECT COALESCE(SUM(p.price_monthly), 0)::text AS mrr
          FROM subscriptions s
          JOIN plans p ON p.id = s.plan_id
          WHERE s.status = 'ACTIVE'
        `,
      ])

    const mrr = Number(mrrResult[0]?.mrr ?? 0)

    return { mrr, activeOrgs, trialOrgs, suspendedOrgs, overdueInvoices }
  }
```

with:

```ts
  async getSummary() {
    const [activeOrgs, trialOrgs, suspendedOrgs, overdueInvoices, mrrResult, openSupportTicketsCount] =
      await Promise.all([
        this.prisma.organization.count({ where: { status: 'ACTIVE' } }),
        this.prisma.subscription.count({ where: { status: 'TRIAL' } }),
        this.prisma.organization.count({ where: { status: 'SUSPENDED' } }),
        this.prisma.invoice.count({ where: { status: 'OVERDUE' } }),
        this.prisma.$queryRaw<[{ mrr: string }]>`
          SELECT COALESCE(SUM(p.price_monthly), 0)::text AS mrr
          FROM subscriptions s
          JOIN plans p ON p.id = s.plan_id
          WHERE s.status = 'ACTIVE'
        `,
        this.prisma.supportTicket.count({ where: { status: 'OPEN' } }),
      ])

    const mrr = Number(mrrResult[0]?.mrr ?? 0)

    return { mrr, activeOrgs, trialOrgs, suspendedOrgs, overdueInvoices, openSupportTicketsCount }
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && bun run test -- metrics.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/metrics/metrics.service.ts backend/src/metrics/metrics.service.spec.ts
git commit -m "feat(metrics): add openSupportTicketsCount to summary"
```

---

### Task 13: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full backend test suite**

Run: `cd backend && bun run test`
Expected: all suites pass, including every `support/**/*.spec.ts` and `metrics/metrics.service.spec.ts` added above.

- [ ] **Step 2: Type-check**

Run: `cd backend && bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `cd backend && bun run lint`
Expected: no errors (warnings acceptable only if they already exist elsewhere in the codebase — do not introduce new ones).

- [ ] **Step 4: Manual smoke check (optional but recommended)**

Run: `cd backend && bun run start:dev`, then open `http://localhost:3001/api/admin/docs` and confirm:
- `support-tickets` tag shows the 5 internal endpoints
- `clinic-ext` tag shows the new `POST /v1/clinic-ext/support-tickets` alongside the existing `subscription`/`plans` endpoints

Stop the dev server after checking (`Ctrl+C`).

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin bravilal/sou-63-suporte-modelo-de-dados-e-modulo-backend-support-tickets
gh pr create --base main --title "Suporte: modelo de dados e módulo backend (support tickets)" --body "Refs SOU-63"
```

Confirm the PR's CI (if configured) passes `tsc --noEmit` per the project's PR-readiness requirement before considering this done.
