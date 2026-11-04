// campus-api/src/modules/chat/dto/chat.dto.ts
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class StartDirectChatDto {
  @IsEmail({}, { message: 'Must be a valid email address.' })
  @IsNotEmpty()
  @MaxLength(255)
  friendEmail!: string;

  @IsString()
  @IsOptional()
  currentUserId?: string;
}

export class CreateChannelDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Channel name must be at least 2 characters.' })
  @MaxLength(50, { message: 'Channel name must not exceed 50 characters.' })
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'Channel name can only contain letters, numbers, hyphens, and underscores.',
  })
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;

  @IsString()
  @IsOptional()
  userId?: string;
}