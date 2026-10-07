import {
  IsArray,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsString,
  Length,
  MinLength,
} from 'class-validator';

export class RequestUniversityOtpDto {
  @IsEmail()
  email!: string;

  @IsArray()
  @IsString({ each: true })
  domains!: string[];
}

export class ClaimUniversityDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  shortCode!: string;

  @IsArray()
  @IsString({ each: true })
  domains!: string[];

  @IsString()
  @IsNotEmpty()
  contactName!: string;

  @IsEmail()
  contactEmail!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @Length(6, 6)
  otp!: string;
}

export class CreateNoteDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsInt()
  semester!: number;

  @IsString()
  @IsNotEmpty()
  branch!: string;

  @IsString()
  @IsNotEmpty()
  fileUrl!: string;
}

export class CreateQuestionDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;
}