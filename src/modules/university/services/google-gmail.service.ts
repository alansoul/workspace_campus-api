import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma.service.js';

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

interface GmailMessageDetail {
  id: string;
  internalDate: string;
  snippet?: string;
  labelIds?: string[];
  payload?: {
    headers?: GmailHeader[];
    body?: { data?: string }; // <-- Added body
    parts?: GmailPart[];       // <-- Added parts
  };
}

@Injectable()
export class GoogleGmailService {
  private readonly logger = new Logger(GoogleGmailService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to decode Base64URL encoded Gmail message body
   */
  private decodeBase64Url(data: string): string {
    try {
      const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
      return Buffer.from(base64, 'base64').toString('utf-8');
    } catch {
      return '';
    }
  }

  /**
   * Recursively extracts plain text body from nested Gmail payload parts
   */
  private extractBodyFromPayload(payload?: GmailMessageDetail['payload']): string {
    if (!payload) return '';
    if (payload.body?.data) {
      return this.decodeBase64Url(payload.body.data);
    }
    if (payload.parts && payload.parts.length > 0) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          return this.decodeBase64Url(part.body.data);
        }
      }
      for (const part of payload.parts) {
        if (part.body?.data) {
          return this.decodeBase64Url(part.body.data);
        }
      }
    }
    return '';
  }

  /**
   * Checks if user has a verified Gmail connection in database
   */
  async getConnectionStatus(userId: string) {
    const user = (await (this.prisma.user as any).findUnique({
      where: { id: userId },
      select: {
        email: true,
        gmailRefreshToken: true,
        gmailConnectedAt: true,
      },
    })) as { email: string; gmailRefreshToken?: string; gmailConnectedAt?: Date } | null;

    const isConnected = Boolean(user?.gmailRefreshToken);
    return {
      connected: isConnected,
      email: isConnected ? user?.email : undefined,
      connectedAt: user?.gmailConnectedAt?.toISOString(),
    };
  }

  /**
   * Generates Google Consent URL with gmail.readonly scope
   */
  getAuthorizationUrl(userId: string): string {
    const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_GMAIL_REDIRECT_URI;
    const scope = encodeURIComponent('https://www.googleapis.com/auth/gmail.readonly');

    return (
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri || '')}&` +
      `response_type=code&` +
      `scope=${scope}&` +
      `access_type=offline&` +
      `prompt=consent&` +
      `state=${userId}`
    );
  }

  /**
   * Exchanges authorization code for tokens and saves to User in database
   */
  async handleCallback(code: string, userId: string) {
    const tokenUrl = 'https://oauth2.googleapis.com/token';

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_GMAIL_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_GMAIL_CLIENT_SECRET || '',
        redirect_uri: process.env.GOOGLE_GMAIL_REDIRECT_URI || '',
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      this.logger.error(`Failed to exchange Google OAuth code: ${err}`);
      throw new Error('Failed to exchange authorization code with Google');
    }

    const tokens = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
    };

    const updateData: Record<string, unknown> = {
      gmailAccessToken: tokens.access_token,
      gmailConnectedAt: new Date(),
    };
    if (tokens.refresh_token) {
      updateData.gmailRefreshToken = tokens.refresh_token;
    }

    await (this.prisma.user as any).update({
      where: { id: userId },
      data: updateData,
    });

    this.logger.log(`Successfully connected real Gmail for user: ${userId}`);
    return true;
  }

  /**
   * Refreshes access token if expired
   */
  async getValidAccessToken(userId: string): Promise<string | null> {
    const user = (await (this.prisma.user as any).findUnique({
      where: { id: userId },
    })) as { gmailAccessToken?: string; gmailRefreshToken?: string } | null;

    if (!user?.gmailRefreshToken) return null;

    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_GMAIL_CLIENT_ID || '',
          client_secret: process.env.GOOGLE_GMAIL_CLIENT_SECRET || '',
          refresh_token: user.gmailRefreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as { access_token: string };
        await (this.prisma.user as any).update({
          where: { id: userId },
          data: { gmailAccessToken: data.access_token },
        });
        return data.access_token;
      }
    } catch {
      this.logger.warn('Token refresh failed, using stored token');
    }

    return user.gmailAccessToken || null;
  }

  /**
   * Calls Google Gmail API and retrieves real emails with full decoded bodies
   */
  async fetchRecentInboxEmails(userId: string, maxResults = 8) {
    const accessToken = await this.getValidAccessToken(userId);
    if (!accessToken) return [];

    try {
      // 1. List messages from INBOX
      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=label:INBOX&maxResults=${maxResults}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (!listRes.ok) return [];

      const listData = (await listRes.json()) as { messages?: Array<{ id: string }> };
      if (!listData.messages || listData.messages.length === 0) return [];

      // 2. Fetch full detail for each email
      const emails = [];
      for (const msg of listData.messages) {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );

        if (msgRes.ok) {
          const fullMsg = (await msgRes.json()) as GmailMessageDetail;
          const headers = fullMsg.payload?.headers || [];
          const subject =
            headers.find((h) => h.name.toLowerCase() === 'subject')?.value || 'No Subject';
          const sender =
            headers.find((h) => h.name.toLowerCase() === 'from')?.value || 'Unknown Sender';
          const decodedBody =
            this.extractBodyFromPayload(fullMsg.payload) || fullMsg.snippet || '';
          const isUnread = Boolean(fullMsg.labelIds?.includes('UNREAD'));

          emails.push({
            id: msg.id,
            sender,
            subject,
            body: decodedBody.slice(0, 3000),
            isUnread,
            receivedAt: new Date(Number(fullMsg.internalDate) || Date.now()).toISOString(),
          });
        }
      }

      return emails;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to fetch emails via Gmail API: ${msg}`);
      return [];
    }
  }
}