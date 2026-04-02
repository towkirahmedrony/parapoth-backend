import { Router } from 'express';
import { 
  getAllExams, getExamDetails, deleteExam, togglePublish, 
  autoFetchQuestions, punishUser, getLiveProgress, 
  getLeaderboard, recoverSession 
} from './exams.admin.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import { rbacGuard } from '../../middlewares/rbacGuard';

const router = Router();

// প্রোডাকশনে যাওয়ার সময় এই মিডলওয়্যারগুলো আনকমেন্ট করে দেবেন
router.use(requireAuth, rbacGuard(['admin'])); 

// জেনারেল রাউটস
router.get('/', getAllExams);
router.post('/auto-fetch', autoFetchQuestions);
router.post('/punish', punishUser);
router.post('/recover-session', recoverSession);

// ID নির্ভর রাউটস
router.get('/:id', getExamDetails);
router.delete('/:id', deleteExam);
router.patch('/:id/publish', togglePublish);
router.get('/:id/live-progress', getLiveProgress);
router.get('/:id/leaderboard', getLeaderboard);

export const ExamAdminRoutes = router;
