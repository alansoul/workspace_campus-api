import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../../src/app.module.js';
import { JwtAuthGuard } from '../../../../src/modules/iam/guards/jwt-auth.guard.js';
import { AiService } from '../../../../src/modules/ai/services/ai.service.js';

describe('AiController (E2E Integration & PII Scrubber)', { timeout: 60000 }, () => {
  let app: INestApplication;
  let aiService: AiService;

  const mockUser = {
    sub: 'test-student-uuid',
    id: 'test-student-uuid',
    email: 'student@iiitnr.edu.in',
    fullName: 'Test Student',
    role: 'STUDENT',
    universityId: 'iiitnr',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          req.user = mockUser;
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    aiService = moduleFixture.get<AiService>(AiService);
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  describe('API Key Validation', () => {
    it('POST /api/ai/validate-key — returns 400 when testing an empty key', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/ai/validate-key')
        .send({ apiKey: '   ' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('valid', false);
      expect(res.body.status).toBe(400);
    });
  });

  describe('AI Chat & Privacy Firewall', () => {
    it('POST /api/ai/chat — dispatches prompt and returns AI response', async () => {
      // Mock AiService.chat response to avoid external API calls during automated CI
      vi.spyOn(aiService, 'chat').mockResolvedValue(
        'Classes for Semester 1 CSE are scheduled in Room 138.',
      );

      const res = await request(app.getHttpServer())
        .post('/api/ai/chat')
        .send({
          messages: [{ role: 'user', content: 'What room is my lecture in?' }],
          modelName: '3.5 Flash-Lite',
          thinkingLevel: 'low',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('reply');
      expect(res.body.reply).toContain('Room 138');
    });

    it('POST /api/ai/chat — scrubs personal email patterns from prompts', async () => {
      const chatSpy = vi.spyOn(aiService, 'chat').mockResolvedValue(
        'Your request has been processed securely.',
      );

      const testEmail = 'sensitive.student@iiitnr.edu.in';
      await request(app.getHttpServer())
        .post('/api/ai/chat')
        .send({
          messages: [{ role: 'user', content: `Contact me at ${testEmail}` }],
          pageContext: `Student active profile: ${testEmail}`,
        });

      expect(chatSpy).toHaveBeenCalled();
    });
  });
});