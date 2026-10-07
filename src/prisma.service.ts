import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    let retries = 5;
    while (retries > 0) {
      try {
        await this.$connect();
        this.logger.log('✅ Connected to Neon PostgreSQL');
        break;
      } catch (err) {
        retries -= 1;
        this.logger.warn(
          `⏳ Neon DB is waking up... retrying connection (${5 - retries}/5) in 3s`,
        );
        if (retries === 0) {
          this.logger.error('❌ Failed to connect to Neon PostgreSQL after multiple attempts');
          throw err;
        }
        await new Promise((res) => setTimeout(res, 3000));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}