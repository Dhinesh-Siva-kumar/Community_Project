import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { uploadProfile } from '../../config/multer';
import * as usersController from './users.controller';

const router = Router();

router.use(authenticate);

// ── Self-service ─────────────────────────────────────────────────────────────
router.get('/profile',  usersController.getProfile);
router.put('/profile',  uploadProfile.single('avatar'), usersController.updateProfile);
router.get('/dashboard', usersController.getDashboard);

// ── Admin — listing & audit ───────────────────────────────────────────────────
router.get('/',             authorize('ADMIN'), usersController.getUsers);
router.get('/audit-logs',   authorize('ADMIN'), usersController.getAuditLogs);
router.post('/broadcast',   authorize('ADMIN'), usersController.broadcastNotification);

// ── Admin — per-user CRUD (must come after named routes) ─────────────────────
router.get('/:id',                    authorize('ADMIN'), usersController.getUserById);
router.post('/',                      authorize('ADMIN'), usersController.adminCreateUser);
router.delete('/:id',                 authorize('ADMIN'), usersController.softDeleteUser);
router.put('/:id/role',               authorize('ADMIN'), usersController.changeUserRole);
router.post('/:id/reset-password',    authorize('ADMIN'), usersController.adminResetPassword);
router.put('/:id/block',              authorize('ADMIN'), usersController.blockUser);
router.put('/:id/unblock',            authorize('ADMIN'), usersController.unblockUser);
router.put('/:id/trust',              authorize('ADMIN'), usersController.trustUser);
router.put('/:id/untrust',            authorize('ADMIN'), usersController.untrustUser);

export default router;
