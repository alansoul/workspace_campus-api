import {
  Controller,
  Get,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../iam/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../iam/guards/roles.guard.js';
import { Roles } from '../../iam/decorators/roles.decorator.js';
import { CurrentUser } from '../../iam/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../iam/guards/jwt-auth.guard.js';
import { PrismaService } from '../../../prisma.service.js';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('overview')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async getOverview(@CurrentUser() user: AuthenticatedUser) {
    const [university, studentCount, noteCount, gigCount] = await Promise.all([
      this.prisma.university.findUnique({
        where: { id: user.universityId },
        include: { domains: true },
      }),
      this.prisma.user.count({
        where: { universityId: user.universityId, role: 'STUDENT' },
      }),
      this.prisma.note.count({
        where: { universityId: user.universityId },
      }),
      this.prisma.gig.count({
        where: { universityId: user.universityId },
      }),
    ]);

    return {
      university,
      metrics: {
        totalStudents: studentCount,
        totalNotes: noteCount,
        totalGigs: gigCount,
      },
    };
  }

  @Get('users')
  @Roles('ADMIN', 'SUPER_ADMIN')
  async getUsers(@CurrentUser() user: AuthenticatedUser) {
    return this.prisma.user.findMany({
      where: { universityId: user.universityId },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}