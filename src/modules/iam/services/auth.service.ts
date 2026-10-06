import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../prisma.service.js';
import { PasswordService } from './password.service.js';
import { RegisterDto, LoginDto } from '../dto/auth.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const domain = dto.email.split('@')[1]?.toLowerCase();
    if (!domain) throw new BadRequestException('Invalid email format');

    const university = await this.prisma.university.findUnique({
      where: { emailDomain: domain },
    });
    if (!university) {
      throw new BadRequestException(`Domain (@${domain}) is not registered. Ask admin to seed your university.`);
    }

    const existingUser = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email.toLowerCase() }, { username: dto.username.toLowerCase() }] },
    });
    if (existingUser) throw new ConflictException('Email or username is already taken');

    const passwordHash = await this.passwordService.hash(dto.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email.toLowerCase(),
          username: dto.username.toLowerCase(),
          fullName: dto.fullName,
          branch: dto.branch,
          universityId: university.id,
        },
      });
      await tx.passwordCredential.create({
        data: { userId: created.id, passwordHash },
      });
      return created;
    });

    const accessToken = await this.signToken(user.id, user.email, user.role, user.universityId);
    return { message: 'Registration successful', accessToken, user };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { password: true, university: true },
    });
    if (!user || !user.password) throw new UnauthorizedException('Invalid email or password');

    const isMatch = await this.passwordService.verify(user.password.passwordHash, dto.password);
    if (!isMatch) throw new UnauthorizedException('Invalid email or password');

    const accessToken = await this.signToken(user.id, user.email, user.role, user.universityId);
    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        universityId: user.universityId,
        universityName: user.university.name,
      },
    };
  }

  private signToken(userId: string, email: string, role: string, universityId: string) {
    return this.jwtService.signAsync({ sub: userId, email, role, universityId });
  }
}