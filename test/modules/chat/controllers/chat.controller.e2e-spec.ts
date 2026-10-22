import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../../src/app.module.js';
import { JwtAuthGuard } from '../../../../src/modules/iam/guards/jwt-auth.guard.js';
import { PrismaService } from '../../../../src/prisma.service.js';

describe('ChatController (E2E Integration & LiveKit)', { timeout: 60000 }, () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const mockUser = {
    sub: 'temp-id',
    id: 'temp-id',
    email: 'chat.self.test@iiitnr.edu.in',
    fullName: 'Chat Self Test',
    role: 'STUDENT',
    universityId: 'iiitnr',
  };

  beforeAll(async () => {
    process.env.LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'test-livekit-key';
    process.env.LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'test-livekit-secret-32-characters-min';

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

    prisma = moduleFixture.get<PrismaService>(PrismaService);

    // Retrieve real University UUID to satisfy User_universityId_fkey
    const uni = await prisma.university.findFirst();
    const uniId = uni ? uni.id : null;

    // Ensure a valid user exists in PostgreSQL for direct chat tests
    const user = await prisma.user.upsert({
      where: { email: 'chat.self.test@iiitnr.edu.in' },
      update: { status: 'ACTIVE' },
      create: {
        email: 'chat.self.test@iiitnr.edu.in',
        username: 'chat_self_test_user',
        fullName: 'Chat Self Test',
        role: 'STUDENT',
        status: 'ACTIVE',
        isEmailVerified: true,
        universityId: uniId,
      },
    });

    mockUser.sub = user.id;
    mockUser.id = user.id;
    mockUser.email = user.email;
    mockUser.fullName = user.fullName;
    mockUser.universityId = user.universityId || (uni ? uni.id : 'iiitnr');
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  describe('LiveKit SFU Token Generation', () => {
    it('GET /api/chat/livekit/token — rejects requests missing room query', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/chat/livekit/token');

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Room query parameter is required');
    });

    it('GET /api/chat/livekit/token — issues signed WebRTC access token for valid room', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/chat/livekit/token?room=room-138-lecture&userId=${mockUser.id}&username=Rohan`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(typeof res.body.token).toBe('string');
      expect(res.body.token.split('.').length).toBe(3);
    });
  });

  describe('Channels & Messaging', () => {
    let createdChannelId = '';

    it('GET /api/chat/channels — retrieves public campus discussion channels', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/chat/channels?userId=${mockUser.id}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('POST /api/chat/channels — creates a new campus channel', async () => {
      const uniqueChannelName = `study-group-${Date.now()}`;
      const res = await request(app.getHttpServer())
        .post('/api/chat/channels')
        .send({
          name: uniqueChannelName,
          description: 'E2E Testing Study Group',
          userId: mockUser.id,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe(uniqueChannelName);
      createdChannelId = res.body.id;
    });

    it('GET /api/chat/channels/:channelId/messages — retrieves message history', async () => {
      if (!createdChannelId) return;

      const res = await request(app.getHttpServer())
        .get(`/api/chat/channels/${createdChannelId}/messages?limit=20`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('POST /api/chat/direct — rejects direct chat with oneself', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/chat/direct')
        .send({
          currentUserId: mockUser.id,
          friendEmail: mockUser.email,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('cannot create a direct chat with yourself');
    });
  });

  describe('File Upload Pipeline', () => {
    it('POST /api/chat/upload — rejects requests with no file attached', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/chat/upload');

      expect(res.status).toBe(400);
    });

    it('POST /api/chat/upload — successfully ingests file and returns media metadata', async () => {
      const dummyFileBuffer = Buffer.from('Testing file upload buffer in Vitest');

      const res = await request(app.getHttpServer())
        .post('/api/chat/upload')
        .attach('file', dummyFileBuffer, 'syllabus-test.txt');

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('fileUrl');
      expect(res.body).toHaveProperty('fileName', 'syllabus-test.txt');
      expect(res.body).toHaveProperty('fileType', 'DOCUMENT');
    });
  });
});