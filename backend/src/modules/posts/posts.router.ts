import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { uploadPostMedia } from '../../config/multer';
import * as ctrl from './posts.controller';

// Either up to ten images or a single video — uploadPostMedia keeps images
// in memory for Sharp and streams the video straight to disk.
const postMedia = uploadPostMedia.fields([
  { name: 'images', maxCount: 10 },
  { name: 'video', maxCount: 1 },
]);

const router = Router();
router.use(authenticate);

router.post('/', postMedia, ctrl.create);
router.get('/', ctrl.findAll);
router.get('/pending', authorize('ADMIN'), ctrl.findPending);
router.get('/pending-count', authorize('ADMIN'), ctrl.getPendingCount);
router.get('/mine', ctrl.getMyPosts);
router.get('/:id', ctrl.findOne);
router.put('/:id/approve', authorize('ADMIN'), ctrl.approve);
router.put('/:id/reject', authorize('ADMIN'), ctrl.reject);
router.put('/:id/request-more-info', authorize('ADMIN'), ctrl.requestMoreInfo);
router.put('/:id', postMedia, ctrl.updatePost);
router.delete('/:id', ctrl.deletePost);
router.post('/:id/like', ctrl.like);
router.delete('/:id/like', ctrl.unlike);
router.post('/:id/save', ctrl.savePost);
router.delete('/:id/save', ctrl.unsavePost);
router.get('/:id/comments', ctrl.getComments);
router.post('/:id/comments', ctrl.addComment);
router.delete('/comments/:commentId', ctrl.deleteComment);

export default router;
