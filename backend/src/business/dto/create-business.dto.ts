import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  IsNumber,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateBusinessDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsOptional()
  images?: string[];

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  pincode?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @Transform(({ value }) => (value === '' || value == null ? undefined : parseFloat(value)))
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @Transform(({ value }) => (value === '' || value == null ? undefined : parseFloat(value)))
  @IsNumber()
  @IsOptional()
  longitude?: number;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  website?: string;

  @IsString()
  @IsOptional()
  openingHours?: string;

  @IsString()
  @IsNotEmpty()
  categoryId!: string;
}

export class CreateBusinessCategoryDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  icon?: string;
}
