import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { uploadImages } from '../../config/multer';
import * as ctrl from './events.controller';

const router = Router();
router.use(authenticate);

router.post('/', uploadImages.array('images', 10), ctrl.create);
router.get('/', ctrl.findAll);
router.get('/mine', ctrl.findMine);
router.get('/pending', authorize('ADMIN'), ctrl.findPending);
router.get('/pending-count', authorize('ADMIN'), ctrl.getPendingCount);
router.get('/:id', ctrl.findOne);
router.put('/:id/approve', authorize('ADMIN'), ctrl.approve);
router.put('/:id/reject', authorize('ADMIN'), ctrl.reject);
router.put('/:id', uploadImages.array('images', 10), ctrl.update);
router.delete('/:id', ctrl.deleteEvent);

export default router;
