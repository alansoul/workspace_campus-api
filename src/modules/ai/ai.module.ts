import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AiController } from './controllers/ai.controller.js';
import { AiService } from './services/ai.service.js';
import { PrismaService } from '../../prisma.service.js';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'super-secret-key-change-in-production',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AiController],
  providers: [AiService, PrismaService],
  exports: [AiService],
})
export class AiModule {}