import { Router } from 'express';
import * as MediaController from './media.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import { rbacGuard } from '../../middlewares/rbacGuard';

const router = Router();

// Apply auth middleware to all media routes
router.use(requireAuth);

// Uploads
router.get('/signature', MediaController.getUploadSignature);
router.post('/', MediaController.saveMedia);

// Asset Management
router.get('/', MediaController.getMediaAssets);
router.get('/trash', rbacGuard(['admin']), MediaController.getTrashAssets);
router.get('/unused', rbacGuard(['admin']), MediaController.scanUnusedMedia);

// Updates
router.put('/:id', rbacGuard(['admin']), MediaController.updateMedia); // নতুন রাউট

// Actions (Soft Delete, Restore, Force Delete)
router.post('/soft-delete', rbacGuard(['admin']), MediaController.softDeleteMediaAssets);
router.post('/restore', rbacGuard(['admin']), MediaController.restoreMediaAssets);
router.post('/delete', rbacGuard(['admin']), MediaController.forceDeleteMediaAssets);

export default router;
