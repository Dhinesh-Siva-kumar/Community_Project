import { Request, Response, NextFunction } from 'express';
import { CreateBusinessDto, UpdateBusinessDto, CreateBusinessCategoryDto, ListBusinessQueryDto } from './business.dto';
import * as businessService from './business.service';

export async function createCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = CreateBusinessCategoryDto.parse(req.body);
    const result = await businessService.createCategory(body);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

export async function getCategories(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await businessService.getCategories();
    res.json(result);
  } catch (err) { next(err); }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const imagePaths = files.map((f) => `/uploads/${f.filename}`);

    const rawBody = { ...req.body };
    if (imagePaths.length) rawBody['images'] = imagePaths;

    const body = CreateBusinessDto.parse(rawBody);
    const result = await businessService.create(body, req.user!.sub);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

export async function findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = ListBusinessQueryDto.parse(req.query);
    const result = await businessService.findAll(query);
    res.json(result);
  } catch (err) { next(err); }
}

export async function findOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await businessService.findOne(req.params['id'] as string);
    res.json(result);
  } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const rawBody = { ...req.body };
    if (files.length) rawBody['images'] = files.map((f) => `/uploads/${f.filename}`);

    const body = UpdateBusinessDto.parse(rawBody);
    const result = await businessService.update(req.params['id'] as string, body, req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}

export async function deleteBusiness(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await businessService.deleteBusiness(req.params['id'] as string, req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}
