import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { Redis } from '@upstash/redis';
import * as crypto from 'crypto';

interface OtpRecord {
  code: string;
  attempts: number;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private redis: Redis | null = null;
  private inMemoryFallback = new Map<string, { code: string; expiresAt: number; attempts: number }>();

  constructor() {
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      this.redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      this.logger.log('Connected to Upstash Redis for OTP storage');
    } else {
      this.logger.warn('Redis credentials not found. Falling back to in-memory store (Local dev only)');
    }
  }

  async generateAndSaveOtp(email: string): Promise<string> {
    const key = `otp:${email.toLowerCase().trim()}`;
    const otp = crypto.randomInt(100000, 999999).toString();
    const ttlSeconds = 600; // 10 minutes

    if (this.redis) {
      const existing = await this.redis.get<OtpRecord>(key);
      if (existing && existing.attempts >= 5) {
        throw new BadRequestException('Too many verification attempts. Please wait 10 minutes.');
      }
      await this.redis.set(key, { code: otp, attempts: 0 }, { ex: ttlSeconds });
    } else {
      const existing = this.inMemoryFallback.get(key);
      if (existing && existing.attempts >= 5 && existing.expiresAt > Date.now()) {
        throw new BadRequestException('Too many verification attempts. Please wait 10 minutes.');
      }
      this.inMemoryFallback.set(key, {
        code: otp,
        expiresAt: Date.now() + ttlSeconds * 1000,
        attempts: 0,
      });
    }

    this.logger.log(`Verification code generated for ${email}`);
    return otp;
  }

  async verifyOtp(email: string, inputOtp: string): Promise<boolean> {
    const key = `otp:${email.toLowerCase().trim()}`;
    const trimmedInput = inputOtp.trim();

    if (this.redis) {
      const record = await this.redis.get<OtpRecord>(key);
      if (!record) return false;

      // Lockout gate
      if (record.attempts >= 5) {
        await this.redis.del(key);
        throw new BadRequestException('Maximum verification attempts exceeded. Request a new code.');
      }

      if (record.code !== trimmedInput) {
        await this.redis.set(key, { ...record, attempts: record.attempts + 1 }, { keepTtl: true });
        return false;
      }

      // One-time use: Delete immediately upon success
      await this.redis.del(key);
      return true;
    }

    // Fallback logic
    const record = this.inMemoryFallback.get(key);
    if (!record || record.expiresAt < Date.now()) return false;

    if (record.attempts >= 5) {
      this.inMemoryFallback.delete(key);
      throw new BadRequestException('Maximum verification attempts exceeded. Request a new code.');
    }

    if (record.code !== trimmedInput) {
      record.attempts += 1;
      return false;
    }

    this.inMemoryFallback.delete(key);
    return true;
  }
}