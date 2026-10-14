import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../services/auth.service.js';
import {
  RequestOtpDto,
  VerifyOtpDto,
  VerifyAndRegisterDto,
  LoginDto,
  SetPasswordDto,
  ResetPasswordDto,
  LinkCampusRequestDto,
  LinkCampusVerifyDto,
} from '../dto/auth.dto.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { CurrentUser } from '../decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../guards/jwt-auth.guard.js';

const isProd = process.env.NODE_ENV === 'production';

// 🚨 CRITICAL FOR CROSS-DOMAIN (Render API -> Vercel Frontend):
// Production cross-site cookies require sameSite: 'none' and secure: true
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? ('none' as const) : ('lax' as const),
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
};

/**
 * Ensures FRONTEND_URL is an absolute URL with protocol (e.g. https://domain.vercel.app)
 * to prevent Express from treating redirects as relative paths.
 */
function sanitizeFrontendUrl(rawUrl?: string): string {
  let url = (rawUrl || 'http://localhost:3000').trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  return url.replace(/\/+$/, ''); // Strip trailing slashes
}

@Controller(['auth', 'iam'])
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('resolve-domain')
  @HttpCode(HttpStatus.OK)
  resolveDomain(@Query('email') email: string) {
    return this.authService.resolveDomain(email || '');
  }

  // 🌐 GOOGLE OAUTH: Step 1 - Redirect user to Google consent screen
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth() {
    // Passport automatically redirects to Google
  }

  // 🌐 GOOGLE OAUTH: Step 2 - Google redirects back here after user approves
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthCallback(@Req() req: any, @Res() res: Response) {
    const frontendUrl = sanitizeFrontendUrl(process.env.FRONTEND_URL);

    try {
      const result = await this.authService.handleGoogleOAuthLogin(req.user);

      res.cookie('token', result.accessToken, COOKIE_OPTIONS);
      res.cookie('user_role', result.user.role, {
        ...COOKIE_OPTIONS,
        httpOnly: false,
      });
      res.cookie('account_type', result.user.accountType, {
        ...COOKIE_OPTIONS,
        httpOnly: false,
      });

      return res.redirect(`${frontendUrl}/dashboard`);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Google authentication failed';
      return res.redirect(
        `${frontendUrl}/login?error=${encodeURIComponent(msg)}`,
      );
    }
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

  // 🔑 FORGOT PASSWORD RESET
  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.resetPassword(dto);

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

    res.cookie('account_type', 'INSTITUTIONAL', {
      ...COOKIE_OPTIONS,
      httpOnly: false,
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

    res.cookie('account_type', 'INDIVIDUAL', {
      ...COOKIE_OPTIONS,
      httpOnly: false,
    });

    return result;
  }
}