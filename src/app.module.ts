import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaService } from './prisma.service.js';
import { IamModule } from './modules/iam/iam.module.js';
import { UniversityModule } from './modules/university/university.module.js';
import { FreelanceModule } from './modules/freelance/freelance.module.js';
import { ChatModule } from './modules/chat/chat.module.js';

@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000, // 1 minute window
      limit: 30,  // max 30 requests per minute globally
    }]),
    IamModule,
    UniversityModule,
    FreelanceModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    PrismaService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [PrismaService],
})
export class AppModule {}