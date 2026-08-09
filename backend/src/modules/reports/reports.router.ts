import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import * as ctrl from './reports.controller';

const router = Router();
router.use(authenticate);

router.post('/', ctrl.create);
router.get('/pending-count', authorize('ADMIN'), ctrl.getPendingCount);

export default router;
