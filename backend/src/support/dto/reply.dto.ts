import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

export class ReplyDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  body!: string
}
