import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../services/auth.service.js';
import {
  RequestOtpDto,
  VerifyOtpDto,
  VerifyAndRegisterDto,
  LoginDto,
  SetPasswordDto,
  LinkCampusRequestDto,
  LinkCampusVerifyDto,
} from '../dto/auth.dto.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { CurrentUser } from '../decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../guards/jwt-auth.guard.js';

const COOKIE_OPTIONS = {
  httpOnly: true, // 🚨 CRITICAL: JavaScript cannot access this cookie (Prevents XSS)
  secure: process.env.NODE_ENV === 'production', // Must be true on Vercel/Production
  sameSite: 'lax' as const, // Protects against CSRF attacks
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
};

// Supports both 'auth' and 'iam' base paths to prevent route mismatches
@Controller(['auth', 'iam'])
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('resolve-domain')
  @HttpCode(HttpStatus.OK)
  resolveDomain(@Query('email') email: string) {
    return this.authService.resolveDomain(email || '');
  }

  // Handles both /request-otp and /otp/request
  @Post(['request-otp', 'otp/request'])
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestOtp(dto);
  }

  // Passwordless OTP entry for both institutional and personal accounts
  @Post(['verify-otp', 'otp/verify'])
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyOtp(dto);

    // If password setup is required, do NOT issue the full session cookie yet
    if (result.requiresPasswordSetup) {
      const { accessToken, token, ...safeData } = result as any;
      return safeData;
    }

    const { accessToken, token, ...safeData } = result as any;

    // Set the secure HttpOnly cookie
    if (accessToken) {
      res.cookie('token', accessToken, COOKIE_OPTIONS);
      res.cookie('user_role', safeData.user.role, {
        ...COOKIE_OPTIONS,
        httpOnly: false,
      });
      res.cookie('account_type', safeData.user.accountType, {
        ...COOKIE_OPTIONS,
        httpOnly: false,
      });
    }

    return safeData;
  }

  @Post('password/set')
  @HttpCode(HttpStatus.OK)
  async setPassword(
    @Body() dto: SetPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.setPassword(dto);

    if (result.accessToken) {
      res.cookie('token', result.accessToken, COOKIE_OPTIONS);
      res.cookie('user_role', result.user.role, {
        ...COOKIE_OPTIONS,
        httpOnly: false,
      });
      res.cookie('account_type', result.user.accountType, {
        ...COOKIE_OPTIONS,
        httpOnly: false,
      });
    }

    const { accessToken, token, ...safeData } = result as any;
    return safeData;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);

    if (result.accessToken) {
      res.cookie('token', result.accessToken, COOKIE_OPTIONS);
      res.cookie('user_role', result.user.role, {
        ...COOKIE_OPTIONS,
        httpOnly: false,
      });
      res.cookie('account_type', result.user.accountType, {
        ...COOKIE_OPTIONS,
        httpOnly: false,
      });
    }

    const { accessToken, token, ...safeData } = result as any;
    return safeData;
  }

  // 🔗 LINK CAMPUS: Request OTP for linking institutional email to personal account
  @Post('campus/link/request')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  requestLinkCampus(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LinkCampusRequestDto,
  ) {
    return this.authService.requestLinkCampus(
      user.sub,
      dto.institutionalEmail,
    );
  }

  // 🔗 LINK CAMPUS: Verify OTP and attach university domain to account
  @Post('campus/link/verify')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async verifyLinkCampus(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LinkCampusVerifyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyLinkCampus(
      user.sub,
      dto.institutionalEmail,
      dto.otp,
    );

    // Refresh UI cookies so edge middleware sees account as INSTITUTIONAL
    res.cookie('account_type', 'INSTITUTIONAL', {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return result;
  }

  @Post('verify-and-register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  async verifyAndRegister(
    @Body() dto: VerifyAndRegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, token, ...safeData } =
      await this.authService.verifyAndRegister(dto);

    res.cookie('token', accessToken, COOKIE_OPTIONS);
    res.cookie('user_role', safeData.user.role, {
      ...COOKIE_OPTIONS,
      httpOnly: false,
    });
    res.cookie('account_type', 'INSTITUTIONAL', {
      ...COOKIE_OPTIONS,
      httpOnly: false,
    });

    return safeData;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.authService.getProfile(user.sub);
    return { user: profile };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('token', { path: '/' });
    res.clearCookie('user_role', { path: '/' });
    res.clearCookie('account_type', { path: '/' });
    return { message: 'Signed out successfully' };
  }

    // 🔗 UNLINK CAMPUS: Removes university association from personal account
  @Post('campus/unlink')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async unlinkCampus(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.unlinkCampus(user.sub);

    // Update UI helper cookie to INDIVIDUAL
    res.cookie('account_type', 'INDIVIDUAL', {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return result;
  }
}