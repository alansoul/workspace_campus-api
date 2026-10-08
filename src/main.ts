import 'dotenv/config'; // Top-level import for ESM
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Configure Helmet to allow cross-origin communication between port 3000 and port 4000
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cookieParser());
  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://workspace-campus-web.vercel.app', // Explicit Vercel production origin
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
  ];

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow server-to-server / curl or matching browser origins
      if (!origin || allowedOrigins.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true, // Required for httpOnly cookies and authorization headers
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Requested-With'],
  });

  const port = process.env.PORT || 4000;
  // Explicitly listen on 0.0.0.0 so both IPv4 (127.0.0.1) and IPv6 (localhost) resolve cleanly on Windows
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Campus API running on http://localhost:${port}/api`);
}

bootstrap();