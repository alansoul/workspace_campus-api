// campus-api/src/modules/iam/services/mail.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null = null;
  private readonly fromEmail: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;

    if (apiKey) {
      this.resend = new Resend(apiKey);
      this.logger.log('✅ Enterprise MailService initialized with Resend');
    } else {
      this.logger.warn(
        '⚠️ RESEND_API_KEY not found in environment. Emails will be logged to console only.',
      );
    }

    // Default to Resend testing address if custom domain is not yet configured
    this.fromEmail =
      process.env.EMAIL_FROM || 'Northstar Workspace <onboarding@resend.dev>';
  }

  /**
   * Dispatches branded single-use verification OTP emails
   */
  async sendVerificationOtp(
    email: string,
    otp: string,
    universityName?: string,
  ): Promise<boolean> {
    const orgTitle = universityName || 'Northstar Workspace';

    // 1. Audit log: Always record to secure backend terminal
    this.logger.log(`🔑 [SECURITY AUDIT] OTP for ${email}: ${otp}`);

    if (!this.resend) {
      this.logger.warn(
        `Email dispatch skipped for ${email} (No RESEND_API_KEY). Use OTP from terminal.`,
      );
      return false;
    }

    // 2. Intelligent Delivery Routing:
    // If using the resend.dev sandbox, route to account owner to prevent 403 errors.
    // In production with a verified domain, deliver directly to the university recipient.
    const isSandbox = this.fromEmail.includes('resend.dev');
    const recipient = isSandbox
      ? process.env.DEV_OVERRIDE_EMAIL || 'alansoul796@gmail.com'
      : email;

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify your institutional account</title>
        <style>
          body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; color: #1e293b; }
          .wrapper { max-width: 560px; margin: 40px auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); }
          .header { background: #0b57d0; padding: 32px 28px; text-align: center; color: #ffffff; }
          .header h1 { margin: 0; font-size: 22px; font-weight: 600; letter-spacing: -0.02em; }
          .header p { margin: 6px 0 0 0; font-size: 13px; opacity: 0.9; }
          .content { padding: 36px 32px; }
          .greeting { font-size: 15px; font-weight: 600; color: #0f172a; margin-bottom: 12px; }
          .desc { font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 28px 0; }
          .otp-card { background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 14px; padding: 22px; text-align: center; margin-bottom: 28px; }
          .otp-code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #0b57d0; display: inline-block; }
          .notice { font-size: 12px; color: #64748b; line-height: 1.5; margin-bottom: 8px; }
          .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px; text-align: center; font-size: 11px; color: #94a3b8; }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="header">
            <h1>${orgTitle}</h1>
            <p>Institutional Domain Security Verification</p>
          </div>
          <div class="content">
            <div class="greeting">Hello,</div>
            <p class="desc">
              A request was made to verify the institutional domain for <strong>${email}</strong>. 
              Enter the single-use verification code below to complete administrative provisioning:
            </p>
            
            <div class="otp-card">
              <span class="otp-code">${otp}</span>
            </div>

            <p class="notice">⏱️ <strong>Expires in 10 minutes:</strong> This code can only be used once.</p>
            <p class="notice">🔒 If you did not initiate this request, you can safely ignore this email.</p>
          </div>
          <div class="footer">
            © 2026 Northstar Workspace. Multi-tenant Institutional Architecture.<br>
            Protected with end-to-end domain isolation.
          </div>
        </div>
      </body>
    </html>
    `;

    try {
      const { data, error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: recipient,
        subject: `${otp} is your ${orgTitle} verification code`,
        html: htmlContent,
      });

      if (error) {
        this.logger.error(`❌ Resend Error: ${error.message} (Status: ${error.name})`);
        return false;
      }

      this.logger.log(`✉️ Email delivered successfully to ${recipient} (Resend ID: ${data?.id})`);
      return true;
    } catch (err: unknown) {
      this.logger.error(`❌ Dispatch exception for ${email}:`, err);
      return false;
    }
  }
}

export default MailService;