import { Request, Response, NextFunction } from 'express';
import { CreatePostDto, UpdatePostBodyDto, ListPostsQueryDto, AddCommentDto, PaginationQueryDto, ListPendingPostsQueryDto } from './posts.dto';
import * as postsService from './posts.service';
import { FileValidationService } from '../../services/file-validation.service';
import { saveBufferToFile } from '../../services/upload-storage.service';

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];

    // Validate uploaded images
    const validation = await FileValidationService.validateMulterFiles(files);
    if (!validation.valid) {
      res.status(400).json({
        message: 'Image validation failed',
        errors: validation.invalidFiles,
      });
      return;
    }

    // Save validated files to disk
    const filenames = await Promise.all(
      files.map((f) => saveBufferToFile(f.buffer, f.originalname, 'posts'))
    );
    const imagePaths = filenames.map((f) => `/uploads/${f}`);

    const rawBody = { ...req.body };
    if (imagePaths.length) rawBody['images'] = imagePaths;
    const body = CreatePostDto.parse(rawBody);
    const result = await postsService.create(body, req.user!.sub);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

export async function findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = ListPostsQueryDto.parse(req.query);
    const isAdmin = req.user?.role === 'ADMIN';
    const result = await postsService.findAll({ ...query, isAdmin, currentUserId: req.user?.sub });
    res.json(result);
  } catch (err) { next(err); }
}

export async function findOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await postsService.findOne(req.params['id'] as string, req.user?.sub);
    res.json(result);
  } catch (err) { next(err); }
}

export async function findPending(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = ListPendingPostsQueryDto.parse(req.query);
    const result = await postsService.findPendingOnly(query);
    res.json(result);
  } catch (err) { next(err); }
}

export async function approve(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await postsService.approve(req.params['id'] as string);
    res.json(result);
  } catch (err) { next(err); }
}

export async function reject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await postsService.reject(req.params['id'] as string);
    res.json(result);
  } catch (err) { next(err); }
}

export async function deletePost(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await postsService.deletePost(req.params['id'] as string, req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}

export async function updatePost(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];

    // Validate uploaded images
    const validation = await FileValidationService.validateMulterFiles(files);
    if (!validation.valid) {
      res.status(400).json({
        message: 'Image validation failed',
        errors: validation.invalidFiles,
      });
      return;
    }

    // Save validated files to disk
    const filenames = await Promise.all(
      files.map((f) => saveBufferToFile(f.buffer, f.originalname, 'posts'))
    );
    const imagePaths = filenames.map((f) => `/uploads/${f}`);

    const rawBody = { ...req.body };
    const incomingImages = rawBody['images'];
    const retainedImages = Array.isArray(incomingImages)
      ? incomingImages
      : typeof incomingImages === 'string' && incomingImages.length > 0
        ? [incomingImages]
        : [];

    if (retainedImages.length || imagePaths.length) {
      rawBody['images'] = [...retainedImages, ...imagePaths];
    }

    const body = UpdatePostBodyDto.parse(rawBody);
    const result = await postsService.updatePost(req.params['id'] as string, req.user!.sub, body);
    res.json(result);
  } catch (err) { next(err); }
}

export async function like(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await postsService.like(req.params['id'] as string, req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}

export async function unlike(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await postsService.unlike(req.params['id'] as string, req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}

export async function savePost(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await postsService.savePost(req.params['id'] as string, req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}

export async function unsavePost(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await postsService.unsavePost(req.params['id'] as string, req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}

export async function getComments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = PaginationQueryDto.parse(req.query);
    const result = await postsService.getComments(req.params['id'] as string, page, limit);
    res.json(result);
  } catch (err) { next(err); }
}

export async function addComment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { content } = AddCommentDto.parse(req.body);
    const result = await postsService.addComment(req.params['id'] as string, req.user!.sub, content);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

export async function deleteComment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await postsService.deleteComment(req.params['commentId'] as string, req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}
