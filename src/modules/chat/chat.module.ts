import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ChatGateway } from './chat.gateway.js';
import { ChatService } from './chat.service.js';
import { ChatController } from './chat.controller.js';
import { PrismaService } from '../../prisma.service.js';

@Module({
  imports: [
    JwtModule.register({}),
  ],
  controllers: [ChatController],
  providers: [
    ChatGateway,
    ChatService,
    PrismaService,
  ],
  exports: [ChatGateway, ChatService],
})
export class ChatModule {}