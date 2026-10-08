import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../../../prisma.service.js';

export interface AuthenticatedUser {
  sub: string;
  email: string;
  role: string;
  universityId: string;
  fullName: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    
    // Enterprise Dual Extraction: Cookie first (web browser), Authorization header fallback (API/mobile)
    const token =
      request.cookies?.token ||
      (request.headers.authorization?.startsWith('Bearer ')
        ? request.headers.authorization.split(' ')[1]
        : null);

    if (!token) {
      throw new UnauthorizedException('Authentication token required');
    }

    let payload: AuthenticatedUser;

    try {
      payload = await this.jwtService.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired authentication token');
    }

    // Real-time account and institutional security check against database
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        status: true,
        role: true,
        university: { select: { status: true } },
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Your account has been deactivated or suspended.');
    }

    if (user.university.status !== 'ACTIVE') {
      throw new UnauthorizedException('Your university workspace is currently suspended.');
    }

    // Keep payload role synchronized with current database record
    payload.role = user.role;
    (request as Request & { user: AuthenticatedUser }).user = payload;

    return true;
  }
}