import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../../../src/app.module.js';
import { JwtAuthGuard } from '../../../../src/modules/iam/guards/jwt-auth.guard.js';

describe('UniversityController (E2E API Verification)', { timeout: 60000 }, () => {
  let app: INestApplication;

  const mockUser = {
    sub: 'test-admin-uuid',
    id: 'test-admin-uuid',
    email: 'admin@iiitnr.edu.in',
    fullName: 'Test Admin',
    role: 'ADMIN',
    universityId: 'iiitnr',
  };

  // Allow up to 60 seconds for AppModule and Neon PostgreSQL connection to boot
  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Bypass JWT authentication with an authorized test admin session
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
  }, 60000);

  
  afterAll(async () => {
    await app.close();
  });

  // ==========================================
  // 1. TIMETABLE PERSISTENCE & SYNC
  // ==========================================
  describe('Timetable System', () => {
    const mockSchedule = [
      {
        day: 'Monday',
        dateStr: 'Day 1',
        isToday: false,
        classCount: 1,
        slots: [
          {
            id: 'slot-test-1',
            subjectName: 'Operating Systems',
            code: 'CS102',
            type: 'Theory',
            startTime: '09:00',
            endTime: '09:55',
            room: 'Room 138',
            faculty: 'Dr. Test Faculty',
          },
        ],
      },
    ];

    it('POST /api/universities/timetable — should persist new timetable to database', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/universities/timetable')
        .send({
          branch: 'CSE',
          semester: 1,
          schedule: mockSchedule,
          roomNo: 'Room 138',
          effectiveDate: '24/08/2026',
          universityId: 'iiitnr',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('data');
    });

    it('GET /api/universities/timetable — should retrieve persistent timetable', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/universities/timetable?branch=CSE&semester=1&universityId=iiitnr');

      expect(res.status).toBe(200);
      expect(res.body).toBeDefined();
      expect(Array.isArray(res.body.schedule)).toBe(true);
    });
  });

  // ==========================================
  // 2. CAMPUS NOTICES & CIRCULARS
  // ==========================================
  describe('Campus Notices', () => {
    it('POST /api/universities/notices — should create a new circular', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/universities/notices')
        .send({
          title: 'Automated E2E Test Notice',
          category: 'Circular',
          summary: 'Testing end-to-end notice broadcasting.',
          isImportant: true,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.title).toBe('Automated E2E Test Notice');
    });

    it('GET /api/universities/notices — should list all university notices', async () => {
      const res = await request(app.getHttpServer()).get('/api/universities/notices');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ==========================================
  // 3. CAMPUS EVENTS
  // ==========================================
  describe('Campus Events', () => {
    let createdEventId = '';

    it('POST /api/universities/events — should create an event', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/universities/events')
        .send({
          title: 'Campus Hackathon 2026',
          category: 'Club',
          description: 'Testing event creation',
          dateTimeStr: 'Tomorrow · 10:00 AM',
          venue: 'Auditorium',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      createdEventId = res.body.id;
    });

    it('GET /api/universities/events — should list active events', async () => {
      const res = await request(app.getHttpServer()).get('/api/universities/events');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('POST /api/universities/events/:id/interest — should register user RSVP', async () => {
      if (!createdEventId) return;
      const res = await request(app.getHttpServer())
        .post(`/api/universities/events/${createdEventId}/interest`)
        .send({ interested: true });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('isInterested', true);
    });
  });

  // ==========================================
  // 4. ASSIGNMENTS & COURSEWORK
  // ==========================================
  describe('Assignments', () => {
    it('GET /api/universities/assignments — should list coursework assignments', async () => {
      const res = await request(app.getHttpServer()).get('/api/universities/assignments');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('PATCH /api/universities/assignments/:id/status — should update assignment status', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/universities/assignments/asg-1/status')
        .send({ status: 'Completed' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'Completed');
    });
  });

  // ==========================================
  // 5. ATTENDANCE ANALYTICS
  // ==========================================
  describe('Attendance Tracking', () => {
    it('POST /api/universities/attendance/log — should log a class attendance', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/universities/attendance/log')
        .send({ subjectName: 'Software Engineering', attended: true });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('subject', 'Software Engineering');
      expect(res.body.attended).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/universities/attendance — should return attendance records', async () => {
      const res = await request(app.getHttpServer()).get('/api/universities/attendance');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('POST /api/universities/attendance/adjust — should manually adjust attendance numbers', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/universities/attendance/adjust')
        .send({ subjectName: 'Software Engineering', attended: 8, total: 10 });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('attendancePct', 80);
    });
  });

  // ==========================================
  // 6. LECTURE NOTES & QUESTIONS
  // ==========================================
  describe('Lecture Drive & Forum', () => {
    it('GET /api/universities/notes — should return lecture documents', async () => {
      const res = await request(app.getHttpServer()).get('/api/universities/notes?branch=CSE&semester=1');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /api/universities/questions — should return question forum posts', async () => {
      const res = await request(app.getHttpServer()).get('/api/universities/questions');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  // ==========================================
  // 7. RESOURCES & MCP INTEGRATION STATUS
  // ==========================================
  describe('Resources & Integrations', () => {
    it('GET /api/universities/resources — should return faculty and lost-found items', async () => {
      const res = await request(app.getHttpServer()).get('/api/universities/resources');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('faculty');
      expect(res.body).toHaveProperty('lostItems');
    });

    it('GET /api/universities/auth/google-gmail/status — should query user Gmail integration status', async () => {
      const res = await request(app.getHttpServer()).get('/api/universities/auth/google-gmail/status');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('connected');
    });

    it('GET /api/universities/auth/google-gmail/connect-url — should generate OAuth redirect link', async () => {
      const res = await request(app.getHttpServer()).get('/api/universities/auth/google-gmail/connect-url');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('url');
      expect(res.body.url).toContain('accounts.google.com');
    });
  });
});