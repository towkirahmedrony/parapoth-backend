import { Router } from 'express';
import * as contentController from './content.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import { rbacGuard } from '../../middlewares/rbacGuard';

const router = Router();

router.use(requireAuth);

router.get('/curriculum', contentController.getCurriculumTree);
router.get('/taxonomy/subjects', contentController.getTaxonomySubjects);
router.get('/taxonomy/chapters', contentController.getTaxonomyChapters);
router.get('/taxonomy/topics', contentController.getTaxonomyTopics);

router.post('/curriculum/manage', rbacGuard(['admin']), contentController.manageCurriculum);

router.post('/comprehensions', rbacGuard(['admin', 'moderator', 'teacher']), contentController.createComprehension);
router.get('/comprehensions/search', rbacGuard(['admin', 'moderator', 'teacher']), contentController.searchComprehensions);

router.get('/questions/audit', rbacGuard(['admin', 'moderator']), contentController.getQuestionsForAudit);
router.patch('/questions/:id/status', rbacGuard(['admin', 'moderator']), contentController.updateAuditQuestionStatus);

router.get('/questions', rbacGuard(['admin', 'moderator', 'teacher']), contentController.getQuestionsBank);
router.post('/questions', rbacGuard(['admin', 'moderator', 'teacher']), contentController.createQuestion);
router.post('/questions/bulk', rbacGuard(['admin', 'moderator', 'teacher']), contentController.bulkCreateQuestions);
router.put('/questions/:id', rbacGuard(['admin', 'moderator', 'teacher']), contentController.updateQuestion);
router.delete('/questions/:id', rbacGuard(['admin', 'moderator']), contentController.deleteQuestion);
router.delete('/questions/:id/hard', rbacGuard(['admin']), contentController.hardDeleteQuestion);

router.get('/ai-review-queue', rbacGuard(['admin', 'moderator']), contentController.getAiReviewQueue);
router.post('/ai-review-queue/:id/review', rbacGuard(['admin', 'moderator']), contentController.reviewQuestion);

router.post('/search-index/sync', rbacGuard(['admin']), contentController.syncSearchIndex);

export default router;
