import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import * as ctrl from './notifications.controller';

const router = Router();
router.use(authenticate);

router.get('/', ctrl.findAll);
router.get('/unread-count', ctrl.getUnreadCount);
router.get('/preferences', ctrl.getPreferences);
router.put('/preferences', ctrl.updatePreferences);
router.put('/read-all', ctrl.markAllAsRead);
router.put('/:id/read', ctrl.markAsRead);

export default router;
