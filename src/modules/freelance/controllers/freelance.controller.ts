import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { FreelanceService } from '../services/freelance.service.js';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../iam/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../iam/guards/jwt-auth.guard.js';
import { CreateGigDto } from '../dto/freelance.dto.js';

@Controller('freelance')
@UseGuards(JwtAuthGuard)
export class FreelanceController {
  constructor(private readonly freelanceService: FreelanceService) {}

  @Get('gigs')
  getGigs(@CurrentUser() user: AuthenticatedUser) {
    return this.freelanceService.getGigs(user.universityId);
  }

  @Post('gigs')
  @HttpCode(HttpStatus.CREATED)
  createGig(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateGigDto,
  ) {
    return this.freelanceService.createGig(user.universityId, user.sub, dto);
  }
}