import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { PrismaService } from '../../../prisma.service.js';
import { PasswordService } from '../../iam/services/password.service.js';
import { OtpService } from '../../iam/services/otp.service.js';
import {
  ClaimUniversityDto,
  RequestUniversityOtpDto,
  CreateNoteDto,
  CreateQuestionDto,
} from '../dto/university.dto.js';

const BLOCKED_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'proton.me',
  'aol.com',
]);

/**
 * Ensures claimed domains match or are explicit subdomains of the verified email domain.
 * Prevents claiming broad root/country zones (e.g., claiming edu.in from college.edu.in).
 */
function isDomainRelated(domain: string, emailDomain: string): boolean {
  return domain === emailDomain || domain.endsWith(`.${emailDomain}`);
}

/**
 * Identifies standard institutional student email conventions.
 */
function isStudentEmail(email: string): boolean {
  const [localPart, domainPart] = email.toLowerCase().split('@');
  if (!localPart || !domainPart) return false;

  // Student subdomain indicators
  if (
    domainPart.startsWith('student.') ||
    domainPart.includes('.std.') ||
    domainPart.includes('.student.')
  ) {
    return true;
  }

  // Common campus roll number or batch ID patterns (e.g., 21bcs042, btech2024, or 5+ consecutive digits)
  const matchesRollPattern =
    /^[a-z]{0,4}\d{4,8}[a-z0-9]*$/i.test(localPart) ||
    /\d{5,}/.test(localPart);

  return matchesRollPattern;
}

@Injectable()
export class UniversityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly otpService: OtpService,
    private readonly jwtService: JwtService,
  ) {}

  async requestOtp(dto: RequestUniversityOtpDto) {
    const email = dto.email.toLowerCase().trim();

    // Security Gate: Reject student emails from claiming university administration
    if (isStudentEmail(email)) {
      throw new BadRequestException(
        'Student email accounts cannot claim administrative management of an institution.',
      );
    }

    const emailDomain = email.split('@')[1];
    const domains = dto.domains.map((d) => d.toLowerCase().trim()).filter(Boolean);

    if (!emailDomain || BLOCKED_DOMAINS.has(emailDomain)) {
      throw new BadRequestException('Please use an official institutional email.');
    }

    if (domains.length === 0) {
      throw new BadRequestException('At least one institutional domain must be provided.');
    }

    for (const d of domains) {
      if (BLOCKED_DOMAINS.has(d)) {
        throw new BadRequestException(`Generic domain @${d} cannot be claimed.`);
      }
      if (!isDomainRelated(d, emailDomain)) {
        throw new BadRequestException(
          `Domain @${d} is not part of the institutional domain structure of @${emailDomain}.`,
        );
      }
    }

    const existingDomain = await this.prisma.universityDomain.findFirst({
      where: { domain: { in: domains } },
    });

    if (existingDomain) {
      throw new ConflictException(
        `Domain @${existingDomain.domain} is already registered in the system.`,
      );
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException('An account with this email already exists.');
    }

    const otp = await this.otpService.generateAndSaveOtp(email);

    return {
      message: `Verification code sent to ${email}`,
      ...(process.env.NODE_ENV !== 'production' ? { devOtp: otp } : {}),
    };
  }

  async claim(dto: ClaimUniversityDto) {
    const email = dto.contactEmail.toLowerCase().trim();

    // Security Gate: Reject student emails from claiming university administration
    if (isStudentEmail(email)) {
      throw new BadRequestException(
        'Student email accounts cannot claim administrative management of an institution.',
      );
    }

    const emailDomain = email.split('@')[1];
    const domains = dto.domains.map((d) => d.toLowerCase().trim()).filter(Boolean);
    const shortCode = dto.shortCode.toUpperCase().trim();
    const contactName = dto.contactName.trim();

    if (!emailDomain || BLOCKED_DOMAINS.has(emailDomain)) {
      throw new BadRequestException('Invalid institutional contact email.');
    }

    if (domains.length === 0) {
      throw new BadRequestException('At least one campus domain must be claimed.');
    }

    for (const d of domains) {
      if (BLOCKED_DOMAINS.has(d)) {
        throw new BadRequestException(`Generic domain @${d} cannot be claimed.`);
      }
      if (!isDomainRelated(d, emailDomain)) {
        throw new BadRequestException(
          `Domain @${d} does not belong to the institution represented by @${emailDomain}.`,
        );
      }
    }

    const isValidOtp = await this.otpService.verifyOtp(email, dto.otp);
    if (!isValidOtp) {
      throw new BadRequestException('Invalid or expired verification code.');
    }

    const existingDomain = await this.prisma.universityDomain.findFirst({
      where: { domain: { in: domains } },
    });
    if (existingDomain) {
      throw new ConflictException(`Domain @${existingDomain.domain} is already registered.`);
    }

    const existingCode = await this.prisma.university.findUnique({
      where: { shortCode },
    });
    if (existingCode) {
      throw new ConflictException(`Short code ${shortCode} is already in use.`);
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException('An account with this email already exists.');
    }

    const passwordHash = await this.passwordService.hash(dto.password);
    const baseUsername = contactName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 15);
    const randomHex = crypto.randomBytes(2).toString('hex');
    const username = `${baseUsername || 'admin'}_admin_${randomHex}`;

    const result = await this.prisma.$transaction(async (tx) => {
      const university = await tx.university.create({
        data: {
          name: dto.name.trim(),
          shortCode,
          contactName,
          contactEmail: email,
          status: 'ACTIVE',
          domains: {
            create: domains.map((domain, idx) => ({
              domain,
              isPrimary: idx === 0,
              isVerified: true,
            })),
          },
        },
      });

      const adminUser = await tx.user.create({
        data: {
          email,
          username,
          fullName: contactName,
          universityId: university.id,
          role: 'ADMIN',
          status: 'ACTIVE',
          isEmailVerified: true,
        },
      });

      await tx.passwordCredential.create({
        data: {
          userId: adminUser.id,
          passwordHash,
        },
      });

      return { university, adminUser };
    });

    const accessToken = await this.jwtService.signAsync({
      sub: result.adminUser.id,
      email: result.adminUser.email,
      role: result.adminUser.role,
      universityId: result.university.id,
      fullName: result.adminUser.fullName,
    });

    return {
      message: 'University registered and Admin account activated!',
      accessToken,
      user: {
        id: result.adminUser.id,
        email: result.adminUser.email,
        username: result.adminUser.username,
        fullName: result.adminUser.fullName,
        role: result.adminUser.role,
        universityId: result.university.id,
        universityName: result.university.name,
        isEmailVerified: true,
      },
      university: {
        id: result.university.id,
        name: result.university.name,
        shortCode: result.university.shortCode,
      },
    };
  }

  async getNotes(universityId: string) {
    return this.prisma.note.findMany({
      where: { universityId },
      include: { author: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createNote(universityId: string, authorId: string, dto: CreateNoteDto) {
    return this.prisma.note.create({
      data: {
        title: dto.title,
        subject: dto.subject,
        semester: dto.semester,
        branch: dto.branch,
        fileUrl: dto.fileUrl,
        authorId,
        universityId,
      },
      include: { author: { select: { fullName: true } } },
    });
  }

  async getQuestions(universityId: string) {
    return this.prisma.question.findMany({
      where: { universityId },
      include: { author: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createQuestion(universityId: string, authorId: string, dto: CreateQuestionDto) {
    return this.prisma.question.create({
      data: {
        title: dto.title,
        subject: dto.subject,
        description: dto.description,
        authorId,
        universityId,
      },
      include: { author: { select: { fullName: true } } },
    });
  }
}