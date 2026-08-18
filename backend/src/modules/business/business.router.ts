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
router.post('/', uploadImages.fields([{ name: 'images', maxCount: 10 }, { name: 'logo', maxCount: 1 }]), ctrl.create);
router.get('/', ctrl.findAll);
router.get('/mine', ctrl.findMine);
router.get('/pending', authorize('ADMIN'), ctrl.findPending);
router.get('/pending-count', authorize('ADMIN'), ctrl.getPendingCount);
router.get('/:id', ctrl.findOne);
router.put('/:id/approve', authorize('ADMIN'), ctrl.approve);
router.put('/:id/reject', authorize('ADMIN'), ctrl.reject);
router.put('/:id', uploadImages.fields([{ name: 'images', maxCount: 10 }, { name: 'logo', maxCount: 1 }]), ctrl.update);
router.delete('/:id', ctrl.deleteBusiness);

export default router;
