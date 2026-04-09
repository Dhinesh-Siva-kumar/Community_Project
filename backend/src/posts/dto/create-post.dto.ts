import { IsNotEmpty, IsOptional, IsString, IsArray, IsEnum } from 'class-validator';

enum PostType {
  GENERAL = 'GENERAL',
  HELP = 'HELP',
  EMERGENCY = 'EMERGENCY',
}

export class CreatePostDto {
  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsString()
  @IsNotEmpty()
  communityId!: string;

  @IsEnum(PostType)
  @IsOptional()
  type?: PostType;

  @IsArray()
  @IsOptional()
  images?: string[];
}
