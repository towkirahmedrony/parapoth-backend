import { Router } from 'express';
import * as AppBuilderController from './app-builder.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import { rbacGuard } from '../../middlewares/rbacGuard';

const router = Router();

// Publicly accessible configurations
router.get('/home-grids', AppBuilderController.getHomeGrids);
router.get('/theme-config', AppBuilderController.getThemeConfig);
router.get('/configs', AppBuilderController.getAppConfigs);
router.get('/configs/:key', AppBuilderController.getAppConfigs);

// Admin guarded routes
const adminGuard = [requireAuth, rbacGuard(['admin', 'super_admin'])];

router.post('/home-grids', adminGuard, AppBuilderController.upsertHomeGrid);
router.patch('/home-grids/reorder', adminGuard, AppBuilderController.reorderHomeGrids);
router.delete('/home-grids/:id', adminGuard, AppBuilderController.deleteHomeGrid);

router.put('/configs', adminGuard, AppBuilderController.updateAppConfig);
router.post('/configs/:key', adminGuard, AppBuilderController.updateAppConfig);

router.put('/xp-rules', adminGuard, AppBuilderController.updateXPRules);

router.get('/levels', adminGuard, AppBuilderController.getLevels);
router.put('/levels', adminGuard, AppBuilderController.updateLevels);

router.put('/global-notice', adminGuard, AppBuilderController.updateGlobalNotice);

export default router;
