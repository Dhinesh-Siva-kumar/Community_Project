import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import * as ctrl from './communities.controller';

const router = Router();
router.use(authenticate);

router.post('/', ctrl.create);
router.get('/my', ctrl.getMyCommunities);
router.get('/created', ctrl.getMyCreatedCommunities);
router.get('/analytics', ctrl.getAnalytics);
router.get('/', ctrl.findAll);
router.get('/:id', ctrl.findOne);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.deleteCommunity);
router.post('/:id/join', ctrl.join);
router.post('/:id/leave', ctrl.leave);
router.get('/:id/members', ctrl.getMembers);

export default router;
