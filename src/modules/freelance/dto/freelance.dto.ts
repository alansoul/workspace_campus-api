import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class CreateGigDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsInt()
  @Min(50)
  budget!: number;

  @IsString()
  @IsNotEmpty()
  category!: string;
}