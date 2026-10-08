import { Module } from '@nestjs/common';
import { UniversityController } from './controllers/university.controller.js';
import { AdminController } from './controllers/admin.controller.js';
import { UniversityService } from './services/university.service.js';
import { PrismaService } from '../../prisma.service.js';
import { PasswordService } from '../iam/services/password.service.js';
import { OtpService } from '../iam/services/otp.service.js';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard.js';
import { RolesGuard } from '../iam/guards/roles.guard.js';
import { IamModule } from '../iam/iam.module.js';

@Module({
  imports: [IamModule],
  controllers: [UniversityController, AdminController],
  providers: [
    UniversityService,
    PrismaService,
    PasswordService,
    OtpService,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [UniversityService],
})
export class UniversityModule {}