import { Router } from 'express';
import * as MediaController from './media.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import { rbacGuard } from '../../middlewares/rbacGuard';
import { requirePermission } from '../../middlewares/requirePermission';
import { PERMISSIONS } from '../../middlewares/authorization';

const router = Router();

// Apply auth middleware to all media routes
router.use(requireAuth);

// Uploads
router.get('/signature', MediaController.getUploadSignature);
router.post('/', MediaController.saveMedia);

// Asset Management
router.get('/', MediaController.getMediaAssets);
router.get('/trash', rbacGuard(['admin']), requirePermission(PERMISSIONS.QUESTIONS_MANAGE), MediaController.getTrashAssets);
router.get('/unused', rbacGuard(['admin']), requirePermission(PERMISSIONS.QUESTIONS_MANAGE), MediaController.scanUnusedMedia);

// Updates
router.put('/:id', rbacGuard(['admin']), requirePermission(PERMISSIONS.QUESTIONS_MANAGE), MediaController.updateMedia); // নতুন রাউট

// Actions (Soft Delete, Restore, Force Delete)
router.post('/soft-delete', rbacGuard(['admin']), requirePermission(PERMISSIONS.QUESTIONS_MANAGE), MediaController.softDeleteMediaAssets);
router.post('/restore', rbacGuard(['admin']), requirePermission(PERMISSIONS.QUESTIONS_MANAGE), MediaController.restoreMediaAssets);
router.post('/delete', rbacGuard(['admin']), requirePermission(PERMISSIONS.QUESTIONS_MANAGE), MediaController.forceDeleteMediaAssets);

export default router;
