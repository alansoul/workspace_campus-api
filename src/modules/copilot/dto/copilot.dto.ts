import { IsNotEmpty, IsOptional, IsString, IsBoolean, IsObject } from 'class-validator';

export class CopilotQueryOptionsDto {
  @IsOptional()
  @IsBoolean()
  citations?: boolean;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  provider?: 'system' | 'gemini' | 'groq' | 'openai' | 'local' | 'huggingface';

  @IsOptional()
  @IsString()
  userApiKey?: string;
}

export class QueryCopilotDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsOptional()
  @IsObject()
  options?: CopilotQueryOptionsDto;
}

export interface AgentStepResult {
  agentName: string;
  action: string;
  status: 'pending' | 'running' | 'completed';
  resultSnippet?: string;
}

export interface CopilotResponseDto {
  content: string;
  agentSteps: AgentStepResult[];
  citations: string[];
  suggestedFollowUps: string[];
  quotaExceeded?: boolean;
  quotaRemaining?: number;
}