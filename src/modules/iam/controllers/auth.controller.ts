// campus-api/src/modules/iam/controllers/auth.controller.ts
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

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? ('none' as const) : ('lax' as const),
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
};

function sanitizeFrontendUrl(rawUrl?: string): string {
  let url = (rawUrl || 'http://localhost:3000').trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  return url.replace(/\/+$/, '');
}

@Controller(['auth', 'iam'])
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('resolve-domain')
  @HttpCode(HttpStatus.OK)
  resolveDomain(
    @Query('email') email?: string,
    @Query('domain') domain?: string,
  ) {
    return this.authService.resolveDomain(email || domain || '');
  }

  // 🌐 GOOGLE OAUTH: Step 1 - Redirect user to Google consent screen
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth() {}

  // 🌐 GOOGLE OAUTH: Step 2 - Callback after user approves
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthCallback(@Req() req: any, @Res() res: Response) {
    const frontendUrl = sanitizeFrontendUrl(process.env.FRONTEND_URL);

    try {
      const result = await this.authService.handleGoogleOAuthLogin(req.user);

      // Set fallback cookies on the API domain
      res.cookie('token', result.accessToken, COOKIE_OPTIONS);
     

      // Redirect directly to /login with token for Vercel first-party cookie hydration
      const targetUrl = new URL('/login', frontendUrl);
      targetUrl.searchParams.set('token', result.accessToken);
      targetUrl.searchParams.set('role', result.user.role);
      targetUrl.searchParams.set('accountType', result.user.accountType);
      targetUrl.searchParams.set('redirect', '/dashboard');

      return res.redirect(targetUrl.toString());
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Google authentication failed';
      return res.redirect(
        `${frontendUrl}/login?error=${encodeURIComponent(msg)}`,
      );
    }
  }

  @Post(['request-otp', 'otp/request'])
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestOtp(dto);
  }

  @Post(['verify-otp', 'otp/verify'])
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyOtp(dto);

    if (result.requiresPasswordSetup) {
      const {
        accessToken: _accessToken,
        token: _token,
        ...safeData
      } = result as any;
      return safeData;
    }

    const { accessToken, token: _token, ...safeData } = result as any;

    if (accessToken) {
      res.cookie('token', accessToken, COOKIE_OPTIONS);
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
    }

    const {
      accessToken: _accessToken,
      token: _token,
      ...safeData
    } = result as any;
    return safeData;
  }

  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.resetPassword(dto);

    if (result.accessToken) {
      res.cookie('token', result.accessToken, COOKIE_OPTIONS);
    }

    const {
      accessToken: _accessToken,
      token: _token,
      ...safeData
    } = result as any;
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
    }

    const {
      accessToken: _accessToken,
      token: _token,
      ...safeData
    } = result as any;
    return safeData;
  }

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

  @Post('campus/link/verify')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async verifyLinkCampus(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LinkCampusVerifyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, ...safeResult } =
      await this.authService.verifyLinkCampus(
        user.sub,
        dto.institutionalEmail,
        dto.otp,
      );

    if (accessToken) {
      res.cookie('token', accessToken, COOKIE_OPTIONS);
    }

    return safeResult;
  }

  @Post('verify-and-register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  async verifyAndRegister(
    @Body() dto: VerifyAndRegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, token: _token, ...safeData } =
      await this.authService.verifyAndRegister(dto);

    res.cookie('token', accessToken, COOKIE_OPTIONS);

    return safeData;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.authService.getProfile(user.sub, user.email);
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

  @Post('campus/unlink')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async unlinkCampus(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, ...safeResult } =
      await this.authService.unlinkCampus(user.sub);

    if (accessToken) {
      res.cookie('token', accessToken, COOKIE_OPTIONS);
    }

    res.cookie('account_type', 'INDIVIDUAL', {
      ...COOKIE_OPTIONS,
      httpOnly: false,
    });

    return safeResult;
  }
}

export default AuthController;