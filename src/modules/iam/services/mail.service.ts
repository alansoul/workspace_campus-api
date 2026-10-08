import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private resend: Resend | null = null;
  private readonly fromEmail: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      this.resend = new Resend(apiKey);
      this.logger.log('✅ Enterprise MailService initialized with Resend');
    } else {
      this.logger.warn(
        '⚠️ RESEND_API_KEY not found. Emails will be logged to server console only.',
      );
    }

    this.fromEmail =
      process.env.EMAIL_FROM || 'Campus Workspace <onboarding@resend.dev>';
  }

  async sendVerificationOtp(email: string, otp: string): Promise<boolean> {
    // 1. Always log to secure server console for audit/staging tracing
    this.logger.log(`🔑 [SECURITY AUDIT] OTP for ${email}: ${otp}`);

    if (!this.resend) {
      this.logger.warn(
        `Email dispatch skipped for ${email} (RESEND_API_KEY missing). Use OTP from logs above.`,
      );
      return false;
    }

    const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f8fafc; padding: 40px 20px; }
          .container { max-width: 520px; margin: 0 auto; background: #131b2e; border: 1px solid #1e293b; border-radius: 16px; padding: 36px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
          .header { text-align: center; margin-bottom: 24px; }
          .header h1 { font-size: 20px; font-weight: 700; color: #38bdf8; margin: 0; }
          .header p { font-size: 13px; color: #94a3b8; margin-top: 4px; }
          .otp-box { background: #0b0f19; border: 1px solid #334155; border-radius: 12px; padding: 20px; text-align: center; margin: 28px 0; }
          .otp-code { font-family: 'Courier New', monospace; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #4ade80; }
          .desc { font-size: 14px; line-height: 1.6; color: #cbd5e1; }
          .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #1e293b; font-size: 11px; color: #64748b; text-align: center; }
          .badge { display: inline-block; background: rgba(56, 189, 248, 0.1); color: #38bdf8; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; margin-bottom: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <span class="badge">Official Institutional Gateway</span>
            <h1>Campus Workspace</h1>
            <p>Single Sign-On Security Verification</p>
          </div>
          <p class="desc">Hello,</p>
          <p class="desc">Your verification code for institutional account authentication is provided below. Enter this 6-digit code in the portal to verify your domain identity:</p>
          
          <div class="otp-box">
            <div class="otp-code">${otp}</div>
          </div>

          <p class="desc" style="font-size: 12px; color: #94a3b8;">
            ⏱️ <strong>This code expires in 10 minutes</strong> and can only be used once.<br>
            🔒 If you did not initiate this request, you can safely disregard this email.
          </p>

          <div class="footer">
            © 2026 Campus Workspace. Multi-tenant Institutional Network.<br>
            Secured with end-to-end domain verification.
          </div>
        </div>
      </body>
    </html>
    `;

    try {
      const response = await this.resend.emails.send({
        from: this.fromEmail,
        to: email,
        subject: `Your Verification Code: ${otp} - Campus Workspace`,
        html: htmlContent,
      });

      this.logger.log(
        `✉️ Verification email dispatched successfully to ${email} (ID: ${response.data?.id})`,
      );
      return true;
    } catch (error) {
      this.logger.error(`❌ Failed to send email to ${email}:`, error);
      return false;
    }
  }
}