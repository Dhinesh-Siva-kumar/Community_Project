import { Request, Response, NextFunction } from 'express';
import { CreateJobDto, UpdateJobDto, ListJobsQueryDto } from './jobs.dto';
import * as jobsService from './jobs.service';

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const rawBody = { ...req.body };
    if (files.length) rawBody['images'] = files.map((f) => `/uploads/${f.filename}`);
    const body = CreateJobDto.parse(rawBody);
    const result = await jobsService.create(body, req.user!.sub);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

export async function findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = ListJobsQueryDto.parse(req.query);
    const result = await jobsService.findAll(query);
    res.json(result);
  } catch (err) { next(err); }
}

export async function findOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await jobsService.findOne(req.params['id'] as string);
    res.json(result);
  } catch (err) { next(err); }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const rawBody = { ...req.body };
    if (files.length) rawBody['images'] = files.map((f) => `/uploads/${f.filename}`);
    const body = UpdateJobDto.parse(rawBody);
    const result = await jobsService.update(req.params['id'] as string, body, req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}

export async function deleteJob(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await jobsService.deleteJob(req.params['id'] as string, req.user!.sub);
    res.json(result);
  } catch (err) { next(err); }
}
