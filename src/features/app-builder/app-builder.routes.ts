import { Router } from 'express';
import { 
  getAllConfigs,
  getHomeGrids, saveHomeGrid, reorderHomeGrids, deleteHomeGrid,
  getDailyQuote, saveDailyQuote,
  getThemeConfig, saveThemeConfig,
  getBanners, createBanner, updateBanner, deleteBanner,
  getLevels, saveLevels,
  getXpRules, saveXpRules
} from './app-builder.controller';
import { requireAuth } from '../../middlewares/requireAuth';
import { rbacGuard } from '../../middlewares/rbacGuard';

const router = Router();

const adminGuard = [requireAuth, rbacGuard(['admin', 'super_admin'])];

// --- Private Configurations (admin only) ---
// Full app_configs dump is never public.
router.get('/configs', adminGuard, getAllConfigs);

// --- Public, allowlisted read models ---
router.get('/home-grids', getHomeGrids);
router.get('/configs/daily_quote', getDailyQuote);
router.get('/theme-config', getThemeConfig);
router.get('/banners', getBanners);
router.get('/levels', getLevels);
router.get('/configs/xp_rules', getXpRules);

// --- Home Grids (admin only) ---
router.post('/home-grids', adminGuard, saveHomeGrid);
router.patch('/home-grids/reorder', adminGuard, reorderHomeGrids);
router.delete('/home-grids/:id', adminGuard, deleteHomeGrid);

// --- Daily Quote (admin only writes) ---
router.post('/configs/daily_quote', adminGuard, saveDailyQuote);

// --- Theme Config (admin only writes) ---
router.post('/configs/theme_config', adminGuard, saveThemeConfig);

// --- Banners (admin only writes) ---
router.post('/banners', adminGuard, createBanner);
router.put('/banners/:id', adminGuard, updateBanner);
router.delete('/banners/:id', adminGuard, deleteBanner);

// --- Leagues & Levels (admin only writes) ---
router.put('/levels', adminGuard, saveLevels);

// --- XP Rules (admin only writes) ---
router.put('/xp-rules', adminGuard, saveXpRules);

export default router;
