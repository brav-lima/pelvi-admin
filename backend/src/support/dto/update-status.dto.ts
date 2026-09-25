import { ApiProperty } from '@nestjs/swagger'
import { IsEnum } from 'class-validator'

export class UpdateStatusDto {
  @ApiProperty({ enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED'] })
  @IsEnum(['OPEN', 'IN_PROGRESS', 'RESOLVED'])
  status!: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'
}
