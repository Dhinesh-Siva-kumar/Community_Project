import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { uploadImages } from '../../config/multer';
import * as ctrl from './business.controller';

const router = Router();
router.use(authenticate);

router.post('/categories', authorize('ADMIN'), ctrl.createCategory);
router.get('/categories', ctrl.getCategories);
router.put('/categories/:id', authorize('ADMIN'), ctrl.updateCategory);
router.delete('/categories/:id', authorize('ADMIN'), ctrl.deleteCategory);
router.post('/', uploadImages.array('images', 10), ctrl.create);
router.get('/', ctrl.findAll);
router.get('/:id', ctrl.findOne);
router.put('/:id', uploadImages.array('images', 10), ctrl.update);
router.delete('/:id', ctrl.deleteBusiness);

export default router;
