import { Router } from 'express';
import { requireAuth } from '../../middlewares/requireAuth';
import * as reportsController from './reports.controller';

const router = Router();

// Route: POST /api/v1/reports
router.post('/', requireAuth, reportsController.submitReport);

export default router;
