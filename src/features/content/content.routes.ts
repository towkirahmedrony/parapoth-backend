import { Router } from 'express';
import * as contentController from './content.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import { rbacGuard } from '../../middlewares/rbacGuard';

const router = Router();

// সব রাউটের জন্যই লগ-ইন (Authentication) বাধ্যতামূলক
router.use(requireAuth);

// ==========================================
// 🔓 PUBLIC / STUDENT ROUTES (শুধু requireAuth, কোনো Role Restriction নেই)
// ==========================================
// স্টুডেন্টরা যেন সিলেবাস এবং সাবজেক্ট দেখতে পারে
router.get('/curriculum', contentController.getCurriculumTree);
router.get('/taxonomy/subjects', contentController.getTaxonomySubjects);
router.get('/taxonomy/chapters', contentController.getTaxonomyChapters);
router.get('/taxonomy/topics', contentController.getTaxonomyTopics);

// ==========================================
// 🔒 ADMIN / MODERATOR / TEACHER ROUTES
// ==========================================
// কারিকুলাম ম্যানেজমেন্ট
router.post('/curriculum/manage', rbacGuard(['admin']), contentController.manageCurriculum);

// কম্প্রিহেনশন (উদ্দীপক)
router.post('/comprehensions', rbacGuard(['admin', 'moderator', 'teacher']), contentController.createComprehension);
router.get('/comprehensions/search', rbacGuard(['admin', 'moderator', 'teacher']), contentController.searchComprehensions);

// প্রশ্ন তৈরি, বাল্ক আপলোড, আপডেট এবং ডিলিট
router.post('/questions', rbacGuard(['admin', 'moderator', 'teacher']), contentController.createQuestion);

// নতুন: Bulk Insert রাউট (এটি /:id এর আগে থাকতে হবে)
router.post('/questions/bulk', rbacGuard(['admin', 'moderator', 'teacher']), contentController.bulkCreateQuestions);

router.put('/questions/:id', rbacGuard(['admin', 'moderator', 'teacher']), contentController.updateQuestion);
router.delete('/questions/:id', rbacGuard(['admin', 'moderator']), contentController.deleteQuestion);

// এআই রিভিউ কিউ
router.get('/ai-review-queue', rbacGuard(['admin', 'moderator']), contentController.getAiReviewQueue);
router.post('/ai-review-queue/:id/review', rbacGuard(['admin', 'moderator']), contentController.reviewQuestion);

// সিস্টেম ইনডেক্স
router.post('/search-index/sync', rbacGuard(['admin']), contentController.syncSearchIndex);

export default router;
