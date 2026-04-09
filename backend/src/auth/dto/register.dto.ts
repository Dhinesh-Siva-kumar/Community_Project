import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  IsInt,
  IsEmail,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  user_name!: string;

  @IsString()
  @IsNotEmpty()
  display_name!: string;

  @IsString()
  @IsNotEmpty()
  phone_no!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password!: string;

  @IsInt()
  @IsNotEmpty()
  country_id!: number;

  @IsEmail()
  @IsOptional()
  email?: string;
}
