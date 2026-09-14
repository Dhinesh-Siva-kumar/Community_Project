import { Router } from 'express';
import { discoverySearchLimiter } from '../../middleware/rateLimiter';
import * as ctrl from './discovery.controller';

// Deliberately no `router.use(authenticate)` — every route here is a public,
// guest-facing preview/search surface backing the homepage. See
// discovery.service.ts for the field-redaction rules applied before any data
// leaves this module.
const router = Router();

router.get('/jobs/preview', ctrl.jobsPreview);
router.get('/businesses/preview', ctrl.businessesPreview);
router.get('/events/preview', ctrl.eventsPreview);
router.get('/communities/preview', ctrl.communitiesPreview);
router.get('/posts/preview', ctrl.postsPreview);
router.get('/stats', ctrl.stats);
router.get('/search', discoverySearchLimiter, ctrl.search);

export default router;
