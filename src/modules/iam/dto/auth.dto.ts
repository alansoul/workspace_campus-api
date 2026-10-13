import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength, Length } from 'class-validator';

export class RequestOtpDto {
  @IsEmail({}, { message: 'Must be a valid email address.' })
  @IsNotEmpty()
  email!: string;

  @IsOptional()
  @IsString()
  purpose?: 'LOGIN' | 'REGISTER';
}

export class VerifyOtpDto {
  @IsEmail({}, { message: 'Must be a valid email address.' })
  @IsNotEmpty()
  email!: string;

  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits.' })
  otp!: string;

  @IsString()
  @IsOptional()
  fullName?: string;
}

export class VerifyAndRegisterDto {
  @IsEmail({}, { message: 'Must be a valid official college email.' })
  @IsNotEmpty()
  email!: string;

  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits.' })
  otp!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long.' })
  password!: string;

  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsString()
  @IsOptional()
  branch?: string;
}

export class LoginDto {
  @IsEmail({}, { message: 'Must be a valid email address.' })
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class SetPasswordDto {
  @IsEmail({}, { message: 'Must be a valid email address.' })
  @IsNotEmpty()
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long.' })
  password!: string;

  @IsString()
  @IsOptional()
  fullName?: string;

  
}

export class LinkCampusRequestDto {
  @IsEmail({}, { message: 'Must be a valid official campus email address.' })
  @IsNotEmpty()
  institutionalEmail!: string;
}

export class LinkCampusVerifyDto {
  @IsEmail({}, { message: 'Must be a valid official campus email address.' })
  @IsNotEmpty()
  institutionalEmail!: string;

  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits.' })
  otp!: string;
}