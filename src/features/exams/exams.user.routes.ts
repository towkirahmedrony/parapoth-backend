import { Router } from 'express';
import {
  generateExam,
  submitExam,
  getArena,
  submitHistory,
  createGroupBattle,
} from './exams.user.controller';
import { requireAuth } from '../../middlewares/requireAuth';

const router = Router();

router.post('/generate', requireAuth, generateExam);
router.get('/arena', requireAuth, getArena);

// Legacy route: XP/Streak/real score এর জন্য ব্যবহার করবেন না
router.post('/history', requireAuth, submitHistory);

// Main secure submit route
router.post('/submit', requireAuth, submitExam);

router.post('/group-battle', requireAuth, createGroupBattle);

export const ExamUserRoutes = router;
