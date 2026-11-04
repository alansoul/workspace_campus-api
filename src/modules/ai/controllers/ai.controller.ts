// campus-api/src/modules/ai/controllers/ai.controller.ts
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AiService } from '../services/ai.service.js';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard.js';
import { ChatRequestDto, ValidateApiKeyDto } from '../dto/ai.dto.js';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /**
   * Main chat endpoint supporting live models, user API keys, and screen context.
   * Throttled to 20 queries/min per IP to prevent Gemini API quota drain.
   */
  @Post('chat')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async chatWithCampusAi(@Body() payload: ChatRequestDto) {
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
   * Validates whether a user's custom Gemini API key is active.
   * Throttled to 10 attempts/min.
   */
  @Post('validate-key')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async validateKey(@Body() dto: ValidateApiKeyDto) {
    return this.aiService.validateApiKey(dto.apiKey);
  }
}