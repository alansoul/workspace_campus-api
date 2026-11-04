// campus-api/src/modules/university/dto/university.dto.ts
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class RequestUniversityOtpDto {
  @IsEmail({}, { message: 'Must be a valid institutional email address.' })
  @IsNotEmpty()
  @MaxLength(255)
  email!: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayNotEmpty({ message: 'At least one campus domain must be specified.' })
  domains!: string[];
}

export class ClaimUniversityDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(150)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(20)
  shortCode!: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayNotEmpty({ message: 'At least one campus domain must be claimed.' })
  domains!: string[];

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  contactName!: string;

  @IsEmail({}, { message: 'Must be a valid institutional contact email.' })
  @MaxLength(255)
  contactEmail!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long.' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters.' })
  password!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'OTP must be exactly 6 numeric digits.' })
  otp!: string;
}

export class CreateNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  subject!: string;

  @IsInt()
  @Min(1)
  semester!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  branch!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  fileUrl!: string;
}

export class CreateQuestionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  subject!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description!: string;
}

export class CreateExamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  subject!: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  type?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  dateStr!: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  timeStr?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  room?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  syllabus?: string;
}

export class CreatePracticalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  subject!: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  labName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  faculty?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  dueInDaysText?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @IsBoolean()
  @IsOptional()
  completed?: boolean;
}