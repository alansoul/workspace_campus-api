import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength, Length } from 'class-validator';

export class RequestOtpDto {
  @IsEmail({}, { message: 'Must be a valid official college email' })
  email!: string;
}

export class VerifyAndRegisterDto {
  @IsEmail({}, { message: 'Must be a valid official college email' })
  email!: string;

  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  otp!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
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
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}