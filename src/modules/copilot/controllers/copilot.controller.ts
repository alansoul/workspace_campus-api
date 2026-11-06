import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CopilotService } from '../services/copilot.service.js';
import { QueryCopilotDto, CopilotResponseDto } from '../dto/copilot.dto.js';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../iam/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../iam/guards/jwt-auth.guard.js';

@Controller('copilot')
export class CopilotController {
  constructor(private readonly copilotService: CopilotService) {}

  @Post('chat')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async chat(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: QueryCopilotDto
  ): Promise<CopilotResponseDto> {
    return this.copilotService.processCopilotQuery(user.sub, dto);
  }
}