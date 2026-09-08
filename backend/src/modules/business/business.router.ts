import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { uploadBusinessMedia } from '../../config/multer';
import * as ctrl from './business.controller';

const router = Router();
router.use(authenticate);

// Three galleries plus a logo. Shared by create and update so the two can
// never drift apart on which fields they accept.
const businessUploadFields = [
  { name: 'images', maxCount: 10 },
  { name: 'menuImages', maxCount: 10 },
  { name: 'cardImages', maxCount: 10 },
  { name: 'logo', maxCount: 1 },
];

router.post('/categories', authorize('ADMIN'), ctrl.createCategory);
router.get('/categories', ctrl.getCategories);
router.put('/categories/:id', authorize('ADMIN'), ctrl.updateCategory);
router.delete('/categories/:id', authorize('ADMIN'), ctrl.deleteCategory);
router.post('/', uploadBusinessMedia.fields(businessUploadFields), ctrl.create);
router.get('/', ctrl.findAll);
// Literal sub-routes must stay above '/:id' below, or it swallows them.
router.get('/mine', ctrl.findMine);
router.get('/pending', authorize('ADMIN'), ctrl.findPending);
router.get('/pending-count', authorize('ADMIN'), ctrl.getPendingCount);
router.get('/:id', ctrl.findOne);
router.put('/:id/approve', authorize('ADMIN'), ctrl.approve);
router.put('/:id/reject', authorize('ADMIN'), ctrl.reject);
router.put('/:id/request-more-info', authorize('ADMIN'), ctrl.requestMoreInfo);
router.put('/:id', uploadBusinessMedia.fields(businessUploadFields), ctrl.update);
router.delete('/:id', ctrl.deleteBusiness);

export default router;
