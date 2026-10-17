import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AiService, GeminiThinkingLevel } from '../services/ai.service.js';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard.js';

interface ChatRequestPayload {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  model?: string;
  modelName?: string;
  thinkingLevel?: GeminiThinkingLevel;
  userApiKey?: string;
  pageContext?: string;
}

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /**
   * Main chat endpoint supporting live models, custom user API keys, and screen context
   */
  @Post('chat')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async chatWithCampusAi(@Body() payload: ChatRequestPayload) {
    const reply = await this.aiService.chat(
      payload.messages,
      payload.model || 'gemini-3.5-flash-lite',
      payload.thinkingLevel || 'low',
      payload.modelName || '3.5 Flash-Lite',
      payload.userApiKey,
      payload.pageContext,
    );

    return {
      success: true,
      model: payload.modelName || '3.5 Flash-Lite',
      reply,
    };
  }

  /**
   * Validates whether a Gemini API key is valid and has active quota
   */
  @Post('validate-key')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async validateKey(@Body() body: { apiKey: string }) {
    return this.aiService.validateApiKey(body.apiKey);
  }
}