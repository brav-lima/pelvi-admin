import { NestFactory } from '@nestjs/core'
import { ValidationPipe, BadRequestException } from '@nestjs/common'
import { DecimalSerializerInterceptor } from './common/interceptors/decimal-serializer.interceptor'
import { ConfigService } from '@nestjs/config'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { Logger } from 'nestjs-pino'
import * as cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { GlobalExceptionFilter } from './common/filters/global-exception.filter'
import { assertMailConfig } from './mail/assert-mail-config'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  app.useLogger(app.get(Logger))

  const config = app.get(ConfigService)
  const port = config.get<number>('PORT', 3001)
  const corsOrigin = config.get<string>('CORS_ORIGIN', 'http://localhost:8081')

  if (process.env.NODE_ENV === 'production' && (!corsOrigin || corsOrigin.includes('localhost'))) {
    throw new Error('CORS_ORIGIN must be set to a production domain in production environment')
  }

  assertMailConfig(config)

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"], // Swagger UI requires inline styles
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  )
  app.use(cookieParser())
  app.enableCors({ origin: corsOrigin, credentials: true })

  app.useGlobalFilters(new GlobalExceptionFilter())
  app.useGlobalInterceptors(new DecimalSerializerInterceptor())

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        new BadRequestException({
          message: 'Validation failed',
          errors: errors.map((e) => ({
            field: e.property,
            messages: Object.values(e.constraints ?? {}),
          })),
        }),
    }),
  )

  app.setGlobalPrefix('api/admin')

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Pelvi Admin API')
    .setDescription('API interna de gestão SaaS do Pelvi')
    .setVersion('1.0')
    .addBearerAuth()
    .build()

  const document = SwaggerModule.createDocument(app, swaggerConfig)

  if (process.env.NODE_ENV !== 'production') {
    SwaggerModule.setup('api/admin/docs', app, document)
  }

  await app.listen(port)
  console.log(`🚀 Admin API running on http://localhost:${port}/api/admin`)
  if (process.env.NODE_ENV !== 'production') {
    console.log(`📖 Swagger docs: http://localhost:${port}/api/admin/docs`)
  }
}

bootstrap()
