import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { uploadImages } from '../../config/multer';
import * as ctrl from './jobs.controller';

const router = Router();
router.use(authenticate);

// Accept both 'logo' (1 file) and 'images' (up to 10 files) in the same multipart request
const jobUpload = uploadImages.fields([
  { name: 'logo',   maxCount: 1  },
  { name: 'images', maxCount: 10 },
]);

router.post('/',     jobUpload, ctrl.create);
router.get('/',      ctrl.findAll);
router.get('/mine',  ctrl.findMine);
router.get('/pending', authorize('ADMIN'), ctrl.findPending);
router.get('/pending-count', authorize('ADMIN'), ctrl.getPendingCount);
router.get('/:id',   ctrl.findOne);
router.put('/:id/approve', authorize('ADMIN'), ctrl.approve);
router.put('/:id/reject', authorize('ADMIN'), ctrl.reject);
router.put('/:id',   jobUpload, ctrl.update);
router.delete('/:id', ctrl.deleteJob);

export default router;
