import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma.service.js';
import { CreateGigDto } from '../dto/freelance.dto.js';

@Injectable()
export class FreelanceService {
  constructor(private readonly prisma: PrismaService) {}

  async getGigs(universityId: string) {
    return this.prisma.gig.findMany({
      where: { universityId, status: 'OPEN' },
      include: { client: { select: { fullName: true } }, proposals: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createGig(universityId: string, clientId: string, dto: CreateGigDto) {
    return this.prisma.gig.create({
      data: {
        title: dto.title,
        description: dto.description,
        budget: dto.budget,
        category: dto.category,
        clientId,
        universityId,
      },
      include: { client: { select: { fullName: true } } },
    });
  }
}