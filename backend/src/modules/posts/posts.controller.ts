import { Request, Response, NextFunction } from 'express';
import { CreatePostDto, UpdatePostBodyDto, ListPostsQueryDto, AddCommentDto, PaginationQueryDto, ListPendingPostsQueryDto, ListMyPostsQueryDto, RejectPostDto, RequestMoreInfoPostDto } from './posts.dto';
import * as postsService from './posts.service';
import { FileValidationService } from '../../services/file-validation.service';
import { saveBufferToFile, deleteUploadedFile } from '../../services/upload-storage.service';
import { AppError } from '../../middleware/errorHandler';
import { env } from '../../config/env';

/**
 * Post media arrives as EITHER `images` (in memory, for Sharp) OR a single
 * `video` (already streamed to disk by multer). Validates the combination,
 * persists the images, and hands back the stored paths.
 *
 * Every rejection deletes the video first: multer writes it before this
 * handler runs, so bailing out without cleanup would leave an orphan file
 * in uploads/videos for a post that was never created.
 */
async function savePostMedia(
  req: Request,
): Promise<{ imagePaths: string[]; videoPath: string | null }> {
  const files = (req.files as Record<string, Express.Multer.File[]> | undefined) ?? {};
  const imageFiles = files['images'] ?? [];
  const videoFile = files['video']?.[0];
  const videoPath = videoFile ? `/uploads/videos/${videoFile.filename}` : null;

  const reject = (message: string, code: string): never => {
    if (videoPath) deleteUploadedFile(videoPath);
    throw new AppError(400, message, code);
  };

  if (imageFiles.length && videoFile) {
    reject('A post can have either images or a video, not both', 'POST_MEDIA_CONFLICT');
  }

  // uploadPostMedia's fileSize limit has to accommodate the video, so it
  // cannot enforce the tighter image cap — do that here.
  const oversized = imageFiles.find((f) => f.size > env.IMAGE_MAX_UPLOAD_BYTES);
  if (oversized) {
    reject(`Image "${oversized.originalname}" is too large`, 'UPLOAD_LIMIT_FILE_SIZE');
  }

  const validation = await FileValidationService.validateMulterFiles(imageFiles);
  if (!validation.valid) {
    const detail = validation.invalidFiles.map((f) => `${f.filename}: ${f.error}`).join('; ');
    reject(`Image validation failed. ${detail}`, 'IMAGE_VALIDATION_FAILED');
  }

  const filenames = await Promise.all(
    imageFiles.map((f) => saveBufferToFile(f.buffer, f.originalname, 'posts')),
  );

  return { imagePaths: filenames.map((f) => `/uploads/${f}`), videoPath };
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { imagePaths, videoPath } = await savePostMedia(req);

    const rawBody = { ...req.body };
    if (imagePaths.length) rawBody['images'] = imagePaths;
    if (videoPath) rawBody['video'] = videoPath;
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

export async function getMyPosts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = ListMyPostsQueryDto.parse(req.query);
    const result = await postsService.findMine(req.user!.sub, query);
    res.json(result);
  } catch (err) { next(err); }
}

export async function getPendingCount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await postsService.countPending();
    res.json(result);
  } catch (err) { next(err); }
}

export async function approve(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await postsService.approve(req.params['id'] as string, req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}

export async function reject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { reason } = RejectPostDto.parse(req.body ?? {});
    const result = await postsService.reject(req.params['id'] as string, req.user!.sub, reason);
    res.json(result);
  } catch (err) { next(err); }
}

export async function requestMoreInfo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { reason } = RequestMoreInfoPostDto.parse(req.body ?? {});
    const result = await postsService.requestMoreInfo(req.params['id'] as string, req.user!.sub, reason);
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
    const { imagePaths, videoPath } = await savePostMedia(req);

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

    // A freshly uploaded video replaces whatever the post had. Otherwise the
    // client's `video` text field decides: the existing path to keep it, or
    // an empty string (normalised to null by the DTO) to clear it.
    if (videoPath) rawBody['video'] = videoPath;

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
