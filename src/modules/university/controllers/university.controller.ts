// campus-api/src/modules/university/controllers/university.controller.ts
import * as fs from 'fs';
import * as path from 'path';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Res,
  Req,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UniversityService } from '../services/university.service.js';
import { CampusEmailSyncService } from '../services/campus-email-sync.service.js';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../iam/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../iam/guards/jwt-auth.guard.js';
import {
  ClaimUniversityDto,
  RequestUniversityOtpDto,
  CreateNoteDto,
  CreateQuestionDto,
} from '../dto/university.dto.js';
import type { Response, Request } from 'express';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

// Persistent token cache path across server hot-reloads
const SESSION_CACHE_PATH = path.join(process.cwd(), '.gmail_session.json');

interface EmailHeader {
  name?: string;
  value?: string;
}

interface SyncedCampusItem {
  id: string;
  title: string;
  summary: string;
  sender: string;
  receivedAt: string;
  actionType: 'NOTICE' | 'TASK' | 'EVENT' | 'TIMETABLE_UPDATE';
  urgency: 'HIGH' | 'NORMAL';
  isUnread: boolean;
  extractedData?: {
    dueDate?: string;
    venue?: string;
  };
}

interface GmailSessionState {
  connected: boolean;
  email: string | null;
  tokens: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  } | null;
}

function persistSessionToDisk(data: GmailSessionState): void {
  try {
    fs.writeFileSync(SESSION_CACHE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write .gmail_session.json cache:', err);
  }
}

function loadSessionFromDisk(): GmailSessionState | null {
  try {
    if (fs.existsSync(SESSION_CACHE_PATH)) {
      const raw = fs.readFileSync(SESSION_CACHE_PATH, 'utf-8');
      return JSON.parse(raw) as GmailSessionState;
    }
  } catch {}
  return null;
}

// Helper to sanitize variables and strip accidental wrapping quotes from .env
function getGoogleGmailCredentials() {
  const clean = (val?: string) => (val ? val.replace(/^"|"$/g, '').trim() : '');

  const clientId =
    clean(process.env.GOOGLE_GMAIL_CLIENT_ID) ||
    clean(process.env.GOOGLE_CLIENT_ID) ||
    '';

  const clientSecret =
    clean(process.env.GOOGLE_GMAIL_CLIENT_SECRET) ||
    clean(process.env.GOOGLE_CLIENT_SECRET) ||
    '';

  const redirectUri =
    clean(process.env.GOOGLE_GMAIL_REDIRECT_URI) ||
    clean(process.env.GOOGLE_REDIRECT_URI) ||
    clean(process.env.GOOGLE_CALLBACK_URL) ||
    'http://localhost:4000/api/universities/auth/google-gmail/callback';

  return { clientId, clientSecret, redirectUri };
}

async function refreshGoogleAccessToken(refreshToken: string): Promise<string | null> {
  const { clientId, clientSecret } = getGoogleGmailCredentials();
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string };
    return data.access_token || null;
  } catch {
    return null;
  }
}

@Controller('universities')
export class UniversityController {
  constructor(
    private readonly universityService: UniversityService,
    private readonly emailSyncService: CampusEmailSyncService,
  ) {}

  // In-memory token store with persistent disk fallback
  private static gmailSession: GmailSessionState = loadSessionFromDisk() || {
    connected: false,
    email: null,
    tokens: null,
  };

  private static getSession(): GmailSessionState {
    const saved = loadSessionFromDisk();
    if (saved && saved.tokens?.access_token) {
      UniversityController.gmailSession = saved;
    }
    return UniversityController.gmailSession;
  }

  // 1. Google Gmail Sync Status
  @Get('auth/google-gmail/status')
  async getGmailStatus() {
    const session = UniversityController.getSession();
    return {
      connected: Boolean(session.connected && session.tokens?.access_token),
      email: session.email,
    };
  }

  // 2. Generate Google OAuth URL (Targeting rohan26100@iiitnr.edu.in)
  @Get('auth/google-gmail/connect-url')
  getGmailConnectUrl() {
    const { clientId, redirectUri } = getGoogleGmailCredentials();

    const scopes = encodeURIComponent(
      [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
      ].join(' '),
    );

    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri,
    )}&response_type=code&scope=${scopes}&access_type=offline&prompt=consent&hd=iiitnr.edu.in&login_hint=rohan26100@iiitnr.edu.in`;

    return { url };
  }

  // 3. Google OAuth Redirect Callback: Native Token Exchange & Disk Persistence
  @Get('auth/google-gmail/callback')
  async handleGmailCallback(@Query('code') code: string, @Res() res: Response) {
    const { clientId, clientSecret, redirectUri } = getGoogleGmailCredentials();

    try {
      if (code && code !== 'mock_dev_code' && clientId && clientSecret) {
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          }),
        });

        const tokenData = (await tokenResponse.json()) as {
          access_token?: string;
          refresh_token?: string;
          expires_in?: number;
          error?: string;
          error_description?: string;
        };

        if (tokenData.access_token) {
          const sessionState: GmailSessionState = {
            connected: true,
            email: 'rohan26100@iiitnr.edu.in',
            tokens: tokenData,
          };
          UniversityController.gmailSession = sessionState;
          persistSessionToDisk(sessionState);
        } else {
          console.error('OAuth token exchange rejected by Google:', tokenData);
        }
      }
    } catch (err) {
      console.error('OAuth code exchange failed:', err);
    }

    const frontendUrl =
  process.env.FRONTEND_URL || 'https://workspace-campus-web.vercel.app';

return res.redirect(`${frontendUrl}/academics?gmail_connected=true`);
  }

  // 4. Pure Live Ingestion: Scans Past 30 Days and Auto-Prunes Older Updates
  @Post('email-sync/run')
  @HttpCode(HttpStatus.OK)
  async syncUniversityEmail(
    @Req() req: Request,
    @Body() payload: { emails?: any[] },
  ) {
    const session = UniversityController.getSession();
    let accessToken = session.tokens?.access_token;
    const refreshToken = session.tokens?.refresh_token;

    if (!accessToken) {
      return {
        success: false,
        error: 'AUTH_REQUIRED',
        message: 'No Google OAuth token found. Please connect your Gmail account in MCP & Plugins.',
        updates: [],
        extracted: [],
        scannedCount: 0,
        unreadCount: 0,
      };
    }

    try {
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      const cutoffTime = Date.now() - THIRTY_DAYS_MS;

      // Query Gmail strictly for emails received within the last 30 days
      const gmailQuery = encodeURIComponent('in:inbox newer_than:30d');
      let listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=${gmailQuery}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      // Automatic access token renewal on 401 Unauthorized
      if (listRes.status === 401 && refreshToken) {
        const refreshedToken = await refreshGoogleAccessToken(refreshToken);
        if (refreshedToken) {
          accessToken = refreshedToken;
          session.tokens!.access_token = refreshedToken;
          persistSessionToDisk(session);

          listRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=${gmailQuery}`,
            {
              headers: { Authorization: `Bearer ${accessToken}` },
            },
          );
        }
      }

      if (!listRes.ok) {
        const errorBody = await listRes.text();
        return {
          success: false,
          error: 'GMAIL_API_ERROR',
          message: errorBody,
          updates: [],
          extracted: [],
          scannedCount: 0,
          unreadCount: 0,
        };
      }

      const listData = (await listRes.json()) as { messages?: { id: string }[] };
      const messages = listData.messages || [];
      const updates: SyncedCampusItem[] = [];

      for (const msg of messages) {
        const detailRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );

        if (!detailRes.ok) continue;

        const detailData = (await detailRes.json()) as {
          id: string;
          snippet?: string;
          internalDate?: string;
          labelIds?: string[];
          payload?: { headers?: EmailHeader[] };
        };

        // Extract millisecond epoch timestamp directly from Gmail internalDate
        const msgTimeMs = detailData.internalDate ? Number(detailData.internalDate) : Date.now();

        // Enforce 30-day cutoff: omit any email that arrived before the 30-day window
        if (msgTimeMs < cutoffTime) continue;

        const headers: EmailHeader[] = detailData.payload?.headers || [];
        const subject =
          headers.find((h: EmailHeader) => h.name?.toLowerCase() === 'subject')?.value ||
          'Campus Circular';
        const fromRaw =
          headers.find((h: EmailHeader) => h.name?.toLowerCase() === 'from')?.value ||
          'Academic Office';
        const snippet = detailData.snippet || '';

        const cleanSender = fromRaw.replace(/<.*?>/, '').trim() || fromRaw;

        // Semantic Category Router
        let actionType: 'NOTICE' | 'TASK' | 'EVENT' | 'TIMETABLE_UPDATE' = 'NOTICE';
        if (/(due|assignment|homework|submit|submission|lab record|problem sheet)/i.test(subject + snippet)) {
          actionType = 'TASK';
        } else if (/(celebration|garba|hackathon|hack-a-sol|codevita|interview|fest|league|orientation|sports)/i.test(subject + snippet)) {
          actionType = 'EVENT';
        } else if (/(timetable|schedule|rescheduled|venue|room no|timing change)/i.test(subject + snippet)) {
          actionType = 'TIMETABLE_UPDATE';
        }

        updates.push({
          id: `gmail-${detailData.id}`,
          title: subject,
          summary: snippet || `Received from ${cleanSender}`,
          sender: cleanSender,
          receivedAt: new Date(msgTimeMs).toISOString(),
          actionType,
          urgency: /(urgent|important|due tomorrow|schedule|exam|final|compulsory|immediate)/i.test(subject + snippet)
            ? 'HIGH'
            : 'NORMAL',
          isUnread: detailData.labelIds?.includes('UNREAD') ?? false,
          extractedData: {
            dueDate: /(tomorrow|due)/i.test(subject) ? 'Due soon' : undefined,
            venue: /(auditorium|hall|lab|room)/i.test(snippet) ? 'Campus' : undefined,
          },
        });
      }

      return {
        success: true,
        scannedCount: messages.length,
        unreadCount: updates.filter((u) => u.isUnread).length,
        updates,
        extracted: updates,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Error querying Gmail API';
      return {
        success: false,
        error: 'NETWORK_EXCEPTION',
        message: errorMessage,
        updates: [],
        extracted: [],
        scannedCount: 0,
        unreadCount: 0,
      };
    }
  }

  // 5. Authentication & Verification
  @Post('request-otp')
  @HttpCode(HttpStatus.OK)
  requestOtp(@Body() dto: RequestUniversityOtpDto) {
    return this.universityService.requestOtp(dto);
  }

  @Post('claim')
  @HttpCode(HttpStatus.CREATED)
  async claim(
    @Body() dto: ClaimUniversityDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.universityService.claim(dto);
    res.cookie('token', result.accessToken, COOKIE_OPTIONS);
    return result;
  }

  // 6. Campus Notices & WhatsApp Ingestion
  @Get('notices')
  @UseGuards(JwtAuthGuard)
  getNotices(@CurrentUser() user: AuthenticatedUser) {
    return this.universityService.getNotices(user.universityId);
  }

  @Post('notices')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  createNotice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { title: string; category?: string; summary: string; isImportant?: boolean },
  ) {
    return this.universityService.createNotice(user.universityId, user.sub, body);
  }

  // 7. Campus Events
  @Get('events')
  @UseGuards(JwtAuthGuard)
  getEvents(@CurrentUser() user: AuthenticatedUser) {
    return this.universityService.getEvents(user.universityId);
  }

  @Post('events')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  createEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      title: string;
      category?: string;
      description: string;
      dateTimeStr: string;
      venue: string;
      organizer?: string;
      organizerContact?: string;
    },
  ) {
    return this.universityService.createEvent(user.universityId, user.sub, body);
  }

  @Post('events/:id/interest')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  toggleEventInterest(
    @Param('id') id: string,
    @Body() body: { interested: boolean },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.universityService.toggleEventInterest(
      id,
      body.interested,
      {
        id: user.sub,
        fullName: user.fullName,
        email: user.email,
      },
      user.universityId,
    );
  }

  // 8. Assignments & Coursework
  @Get('assignments')
  @UseGuards(JwtAuthGuard)
  getAssignments(@CurrentUser() user: AuthenticatedUser) {
    return this.universityService.getAssignments(user.universityId);
  }

  @Patch('assignments/:id/status')
  @UseGuards(JwtAuthGuard)
  updateAssignmentStatus(
    @Param('id') id: string,
    @Body() body: { status: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.universityService.updateAssignmentStatus(id, body.status, user?.universityId);
  }

  // 9. Attendance Tracking
  @Get('attendance')
  @UseGuards(JwtAuthGuard)
  getAttendance(@CurrentUser() user: AuthenticatedUser) {
    return this.universityService.getAttendance(user.universityId, user.sub);
  }

  @Post('attendance/log')
  @UseGuards(JwtAuthGuard)
  logAttendance(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { subjectName: string; attended: boolean },
  ) {
    return this.universityService.logAttendance(
      user.universityId,
      user.sub,
      body.subjectName,
      body.attended,
    );
  }

  // 10. Academic Notes & Question Forum
  @Get('notes')
  @UseGuards(JwtAuthGuard)
  getNotes(@CurrentUser() user: AuthenticatedUser) {
    return this.universityService.getNotes(user.universityId);
  }

  @Post('notes')
  @UseGuards(JwtAuthGuard)
  createNote(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateNoteDto) {
    return this.universityService.createNote(user.universityId, user.sub, dto);
  }

  @Get('questions')
  @UseGuards(JwtAuthGuard)
  getQuestions(@CurrentUser() user: AuthenticatedUser) {
    return this.universityService.getQuestions(user.universityId);
  }

  @Post('questions')
  @UseGuards(JwtAuthGuard)
  createQuestion(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateQuestionDto) {
    return this.universityService.createQuestion(user.universityId, user.sub, dto);
  }
}