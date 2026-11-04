import { Module } from '@nestjs/common';
import { IamModule } from '../iam/iam.module.js';
import { ChatGateway } from './chat.gateway.js';
import { ChatService } from './chat.service.js';
import { ChatController } from './chat.controller.js';
import { PrismaService } from '../../prisma.service.js';

@Module({
  imports: [
    IamModule,
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