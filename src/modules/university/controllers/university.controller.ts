import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { UniversityService } from '../services/university.service.js';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../iam/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../iam/guards/jwt-auth.guard.js';
import {
  ClaimUniversityDto,
  RequestUniversityOtpDto,
  CreateNoteDto,
  CreateQuestionDto,
} from '../dto/university.dto.js';
import type { Response } from 'express';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};
@Controller('universities')
export class UniversityController {
  constructor(private readonly universityService: UniversityService) {}

  @Post('request-otp')
  @HttpCode(HttpStatus.OK)
  requestOtp(@Body() dto: RequestUniversityOtpDto) {
    return this.universityService.requestOtp(dto);
  }

  @Post('claim')
@HttpCode(HttpStatus.CREATED)
async claim(
  @Body() dto: ClaimUniversityDto,
  @Res({ passthrough: true }) res: Response,
) {
  const result = await this.universityService.claim(dto);
  res.cookie('token', result.accessToken, COOKIE_OPTIONS);
  return result;
}

  @Get('notes')
  @UseGuards(JwtAuthGuard)
  getNotes(@CurrentUser() user: AuthenticatedUser) {
    return this.universityService.getNotes(user.universityId);
  }

  @Post('notes')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  createNote(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateNoteDto,
  ) {
    return this.universityService.createNote(user.universityId, user.sub, dto);
  }

  @Get('questions')
  @UseGuards(JwtAuthGuard)
  getQuestions(@CurrentUser() user: AuthenticatedUser) {
    return this.universityService.getQuestions(user.universityId);
  }

  @Post('questions')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  createQuestion(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateQuestionDto,
  ) {
    return this.universityService.createQuestion(user.universityId, user.sub, dto);
  }
}