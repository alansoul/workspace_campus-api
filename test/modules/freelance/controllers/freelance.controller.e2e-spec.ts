import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../../src/app.module.js';
import { JwtAuthGuard } from '../../../../src/modules/iam/guards/jwt-auth.guard.js';
import { PrismaService } from '../../../../src/prisma.service.js';

describe('FreelanceController (E2E Integration & Gigs)', { timeout: 60000 }, () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const mockUser = {
    sub: 'temp-id',
    id: 'temp-id',
    email: 'freelance.client@iiitnr.edu.in',
    fullName: 'Freelance Client',
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

    prisma = moduleFixture.get<PrismaService>(PrismaService);

    // Ensure university exists
    const uni = await prisma.university.findFirst();
    const uniId = uni ? uni.id : 'iiitnr';

    // Ensure a valid user exists in PostgreSQL to satisfy Gig_clientId_fkey
    const user = await prisma.user.upsert({
      where: { email: 'freelance.client.test@iiitnr.edu.in' },
      update: { status: 'ACTIVE' },
      create: {
        email: 'freelance.client.test@iiitnr.edu.in',
        username: 'freelance_client_test',
        fullName: 'Freelance Client Test',
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
    mockUser.universityId = user.universityId || uniId;
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  describe('Freelance Gig Lifecycle', () => {
    it('GET /api/freelance/gigs — lists open gigs scoped to the student university', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/freelance/gigs');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('POST /api/freelance/gigs — rejects gig with budget below 50 INR minimum floor', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/freelance/gigs')
        .send({
          title: 'Design college event poster',
          description: 'Need a vector poster designed in Figma',
          budget: 20, // Violates @Min(50) rule
          category: 'Design',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([expect.stringContaining('budget must not be less than 50')]),
      );
    });

    it('POST /api/freelance/gigs — creates new gig listing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/freelance/gigs')
        .send({
          title: 'Full-Stack NestJS API Endpoint Refactoring',
          description: 'Need assistance writing Vitest integration tests for API module.',
          budget: 1500,
          category: 'Coding',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.title).toContain('NestJS');
      expect(res.body.budget).toBe(1500);
    });
  });
});