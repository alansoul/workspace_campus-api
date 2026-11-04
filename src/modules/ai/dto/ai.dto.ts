// campus-api/src/modules/ai/dto/ai.dto.ts
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ChatMessageItemDto {
  @IsString()
  @IsIn(['user', 'assistant', 'model'], {
    message: 'Role must be user, assistant, or model.',
  })
  role!: 'user' | 'assistant' | 'model';

  @IsString()
  @IsNotEmpty({ message: 'Message content cannot be empty.' })
  @MaxLength(8000, { message: 'Message content must not exceed 8,000 characters.' })
  content!: string;
}

export class ChatRequestDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one message is required.' })
  @ArrayMaxSize(50, { message: 'Conversation history must not exceed 50 messages.' })
  @ValidateNested({ each: true })
  @Type(() => ChatMessageItemDto)
  messages!: ChatMessageItemDto[];

  @IsString()
  @IsOptional()
  @MaxLength(50)
  model?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  modelName?: string;

  @IsString()
  @IsOptional()
  @IsIn(['low', 'medium', 'high'], {
    message: 'Thinking level must be low, medium, or high.',
  })
  thinkingLevel?: 'low' | 'medium' | 'high';

  @IsString()
  @IsOptional()
  @MaxLength(100)
  userApiKey?: string;

  @IsString()
  @IsOptional()
  @MaxLength(15000, { message: 'Screen context must not exceed 15,000 characters.' })
  pageContext?: string;
}

export class ValidateApiKeyDto {
  @IsString()
  @IsNotEmpty({ message: 'API key is required.' })
  @MaxLength(100, { message: 'API key must not exceed 100 characters.' })
  apiKey!: string;
}