import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { optionalAuthenticate } from '../../middleware/optionalAuthenticate';
import { authorize } from '../../middleware/authorize';
import { uploadBusinessMedia } from '../../config/multer';
import * as ctrl from './business.controller';

const router = Router();

// Three galleries plus a logo. Shared by create and update so the two can
// never drift apart on which fields they accept.
const businessUploadFields = [
  { name: 'images', maxCount: 10 },
  { name: 'menuImages', maxCount: 10 },
  { name: 'cardImages', maxCount: 10 },
  { name: 'logo', maxCount: 1 },
];

// Guest-visible — service layer scopes the result down when req.user is unset.
// Must stay above '/:id' below, or it swallows them.
router.get('/categories', optionalAuthenticate, ctrl.getCategories);
router.get('/', optionalAuthenticate, ctrl.findAll);

// Everything else is account-only.
router.post('/categories', authenticate, authorize('ADMIN'), ctrl.createCategory);
router.put('/categories/:id', authenticate, authorize('ADMIN'), ctrl.updateCategory);
router.delete('/categories/:id', authenticate, authorize('ADMIN'), ctrl.deleteCategory);
router.post('/', authenticate, uploadBusinessMedia.fields(businessUploadFields), ctrl.create);
router.get('/mine', authenticate, ctrl.findMine);
router.get('/pending', authenticate, authorize('ADMIN'), ctrl.findPending);
router.get('/pending-count', authenticate, authorize('ADMIN'), ctrl.getPendingCount);
router.get('/:id', optionalAuthenticate, ctrl.findOne);
router.put('/:id/approve', authenticate, authorize('ADMIN'), ctrl.approve);
router.put('/:id/reject', authenticate, authorize('ADMIN'), ctrl.reject);
router.put('/:id/request-more-info', authenticate, authorize('ADMIN'), ctrl.requestMoreInfo);
router.put('/:id', authenticate, uploadBusinessMedia.fields(businessUploadFields), ctrl.update);
router.delete('/:id', authenticate, ctrl.deleteBusiness);

export default router;
