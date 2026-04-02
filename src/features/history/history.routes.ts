import { Router } from 'express';
import * as historyController from './history.controller';
import { requireAuth } from '../../middlewares/requireAuth';

const router = Router();

// Protect all history routes
router.use(requireAuth);

router.get('/exams', historyController.getExamHistory);
router.get('/mistakes', historyController.getMistakes);
router.get('/bookmarks', historyController.getBookmarks);

router.delete('/mistakes/:id', historyController.deleteMistake);
router.delete('/bookmarks/:id', historyController.deleteBookmark);

export default router;
