import { Router } from 'express';
import * as ctrl from './geography.controller';

// All routes are public/no-auth — reference geographic data, same
// precedent as /api/master-data/*.
const router = Router();

router.get('/countries', ctrl.getCountries);
router.get('/countries/:id/config', ctrl.getCountryConfig);
router.get('/countries/:countryId/divisions', ctrl.getDivisions);
router.get('/cities', ctrl.searchCities);

export default router;
