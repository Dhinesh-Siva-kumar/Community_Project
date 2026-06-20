import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
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
router.get('/:id',   ctrl.findOne);
router.put('/:id',   jobUpload, ctrl.update);
router.delete('/:id', ctrl.deleteJob);

export default router;
