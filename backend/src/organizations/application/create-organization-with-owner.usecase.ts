import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common'
import { IOrganizationRepository, ORGANIZATION_REPOSITORY } from '../domain/organization.repository'
import { Organization } from '../domain/organization.entity'
import { ClinicApiService } from '../../clinic-api/clinic-api.service'
import { PrismaService } from '../../prisma/prisma.service'
import { ResolveTrialPlan } from './resolve-trial-plan'
import { generateProvisionalPassword } from './provisional-password'
import { OrgEventService } from './org-event.service'
import { SendWelcomeEmail } from './send-welcome-email'

export interface CreateOrganizationWithOwnerInput {
  organizationType: 'CLINIC_PJ' | 'SOLO_PF'
  name: string
  document?: string // CNPJ para CLINIC_PJ; omitido para SOLO_PF (usa owner.cpf)
  email: string
  phone?: string
  owner: {
    name: string
    cpf: string
    email: string
    phone?: string
  }
}

export interface CreateOrganizationWithOwnerResult {
  organization: Organization
  owner: {
    personId: string
    cpf: string
    name: string
    email: string
    reused: boolean
  }
  subscription: {
    id: string
    status: string
    trialEndsAt: Date
  }
  // Retornado apenas quando a pessoa foi criada agora. UI deve exibir uma única vez.
  provisionalPassword: string | null
}

const TRIAL_DAYS = 14

@Injectable()
export class CreateOrganizationWithOwnerUseCase {
  private readonly logger = new Logger(CreateOrganizationWithOwnerUseCase.name)

  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly repo: IOrganizationRepository,
    private readonly clinicApi: ClinicApiService,
    private readonly prisma: PrismaService,
    private readonly resolveTrialPlan: ResolveTrialPlan,
    private readonly orgEvents: OrgEventService,
    private readonly sendWelcomeEmail: SendWelcomeEmail,
  ) {}

  async execute(input: CreateOrganizationWithOwnerInput): Promise<CreateOrganizationWithOwnerResult> {
    const isSolo = input.organizationType === 'SOLO_PF'
    const document = isSolo ? input.owner.cpf : input.document!
    const documentType = isSolo ? 'CPF' : 'CNPJ'

    const existing = await this.repo.findAll({ search: document, limit: 1 })
    const conflict = existing.data.find((o) => o.document === document)
    if (conflict) {
      throw new ConflictException(
        isSolo
          ? 'Já existe uma organização com este CPF'
          : 'Já existe uma organização com este CNPJ',
      )
    }

    // ── External calls (pelvi-ui) ────────────────────────────────────────────
    const clinic = await this.clinicApi.createClinic({
      name: input.name,
      document,
      documentType,
      email: input.email,
      phone: input.phone,
    })

    const provisionalPassword = generateProvisionalPassword()
    const personResp = await this.clinicApi.upsertPerson({
      cpf: input.owner.cpf,
      name: input.owner.name,
      email: input.owner.email,
      phone: input.owner.phone,
      password: provisionalPassword,
    })

    await this.clinicApi.linkPersonToClinic(clinic.clinicId, {
      personId: personResp.person.personId,
      role: 'ADMIN',
    })

    // ── Local persistence (atomic) ───────────────────────────────────────────
    // If this fails, the clinic already exists in pelvi-ui. Compensate by
    // blocking it so it cannot be used until an operator resolves the conflict.
    const trialPlanId = await this.resolveTrialPlan.planId()
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000)

    let organization: Organization
    let subscription: { id: string; status: string; trialEndsAt: Date }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: {
            name: input.name,
            document,
            documentType,
            email: input.email,
            phone: input.phone ?? null,
            status: 'ACTIVE',
            clinicExternalId: clinic.clinicId,
          },
        })
        const sub = await tx.subscription.create({
          data: {
            organizationId: org.id,
            planId: trialPlanId,
            status: 'TRIAL',
            startDate: new Date(),
            trialEndsAt,
          },
        })
        return { org, sub }
      })
      organization = result.org as Organization
      subscription = {
        id: result.sub.id,
        status: result.sub.status,
        trialEndsAt: result.sub.trialEndsAt!,
      }
    } catch (persistenceError) {
      this.logger.error(
        `Local persistence failed for clinic ${clinic.clinicId} — blocking in pelvi-ui as compensation`,
      )
      try {
        await this.clinicApi.updateClinicAccess(clinic.clinicId, 'BLOCKED')
      } catch {
        this.logger.error(
          `Compensation also failed for clinic ${clinic.clinicId} — manual cleanup required`,
        )
      }
      throw persistenceError
    }

    // ── Propagate plan limits to pelvi-ui ────────────────────────────────────
    const plan = await this.prisma.plan.findUniqueOrThrow({ where: { id: trialPlanId } })
    await this.clinicApi.updateClinicAccess(clinic.clinicId, 'ACTIVE', {
      maxUsers: plan.maxUsers,
      maxPatients: plan.maxPatients,
    })

    await this.orgEvents.record(organization.id, 'ORG_CREATED', {
      document,
      documentType,
      clinicId: clinic.clinicId,
    })
    await this.orgEvents.record(organization.id, 'TRIAL_STARTED', {
      planId: trialPlanId,
      trialEndsAt: trialEndsAt.toISOString(),
    })

    if (personResp.reused) {
      this.logger.log(`Owner reaproveitado (cpf=***${input.owner.cpf.slice(-3)}); senha provisória não foi redefinida.`)
    } else {
      try {
        await this.sendWelcomeEmail.execute({
          ownerName: personResp.person.name,
          ownerEmail: personResp.person.email,
          ownerCpf: personResp.person.cpf,
          organizationName: organization.name,
          provisionalPassword,
        })
        await this.orgEvents.record(organization.id, 'WELCOME_EMAIL_SENT', {
          ownerEmail: personResp.person.email,
        })
      } catch (err) {
        this.logger.error(`Falha ao enviar e-mail de boas-vindas (org=${organization.id}): ${(err as Error).message}`)
      }
    }

    return {
      organization,
      owner: {
        personId: personResp.person.personId,
        cpf: personResp.person.cpf,
        name: personResp.person.name,
        email: personResp.person.email,
        reused: personResp.reused,
      },
      subscription,
      provisionalPassword: personResp.reused ? null : provisionalPassword,
    }
  }
}
