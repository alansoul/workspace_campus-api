import { Module } from '@nestjs/common';
import { IamModule } from '../iam/iam.module.js';
import { FreelanceController } from './controllers/freelance.controller.js';
import { FreelanceService } from './services/freelance.service.js';
import { PrismaService } from '../../prisma.service.js';

@Module({
  imports: [IamModule],
  controllers: [FreelanceController],
  providers: [FreelanceService, PrismaService],
  exports: [FreelanceService],
})
export class FreelanceModule {}