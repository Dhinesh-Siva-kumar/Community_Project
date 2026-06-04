import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import * as usersController from './users.controller';

const router = Router();

// All users routes require authentication
router.use(authenticate);

// GET  /api/users/profile
router.get('/profile', usersController.getProfile);

// PUT  /api/users/profile
router.put('/profile', usersController.updateProfile);

// GET  /api/users/dashboard
router.get('/dashboard', usersController.getDashboard);

// GET  /api/users  (ADMIN only)
router.get('/', authorize('ADMIN'), usersController.getUsers);

// PUT  /api/users/:id/block  (ADMIN only)
router.put('/:id/block', authorize('ADMIN'), usersController.blockUser);

// PUT  /api/users/:id/unblock  (ADMIN only)
router.put('/:id/unblock', authorize('ADMIN'), usersController.unblockUser);

// PUT  /api/users/:id/trust  (ADMIN only)
router.put('/:id/trust', authorize('ADMIN'), usersController.trustUser);

// PUT  /api/users/:id/untrust  (ADMIN only)
router.put('/:id/untrust', authorize('ADMIN'), usersController.untrustUser);

export default router;
