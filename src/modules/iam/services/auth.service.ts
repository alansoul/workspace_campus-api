import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../../prisma.service.js';
import { PasswordService } from './password.service.js';
import { OtpService } from './otp.service.js';
import {
  RequestOtpDto,
  VerifyOtpDto,
  VerifyAndRegisterDto,
  LoginDto,
  SetPasswordDto,
  ResetPasswordDto,
} from '../dto/auth.dto.js';
import { MailService } from './mail.service.js';

type UserWithRelations = Prisma.UserGetPayload<{
  include: { university: true; password: true };
}>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly otpService: OtpService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Helper to find user by EITHER primary email OR linked institutional email
   */
  private async findUserByAnyEmail(email: string): Promise<UserWithRelations | null> {
    return this.prisma.user.findFirst({
      where: {
        OR: [
          { email: email },
          { institutionalEmail: email } // 🔧 UPDATED: Removed 'as any' since Prisma types are generated
        ]
      },
      include: { university: true, password: true },
    }) as Promise<UserWithRelations | null>;
  }

  /**
   * CORE DOMAIN LOGIC
   * Accepts either full email ("rohan@nancy.edu.in") or domain ("nancy.edu.in")
   */
  async resolveDomain(emailOrDomain: string) {
    const normalized = emailOrDomain.toLowerCase().trim();
    const domain = normalized.includes('@')
      ? normalized.split('@')[1]?.trim()
      : normalized;

    if (!domain || !domain.includes('.')) {
      return {
        allowed: false,
        isRegistered: false,
        error: 'INVALID_EMAIL',
      };
    }

    // RULE 1: Gmail = individual (never attach a default university)
    if (domain === 'gmail.com') {
      return {
        allowed: true,
        isRegistered: true,
        domain,
        isGmail: true,
        isUniversity: false,
        universityName: null,
        university: null,
      };
    }

    // RULE 2: Registered campus domain
    const domainRecord = await this.prisma.universityDomain.findFirst({
      where: {
        domain: { equals: domain, mode: 'insensitive' },
        isVerified: true,
        university: { status: { not: 'SUSPENDED' } },
      },
      include: { university: true },
    });

    if (!domainRecord) {
      return {
        allowed: false,
        isRegistered: false,
        error: 'DOMAIN_UNREGISTERED',
        domain,
      };
    }

    return {
      allowed: true,
      isRegistered: true,
      domain: domainRecord.domain,
      isGmail: false,
      isUniversity: true,
      universityName: domainRecord.university.name,
      university: {
        id: domainRecord.university.id,
        name: domainRecord.university.name,
        shortCode: domainRecord.university.shortCode,
      },
    };
  }

  async requestOtp(dto: RequestOtpDto) {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const purpose = (dto.purpose || 'LOGIN').toUpperCase();

    const resolution = await this.resolveDomain(normalizedEmail);
    if (!resolution.allowed) {
      throw new BadRequestException(
        'Only @gmail.com or admin-registered campus domains are allowed.',
      );
    }

    const existingUser = await this.findUserByAnyEmail(normalizedEmail);

    // 1. RESET_PASSWORD always requires an existing account
    // 2. LOGIN requires an existing account for @gmail.com (university emails can auto-onboard)
    // (Tip: If you want university emails to ALSO require Sign Up first, remove `&& resolution.isGmail`)
    if (
      (purpose === 'RESET_PASSWORD' && !existingUser) ||
      (purpose === 'LOGIN' && !existingUser && resolution.isGmail)
    ) {
      throw new BadRequestException(
        'No account found with this email. Please sign up first.',
      );
    }

    if (existingUser && existingUser.status !== 'ACTIVE') {
      throw new UnauthorizedException(
        'Your account has been deactivated or suspended.',
      );
    }

    // REGISTER: block finished accounts
    if (purpose === 'REGISTER') {
      if (existingUser?.password) {
        throw new ConflictException(
          'Account already exists. Please sign in instead.',
        );
      }
    }

    const otp = await this.otpService.generateAndSaveOtp(
      normalizedEmail,
      purpose,
    );

    // ✉️ DISPATCH REAL EMAIL VIA RESEND
    await this.mailService.sendVerificationOtp(normalizedEmail, otp);

    const shouldExposeDevOtp =
      process.env.EXPOSE_DEV_OTP === 'true' &&
      process.env.NODE_ENV !== 'production';

    return {
      message: `Verification code sent to ${normalizedEmail}`,
      ...(shouldExposeDevOtp ? { devOtp: otp } : {}),
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const normalizedEmail = dto.email.toLowerCase().trim();

    const resolution = await this.resolveDomain(normalizedEmail);
    if (!resolution.allowed) {
      throw new BadRequestException(
        'Only @gmail.com or admin-registered campus domains are allowed.',
      );
    }

    const isValidOtp = await this.otpService.verifyOtp(
      normalizedEmail,
      dto.otp,
    );
    if (!isValidOtp) {
      throw new BadRequestException('Invalid or expired verification code.');
    }

    const isUniversity = Boolean(
      resolution.isUniversity && resolution.university,
    );
    const targetUniversity = resolution.university; // null for gmail

    // Campus emails must resolve to a university; Gmail does not
    if (isUniversity && !targetUniversity) {
      throw new BadRequestException(
        'No active campus workspace found in system.',
      );
    }

    let user = await this.findUserByAnyEmail(normalizedEmail);

    // Block unregistered @gmail.com on Sign In; allow signup (fullName present) or verified university email
    if (!user) {
      if (!dto.fullName?.trim() && resolution.isGmail) {
        throw new BadRequestException(
          'No account found with this email. Please sign up first.',
        );
      }

      const emailPrefix = normalizedEmail.split('@')[0] || 'user';
      const defaultName =
        dto.fullName?.trim() ||
        emailPrefix
          .replace(/[._-]+/g, ' ')
          .replace(/\b\w/g, (char) => char.toUpperCase());

      const baseUsername =
        emailPrefix.replace(/[^a-z0-9_]/g, '') || 'user';
      let username = baseUsername;

      const existingUsername = await this.prisma.user.findUnique({
        where: { username },
      });
      if (existingUsername) {
        username = `${baseUsername}_${crypto.randomInt(100, 999)}`;
      }

      const createData: Prisma.UserUncheckedCreateInput = {
        email: normalizedEmail,
        username,
        fullName: defaultName,
        role: 'STUDENT',
        status: 'ACTIVE',
        isEmailVerified: true,
        universityId: targetUniversity ? targetUniversity.id : null,
      };

      user = (await this.prisma.user.create({
        data: createData,
        include: { university: true, password: true },
      })) as UserWithRelations;
    } else {
      if (user.status !== 'ACTIVE') {
        throw new UnauthorizedException(
          'Your account has been deactivated or suspended.',
        );
      }
      if (user.university && user.university.status !== 'ACTIVE') {
        throw new UnauthorizedException(
          'Your university workspace is currently suspended.',
        );
      }

      if (
        !user.isEmailVerified ||
        (dto.fullName && dto.fullName !== user.fullName)
      ) {
        user = (await this.prisma.user.update({
          where: { id: user.id },
          data: {
            isEmailVerified: true,
            ...(dto.fullName ? { fullName: dto.fullName.trim() } : {}),
          },
          include: { university: true, password: true },
        })) as UserWithRelations;
      }
    }

    if (!user) {
      throw new InternalServerErrorException('Failed to process user account.');
    }

    const hasPassword = Boolean(user.password);

    // First-time: force password setup
    if (!hasPassword) {
      await this.otpService.markPasswordSetupVerified(normalizedEmail);
      return {
        message: 'Email verified. Please create your password.',
        requiresPasswordSetup: true,
        user: {
          id: user.id,
          email: normalizedEmail,
          username: user.username,
          fullName: user.fullName,
          role: user.role,
          universityId: user.universityId,
          universityName: user.university ? user.university.name : null,
          institutionalEmail: user.institutionalEmail ?? null,
          isEmailVerified: user.isEmailVerified,
          accountType: user.universityId ? 'INSTITUTIONAL' : 'INDIVIDUAL',
        },
      };
    }

    // Returning user with password: full login using the exact email they signed in with
    const accessToken = await this.signToken(
      user.id,
      normalizedEmail,
      user.role,
      user.universityId,
      user.fullName,
    );

    return {
      message: 'Authentication successful!',
      requiresPasswordSetup: false,
      accessToken,
      token: accessToken,
      user: {
        id: user.id,
        email: normalizedEmail,
        username: user.username,
        fullName: user.fullName,
        branch: user.branch || null,
        role: user.role,
        universityId: user.universityId,
        universityName: user.university ? user.university.name : null,
        institutionalEmail: user.institutionalEmail ?? null,
        isEmailVerified: user.isEmailVerified,
        accountType: user.universityId ? 'INSTITUTIONAL' : 'INDIVIDUAL',
      },
    };
  }

  async setPassword(dto: SetPasswordDto) {
    const normalizedEmail = dto.email.toLowerCase().trim();

    const user = await this.findUserByAnyEmail(normalizedEmail);

    if (!user) {
      throw new BadRequestException(
        'Account not found. Please verify your email with OTP first.',
      );
    }

    if (!user.isEmailVerified) {
      throw new BadRequestException(
        'Your email is not verified yet. Request a new OTP.',
      );
    }

    if (user.password) {
      throw new ConflictException(
        'Password already set. Please sign in directly.',
      );
    }

    const isAuthorized =
      await this.otpService.consumePasswordSetupVerified(normalizedEmail);
    if (!isAuthorized) {
      throw new UnauthorizedException(
        'Password setup session expired or unauthorized. Please verify your email with OTP first.',
      );
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    await this.prisma.$transaction(async (tx) => {
      await tx.passwordCredential.create({
        data: { userId: user.id, passwordHash },
      });

      if (dto.fullName && dto.fullName.trim() !== '') {
        await tx.user.update({
          where: { id: user.id },
          data: { fullName: dto.fullName.trim() },
        });
      }
    });

    const refreshed = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { university: true },
    });

    if (!refreshed) {
      throw new InternalServerErrorException('Failed to finalize account.');
    }

    const accessToken = await this.signToken(
      refreshed.id,
      refreshed.email,
      refreshed.role,
      refreshed.universityId,
      refreshed.fullName,
    );

    return {
      message: 'Password created. Welcome to Northstar!',
      accessToken,
      token: accessToken,
      user: {
        id: refreshed.id,
        email: refreshed.email,
        username: refreshed.username,
        fullName: refreshed.fullName,
        branch: refreshed.branch || null,
        role: refreshed.role,
        universityId: refreshed.universityId,
        universityName: refreshed.university ? refreshed.university.name : null,
        institutionalEmail: refreshed.institutionalEmail ?? null, // 🔧 UPDATED: Removed '(refreshed as any)'
        isEmailVerified: refreshed.isEmailVerified,
        accountType: refreshed.universityId ? 'INSTITUTIONAL' : 'INDIVIDUAL',
      },
    };
  }

  async requestLinkCampus(userId: string, institutionalEmail: string) {
    const normalized = institutionalEmail.toLowerCase().trim();
    const domain = normalized.split('@')[1]?.trim();

    if (!domain || domain === 'gmail.com') {
      throw new BadRequestException(
        'Please enter your official university email address, not Gmail.',
      );
    }

    const resolution = await this.resolveDomain(normalized);
    if (!resolution.allowed || !resolution.university) {
      throw new BadRequestException(
        'This university domain is not registered by an administrator.',
      );
    }

    const me = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!me) throw new UnauthorizedException('User no longer exists.');

    // 🔧 UPDATED: Safely checked `me.institutionalEmail` directly without `as any`
    if (me.universityId && me.institutionalEmail) {
      throw new ConflictException(
        'A university email is already linked to this account.',
      );
    }

    const taken = await this.prisma.user.findFirst({
      where: {
        // 🔧 UPDATED: Removed `as any` from the OR clause since Prisma now correctly knows this field
        OR: [{ email: normalized }, { institutionalEmail: normalized }],
        NOT: { id: userId },
      },
    });

    if (taken) {
      throw new ConflictException(
        'This university email is already registered to another account.',
      );
    }

    const otp = await this.otpService.generateAndSaveOtp(normalized, 'LINK_CAMPUS');
    await this.mailService.sendVerificationOtp(normalized, otp);

    return {
      message: `Verification code sent to ${normalized}`,
      universityName: resolution.university.name,
    };
  }

  async verifyLinkCampus(
    userId: string,
    institutionalEmail: string,
    otp: string,
  ) {
    const normalized = institutionalEmail.toLowerCase().trim();

    const resolution = await this.resolveDomain(normalized);
    if (!resolution.allowed || !resolution.university) {
      throw new BadRequestException('Campus domain not registered.');
    }

    const ok = await this.otpService.verifyOtp(normalized, otp);
    if (!ok) {
      throw new BadRequestException('Invalid or expired verification code.');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      // 🔧 UPDATED: Removed `as any` from data payload
      data: {
        institutionalEmail: normalized,
        universityId: resolution.university.id,
      },
      include: { university: true },
    });

    const accessToken = await this.signToken(
      updated.id,
      updated.email,
      updated.role,
      updated.universityId,
      updated.fullName,
    );

    return {
      message: 'Campus email linked successfully!',
      accessToken,
      user: {
        id: updated.id,
        email: updated.email,
        username: updated.username,
        fullName: updated.fullName,
        branch: updated.branch || null,
        role: updated.role,
        universityId: updated.universityId,
        universityName: updated.university?.name ?? null,
        institutionalEmail: updated.institutionalEmail ?? normalized, // 🔧 UPDATED: Removed '(updated as any)'
        isEmailVerified: updated.isEmailVerified,
        accountType: 'INSTITUTIONAL' as const,
      },
    };
  }

  async verifyAndRegister(dto: VerifyAndRegisterDto) {
    const resolution = await this.resolveDomain(dto.email);
    if (!resolution.allowed || !resolution.university) {
      throw new BadRequestException(
        'Domain not allowed or no active campus workspace found.',
      );
    }

    const isValidOtp = await this.otpService.verifyOtp(dto.email, dto.otp);
    if (!isValidOtp) {
      throw new BadRequestException('Invalid or expired code.');
    }

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
          include: { university: true, password: true },
        });
        await tx.passwordCredential.create({
          data: { userId: created.id, passwordHash },
        });
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
        token: accessToken,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          fullName: user.fullName,
          branch: user.branch || null,
          role: user.role,
          universityId: user.universityId,
          universityName: user.university ? user.university.name : null,
          institutionalEmail: user.institutionalEmail ?? null, // 🔧 UPDATED: Consistent typing added
          isEmailVerified: user.isEmailVerified,
          accountType: 'INSTITUTIONAL' as const,
        },
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email or username is already taken.');
      }
      throw error;
    }
  }

  async verifyOtpAndLogin(email: string, otp: string, fullName?: string) {
    return this.verifyOtp({ email, otp, fullName });
  }

  async login(dto: LoginDto) {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const user = await this.findUserByAnyEmail(normalizedEmail);

    if (!user || !user.password) {
      throw new UnauthorizedException(
        'Invalid credentials (No password set yet). Use OTP to sign in.',
      );
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException(
        'Your account has been deactivated or suspended.',
      );
    }
    if (user.university && user.university.status !== 'ACTIVE') {
      throw new UnauthorizedException(
        'Your university workspace is currently suspended.',
      );
    }

    const isMatch = await this.passwordService.verify(
      user.password.passwordHash,
      dto.password,
    );
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = await this.signToken(
      user.id,
      normalizedEmail,
      user.role,
      user.universityId,
      user.fullName,
    );

    return {
      accessToken,
      token: accessToken,
      user: {
        id: user.id,
        email: normalizedEmail,
        username: user.username,
        fullName: user.fullName,
        branch: user.branch || null,
        role: user.role,
        universityId: user.universityId,
        universityName: user.university ? user.university.name : null,
        institutionalEmail: user.institutionalEmail ?? null,
        isEmailVerified: user.isEmailVerified,
        accountType: user.universityId ? 'INSTITUTIONAL' : 'INDIVIDUAL',
      },
    };
  }

  async getProfile(userId: string, sessionEmail?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        university: { select: { id: true, name: true, shortCode: true } },
      },
    });

    if (!user) throw new UnauthorizedException('User no longer exists.');

    // Show the exact email they used to sign in (either Gmail or linked institutional email)
    const activeLoginEmail =
      sessionEmail &&
      (sessionEmail === user.email || sessionEmail === user.institutionalEmail)
        ? sessionEmail
        : user.email;

    return {
      id: user.id,
      email: activeLoginEmail,
      primaryEmail: user.email,
      username: user.username,
      fullName: user.fullName,
      name: user.fullName,
      branch: user.branch || null,
      role: user.role,
      universityId: user.universityId,
      universityName: user.university ? user.university.name : null,
      institutionalEmail: user.institutionalEmail ?? null,
      isEmailVerified: user.isEmailVerified,
      accountType: user.universityId ? 'INSTITUTIONAL' : 'INDIVIDUAL',
    };
  }

  async unlinkCampus(userId: string) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        universityId: null,
        institutionalEmail: null,
      },
      include: { university: true },
    });

    const accessToken = await this.signToken(
      updated.id,
      updated.email,
      updated.role,
      null,
      updated.fullName,
    );

    return {
      message: 'Campus email unlinked successfully.',
      accessToken,
      user: {
        id: updated.id,
        email: updated.email,
        username: updated.username,
        fullName: updated.fullName,
        branch: updated.branch || null,
        role: updated.role,
        universityId: null,
        universityName: null,
        institutionalEmail: null,
        isEmailVerified: updated.isEmailVerified,
        accountType: 'INDIVIDUAL' as const,
      },
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const normalizedEmail = dto.email.toLowerCase().trim();

    const user = await this.findUserByAnyEmail(normalizedEmail);

    if (!user) {
      throw new BadRequestException('Account not found.');
    }

    const isValidOtp = await this.otpService.verifyOtp(
      normalizedEmail,
      dto.otp,
    );
    if (!isValidOtp) {
      throw new BadRequestException('Invalid or expired verification code.');
    }

    const passwordHash = await this.passwordService.hash(dto.newPassword);

    await this.prisma.$transaction(async (tx) => {
      if (user.password) {
        await tx.passwordCredential.update({
          where: { userId: user.id },
          data: { passwordHash },
        });
      } else {
        await tx.passwordCredential.create({
          data: { userId: user.id, passwordHash },
        });
      }
    });

    const accessToken = await this.signToken(
      user.id,
      user.email,
      user.role,
      user.universityId || null,
      user.fullName,
    );

    return {
      message: 'Password reset successfully!',
      accessToken,
      token: accessToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        branch: user.branch || null,
        role: user.role,
        universityId: user.universityId,
        universityName: user.university ? user.university.name : null,
        institutionalEmail: user.institutionalEmail ?? null, // 🔧 UPDATED: Removed '(user as any)'
        isEmailVerified: user.isEmailVerified,
        accountType: user.universityId ? 'INSTITUTIONAL' : 'INDIVIDUAL',
      },
    };
  }

  async handleGoogleOAuthLogin(profile: {
    email?: string;
    fullName: string;
    avatarUrl?: string | null;
  }) {
    if (!profile.email) {
      throw new BadRequestException('Google account did not provide an email.');
    }

    const normalizedEmail = profile.email.toLowerCase().trim();
    const resolution = await this.resolveDomain(normalizedEmail);

    if (!resolution.allowed) {
      throw new UnauthorizedException(
        'Only @gmail.com or admin-registered university Google accounts are allowed.',
      );
    }

    let user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { university: true },
    });

    if (!user) {
      const baseUsername =
        normalizedEmail.split('@')[0].replace(/[^a-z0-9_]/g, '') || 'user';
      let username = baseUsername;

      const taken = await this.prisma.user.findUnique({ where: { username } });
      if (taken) {
        username = `${baseUsername}_${crypto.randomInt(100, 999)}`;
      }

      user = await this.prisma.user.create({
        data: {
          email: normalizedEmail,
          username,
          fullName: profile.fullName,
          avatarUrl: profile.avatarUrl ?? null,
          role: 'STUDENT',
          status: 'ACTIVE',
          isEmailVerified: true,
          universityId: resolution.university ? resolution.university.id : null,
        },
        include: { university: true },
      });
    } else if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Your account has been suspended.');
    }

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
        role: user.role,
        universityName: user.university?.name ?? null,
        institutionalEmail: user.institutionalEmail ?? null, // 🔧 UPDATED: Added for consistency
        accountType: user.universityId ? 'INSTITUTIONAL' : 'INDIVIDUAL',
      },
    };
  }

  private signToken(
    userId: string,
    email: string,
    role: string,
    universityId: string | null | undefined,
    fullName: string,
  ) {
    return this.jwtService.signAsync({
      sub: userId,
      email,
      role,
      universityId: universityId || null,
      fullName,
    });
  }
}