import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import * as auditController from './audit.controller';

const router = Router();

router.use(authenticate);
router.use(authorize('ADMIN'));

router.get('/', auditController.getAuditLogs);
router.get('/facets', auditController.getFacets);

export default router;
