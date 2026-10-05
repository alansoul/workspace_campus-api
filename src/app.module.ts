import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Module({
  imports: [],
  controllers: [],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}