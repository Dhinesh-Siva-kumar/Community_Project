import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { uploadImages } from '../../config/multer';
import * as ctrl from './jobs.controller';

const router = Router();
router.use(authenticate);

router.post('/', uploadImages.array('images', 10), ctrl.create);
router.get('/', ctrl.findAll);
router.get('/:id', ctrl.findOne);
router.put('/:id', uploadImages.array('images', 10), ctrl.update);
router.delete('/:id', ctrl.deleteJob);

export default router;
