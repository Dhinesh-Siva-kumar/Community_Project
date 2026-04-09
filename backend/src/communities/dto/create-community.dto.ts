import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCommunityDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  image?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  pincode?: string;
}
