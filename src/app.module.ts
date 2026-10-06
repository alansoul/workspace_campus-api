import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { IamModule } from './modules/iam/iam.module.js';

@Module({
  imports: [IamModule],
  controllers: [],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}