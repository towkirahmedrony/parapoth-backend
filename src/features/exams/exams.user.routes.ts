import { Router } from 'express';
import { generateExam, submitExam, getArena, submitHistory, createGroupBattle } from './exams.user.controller';
import { requireAuth } from '../../middlewares/requireAuth';

const router = Router();

router.post('/generate', requireAuth, generateExam);
router.get('/arena', requireAuth, getArena);
router.post('/history', requireAuth, submitHistory);
router.post('/submit', requireAuth, submitExam);

// নতুন রাউট: Group Battle এর জন্য
router.post('/group-battle', requireAuth, createGroupBattle);

export const ExamUserRoutes = router;
