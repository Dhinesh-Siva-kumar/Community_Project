import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { translationLimiter } from '../../middleware/rateLimiter';
import * as ctrl from './translation.controller';

const router = Router();

router.post('/', authenticate, translationLimiter, ctrl.translate);

export default router;
