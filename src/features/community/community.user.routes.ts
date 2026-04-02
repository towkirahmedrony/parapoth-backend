import { Router } from 'express';
import * as userController from './community.user.controller';
import { requireAuth } from '../../middlewares/requireAuth';

const router = Router();

// এই রাউটগুলোর জন্য শুধু লগ-ইন থাকা (Student/User) বাধ্যতামূলক
router.use(requireAuth);

// 🏠 Lobby Dashboard Data (Leaderboard, My Group, Squad Activity)
router.get('/lobby', userController.getLobbyData);

// ⚡ Actions from Lobby
router.post('/focus/start', userController.startFocus);
router.post('/battle/challenge', userController.challengeTrio);
router.post('/buzz', userController.buzzUser);

export default router;
