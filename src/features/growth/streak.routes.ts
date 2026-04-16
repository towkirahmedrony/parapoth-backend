import { Router } from 'express';
import * as StreakController from './streak.controller';
import { requireAuth } from '../../middlewares/requireAuth';

const router = Router();

// Protect all growth/streak routes, user must be logged in
router.use(requireAuth);

router.get('/stats/:userId?', StreakController.getStreakStats);
router.get('/heatmap/:userId?', StreakController.getHeatmap);
router.get('/quests/:userId?', StreakController.getDailyQuests);

export default router;
