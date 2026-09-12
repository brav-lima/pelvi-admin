import { Module } from '@nestjs/common'
import { OrganizationsController } from './organizations.controller'
import { CreateOrganizationUseCase } from './application/create-organization.usecase'
import { CreateOrganizationWithOwnerUseCase } from './application/create-organization-with-owner.usecase'
import { UpdateOrgStatusUseCase } from './application/update-status.usecase'
import { ListOrganizationsUseCase } from './application/list-organizations.usecase'
import { ResetClinicUserPasswordUseCase } from './application/reset-clinic-user-password.usecase'
import { ChangePlanAdminUseCase } from './application/change-plan-admin.usecase'
import { ResolveClinicId } from './application/resolve-clinic-id'
import { ResolveTrialPlan } from './application/resolve-trial-plan'
import { OrgEventService } from './application/org-event.service'
import { SendWelcomeEmail } from './application/send-welcome-email'
import { PrismaOrganizationRepository } from './infra/prisma-organization.repository'
import { ORGANIZATION_REPOSITORY } from './domain/organization.repository'

@Module({
  controllers: [OrganizationsController],
  providers: [
    CreateOrganizationUseCase,
    CreateOrganizationWithOwnerUseCase,
    UpdateOrgStatusUseCase,
    ListOrganizationsUseCase,
    ResetClinicUserPasswordUseCase,
    ChangePlanAdminUseCase,
    ResolveClinicId,
    ResolveTrialPlan,
    OrgEventService,
    SendWelcomeEmail,
    {
      provide: ORGANIZATION_REPOSITORY,
      useClass: PrismaOrganizationRepository,
    },
  ],
})
export class OrganizationsModule {}
