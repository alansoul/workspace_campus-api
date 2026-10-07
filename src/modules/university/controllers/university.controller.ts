import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
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
  claim(@Body() dto: ClaimUniversityDto) {
    return this.universityService.claim(dto);
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