import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { studentConnectionRequestLimiter, studentChatMessageLimiter } from '../../middleware/rateLimiter';
import * as ctrl from './student-connect.controller';

const router = Router();

// GET /api/student-connect/config — public, no auth. The frontend's single
// source of truth for which concept (Contact Sharing vs In-App Chat) is
// live; must be reachable before authenticate() so a guest/unregistered
// visitor's shell can still render the right tab strip.
router.get('/config', ctrl.getConfig);

router.use(authenticate);

router.get('/me', ctrl.getMe);
router.post('/register', ctrl.register);
router.patch('/me', ctrl.updateMe);

router.get('/search', ctrl.search);
router.get('/profile/:userId', ctrl.getProfile);

router.post('/connections/requests', studentConnectionRequestLimiter, ctrl.createConnectionRequest);
router.get('/connections/requests', ctrl.listConnectionRequests);
router.post('/connections/requests/:id/accept', ctrl.acceptConnectionRequest);
router.post('/connections/requests/:id/decline', ctrl.declineConnectionRequest);
router.get('/connections', ctrl.listConnections);

router.post('/saved/:userId', ctrl.toggleSaved);
router.get('/saved', ctrl.listSaved);

router.post('/reports', ctrl.createReport);
router.post('/block/:userId', ctrl.blockUser);

// Chat — Model B only; behaves as 404 under Contact Sharing
// (see student-connect.service.ts's assertChatModelEnabled()).
router.get('/chat/threads', ctrl.listChatThreads);
router.get('/chat/threads/:id/messages', ctrl.listChatMessages);
router.post('/chat/threads/:id/messages', studentChatMessageLimiter, ctrl.sendChatMessage);
router.post('/chat/threads/:id/read', ctrl.markThreadRead);

// Admin — same router, inline authorize('ADMIN'), matching every other
// module's convention (no separate /api/admin namespace in this repo).
router.get('/verification-queue', authorize('ADMIN'), ctrl.listVerificationQueue);
router.get('/verification-queue-count', authorize('ADMIN'), ctrl.getVerificationQueueCount);
router.post('/verification-queue/:userId/approve', authorize('ADMIN'), ctrl.approveVerification);
router.post('/verification-queue/:userId/reject', authorize('ADMIN'), ctrl.rejectVerification);
router.get('/chat-threads/:id/messages/moderation', authorize('ADMIN'), ctrl.getThreadForModeration);

export default router;
