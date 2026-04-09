import { IsOptional, IsString, IsArray, IsEmail, IsInt } from 'class-validator';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  userName?: string;

  @IsString()
  @IsOptional()
  displayName?: string;

  @IsString()
  @IsOptional()
  phoneNo?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsInt()
  @IsOptional()
  countryId?: number;

  @IsString()
  @IsOptional()
  bio?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  pincode?: string;

  @IsArray()
  @IsOptional()
  interests?: string[];

  @IsString()
  @IsOptional()
  professionalCategory?: string;

  @IsString()
  @IsOptional()
  avatar?: string;
}
