import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import * as ctrl from './communities.controller';

const router = Router();
router.use(authenticate);

router.post('/', ctrl.create);
router.get('/my', ctrl.getMyCommunities);
router.get('/created', ctrl.getMyCreatedCommunities);
router.get('/analytics', ctrl.getAnalytics);
router.get('/suggested', ctrl.getSuggested);
router.get('/pending', authorize('ADMIN'), ctrl.findPending);
router.get('/pending-count', authorize('ADMIN'), ctrl.getPendingCount);
router.get('/', ctrl.findAll);
router.get('/:id', ctrl.findOne);
router.put('/:id/approve', authorize('ADMIN'), ctrl.approve);
router.put('/:id/reject', authorize('ADMIN'), ctrl.reject);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.deleteCommunity);
router.post('/:id/join', ctrl.join);
router.post('/:id/leave', ctrl.leave);
router.get('/:id/members', ctrl.getMembers);

export default router;
