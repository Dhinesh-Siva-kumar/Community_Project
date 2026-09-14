import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { optionalAuthenticate } from '../../middleware/optionalAuthenticate';
import { authorize } from '../../middleware/authorize';
import { uploadImages } from '../../config/multer';
import * as ctrl from './events.controller';

const router = Router();

// Guest-visible — service layer scopes the result down when req.user is unset.
// Must stay above '/:id' below, or it swallows them.
router.get('/categories', optionalAuthenticate, ctrl.getCategories); // feeds the create/edit Event category picker for any user
router.get('/', optionalAuthenticate, ctrl.findAll);

// Everything else is account-only.
router.post('/categories', authenticate, authorize('ADMIN'), ctrl.createCategory);
router.put('/categories/:id', authenticate, authorize('ADMIN'), ctrl.updateCategory);

router.post('/', authenticate, uploadImages.array('images', 10), ctrl.create);
router.get('/mine', authenticate, ctrl.findMine);
router.get('/pending', authenticate, authorize('ADMIN'), ctrl.findPending);
router.get('/pending-count', authenticate, authorize('ADMIN'), ctrl.getPendingCount);
router.get('/:id/related', optionalAuthenticate, ctrl.findRelated);
router.get('/:id', optionalAuthenticate, ctrl.findOne);
router.put('/:id/approve', authenticate, authorize('ADMIN'), ctrl.approve);
router.put('/:id/reject', authenticate, authorize('ADMIN'), ctrl.reject);
router.put('/:id/request-more-info', authenticate, authorize('ADMIN'), ctrl.requestMoreInfo);
router.put('/:id', authenticate, uploadImages.array('images', 10), ctrl.update);
router.delete('/:id', authenticate, ctrl.deleteEvent);

export default router;
