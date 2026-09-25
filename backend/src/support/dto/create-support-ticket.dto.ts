import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator'

export class SupportTicketContextDto {
  @ApiProperty()
  @IsString()
  @MaxLength(500)
  route!: string

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  url!: string

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  userAgent!: string

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  appVersion!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  sessionId?: string | null

  @ApiProperty()
  @IsString()
  @MaxLength(500)
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
  @MaxLength(2000)
  description!: string

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reporterName!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  reporterEmail?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reporterRole?: string | null

  @ApiProperty({ type: () => SupportTicketContextDto })
  @ValidateNested()
  @Type(() => SupportTicketContextDto)
  context!: SupportTicketContextDto

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sentryEventId?: string | null
}
