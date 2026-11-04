// campus-api/src/modules/iam/dto/auth.dto.ts
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RequestOtpDto {
  @IsEmail({}, { message: 'Must be a valid email address.' })
  @IsNotEmpty()
  @MaxLength(255, { message: 'Email address must not exceed 255 characters.' })
  email!: string;

  @IsOptional()
  @IsString()
  @IsIn(['LOGIN', 'REGISTER', 'RESET_PASSWORD', 'LINK_CAMPUS'], {
    message: 'Purpose must be LOGIN, REGISTER, RESET_PASSWORD, or LINK_CAMPUS.',
  })
  purpose?: 'LOGIN' | 'REGISTER' | 'RESET_PASSWORD' | 'LINK_CAMPUS';
}

export class VerifyOtpDto {
  @IsEmail({}, { message: 'Must be a valid email address.' })
  @IsNotEmpty()
  @MaxLength(255, { message: 'Email address must not exceed 255 characters.' })
  email!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'OTP must be exactly 6 numeric digits.' })
  otp!: string;

  @IsString()
  @IsOptional()
  @MinLength(2, { message: 'Full name must be at least 2 characters.' })
  @MaxLength(100, { message: 'Full name must not exceed 100 characters.' })
  fullName?: string;
}

export class VerifyAndRegisterDto {
  @IsEmail({}, { message: 'Must be a valid official college email.' })
  @IsNotEmpty()
  @MaxLength(255, { message: 'Email address must not exceed 255 characters.' })
  email!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'OTP must be exactly 6 numeric digits.' })
  otp!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long.' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters.' })
  password!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'Username must be at least 3 characters long.' })
  @MaxLength(30, { message: 'Username must not exceed 30 characters.' })
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'Username can only contain letters, numbers, and underscores.',
  })
  username!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Full name must be at least 2 characters.' })
  @MaxLength(100, { message: 'Full name must not exceed 100 characters.' })
  fullName!: string;

  @IsString()
  @IsOptional()
  @MaxLength(50, { message: 'Branch must not exceed 50 characters.' })
  branch?: string;
}

export class LoginDto {
  @IsEmail({}, { message: 'Must be a valid email address.' })
  @IsNotEmpty()
  @MaxLength(255, { message: 'Email address must not exceed 255 characters.' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required.' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters.' })
  password!: string;
}

export class SetPasswordDto {
  @IsEmail({}, { message: 'Must be a valid email address.' })
  @IsNotEmpty()
  @MaxLength(255, { message: 'Email address must not exceed 255 characters.' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long.' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters.' })
  password!: string;

  @IsString()
  @IsOptional()
  @MinLength(2, { message: 'Full name must be at least 2 characters.' })
  @MaxLength(100, { message: 'Full name must not exceed 100 characters.' })
  fullName?: string;
}

export class LinkCampusRequestDto {
  @IsEmail({}, { message: 'Must be a valid official campus email address.' })
  @IsNotEmpty()
  @MaxLength(255, { message: 'Email address must not exceed 255 characters.' })
  institutionalEmail!: string;
}

export class LinkCampusVerifyDto {
  @IsEmail({}, { message: 'Must be a valid official campus email address.' })
  @IsNotEmpty()
  @MaxLength(255, { message: 'Email address must not exceed 255 characters.' })
  institutionalEmail!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'OTP must be exactly 6 numeric digits.' })
  otp!: string;
}

export class ResetPasswordDto {
  @IsEmail({}, { message: 'Must be a valid email address.' })
  @IsNotEmpty()
  @MaxLength(255, { message: 'Email address must not exceed 255 characters.' })
  email!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'OTP must be exactly 6 numeric digits.' })
  otp!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long.' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters.' })
  newPassword!: string;
}