import { Module } from '@nestjs/common';
import { FreelanceController } from './controllers/freelance.controller.js';
import { FreelanceService } from './services/freelance.service.js';
import { PrismaService } from '../../prisma.service.js';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard.js';

@Module({
  controllers: [FreelanceController],
  providers: [FreelanceService, PrismaService, JwtAuthGuard],
  exports: [FreelanceService],
})
export class FreelanceModule {}