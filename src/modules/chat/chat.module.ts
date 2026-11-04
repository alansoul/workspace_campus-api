import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ChatGateway } from './chat.gateway.js';
import { ChatService } from './chat.service.js';
import { ChatController } from './chat.controller.js';
import { PrismaService } from '../../prisma.service.js';
import { JwtAuthGuard } from '../iam/guards/jwt-auth.guard.js';

@Module({
  imports: [
    JwtModule.register({}),
  ],
  controllers: [ChatController],
  providers: [
    ChatGateway,
    ChatService,
    PrismaService,
    JwtAuthGuard,
  ],
  exports: [ChatGateway, ChatService],
})
export class ChatModule {}