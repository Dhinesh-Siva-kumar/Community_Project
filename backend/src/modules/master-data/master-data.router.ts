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

// GET /api/master-data/states?countryId=1 — public, no auth
router.get('/states', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const countryId = Number(req.query['countryId']);
    if (!countryId || isNaN(countryId)) {
      res.status(400).json({ success: false, message: 'countryId query param is required' });
      return;
    }
    const result = await masterDataService.getStates(countryId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/master-data/cities?stateId=5 — public, no auth
router.get('/cities', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stateId = Number(req.query['stateId']);
    if (!stateId || isNaN(stateId)) {
      res.status(400).json({ success: false, message: 'stateId query param is required' });
      return;
    }
    const result = await masterDataService.getCities(stateId);
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
