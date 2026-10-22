import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../../src/app.module.js';
import { JwtAuthGuard } from '../../../../src/modules/iam/guards/jwt-auth.guard.js';
import { PrismaService } from '../../../../src/prisma.service.js';

describe('AuthController (E2E Integration & Security)', { timeout: 60000 }, () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const mockUser = {
    sub: 'temp-id',
    id: 'temp-id',
    email: 'admin@iiitnr.edu.in',
    fullName: 'Test System Administrator',
    role: 'ADMIN',
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

    // Find seeded admin or ensure an active test user exists in PostgreSQL
    let user = await prisma.user.findFirst({
      where: { email: 'admin@iiitnr.edu.in' },
    });

    if (!user) {
      user = await prisma.user.upsert({
        where: { email: 'test.auth.user@iiitnr.edu.in' },
        update: { status: 'ACTIVE' },
        create: {
          email: 'test.auth.user@iiitnr.edu.in',
          username: 'test_auth_user',
          fullName: 'Test Auth User',
          role: 'ADMIN',
          status: 'ACTIVE',
          isEmailVerified: true,
          universityId: 'iiitnr',
        },
      });
    }

    mockUser.sub = user.id;
    mockUser.id = user.id;
    mockUser.email = user.email;
    mockUser.fullName = user.fullName;
    mockUser.role = user.role;
    mockUser.universityId = user.universityId || 'iiitnr';
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  describe('Domain Resolution', () => {
    it('GET /api/auth/resolve-domain — identifies registered university domains', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/resolve-domain?email=admin@iiitnr.edu.in');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('allowed', true);
      expect(res.body).toHaveProperty('isUniversity', true);
      expect(res.body).toHaveProperty('university');
      expect(res.body.university.shortCode).toBe('IIITNR');
    });

    it('GET /api/auth/resolve-domain — identifies personal Gmail addresses as individual', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/resolve-domain?email=personal.user@gmail.com');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('allowed', true);
      expect(res.body).toHaveProperty('isGmail', true);
      expect(res.body).toHaveProperty('isUniversity', false);
    });

    it('GET /api/auth/resolve-domain — rejects unregistered commercial domains', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/resolve-domain?email=intruder@unregistered-domain.com');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('allowed', false);
      expect(res.body).toHaveProperty('error', 'DOMAIN_UNREGISTERED');
    });
  });

  describe('Authentication Flow', () => {
    it('POST /api/auth/login — returns 401 on non-existent account or wrong password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@iiitnr.edu.in',
          password: 'IncorrectPassword123!',
        });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('message');
    });

    it('GET /api/auth/me — returns active session profile for authenticated user', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/me');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('user');
      expect(res.body.user.email).toBe(mockUser.email);
    });

    it('POST /api/auth/logout — clears authentication cookies cleanly', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/logout');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message', 'Signed out successfully');
    });
  });
});