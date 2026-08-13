import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../middleware/errorHandler';
import { DivisionsQueryDto, CitiesQueryDto } from './geography.dto';
import * as geographyService from './geography.service';

export async function getCountries(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await geographyService.getCountries();
    res.json({ data });
  } catch (err) { next(err); }
}

export async function getCountryConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const countryId = Number(req.params['id']);
    if (!countryId || Number.isNaN(countryId)) throw new AppError(400, 'A valid country id is required');
    const result = await geographyService.getCountryConfig(countryId);
    res.json(result);
  } catch (err) { next(err); }
}

export async function getDivisions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const countryId = Number(req.params['countryId']);
    if (!countryId || Number.isNaN(countryId)) throw new AppError(400, 'A valid country id is required');
    const query = DivisionsQueryDto.parse(req.query);
    const data = await geographyService.getDivisions(countryId, query.parentId);
    res.json({ data });
  } catch (err) { next(err); }
}

export async function searchCities(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = CitiesQueryDto.parse(req.query);
    const result = await geographyService.searchCities(query);
    res.json(result);
  } catch (err) { next(err); }
}
