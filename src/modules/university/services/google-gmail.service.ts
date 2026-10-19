import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma.service.js';

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailPart {
  filename?: string;
  mimeType?: string;
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailPart[];
}

export interface ExtractedEmailAttachment {
  filename: string;
  mimeType: string;
  size: number;
  sizeFormatted: string;
  attachmentId?: string;
}

interface GmailMessageDetail {
  id: string;
  threadId?: string;
  internalDate: string;
  snippet?: string;
  labelIds?: string[];
  payload?: {
    headers?: GmailHeader[];
    body?: { data?: string };
    parts?: GmailPart[];
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
   * Cleans raw HTML entities returned by Gmail (e.g. &#39; -> ')
   */
  private cleanHtmlEntities(str: string): string {
    return str
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ');
  }

  /**
   * Recursively parses payload parts to extract file attachments
   */
  private extractAttachmentsFromPayload(payload?: GmailMessageDetail['payload']): ExtractedEmailAttachment[] {
    if (!payload?.parts) return [];
    const attachments: ExtractedEmailAttachment[] = [];

    const traverse = (parts?: GmailPart[]) => {
      if (!parts) return;
      for (const part of parts) {
        if (part.filename && part.filename.trim().length > 0) {
          const rawBytes = part.body?.size || 0;
          const sizeFormatted =
            rawBytes > 1024 * 1024
              ? `${(rawBytes / (1024 * 1024)).toFixed(1)} MB`
              : `${Math.round(rawBytes / 1024) || 1} KB`;

          attachments.push({
            filename: part.filename,
            mimeType: part.mimeType || 'application/octet-stream',
            size: rawBytes,
            sizeFormatted,
            attachmentId: part.body?.attachmentId,
          });
        }
        if (part.parts) {
          traverse(part.parts);
        }
      }
    };

    traverse(payload.parts);
    return attachments;
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
   * Calls Google Gmail API and retrieves strictly campus and academic emails
   * Filters out personal services (GitHub, Google security alerts, social media)
   */
  async fetchRecentInboxEmails(userId: string, maxResults = 25) {
    const accessToken = await this.getValidAccessToken(userId);
    if (!accessToken) return [];

    try {
      // 1. Fetch user email ONCE to construct accurate authuser deep-links without loop overhead
      const userRecord = (await (this.prisma.user as any).findUnique({
        where: { id: userId },
        select: { email: true },
      })) as { email: string } | null;

      const userEmail = userRecord?.email?.toLowerCase().trim();
      const authUserQuery = userEmail ? `?authuser=${encodeURIComponent(userEmail)}` : '';

      // 2. Comprehensive academic query: includes lab, experiment, notes, and circular keywords
      const academicFilter = [
        'label:INBOX',
        '(from:(@iiitnr.edu.in) OR from:(edu.in) OR from:(ac.in) OR subject:(notice OR circular OR timetable OR assignment OR exam OR schedule OR quiz OR attendance OR coursework OR result OR seminar OR lecture OR lab OR experiment OR material OR notes OR syllabus OR project OR workshop))',
        '-from:(github.com)',
        '-from:(accounts.google.com)',
        '-from:(notifications.google.com)',
        '-from:(linkedin.com)',
        '-subject:("security alert")',
        '-subject:("OAuth application")',
      ].join(' ');

      const queryUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(
        academicFilter,
      )}&maxResults=${maxResults}`;

      const listRes = await fetch(queryUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!listRes.ok) return [];

      const listData = (await listRes.json()) as { messages?: Array<{ id: string }> };
      if (!listData.messages || listData.messages.length === 0) return [];

      // 3. Fetch full detail for each email with secondary safety checks
      const emails = [];
      const excludedSenders = ['github.com', 'accounts.google.com', 'no-reply@', 'noreply@'];

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

          // In-memory guard: Skip if sender is an excluded commercial/system service
          const lowerSender = sender.toLowerCase();
          const isSystemSpam = excludedSenders.some((domain) => lowerSender.includes(domain));
          if (isSystemSpam && !lowerSender.includes('iiitnr.edu.in')) {
            continue;
          }

          const rawBody =
            this.extractBodyFromPayload(fullMsg.payload) || fullMsg.snippet || '';
          const decodedBody = this.cleanHtmlEntities(rawBody);
          const attachments = this.extractAttachmentsFromPayload(fullMsg.payload);
          const isUnread = Boolean(fullMsg.labelIds?.includes('UNREAD'));

          const targetId = fullMsg.threadId || msg.id;

          // Valid universal Gmail URL: switches directly to the authenticated campus session
          const gmailUrl = `https://mail.google.com/mail/${authUserQuery}#all/${targetId}`;

          emails.push({
            id: msg.id,
            sender: this.cleanHtmlEntities(sender),
            subject: this.cleanHtmlEntities(subject),
            body: decodedBody,
            attachments,
            gmailUrl,
            isUnread,
            receivedAt: new Date(Number(fullMsg.internalDate) || Date.now()).toISOString(),
          });
        }
      }

      return emails;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to fetch academic emails via Gmail API: ${msg}`);
      return [];
    }
  }
}