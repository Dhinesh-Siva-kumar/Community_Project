import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import * as masterDataService from './master-data.service';

const router = Router();

// GET /api/master-data/countries — public, no auth
router.get('/countries', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await masterDataService.getCountries();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/master-data/interests — public, no auth
router.get('/interests', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await masterDataService.getInterests();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
