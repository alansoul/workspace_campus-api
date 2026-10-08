import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaService } from './prisma.service.js';
import { IamModule } from './modules/iam/iam.module.js';
import { UniversityModule } from './modules/university/university.module.js';
import { FreelanceModule } from './modules/freelance/freelance.module.js';
import { ChatModule } from './modules/chat/chat.module.js';

@Module({
  imports: [IamModule, UniversityModule, FreelanceModule, ChatModule],
  controllers: [AppController],
  providers: [AppService, PrismaService],
  exports: [PrismaService],
})
export class AppModule {}