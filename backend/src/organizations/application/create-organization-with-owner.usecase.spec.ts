import { ConflictException } from '@nestjs/common'
import {
  CreateOrganizationWithOwnerUseCase,
  CreateOrganizationWithOwnerInput,
} from './create-organization-with-owner.usecase'
import { IOrganizationRepository } from '../domain/organization.repository'
import { ClinicApiService } from '../../clinic-api/clinic-api.service'
import { PrismaService } from '../../prisma/prisma.service'
import { ResolveTrialPlan } from './resolve-trial-plan'
import { OrgEventService } from './org-event.service'
import { Organization } from '../domain/organization.entity'
import { SendWelcomeEmail } from './send-welcome-email'

const makeOrg = (overrides: Partial<Organization> = {}): Organization => ({
  id: 'org-1',
  name: 'Clínica A',
  document: '12345678000100',
  documentType: 'CNPJ',
  email: 'a@test.com',
  phone: null,
  status: 'ACTIVE',
  clinicExternalId: 'clinic-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const makeSub = (orgId = 'org-1') => ({
  id: 'sub-1',
  organizationId: orgId,
  planId: 'plan-trial-id',
  status: 'TRIAL',
  trialEndsAt: new Date(Date.now() + 14 * 86400000),
  startDate: new Date(),
})

const baseInput: CreateOrganizationWithOwnerInput = {
  organizationType: 'CLINIC_PJ',
  name: 'Clínica A',
  document: '12345678000100',
  email: 'a@test.com',
  phone: '11999990000',
  owner: {
    name: 'Ana Lima',
    cpf: '12345678900',
    email: 'ana@test.com',
    phone: '11988880000',
  },
}

const personResp = (reused = false) => ({
  reused,
  person: {
    personId: 'person-1',
    cpf: '12345678900',
    name: 'Ana Lima',
    email: 'ana@test.com',
    phone: null,
    active: true,
  },
})

const makeTx = (orgOverride: Partial<Organization> = {}) => ({
  organization: {
    create: jest.fn().mockResolvedValue(makeOrg(orgOverride)),
  },
  subscription: {
    create: jest.fn().mockResolvedValue(makeSub(orgOverride.id ?? 'org-1')),
  },
})

describe('CreateOrganizationWithOwnerUseCase', () => {
  let repo: jest.Mocked<IOrganizationRepository>
  let clinicApi: jest.Mocked<ClinicApiService>
  let prisma: jest.Mocked<Pick<PrismaService, '$transaction' | 'plan'>>
  let resolveTrialPlan: jest.Mocked<ResolveTrialPlan>
  let orgEvents: jest.Mocked<OrgEventService>
  let sendWelcomeEmail: jest.Mocked<SendWelcomeEmail>
  let sut: CreateOrganizationWithOwnerUseCase
  let tx: ReturnType<typeof makeTx>

  beforeEach(() => {
    tx = makeTx()
    repo = {
      findById: jest.fn(),
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    }
    clinicApi = {
      createClinic: jest.fn(),
      listClinics: jest.fn(),
      updateClinicAccess: jest.fn().mockResolvedValue(undefined),
      upsertPerson: jest.fn(),
      linkPersonToClinic: jest.fn().mockResolvedValue(undefined),
      listClinicUsers: jest.fn(),
      updateClinicUser: jest.fn(),
      resetClinicUserPassword: jest.fn(),
    } as any
    prisma = {
      $transaction: jest.fn().mockImplementation(async (fn: (tx: any) => Promise<unknown>) => fn(tx)),
      plan: { findUniqueOrThrow: jest.fn().mockResolvedValue({ maxUsers: 5, maxPatients: 100 }) } as any,
    }
    resolveTrialPlan = { planId: jest.fn().mockResolvedValue('plan-trial-id') } as any
    orgEvents = { record: jest.fn().mockResolvedValue(undefined), list: jest.fn() } as any
    sendWelcomeEmail = { execute: jest.fn().mockResolvedValue(undefined) } as any

    sut = new CreateOrganizationWithOwnerUseCase(
      repo as any,
      clinicApi,
      prisma as any,
      resolveTrialPlan,
      orgEvents,
      sendWelcomeEmail,
    )
  })

  it('throws ConflictException when document already belongs to an org', async () => {
    repo.findAll.mockResolvedValue({ data: [makeOrg()], total: 1 })
    await expect(sut.execute(baseInput)).rejects.toThrow(ConflictException)
  })

  it('executes the full creation flow in order', async () => {
    repo.findAll.mockResolvedValue({ data: [], total: 0 })
    clinicApi.createClinic.mockResolvedValue({ clinicId: 'clinic-new' } as any)
    clinicApi.upsertPerson.mockResolvedValue(personResp(false) as any)

    await sut.execute(baseInput)

    expect(clinicApi.createClinic).toHaveBeenCalled()
    expect(clinicApi.upsertPerson).toHaveBeenCalled()
    expect(clinicApi.linkPersonToClinic).toHaveBeenCalled()
    expect(prisma.$transaction).toHaveBeenCalled()
    expect(tx.organization.create).toHaveBeenCalled()
    expect(tx.subscription.create).toHaveBeenCalled()
    expect(clinicApi.updateClinicAccess).toHaveBeenCalled()
  })

  it('creates TRIAL subscription with 14-day trialEndsAt inside the transaction', async () => {
    tx = makeTx({ id: 'org-new' })
    prisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<unknown>) => fn(tx))

    repo.findAll.mockResolvedValue({ data: [], total: 0 })
    clinicApi.createClinic.mockResolvedValue({ clinicId: 'clinic-new' } as any)
    clinicApi.upsertPerson.mockResolvedValue(personResp(false) as any)

    await sut.execute(baseInput)

    expect(tx.subscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-new',
          planId: 'plan-trial-id',
          status: 'TRIAL',
        }),
      }),
    )
  })

  it('returns subscription info in result', async () => {
    repo.findAll.mockResolvedValue({ data: [], total: 0 })
    clinicApi.createClinic.mockResolvedValue({ clinicId: 'clinic-new' } as any)
    clinicApi.upsertPerson.mockResolvedValue(personResp(false) as any)

    const result = await sut.execute(baseInput)

    expect(result.subscription).toMatchObject({ id: 'sub-1', status: 'TRIAL' })
    expect(result.subscription.trialEndsAt).toBeInstanceOf(Date)
  })

  it('returns provisionalPassword when person is newly created', async () => {
    repo.findAll.mockResolvedValue({ data: [], total: 0 })
    clinicApi.createClinic.mockResolvedValue({ clinicId: 'clinic-new' } as any)
    clinicApi.upsertPerson.mockResolvedValue(personResp(false) as any)

    const result = await sut.execute(baseInput)

    expect(result.provisionalPassword).not.toBeNull()
    expect(typeof result.provisionalPassword).toBe('string')
  })

  it('returns null provisionalPassword when person already existed (reused)', async () => {
    repo.findAll.mockResolvedValue({ data: [], total: 0 })
    clinicApi.createClinic.mockResolvedValue({ clinicId: 'clinic-new' } as any)
    clinicApi.upsertPerson.mockResolvedValue(personResp(true) as any)

    const result = await sut.execute(baseInput)

    expect(result.provisionalPassword).toBeNull()
    expect(result.owner.reused).toBe(true)
  })

  it('links person to clinic with ADMIN role', async () => {
    repo.findAll.mockResolvedValue({ data: [], total: 0 })
    clinicApi.createClinic.mockResolvedValue({ clinicId: 'clinic-new' } as any)
    clinicApi.upsertPerson.mockResolvedValue(personResp(false) as any)

    await sut.execute(baseInput)

    expect(clinicApi.linkPersonToClinic).toHaveBeenCalledWith(
      'clinic-new',
      expect.objectContaining({ personId: 'person-1', role: 'ADMIN' }),
    )
  })

  it('blocks clinic in pelvi-ui and rethrows when local persistence fails', async () => {
    repo.findAll.mockResolvedValue({ data: [], total: 0 })
    clinicApi.createClinic.mockResolvedValue({ clinicId: 'clinic-fail' } as any)
    clinicApi.upsertPerson.mockResolvedValue(personResp(false) as any)
    const dbError = new Error('DB connection lost')
    prisma.$transaction.mockRejectedValue(dbError)

    await expect(sut.execute(baseInput)).rejects.toThrow('DB connection lost')
    expect(clinicApi.updateClinicAccess).toHaveBeenCalledWith('clinic-fail', 'BLOCKED')
  })

  it('sends the welcome email when a new person is created', async () => {
    repo.findAll.mockResolvedValue({ data: [], total: 0 })
    clinicApi.createClinic.mockResolvedValue({ clinicId: 'clinic-new' } as any)
    clinicApi.upsertPerson.mockResolvedValue(personResp(false) as any)

    await sut.execute(baseInput)

    expect(sendWelcomeEmail.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerName: 'Ana Lima',
        ownerEmail: 'ana@test.com',
        ownerCpf: '12345678900',
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
})
