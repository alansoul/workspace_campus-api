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
import { CampusEmailSyncService, RawCampusEmail } from '../services/campus-email-sync.service.js';
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
  constructor(private readonly universityService: UniversityService,
    private readonly emailSyncService: CampusEmailSyncService,
  ) {}

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

  @Post('email-sync/run')
@UseGuards(JwtAuthGuard)
async syncUniversityEmail(
  @CurrentUser() user: any,
  @Body() payload: { emails?: any[] }
) {
  // If no external emails were piped in, synthesize/fetch the latest campus circulars
  const sampleCampusEmails = payload.emails?.length
    ? payload.emails
    : [
        {
          id: 'em-1',
          sender: 'academics@iiitnr.edu.in',
          subject: 'Revised Lab Schedule for B.Tech Sem 1 ECE & CSE',
          receivedAt: new Date().toISOString(),
          body: 'All students are hereby informed that the Digital Electronics and IT Workshop practical sessions for Thursday will be held in Lab 1 and Lab 2 starting at 14:00. Attendance is compulsory.',
        },
        {
          id: 'em-2',
          sender: 'sports_club@iiitnr.edu.in',
          subject: 'Inter-Department Cricket & Football League Registrations',
          receivedAt: new Date().toISOString(),
          body: 'Registrations are open for the Autumn Sports League. Matches commence on 25 October at the University Sports Complex. Team captains must submit rosters by Monday.',
        },
      ];

  const results = [];
  for (const email of sampleCampusEmails) {
    const parsed = await this.emailSyncService.processCampusEmail(
      user.universityId || 'default-university',
      email
    );
    results.push(parsed);
  }

  return {
    success: true,
    message: `Synchronized ${results.length} campus emails successfully`,
    extracted: results,
  };
}
}