import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma.service.js';
import { PasswordService } from './password.service.js';
import { OtpService } from './otp.service.js';
import { RequestOtpDto, VerifyAndRegisterDto, LoginDto } from '../dto/auth.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly otpService: OtpService,
    private readonly jwtService: JwtService,
  ) {}

  async resolveDomain(email: string) {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return { allowed: false, error: 'INVALID_EMAIL' };

    const domainRecord = await this.prisma.universityDomain.findFirst({
      where: { domain, isVerified: true, university: { status: 'ACTIVE' } },
      include: { university: true },
    });

    if (!domainRecord) return { allowed: false, error: 'DOMAIN_UNREGISTERED', domain };

    return {
      allowed: true,
      domain,
      university: {
        id: domainRecord.university.id,
        name: domainRecord.university.name,
        shortCode: domainRecord.university.shortCode,
      },
    };
  }

  async requestOtp(dto: RequestOtpDto) {
    const resolution = await this.resolveDomain(dto.email);
    if (!resolution.allowed) {
      throw new BadRequestException('Domain is not registered or inactive.');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existingUser) throw new ConflictException('Account already exists. Please sign in.');

    const otp = await this.otpService.generateAndSaveOtp(dto.email);
    return {
      message: `Code sent to ${dto.email}`,
      ...(process.env.NODE_ENV !== 'production' ? { devOtp: otp } : {}),
    };
  }

  async verifyAndRegister(dto: VerifyAndRegisterDto) {
    const resolution = await this.resolveDomain(dto.email);
    if (!resolution.allowed || !resolution.university) throw new BadRequestException('Domain not allowed');

    const isValidOtp = await this.otpService.verifyOtp(dto.email, dto.otp);
    if (!isValidOtp) throw new BadRequestException('Invalid or expired code.');

    const passwordHash = await this.passwordService.hash(dto.password);

    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: dto.email.toLowerCase(),
            username: dto.username.toLowerCase(),
            fullName: dto.fullName,
            branch: dto.branch,
            universityId: resolution.university!.id,
            role: 'STUDENT',
            status: 'ACTIVE',
            isEmailVerified: true,
          },
        });
        await tx.passwordCredential.create({ data: { userId: created.id, passwordHash } });
        return created;
      });

      const accessToken = await this.signToken(
        user.id,
        user.email,
        user.role,
        user.universityId,
        user.fullName,
      );

      return {
        message: 'Registration successful!',
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          fullName: user.fullName,
          branch: user.branch,
          role: user.role,
          universityId: user.universityId,
          universityName: resolution.university.name,
          isEmailVerified: user.isEmailVerified,
        },
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Email or username is already taken.');
      }
      throw error;
    }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { password: true, university: true },
    });

    if (!user || !user.password) throw new UnauthorizedException('Invalid credentials');

    // Security Gate: Check account and institutional status
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Your account has been deactivated or suspended.');
    }
    if (user.university.status !== 'ACTIVE') {
      throw new UnauthorizedException('Your university workspace is currently suspended.');
    }

    const isMatch = await this.passwordService.verify(user.password.passwordHash, dto.password);
    if (!isMatch) throw new UnauthorizedException('Invalid credentials');

    const accessToken = await this.signToken(
      user.id,
      user.email,
      user.role,
      user.universityId,
      user.fullName,
    );

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        branch: user.branch,
        role: user.role,
        universityId: user.universityId,
        universityName: user.university.name,
        isEmailVerified: user.isEmailVerified,
      },
    };
  }

  async getProfile(userId: string) {
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    include: { university: { select: { id: true, name: true, shortCode: true } } },
  });

  if (!user) throw new UnauthorizedException('User no longer exists.');

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    fullName: user.fullName,
    branch: user.branch,
    role: user.role,
    universityId: user.universityId,
    universityName: user.university.name,
    isEmailVerified: user.isEmailVerified,
  };
}

  private signToken(
    userId: string,
    email: string,
    role: string,
    universityId: string,
    fullName: string,
  ) {
    return this.jwtService.signAsync({ sub: userId, email, role, universityId, fullName });
  }
}