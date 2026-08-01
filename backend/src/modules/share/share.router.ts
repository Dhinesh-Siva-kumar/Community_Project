import { Router } from 'express';
import * as ctrl from './share.controller';

const router = Router();

router.get('/post/:id', ctrl.postSharePage);

export default router;
