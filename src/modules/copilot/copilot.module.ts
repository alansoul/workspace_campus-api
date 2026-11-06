import { Module } from '@nestjs/common';
import { CopilotController } from './controllers/copilot.controller.js';
import { CopilotService } from './services/copilot.service.js';
import { PrismaService } from '../../prisma.service.js';

@Module({
  controllers: [CopilotController],
  providers: [CopilotService, PrismaService],
  exports: [CopilotService],
})
export class CopilotModule {}