import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { uploadImages } from '../../config/multer';
import * as ctrl from './posts.controller';

const router = Router();
router.use(authenticate);

router.post('/', uploadImages.array('images', 10), ctrl.create);
router.get('/', ctrl.findAll);
router.get('/pending', authorize('ADMIN'), ctrl.findPending);
router.put('/:id/approve', authorize('ADMIN'), ctrl.approve);
router.put('/:id/reject', authorize('ADMIN'), ctrl.reject);
router.put('/:id', uploadImages.array('images', 10), ctrl.updatePost);
router.delete('/:id', ctrl.deletePost);
router.post('/:id/like', ctrl.like);
router.delete('/:id/like', ctrl.unlike);
router.get('/:id/comments', ctrl.getComments);
router.post('/:id/comments', ctrl.addComment);
router.delete('/comments/:commentId', ctrl.deleteComment);

export default router;
