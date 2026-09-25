import { ApiProperty } from '@nestjs/swagger'
import { IsNotEmpty, IsString } from 'class-validator'

export class UpdateInternalNoteDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  note!: string
}
