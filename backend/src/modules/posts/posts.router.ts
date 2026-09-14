import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { optionalAuthenticate } from '../../middleware/optionalAuthenticate';
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

// Guest-visible — service layer scopes the result down when req.user is
// unset (posts.controller.ts's findAll/findOne already pass req.user?.sub).
// Must stay above '/:id' below, or it swallows them.
router.get('/', optionalAuthenticate, ctrl.findAll);

// Everything else is account-only.
router.post('/', authenticate, postMedia, ctrl.create);
router.get('/pending', authenticate, authorize('ADMIN'), ctrl.findPending);
router.get('/pending-count', authenticate, authorize('ADMIN'), ctrl.getPendingCount);
router.get('/mine', authenticate, ctrl.getMyPosts);
router.get('/:id', optionalAuthenticate, ctrl.findOne);
router.put('/:id/approve', authenticate, authorize('ADMIN'), ctrl.approve);
router.put('/:id/reject', authenticate, authorize('ADMIN'), ctrl.reject);
router.put('/:id/request-more-info', authenticate, authorize('ADMIN'), ctrl.requestMoreInfo);
router.put('/:id', authenticate, postMedia, ctrl.updatePost);
router.delete('/:id', authenticate, ctrl.deletePost);
router.post('/:id/like', authenticate, ctrl.like);
router.delete('/:id/like', authenticate, ctrl.unlike);
router.post('/:id/save', authenticate, ctrl.savePost);
router.delete('/:id/save', authenticate, ctrl.unsavePost);
router.get('/:id/comments', optionalAuthenticate, ctrl.getComments);
router.post('/:id/comments', authenticate, ctrl.addComment);
router.delete('/comments/:commentId', authenticate, ctrl.deleteComment);

export default router;
