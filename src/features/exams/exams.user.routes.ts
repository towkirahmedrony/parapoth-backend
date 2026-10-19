import { Router } from 'express';
import {
  generateExam,
  submitExam,
  getArena,
  getExamResult,
  submitHistory,
  createGroupBattle,
} from './exams.user.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import { rateLimit } from '../../middlewares/rateLimit';

const router = Router();

// Question retrieval is limited per authenticated user to make bulk harvesting
// of the published question bank expensive even for a valid account.
const questionReadLimit = rateLimit({ windowMs: 60_000, max: 60, keyPrefix: 'exam-questions' });
const submissionLimit = rateLimit({ windowMs: 60_000, max: 20, keyPrefix: 'exam-submit' });

router.post('/generate', requireAuth, questionReadLimit, generateExam);
router.get('/arena', requireAuth, questionReadLimit, getArena);

// Owner-scoped attempt review (question text/options resolved server-side)
router.get('/result/:id', requireAuth, getExamResult);

// Legacy route: XP/Streak/real score এর জন্য ব্যবহার করবেন না
router.post('/history', requireAuth, submitHistory);

// Main secure submit route
router.post('/submit', requireAuth, submissionLimit, submitExam);

router.post('/group-battle', requireAuth, createGroupBattle);

export const ExamUserRoutes = router;
