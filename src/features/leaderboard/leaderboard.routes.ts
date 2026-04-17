import { Router } from 'express';
import * as leaderboardController from './leaderboard.controller';
import { requireAuth } from '../../middlewares/requireAuth';

const router = Router();

// সব রুটেই অথেন্টিকেশন প্রয়োজন
router.use(requireAuth);

router.get('/leagues', leaderboardController.getLeaguesConfig);
router.get('/league', leaderboardController.getLeagueLeaderboard);
router.get('/squads', leaderboardController.getSquadLeaderboard);

export default router;
