import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { optionalAuthenticate } from '../../middleware/optionalAuthenticate';
import { authorize } from '../../middleware/authorize';
import { uploadImages } from '../../config/multer';
import * as ctrl from './jobs.controller';

const router = Router();

// Accept both 'logo' (1 file) and 'images' (up to 10 files) in the same multipart request
const jobUpload = uploadImages.fields([
  { name: 'logo',   maxCount: 1  },
  { name: 'images', maxCount: 10 },
]);

// Guest-visible — service layer scopes the result down when req.user is unset.
// Must stay above '/:id' below, or it swallows them.
router.get('/',      optionalAuthenticate, ctrl.findAll);

// Everything else is account-only.
router.post('/',     authenticate, jobUpload, ctrl.create);
router.get('/mine',  authenticate, ctrl.findMine);
router.get('/pending', authenticate, authorize('ADMIN'), ctrl.findPending);
router.get('/pending-count', authenticate, authorize('ADMIN'), ctrl.getPendingCount);
router.get('/:id',   optionalAuthenticate, ctrl.findOne);
router.put('/:id/approve', authenticate, authorize('ADMIN'), ctrl.approve);
router.put('/:id/reject', authenticate, authorize('ADMIN'), ctrl.reject);
router.put('/:id/request-more-info', authenticate, authorize('ADMIN'), ctrl.requestMoreInfo);
router.put('/:id',   authenticate, jobUpload, ctrl.update);
router.delete('/:id', authenticate, ctrl.deleteJob);

export default router;
