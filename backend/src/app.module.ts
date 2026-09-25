import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ThrottlerModule } from '@nestjs/throttler'
import { LoggerModule } from 'nestjs-pino'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './auth/auth.module'
import { OrganizationsModule } from './organizations/organizations.module'
import { PlansModule } from './plans/plans.module'
import { SubscriptionsModule } from './subscriptions/subscriptions.module'
import { InvoicesModule } from './invoices/invoices.module'
import { MetricsModule } from './metrics/metrics.module'
import { ClinicApiModule } from './clinic-api/clinic-api.module'
import { HealthModule } from './health/health.module'
import { ClinicExtModule } from './clinic-ext/clinic-ext.module'
import { SupportModule } from './support/support.module'
import { PlanFeaturesModule } from './plan-features/plan-features.module'
import { MailModule } from './mail/mail.module'
import { CorrelationIdMiddleware } from './common/correlation/correlation-id.middleware'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // dotenvx já injeta as variáveis no processo antes do NestJS iniciar
      ignoreEnvFile: true,
    }),
    ThrottlerModule.forRoot([
      { ttl: 60000, limit: 100 },
      { name: 'reset-ip', ttl: 3_600_000, limit: 1000 },
    ]),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
        serializers: {
          req: (req) => ({ method: req.method, url: req.url }),
          res: (res) => ({ statusCode: res.statusCode }),
        },
        customProps: (req) => ({
          correlationId: req.headers['x-correlation-id'],
        }),
      },
    }),
    PrismaModule,
    ClinicApiModule,
    MailModule,
    AuthModule,
    OrganizationsModule,
    PlansModule,
    PlanFeaturesModule,
    SubscriptionsModule,
    InvoicesModule,
    MetricsModule,
    HealthModule,
    ClinicExtModule,
    SupportModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*')
  }
}
