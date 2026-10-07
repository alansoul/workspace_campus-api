import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { AuthService } from '../services/auth.service.js';
import { RequestOtpDto, VerifyAndRegisterDto, LoginDto } from '../dto/auth.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('resolve-domain')
  @HttpCode(HttpStatus.OK)
  resolveDomain(@Query('email') email: string) {
    return this.authService.resolveDomain(email || '');
  }

  @Post('request-otp')
  @HttpCode(HttpStatus.OK)
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.authService.requestOtp(dto);
  }

  @Post('verify-and-register')
  @HttpCode(HttpStatus.CREATED)
  verifyAndRegister(@Body() dto: VerifyAndRegisterDto) {
    return this.authService.verifyAndRegister(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}