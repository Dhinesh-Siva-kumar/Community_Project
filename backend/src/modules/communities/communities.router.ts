import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { optionalAuthenticate } from '../../middleware/optionalAuthenticate';
import { authorize } from '../../middleware/authorize';
import * as ctrl from './communities.controller';

const router = Router();

// Guest-visible — service layer scopes the result down when req.user is unset.
router.get('/', optionalAuthenticate, ctrl.findAll);
router.get('/analytics', optionalAuthenticate, ctrl.getAnalytics);

// Everything else is account-only. Literal sub-paths must stay above '/:id'
// below, or it swallows them (e.g. '/my' would match '/:id' with id='my').
router.post('/', authenticate, ctrl.create);
router.get('/my', authenticate, ctrl.getMyCommunities);
router.get('/created', authenticate, ctrl.getMyCreatedCommunities);
router.get('/suggested', authenticate, ctrl.getSuggested);
router.get('/pending', authenticate, authorize('ADMIN'), ctrl.findPending);
router.get('/pending-count', authenticate, authorize('ADMIN'), ctrl.getPendingCount);
router.get('/:id', optionalAuthenticate, ctrl.findOne);
router.put('/:id/approve', authenticate, authorize('ADMIN'), ctrl.approve);
router.put('/:id/reject', authenticate, authorize('ADMIN'), ctrl.reject);
router.put('/:id/request-more-info', authenticate, authorize('ADMIN'), ctrl.requestMoreInfo);
router.put('/:id', authenticate, ctrl.update);
router.delete('/:id', authenticate, ctrl.deleteCommunity);
router.post('/:id/join', authenticate, ctrl.join);
router.post('/:id/leave', authenticate, ctrl.leave);
router.get('/:id/members', authenticate, ctrl.getMembers);

export default router;
