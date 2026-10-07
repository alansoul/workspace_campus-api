import { Module } from '@nestjs/common';
import { UniversityController } from './controllers/university.controller.js';
import { UniversityService } from './services/university.service.js';
import { PrismaService } from '../../prisma.service.js';
import { PasswordService } from '../iam/services/password.service.js';
import { OtpService } from '../iam/services/otp.service.js';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard.js';

@Module({
  controllers: [UniversityController],
  providers: [
    UniversityService,
    PrismaService,
    PasswordService,
    OtpService,
    JwtAuthGuard,
  ],
  exports: [UniversityService],
})
export class UniversityModule {}