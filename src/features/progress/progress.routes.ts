import { Router } from 'express';
import * as progressController from './progress.controller';
import { requireAuth } from '../../middlewares/requireAuth';

const router = Router();

// Apply auth middleware to protect the route
router.use(requireAuth);

router.get('/dashboard', progressController.getDashboardData);

export default router;
