import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma.service.js';

export interface RawCampusEmail {
  id: string;
  sender: string;
  subject: string;
  body: string;
  receivedAt: string;
  attachmentName?: string;
}

export interface ExtractedAcademicItem {
  category: 'NOTICE' | 'EVENT' | 'EXAM' | 'TASK';
  title: string;
  summary: string;
  targetBranch?: string;
  targetSemester?: number;
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  dateStr?: string;
  venue?: string;
}

@Injectable()
export class CampusEmailSyncService {
  private readonly logger = new Logger(CampusEmailSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Parses incoming emails via Gemini AI (or intelligent pattern matching fallback)
   */
  async processCampusEmail(
    universityId: string,
    email: RawCampusEmail,
  ): Promise<ExtractedAcademicItem> {
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      try {
        const prompt = `
You are an Academic Intelligence Agent for a University Workspace.
Analyze the following official university email and convert it into a structured JSON record.

Email Details:
Sender: ${email.sender}
Subject: ${email.subject}
Date: ${email.receivedAt}
Body:
${email.body}

Return ONLY a valid JSON object matching this schema without markdown:
{
  "category": "NOTICE" | "EVENT" | "EXAM" | "TASK",
  "title": "Clean, concise headline",
  "summary": "1-2 sentence student-friendly summary",
  "targetBranch": "CSE" | "ECE" | "ALL",
  "targetSemester": 1,
  "urgency": "HIGH" | "MEDIUM" | "LOW",
  "dateStr": "e.g. 19 Oct 2026",
  "venue": "Room or lab name, or null"
}
`;

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
            }),
          },
        );

        if (response.ok) {
          const data = (await response.json()) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          };
          const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const cleanJson = rawText.replace(/```json|```/g, '').trim();
          const parsed = JSON.parse(cleanJson) as ExtractedAcademicItem;
          this.logger.log(`Gemini parsed email: ${parsed.title}`);
          return parsed;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Gemini AI fallback triggered: ${msg}`);
      }
    }

    // Resilient rule-based categorization fallback
    const isExam = /exam|quiz|datesheet|mid-sem/i.test(email.subject + email.body);
    const isEvent = /hackathon|bootcamp|club|seminar|sports|league/i.test(email.subject + email.body);
    const isTask = /assignment|submission|deadline/i.test(email.subject + email.body);

    const category: ExtractedAcademicItem['category'] = isExam
      ? 'EXAM'
      : isEvent
        ? 'EVENT'
        : isTask
          ? 'TASK'
          : 'NOTICE';

    return {
      category,
      title: email.subject,
      summary: email.body.slice(0, 160).trim() + '...',
      targetBranch: 'ALL',
      targetSemester: 1,
      urgency: /urgent|important|compulsory/i.test(email.body) ? 'HIGH' : 'MEDIUM',
      dateStr: new Date(email.receivedAt).toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
      venue: email.body.match(/Lab \d|Room \d+|Auditorium|Sports Complex/i)?.[0] || undefined,
    };
  }
}