import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import * as ctrl from './analytics.controller';

const router = Router();
router.use(authenticate, authorize('ADMIN'));

router.get('/overview', ctrl.getOverview);

export default router;
