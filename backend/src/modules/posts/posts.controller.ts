import { Request, Response, NextFunction } from 'express';
import { CreatePostDto, ListPostsQueryDto, AddCommentDto, PaginationQueryDto } from './posts.dto';
import * as postsService from './posts.service';

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = CreatePostDto.parse(req.body);
    const result = await postsService.create(body, req.user!.sub);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

export async function findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = ListPostsQueryDto.parse(req.query);
    const isAdmin = req.user?.role === 'ADMIN';
    const result = await postsService.findAll({ ...query, isAdmin });
    res.json(result);
  } catch (err) { next(err); }
}

export async function findPending(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit } = PaginationQueryDto.parse(req.query);
    const result = await postsService.findPendingOnly(page, limit);
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
