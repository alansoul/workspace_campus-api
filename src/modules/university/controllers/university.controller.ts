// campus-api/src/modules/university/controllers/university.controller.ts
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

// 🟢 ADD THESE TWO INTERFACES:
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

@Controller(['university', 'universities'])
export class UniversityController {
  constructor(
    private readonly universityService: UniversityService,
    private readonly emailSyncService: CampusEmailSyncService,
  ) {}



 // 1. Google Gmail Sync Status (Queried per-user from PostgreSQL)
  @Get('auth/google-gmail/status')
  @UseGuards(JwtAuthGuard)
  async getGmailStatus(@CurrentUser() user: AuthenticatedUser) {
    const credential = await this.universityService.getUserGmailCredential(user.sub);
    return {
      connected: Boolean(credential?.accessToken || credential?.refreshToken),
      email: credential?.email || null,
    };
  }

  // 2. Generate Google OAuth URL (Dynamic user state & hint)
  @Get('auth/google-gmail/connect-url')
  @UseGuards(JwtAuthGuard)
  getGmailConnectUrl(@CurrentUser() user: AuthenticatedUser) {
    const { clientId, redirectUri } = getGoogleGmailCredentials();

    const scopes = encodeURIComponent(
      [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
      ].join(' '),
    );

    const loginHintParam = user.email ? `&login_hint=${encodeURIComponent(user.email)}` : '';

    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri,
    )}&response_type=code&scope=${scopes}&access_type=offline&prompt=consent&state=${user.sub}${loginHintParam}`;

    return { url };
  }

  // 3. Google OAuth Redirect Callback: Native Token Exchange & Database Persistence
  @Get('auth/google-gmail/callback')
  async handleGmailCallback(
    @Query('code') code: string,
    @Query('state') stateUserId: string,
    @Res() res: Response,
  ) {
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
        };

        if (tokenData.access_token && stateUserId) {
          // Fetch the actual authenticated email dynamically from Google API
          let userEmail: string | undefined;
          try {
            const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
              headers: { Authorization: `Bearer ${tokenData.access_token}` },
            });
            if (profileRes.ok) {
              const profile = (await profileRes.json()) as { email?: string };
              userEmail = profile.email;
            }
          } catch (e) {
            console.warn('Could not fetch user profile from Google:', e);
          }

          // Persist credentials per-user in PostgreSQL
          await this.universityService.saveGmailCredentials(stateUserId, {
            email: userEmail,
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresIn: tokenData.expires_in,
          });
        }
      }
    } catch (err) {
      console.error('OAuth code exchange failed:', err);
    }

    let frontendUrl = process.env.FRONTEND_URL || 'https://workspace-campus-web.vercel.app';
    if (!frontendUrl.startsWith('http://') && !frontendUrl.startsWith('https://')) {
      frontendUrl = `https://${frontendUrl}`;
    }
    frontendUrl = frontendUrl.replace(/\/+$/, '');

    return res.redirect(`${frontendUrl}/academics?gmail_connected=true`);
  }

  // 4. Live Ingestion: Scans Past 30 Days using the authenticated user's DB credentials
  @Post('email-sync/run')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async syncUniversityEmail(
    @CurrentUser() user: AuthenticatedUser,
    @Body() payload: { emails?: any[] },
  ) {
    const credential = await this.universityService.getUserGmailCredential(user.sub);
    let accessToken = credential?.accessToken;
    const refreshToken = credential?.refreshToken;

    if (!accessToken && !refreshToken) {
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
          await this.universityService.saveGmailCredentials(user.sub, {
            email: credential?.email || undefined,
            accessToken: refreshedToken,
            refreshToken,
          });

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

        const msgTimeMs = detailData.internalDate ? Number(detailData.internalDate) : Date.now();
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
    return this.universityService.getEvents(user.universityId, user.sub);
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

  @Post('attendance/adjust')
  @UseGuards(JwtAuthGuard)
  adjustAttendance(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { subjectName: string; attended: number; total: number },
  ) {
    return this.universityService.adjustAttendance(
      user.universityId,
      user.sub,
      body.subjectName,
      body.attended,
      body.total,
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

  // Dynamic AI Timetable Parser configured for Gemini 3.5 Flash-Lite
  @Post('timetable/parse-document')
  @UseGuards(JwtAuthGuard)
  async parseTimetableDocument(
    @Body() body: { fileBase64: string; mimeType: string; branch?: string; semester?: number },
  ) {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();

    if (!apiKey) {
      return { success: false, error: 'GEMINI_API_KEY is missing from Render Environment Variables.' };
    }

    const branch = body.branch || 'CSE';
    const semester = body.semester || 1;

    const prompt = `You are an academic schedule extractor. Analyze this uploaded timetable document.
Target: B.Tech Semester ${semester} - ${branch} (Room 138).
1. Match slot letters in the timetable grid (Slot A, Slot Z, Slot B, Slot L, Slot F, Slot P, Slot E, ILC, Music, Yoga) with the legend table at the bottom of the page.
2. Resolve each slot into its full Subject name and Faculty name (e.g. Slot Z is Calculas by Dr. P P Paltani, Slot B is Programming with C by Dr. Ruhul, Slot L is Digital Electronics using Verilog by Dr. Manoj, Slot F is Internet of Things by Dr. Abhishek).
3. Include Monday through Friday.
4. Derive unique subjects with code, faculty, and classesPerWeek.

Return ONLY a strict raw JSON object with this exact structure (no markdown fences, no backticks, no comments):
{
  "institution": "Dr. Shyama Prasad Mukherjee IIIT Naya Raipur",
  "roomNo": "Room 138",
  "effectiveDate": "24/08/2026",
  "timetable": [
    {
      "day": "Monday",
      "dateStr": "Day 1",
      "isToday": false,
      "classCount": 8,
      "slots": [
        {
          "id": "slot-mon-1",
          "subjectName": "Music",
          "code": "CL101",
          "type": "Theory",
          "startTime": "09:00",
          "endTime": "09:55",
          "room": "Room 138",
          "faculty": "Dr. Darash",
          "isToday": false
        }
      ]
    }
  ],
  "subjects": [
    {
      "id": "sub-1",
      "name": "Linear Algebra & Matrix Analysis",
      "code": "MA102",
      "faculty": "Dr. Mithilesh",
      "classesPerWeek": 4,
      "credits": 4,
      "assignmentsCount": 2,
      "filesCount": 4,
      "unitsCompleted": 1,
      "totalUnits": 4,
      "attendancePct": 85
    }
  ]
}`;

    // Clean base64 string
    const cleanBase64 = (body.fileBase64 || '')
      .replace(/^data:.*?;base64,/, '')
      .replace(/[\r\n\s]/g, '');

    const requestPayload = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: body.mimeType || 'application/pdf',
                data: cleanBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    };

    // Models supported by your active Google AI key
    const verifiedModels = [
      'gemini-3.5-flash-lite',
      'gemini-flash-lite-latest',
      'gemini-2.5-flash-lite',
      'gemini-3.5-flash',
    ];

    let lastError = 'Unable to parse timetable with Google AI.';

    for (const model of verifiedModels) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': apiKey,
            },
            body: JSON.stringify(requestPayload),
          },
        );

        const json = await response.json();

        if (json.error) {
          lastError = `Google (${model}): ${json.error.message || json.error.status}`;
          continue;
        }

        const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const cleanJson = rawText
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/```\s*$/, '')
            .trim();

          const parsed = JSON.parse(cleanJson);
          return {
            success: true,
            data: parsed,
          };
        }
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : 'Request failed';
      }
    }

    return { success: false, error: lastError };
  }
}