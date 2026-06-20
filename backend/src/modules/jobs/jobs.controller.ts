import { Request, Response, NextFunction } from 'express';
import { CreateJobDto, UpdateJobDto, ListJobsQueryDto } from './jobs.dto';
import * as jobsService from './jobs.service';

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const files = (req.files as { [fieldname: string]: Express.Multer.File[] } | undefined) ?? {};
    const rawBody = { ...req.body };

    // Extract company logo (single file under 'logo' field)
    const logoFiles = files['logo'] ?? [];
    if (logoFiles.length) rawBody['companyLogo'] = `/uploads/${logoFiles[0].filename}`;

    // Extract job gallery images (multiple files under 'images' field)
    const imageFiles = files['images'] ?? [];
    if (imageFiles.length) rawBody['images'] = imageFiles.map((f) => `/uploads/${f.filename}`);

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
    const files = (req.files as { [fieldname: string]: Express.Multer.File[] } | undefined) ?? {};
    const rawBody = { ...req.body };

    const logoFiles = files['logo'] ?? [];
    if (logoFiles.length) rawBody['companyLogo'] = `/uploads/${logoFiles[0].filename}`;

    const imageFiles = files['images'] ?? [];
    if (imageFiles.length) rawBody['images'] = imageFiles.map((f) => `/uploads/${f.filename}`);

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
