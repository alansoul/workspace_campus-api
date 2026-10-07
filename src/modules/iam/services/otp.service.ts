import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private inMemoryStore = new Map<string, { code: string; expiresAt: number; attempts: number }>();

  async generateAndSaveOtp(email: string): Promise<string> {
    const key = `otp:${email.toLowerCase().trim()}`;
    const existing = this.inMemoryStore.get(key);

    if (existing && existing.attempts >= 5 && existing.expiresAt > Date.now()) {
      throw new BadRequestException('Too many verification attempts. Please wait 10 minutes.');
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    this.inMemoryStore.set(key, {
      code: otp,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
      attempts: (existing?.attempts || 0) + 1,
    });

    this.logger.log(`🔑 Verification code generated for ${email}`);
    return otp;
  }

  async verifyOtp(email: string, inputOtp: string): Promise<boolean> {
    const key = `otp:${email.toLowerCase().trim()}`;
    const record = this.inMemoryStore.get(key);

    if (!record || record.expiresAt < Date.now()) {
      return false;
    }

    if (record.code !== inputOtp.trim()) {
      record.attempts += 1;
      return false;
    }

    this.inMemoryStore.delete(key);
    return true;
  }
}