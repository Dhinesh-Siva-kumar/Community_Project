import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import * as ctrl from './communities.controller';

const router = Router();
router.use(authenticate);

router.post('/', authorize('ADMIN'), ctrl.create);
router.get('/', ctrl.findAll);
router.get('/:id', ctrl.findOne);
router.put('/:id', authorize('ADMIN'), ctrl.update);
router.delete('/:id', authorize('ADMIN'), ctrl.deleteCommunity);
router.post('/:id/join', ctrl.join);
router.post('/:id/leave', ctrl.leave);
router.get('/:id/members', ctrl.getMembers);

export default router;
