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
